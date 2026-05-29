import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { branchAlertState, services, tickets } from "@shared/schema";
import { storage } from "./storage";
import { notifyServiceQueueStatusChange } from "./notifications";
import { notifyOrgServiceQueueStatusChange } from "./branch-alerts";

// How long a service queue may sit with zero waiting tickets before it is
// ended automatically. Mirrors the product rule: "when there is no one in the
// waiting stage for a continuous 30 minutes, the queue should be ended".
const IDLE_MINUTES = 30;
const IDLE_MS = IDLE_MINUTES * 60 * 1000;

// How often the scheduler scans active service queues. A 5-minute cadence keeps
// the auto-end accurate to within one scan of the 30-minute threshold without
// hammering the database.
const SCAN_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Scan every active service queue once and auto-end any that have had no one in
 * the waiting stage for a continuous {@link IDLE_MINUTES} minutes.
 *
 * "Continuous idle" is measured from the most recent activity reference, which
 * is the later of:
 *   - the last time any ticket on the service changed (max updated_at), and
 *   - the queue-open anchor (when the queue was last started).
 * Using ticket activity (rather than only the scheduler's own bookkeeping)
 * makes the decision robust to process restarts.
 */
export async function scanAndEndIdleQueuesOnce(): Promise<{ scanned: number; ended: number }> {
  const activeServices = await db
    .select({
      id: services.id,
      branchId: services.branchId,
      name: services.name,
      updatedAt: services.updatedAt,
    })
    .from(services)
    .where(eq(services.queueStatus, "active"));

  if (activeServices.length === 0) return { scanned: 0, ended: 0 };

  const serviceIds = activeServices.map((s) => s.id);

  // Per-service waiting count + last activity timestamp in one grouped query.
  const aggRows = await db
    .select({
      serviceId: tickets.serviceId,
      waiting: sql<number>`count(*) filter (where ${tickets.status} = 'waiting')`,
      lastActivity: sql<Date | null>`max(${tickets.updatedAt})`,
    })
    .from(tickets)
    .where(inArray(tickets.serviceId, serviceIds))
    .groupBy(tickets.serviceId);

  const aggByService = new Map<string, { waiting: number; lastActivity: Date | null }>();
  for (const row of aggRows) {
    if (!row.serviceId) continue;
    aggByService.set(row.serviceId, {
      waiting: Number(row.waiting) || 0,
      lastActivity: row.lastActivity ? new Date(row.lastActivity) : null,
    });
  }

  // Queue-open anchors (when each service queue was last started) so a freshly
  // started but empty queue still counts its idle window from the start, not
  // from some stale ticket.
  const openRows = await db
    .select({ scopeId: branchAlertState.scopeId, lastTriggeredAt: branchAlertState.lastTriggeredAt })
    .from(branchAlertState)
    .where(
      and(
        eq(branchAlertState.triggerKind, "queue_open"),
        inArray(branchAlertState.scopeId, serviceIds),
      ),
    );
  const openByService = new Map<string, Date | null>();
  for (const row of openRows) {
    openByService.set(row.scopeId, row.lastTriggeredAt ? new Date(row.lastTriggeredAt) : null);
  }

  const now = Date.now();
  let ended = 0;

  for (const svc of activeServices) {
    const agg = aggByService.get(svc.id);
    const waiting = agg?.waiting ?? 0;
    if (waiting > 0) continue; // Someone is still waiting — leave it open.

    // Reference point = the most recent of: last ticket activity, the
    // queue-open anchor, and the service row's own updatedAt. updatedAt is
    // NOT NULL so there is always a reference — a started-but-empty service
    // (no tickets, no queue_open anchor) still gets a sensible idle window
    // measured from when it was last started/edited.
    const candidates: Date[] = [];
    if (agg?.lastActivity) candidates.push(agg.lastActivity);
    const openAnchor = openByService.get(svc.id) ?? null;
    if (openAnchor) candidates.push(openAnchor);
    if (svc.updatedAt) candidates.push(new Date(svc.updatedAt));
    if (candidates.length === 0) continue;
    const reference = candidates.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));

    if (now - reference.getTime() < IDLE_MS) continue; // Not idle long enough yet.

    try {
      // Atomic end: only flip to "ended" if the queue is still "active" AND a
      // fresh re-check confirms no one is waiting. This closes the race where a
      // ticket joins between the bulk snapshot above and this update.
      const freshWaiting = await db
        .select({ c: sql<number>`count(*)` })
        .from(tickets)
        .where(and(eq(tickets.serviceId, svc.id), eq(tickets.status, "waiting")));
      if ((Number(freshWaiting[0]?.c) || 0) > 0) continue;

      const updated = await db
        .update(services)
        .set({ queueStatus: "ended", updatedAt: new Date() })
        .where(and(eq(services.id, svc.id), eq(services.queueStatus, "active")))
        .returning({ id: services.id });
      if (updated.length === 0) continue; // Status changed underneath us.

      const branch = svc.branchId ? await storage.getBranchById(svc.branchId) : null;
      const branchName = branch?.name || "Queue";
      // Fire the same notifications a manual End triggers: customer/staff push
      // plus the org-level queue-end alert (WhatsApp/email with day stats).
      notifyServiceQueueStatusChange(svc.id, branchName, svc.name, "ended").catch(console.error);
      if (svc.branchId) {
        notifyOrgServiceQueueStatusChange(svc.branchId, svc.id, svc.name, "ended").catch(console.error);
      }
      ended += 1;
      console.log(
        `[queue-auto-end] ended idle queue service=${svc.id} (${svc.name}) branch=${svc.branchId} after >=${IDLE_MINUTES}m with no waiting tickets`,
      );
    } catch (err) {
      console.error(`[queue-auto-end] failed to end service ${svc.id}:`, err);
    }
  }

  return { scanned: activeServices.length, ended };
}

let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

export function startQueueAutoEnd(): void {
  if (started) return;
  started = true;
  const tick = async () => {
    try {
      const result = await scanAndEndIdleQueuesOnce();
      if (result.ended > 0) {
        console.log(
          `[queue-auto-end] scan complete: scanned=${result.scanned} ended=${result.ended}`,
        );
      }
    } catch (err) {
      console.error("[queue-auto-end] scan failed:", err);
    }
  };
  setTimeout(tick, 60_000);
  timer = setInterval(tick, SCAN_INTERVAL_MS);
  if (timer && typeof (timer as any).unref === "function") (timer as any).unref();
  console.log(
    `[queue-auto-end] scheduler started (every ${SCAN_INTERVAL_MS / 1000 / 60}m, idle threshold ${IDLE_MINUTES}m)`,
  );
}

export const __test = { scanAndEndIdleQueuesOnce, IDLE_MINUTES };
