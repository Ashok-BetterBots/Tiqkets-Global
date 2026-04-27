import { db } from "./db";
import {
  branches,
  branchAlertRecipients,
  branchAlertState,
  tickets,
  orgUserPushTokens,
  type BranchAlertRecipient,
} from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";
import { sendWhatsAppMessage } from "./whatsapp";

export type AlertTriggerKind = "waiting_count" | "avg_wait_time" | "queue_status";

export interface AlertThresholds {
  waitingCountMax: number;
  waitingCountMin: number;
  avgWaitTimeMaxMinutes: number;
  avgWaitTimeMinMinutes: number;
  enabled: boolean;
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  waitingCountMax: 0,
  waitingCountMin: 0,
  avgWaitTimeMaxMinutes: 0,
  avgWaitTimeMinMinutes: 0,
  enabled: false,
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: "default" | null;
  channelId?: string;
  priority?: "default" | "normal" | "high";
}

function isValidExpoPushToken(token: string): boolean {
  return typeof token === "string" && (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["));
}

async function sendExpoPushBatch(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
    if (!response.ok) {
      console.error("Expo push API error:", response.status, await response.text());
    }
  } catch (err) {
    console.error("Failed to send Expo push:", err);
  }
}

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
    avgWaitTimeMaxMinutes: num(raw.avgWaitTimeMaxMinutes, DEFAULT_THRESHOLDS.avgWaitTimeMaxMinutes),
    avgWaitTimeMinMinutes: num(raw.avgWaitTimeMinMinutes, DEFAULT_THRESHOLDS.avgWaitTimeMinMinutes),
    enabled: raw.enabled === false ? false : true,
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

async function getOrgUserPushTokens(userId: string): Promise<string[]> {
  const rows = await db
    .select({ pushToken: orgUserPushTokens.pushToken })
    .from(orgUserPushTokens)
    .where(eq(orgUserPushTokens.userId, userId));
  return rows.map((r) => r.pushToken).filter(isValidExpoPushToken);
}

export async function sendAlertToRecipient(
  recipient: BranchAlertRecipient,
  title: string,
  message: string,
): Promise<{ wa: boolean; push: boolean }> {
  const result = { wa: false, push: false };

  if (recipient.sendViaWhatsapp && recipient.phoneNumber) {
    try {
      result.wa = await sendWhatsAppMessage(recipient.phoneNumber, `${title}\n${message}`);
    } catch (err) {
      console.error("Alert WA send error to", recipient.phoneNumber, err);
    }
  }

  if (recipient.sendViaPush && recipient.userId) {
    try {
      const tokens = await getOrgUserPushTokens(recipient.userId);
      if (tokens.length > 0) {
        await sendExpoPushBatch(
          tokens.map((to) => ({
            to,
            title,
            body: message,
            sound: "default",
            channelId: "queue-alerts",
            priority: "high",
            data: { type: "branch_alert", branchId: recipient.branchId },
          })),
        );
        result.push = true;
      }
    } catch (err) {
      console.error("Alert push send error for user", recipient.userId, err);
    }
  }

  return result;
}

export async function sendAlertToRecipients(
  recipients: BranchAlertRecipient[],
  title: string,
  message: string,
): Promise<void> {
  await Promise.all(recipients.map((r) => sendAlertToRecipient(r, title, message)));
}

function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${m} min`;
}

/**
 * Notify org alert recipients when a service queue's status transitions.
 * Edge-triggered: only fires when status actually changes for the service.
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
    if (recipients.length > 0) {
      const label =
        newStatus === "active" ? "OPENED" : newStatus === "paused" ? "PAUSED" : "CLOSED";
      const title = `Tiqkets · Queue ${label}`;
      const body = `Branch: ${branch.name}\nService: ${serviceName}\nTime: ${new Date().toLocaleString()}`;
      await sendAlertToRecipients(recipients, title, body);
    }

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
 * Evaluate branch-wide numeric alerts (waiting count + avg wait time)
 * with hysteresis: trigger when over MAX, re-arm only after dropping below MIN.
 * Safe to call after any ticket mutation.
 */
export async function evaluateBranchAlerts(branchId: string): Promise<void> {
  try {
    const branch = await getBranch(branchId);
    if (!branch) return;

    const thresholds = readAlertThresholds(branch.displaySettings as unknown);
    if (!thresholds.enabled) return;

    const waitingRows = await db
      .select({
        count: sql<number>`count(*)::int`,
        avgWait: sql<number>`coalesce(avg(${tickets.estimatedWaitTime}), 0)::int`,
      })
      .from(tickets)
      .where(and(eq(tickets.branchId, branchId), eq(tickets.status, "waiting")));

    const waitingCount = Number(waitingRows[0]?.count ?? 0);
    const avgWaitMinutes = Number(waitingRows[0]?.avgWait ?? 0);

    if (thresholds.waitingCountMax > 0) {
      const state = await getOrCreateState(branchId, "waiting_count", "");
      const overMax = waitingCount >= thresholds.waitingCountMax;
      const belowMin = waitingCount <= thresholds.waitingCountMin;
      if (!state.isTriggered && overMax) {
        const recipients = await getRecipientsFor(branchId, "alertOnWaitingCountMax");
        if (recipients.length > 0) {
          const title = `Tiqkets · High waiting count`;
          const body = `Branch: ${branch.name}\nWaiting: ${waitingCount} (threshold ${thresholds.waitingCountMax})\nTime: ${new Date().toLocaleString()}`;
          await sendAlertToRecipients(recipients, title, body);
        }
        await setStateTriggered(branchId, "waiting_count", "", waitingCount);
      } else if (state.isTriggered && belowMin) {
        await setStateCleared(branchId, "waiting_count", "", waitingCount);
      }
    }

    if (thresholds.avgWaitTimeMaxMinutes > 0) {
      const state = await getOrCreateState(branchId, "avg_wait_time", "");
      const overMax = avgWaitMinutes >= thresholds.avgWaitTimeMaxMinutes;
      const belowMin = avgWaitMinutes <= thresholds.avgWaitTimeMinMinutes;
      if (!state.isTriggered && overMax) {
        const recipients = await getRecipientsFor(branchId, "alertOnAvgWaitTimeMax");
        if (recipients.length > 0) {
          const title = `Tiqkets · High average wait time`;
          const body = `Branch: ${branch.name}\nAvg wait: ${formatMinutes(avgWaitMinutes)} (threshold ${formatMinutes(thresholds.avgWaitTimeMaxMinutes)})\nTime: ${new Date().toLocaleString()}`;
          await sendAlertToRecipients(recipients, title, body);
        }
        await setStateTriggered(branchId, "avg_wait_time", "", avgWaitMinutes);
      } else if (state.isTriggered && belowMin) {
        await setStateCleared(branchId, "avg_wait_time", "", avgWaitMinutes);
      }
    }
  } catch (err) {
    console.error("evaluateBranchAlerts error:", err);
  }
}

export function buildTestAlertTitle(): string {
  return "Tiqkets · Test alert";
}

export function buildTestAlertMessage(branchName: string): string {
  return `Branch: ${branchName}\nThis is a test message from your Tiqkets dashboard. If you received this, alerts are configured correctly.`;
}
