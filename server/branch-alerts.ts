import { db } from "./db";
import {
  branches,
  branchAlertRecipients,
  branchAlertState,
  tickets,
  type BranchAlertRecipient,
} from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";
import { sendWhatsAppMessage } from "./whatsapp";

export type AlertTriggerKind = "waiting_count" | "avg_wait_time" | "queue_status";

export interface AlertThresholds {
  waitingCountMax: number;
  waitingCountMin: number;
  avgWaitTimeMaxSeconds: number;
  avgWaitTimeMinSeconds: number;
  enabled: boolean;
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  waitingCountMax: 0,
  waitingCountMin: 0,
  avgWaitTimeMaxSeconds: 0,
  avgWaitTimeMinSeconds: 0,
  enabled: false,
};

export function readAlertThresholds(displaySettings: unknown): AlertThresholds {
  const ds = (displaySettings ?? {}) as Record<string, unknown>;
  const raw = (ds.alertThresholds ?? {}) as Record<string, unknown>;
  const num = (v: unknown, def: number): number => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : def;
  };
  return {
    waitingCountMax: num(raw.waitingCountMax, DEFAULT_THRESHOLDS.waitingCountMax),
    waitingCountMin: num(raw.waitingCountMin, DEFAULT_THRESHOLDS.waitingCountMin),
    avgWaitTimeMaxSeconds: num(raw.avgWaitTimeMaxSeconds, DEFAULT_THRESHOLDS.avgWaitTimeMaxSeconds),
    avgWaitTimeMinSeconds: num(raw.avgWaitTimeMinSeconds, DEFAULT_THRESHOLDS.avgWaitTimeMinSeconds),
    enabled: raw.enabled === true,
  };
}

