import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { branchAlertState, branches, services, tickets } from "@shared/schema";
import { notifyServiceQueueStatusChange } from "./notifications";
import { notifyOrgServiceQueueStatusChange } from "./branch-alerts";
import { dineInModeCondition, recordWaitingActivity } from "./queue-idle";

const IDLE_MINUTES = 30;
const IDLE_MS = IDLE_MINUTES * 60 * 1000;
const SCAN_INTERVAL_MS = 60 * 1000;

/**
 * Only Dine In closes automatically. Persisted waiting-transition anchors
 * survive restarts and catch tickets that join and leave between scans.
 * Seated/called/held customers are left untouched.
 */
export async function scanAndEndIdleQueuesOnce(): Promise<{ scanned: number; ended: number }> {
  const candidates = await db.select({ id: services.id }).from(services)
    .innerJoin(branches, eq(branches.id, services.branchId))
    .where(and(
      eq(services.queueStatus, "active"), eq(services.isActive, true),
      eq(branches.queueStatus, "active"), eq(branches.isActive, true),
      dineInModeCondition,
    ));
  let ended = 0;
  for (const candidate of candidates) {
    try {
      const closed = await db.transaction(async (tx) => {
        // Recheck scope/status under the same lock taken by waiting-ticket writes.
        const [svc] = await tx.select({
          id: services.id, branchId: services.branchId, name: services.name,
          updatedAt: services.updatedAt, branchName: branches.name,
          branchUpdatedAt: branches.updatedAt,
        }).from(services).innerJoin(branches, eq(branches.id, services.branchId))
          .where(and(
            eq(services.id, candidate.id), eq(services.queueStatus, "active"),
            eq(services.isActive, true), eq(branches.isActive, true),
            eq(branches.queueStatus, "active"), dineInModeCondition,
          )).for("update", { of: services });
        if (!svc) return null;
        const [activity] = await tx.select({
          waiting: sql<number>`count(*) filter (where ${tickets.status} = 'waiting')`,
          lastActivity: sql<Date | null>`max(${tickets.updatedAt})`,
        }).from(tickets).where(eq(tickets.serviceId, svc.id));
        if (Number(activity?.waiting) > 0) return null;
        const anchors = await tx.select({
          kind: branchAlertState.triggerKind, at: branchAlertState.lastTriggeredAt,
        }).from(branchAlertState).where(and(
          eq(branchAlertState.branchId, svc.branchId),
          eq(branchAlertState.scopeId, svc.id),
          sql`${branchAlertState.triggerKind} in ('queue_idle', 'queue_open')`,
        ));
        const idleAt = anchors.find(anchor => anchor.kind === "queue_idle")?.at;
        const times = [
          svc.updatedAt, svc.branchUpdatedAt,
          ...anchors.map(anchor => anchor.at),
          // Conservative bootstrap for queues created before idle tracking.
          // Once seeded, unrelated ticket updates no longer restart this timer.
          !idleAt ? activity?.lastActivity : null,
        ].filter((at): at is Date => !!at).map(at => new Date(at).getTime());
        const reference = Math.max(...times);
        if (!Number.isFinite(reference)) return null;
        if (!idleAt) await recordWaitingActivity(tx, svc, new Date(reference));
        if (Date.now() - reference < IDLE_MS) return null;
        const [updated] = await tx.update(services)
          .set({ queueStatus: "ended", updatedAt: new Date() })
          .where(and(
            eq(services.id, svc.id), eq(services.queueStatus, "active"),
            sql`not exists (select 1 from ${tickets}
              where ${tickets.serviceId} = ${svc.id} and ${tickets.status} = 'waiting')`,
            sql`exists (select 1 from ${branches}
              where ${branches.id} = ${svc.branchId}
              and ${branches.queueStatus} = 'active'
              and ${branches.isActive} = true and ${dineInModeCondition})`,
          )).returning({ id: services.id });
        return updated ? svc : null;
      });
      if (!closed) continue;
      ended++;
      // Explicit previous status prevents stale alert history suppressing a
      // confirmed automatic close. Notify only after the transaction commits.
      const notifications = await Promise.allSettled([
        notifyServiceQueueStatusChange(closed.id, closed.branchName, closed.name, "ended"),
        notifyOrgServiceQueueStatusChange(closed.branchId, closed.id, closed.name, "ended", "active"),
      ]);
      for (const result of notifications) {
        if (result.status === "rejected") console.error("[queue-auto-end] close notification failed:", result.reason);
      }
      console.log(`[queue-auto-end] closed Dine In service=${closed.id} after ${IDLE_MINUTES}m without waiting tickets`);
    } catch (err) {
      console.error(`[queue-auto-end] failed to close service ${candidate.id}:`, err);
    }
  }
  return { scanned: candidates.length, ended };
}

let started = false;
let scanning = false;
export function startQueueAutoEnd(): void {
  if (started) return;
  started = true;
  const tick = async () => {
    if (scanning) return;
    scanning = true;
    try {
      const result = await scanAndEndIdleQueuesOnce();
      if (result.ended > 0) console.log(`[queue-auto-end] scanned=${result.scanned} ended=${result.ended}`);
    } catch (err) {
      console.error("[queue-auto-end] scan failed:", err);
    } finally {
      scanning = false;
    }
  };
  const kickoff = setTimeout(tick, SCAN_INTERVAL_MS);
  const timer = setInterval(tick, SCAN_INTERVAL_MS);
  for (const handle of [kickoff, timer]) {
    if (typeof (handle as any).unref === "function") (handle as any).unref();
  }
  console.log(`[queue-auto-end] scheduler started (Dine In only, every 1m, idle threshold ${IDLE_MINUTES}m)`);
}

export const __test = { scanAndEndIdleQueuesOnce, IDLE_MINUTES, SCAN_INTERVAL_MS };