async function getOrCreateState(branchId: string, kind: AlertTriggerKind, scopeId: string) {
  const existing = await db
    .select()
    .from(branchAlertState)
    .where(
      and(
        eq(branchAlertState.branchId, branchId),
        eq(branchAlertState.triggerKind, kind),
        eq(branchAlertState.scopeId, scopeId),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db
    .insert(branchAlertState)
    .values({ branchId, triggerKind: kind, scopeId })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];
  const re = await db
    .select()
    .from(branchAlertState)
    .where(
      and(
        eq(branchAlertState.branchId, branchId),
        eq(branchAlertState.triggerKind, kind),
        eq(branchAlertState.scopeId, scopeId),
      ),
    )
    .limit(1);
  return re[0]!;
}

async function setStateTriggered(branchId: string, kind: AlertTriggerKind, scopeId: string, value: number) {
  await db
    .update(branchAlertState)
    .set({ isTriggered: true, lastTriggeredAt: new Date(), lastValue: value, updatedAt: new Date() })
    .where(
      and(
        eq(branchAlertState.branchId, branchId),
        eq(branchAlertState.triggerKind, kind),
        eq(branchAlertState.scopeId, scopeId),
      ),
    );
}

async function setStateCleared(branchId: string, kind: AlertTriggerKind, scopeId: string, value: number) {
  await db
    .update(branchAlertState)
    .set({ isTriggered: false, lastClearedAt: new Date(), lastValue: value, updatedAt: new Date() })
    .where(
      and(
        eq(branchAlertState.branchId, branchId),
        eq(branchAlertState.triggerKind, kind),
        eq(branchAlertState.scopeId, scopeId),
      ),
    );
}

async function getBranch(branchId: string) {
  const rows = await db.select().from(branches).where(eq(branches.id, branchId)).limit(1);
  return rows[0];
}

async function getRecipientsFor(
  branchId: string,
  flag: keyof Pick<
    BranchAlertRecipient,
    "alertOnQueueOpenClose" | "alertOnWaitingCountMax" | "alertOnAvgWaitTimeMax"
  >,
): Promise<BranchAlertRecipient[]> {
  const rows = await db
    .select()
    .from(branchAlertRecipients)
    .where(
      and(
        eq(branchAlertRecipients.branchId, branchId),
        eq(branchAlertRecipients.isActive, true),
        eq(branchAlertRecipients[flag] as any, true),
      ),
    );
  return rows;
}

export async function sendAlertToRecipients(
  recipients: BranchAlertRecipient[],
  message: string,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  await Promise.all(
    recipients.map(async (r) => {
      try {
        const ok = await sendWhatsAppMessage(r.phoneNumber, message);
        if (ok) sent++;
        else failed++;
      } catch (err) {
        console.error("Alert send error to", r.phoneNumber, err);
        failed++;
      }
    }),
  );
  return { sent, failed };
}

function formatMinutes(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  return `${m} min`;
}

/**
 * Notify org alert recipients when a service queue's status transitions.
 * Edge-triggered: only fires if it differs from the last recorded status for the service.
 */
export async function notifyOrgServiceQueueStatusChange(
  branchId: string,
  serviceId: string,
  serviceName: string,
  newStatus: "active" | "paused" | "ended",
): Promise<void> {
  try {
    const branch = await getBranch(branchId);
    if (!branch) return;

    const state = await getOrCreateState(branchId, "queue_status", serviceId);
    const statusCode = newStatus === "active" ? 1 : newStatus === "paused" ? 2 : 3;
    if (state.lastValue === statusCode) return;

    const recipients = await getRecipientsFor(branchId, "alertOnQueueOpenClose");
    if (recipients.length === 0) {
      // Update state even if no one to notify, so we don't accumulate skipped transitions.
      await db
        .update(branchAlertState)
        .set({ lastValue: statusCode, lastTriggeredAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(branchAlertState.branchId, branchId),
            eq(branchAlertState.triggerKind, "queue_status"),
            eq(branchAlertState.scopeId, serviceId),
          ),
        );
      return;
    }

    const label =
      newStatus === "active" ? "OPENED" : newStatus === "paused" ? "PAUSED" : "CLOSED";
    const message = `[Tiqkets] Queue ${label}\nBranch: ${branch.name}\nService: ${serviceName}\nTime: ${new Date().toLocaleString()}`;
    await sendAlertToRecipients(recipients, message);

    await db
      .update(branchAlertState)
      .set({ lastValue: statusCode, lastTriggeredAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(branchAlertState.branchId, branchId),
          eq(branchAlertState.triggerKind, "queue_status"),
          eq(branchAlertState.scopeId, serviceId),
        ),
      );
  } catch (err) {
    console.error("notifyOrgServiceQueueStatusChange error:", err);
  }
}

/**
 * Evaluate all numeric branch-wide alerts (waiting count + avg wait time)
 * applying hysteresis: trigger when over MAX, re-arm only after dropping below MIN.
 * Safe to call after any ticket mutation.
 */
export async function evaluateBranchAlerts(branchId: string): Promise<void> {
  try {
    const branch = await getBranch(branchId);
    if (!branch) return;

    const thresholds = readAlertThresholds(branch.displaySettings as unknown);
    if (!thresholds.enabled) return;

    // Count waiting tickets and compute average estimated wait time among them
    const waitingRows = await db
      .select({
        count: sql<number>`count(*)::int`,
        avgWait: sql<number>`coalesce(avg(${tickets.estimatedWaitTime}), 0)::int`,
      })
      .from(tickets)
      .where(and(eq(tickets.branchId, branchId), eq(tickets.status, "waiting")));

    const waitingCount = Number(waitingRows[0]?.count ?? 0);
    const avgWaitSeconds = Number(waitingRows[0]?.avgWait ?? 0);

    // ---- Waiting count alert ----
    if (thresholds.waitingCountMax > 0) {
      const state = await getOrCreateState(branchId, "waiting_count", "");
      const overMax = waitingCount >= thresholds.waitingCountMax;
      const belowMin = waitingCount <= thresholds.waitingCountMin;
      if (!state.isTriggered && overMax) {
        const recipients = await getRecipientsFor(branchId, "alertOnWaitingCountMax");
        if (recipients.length > 0) {
          const msg = `[Tiqkets] High Waiting Count\nBranch: ${branch.name}\nWaiting: ${waitingCount} (threshold ${thresholds.waitingCountMax})\nTime: ${new Date().toLocaleString()}`;
          await sendAlertToRecipients(recipients, msg);
        }
        await setStateTriggered(branchId, "waiting_count", "", waitingCount);
      } else if (state.isTriggered && belowMin) {
        await setStateCleared(branchId, "waiting_count", "", waitingCount);
      }
    }

    // ---- Average waiting time alert ----
    if (thresholds.avgWaitTimeMaxSeconds > 0) {
      const state = await getOrCreateState(branchId, "avg_wait_time", "");
      const overMax = avgWaitSeconds >= thresholds.avgWaitTimeMaxSeconds;
      const belowMin = avgWaitSeconds <= thresholds.avgWaitTimeMinSeconds;
      if (!state.isTriggered && overMax) {
        const recipients = await getRecipientsFor(branchId, "alertOnAvgWaitTimeMax");
        if (recipients.length > 0) {
          const msg = `[Tiqkets] High Average Wait Time\nBranch: ${branch.name}\nAvg wait: ${formatMinutes(avgWaitSeconds)} (threshold ${formatMinutes(thresholds.avgWaitTimeMaxSeconds)})\nTime: ${new Date().toLocaleString()}`;
          await sendAlertToRecipients(recipients, msg);
        }
        await setStateTriggered(branchId, "avg_wait_time", "", avgWaitSeconds);
      } else if (state.isTriggered && belowMin) {
        await setStateCleared(branchId, "avg_wait_time", "", avgWaitSeconds);
      }
    }
  } catch (err) {
    console.error("evaluateBranchAlerts error:", err);
  }
}

/** Build a one-line preview message used by the "Send test" button. */
export function buildTestAlertMessage(branchName: string): string {
  return `[Tiqkets] Test alert\nBranch: ${branchName}\nThis is a test message from your Tiqkets dashboard. If you received this, alerts are configured correctly.`;
}
