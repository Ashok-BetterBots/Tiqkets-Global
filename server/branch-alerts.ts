import { db } from "./db";
import {
  branches,
  branchAlertRecipients,
  branchAlertState,
  tickets,
  services,
  orgUserPushTokens,
  type BranchAlertRecipient,
} from "@shared/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { isDineInMode } from "@shared/dineInFields";
import { sendWhatsAppMessage, sendWhatsAppAlertTemplate } from "./whatsapp";
import { getOrganizationCalendar } from "./organization-calendar";

type AlertTemplateName =
  | "org_alert_high_volume"
  | "org_alert_queue_end"
  | "org_alert_queue_start"
  | "org_alert_wait_time";

interface AlertPayload {
  // Plain-text variant used for push notifications and as a WhatsApp
  // fallback when no template / credentials are available.
  title: string;
  message: string;
  // When set, WhatsApp delivery uses the named pre-approved template
  // with the supplied positional body parameters instead of free text.
  template?: { name: AlertTemplateName; params: Array<string | number> };
}

export type AlertTriggerKind =
  | "waiting_count"
  | "avg_wait_time"
  | "queue_status"
  // Anchors the start-of-session timestamp for a service queue. Stored
  // on its own row (separate triggerKind) so transitions to paused/
  // ended don't overwrite the open time used by end-of-queue stats.
  | "queue_open"
  // Used by the auto-end scheduler (server/queue-auto-end.ts) to track
  // when an active service queue first went empty, so it can be ended
  // automatically after a sustained idle period.
  | "queue_idle";

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
  payload: AlertPayload,
): Promise<{ wa: boolean; push: boolean }> {
  const result = { wa: false, push: false };
  const { title, message, template } = payload;
  const isQueueStatusAlert =
    template?.name === "org_alert_queue_start" ||
    template?.name === "org_alert_queue_end";

  if (recipient.sendViaWhatsapp && recipient.phoneNumber) {
    try {
      if (template) {
        // Build the per-recipient parameter list. {{1}} is always the
        // recipient's display name so each user sees a personalised
        // greeting; the remaining params come from the caller in order.
        const params = [recipient.name || "there", ...template.params];
        result.wa = await sendWhatsAppAlertTemplate(
          recipient.phoneNumber,
          template.name,
          params,
        );
        // If the template send failed (e.g. credentials missing) fall
        // back to plain text so the alert is not silently dropped.
        if (!result.wa) {
          const queueTemplateName =
            template.name === "org_alert_queue_start" ||
            template.name === "org_alert_queue_end"
              ? template.name
              : undefined;
          result.wa = await sendWhatsAppMessage(
            recipient.phoneNumber,
            `${title}\n${message}`,
            undefined,
            queueTemplateName ? { queueAlertTemplate: queueTemplateName } : undefined,
          );
        }
      } else {
        result.wa = await sendWhatsAppMessage(
          recipient.phoneNumber,
          `${title}\n${message}`,
        );
      }
    } catch (err) {
      if (isQueueStatusAlert) {
        console.error(
          `[org-queue-alert] recipient send error template=${template?.name}`,
        );
      } else {
        console.error("Alert WA send error to", recipient.phoneNumber, err);
      }
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
  payload: AlertPayload,
): Promise<void> {
  await Promise.all(recipients.map((r) => sendAlertToRecipient(r, payload)));
}

function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${m} min`;
}

// "27 Apr 2026" — short, locale-stable, easy to read in WhatsApp.
function formatAlertDate(d: Date, timeZone: string): string {
  return d.toLocaleDateString("en-GB", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// "10:30 AM" — same intent as formatAlertDate (compact, unambiguous).
function formatAlertTime(d: Date, timeZone: string): string {
  return d.toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// Compose a single string with branch name and city/address so the
// queue-start / queue-end templates have a meaningful "location" slot.
function locationLabelFor(branch: { name: string; address: string | null; city: string | null } | undefined | null): string {
  if (!branch) return "";
  const place = branch.city || branch.address || "";
  return place ? `${branch.name}, ${place}` : branch.name;
}

async function getServiceById(serviceId: string) {
  const rows = await db
    .select()
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1);
  return rows[0];
}

interface QueueEndStats {
  totalEntries: number;
  totalVisitors: number;
  served: number;
  cancelled: number;
  noShow: number;
  walkins: number;
  avgWaitMinutes: number;
  peakWaitMinutes: number;
}

/**
 * Aggregate service-level statistics for a closed queue session,
 * Dine In uses bookings joined between opening and closing, seated outcomes
 * and measured waits. Other modes keep their existing created-since window.
 * Visitor count sums captured party sizes, or one visitor per ticket.
 */
async function aggregateQueueEndStats(
  branchId: string,
  serviceId: string,
  since: Date,
  session?: { dineIn: boolean; endedAt: Date },
): Promise<QueueEndStats> {
  const dineIn = session?.dineIn === true;
  const rows = await db
    .select()
    .from(tickets)
    .where(
      and(
        eq(tickets.branchId, branchId),
        eq(tickets.serviceId, serviceId),
        gte(dineIn ? tickets.joinedAt : tickets.createdAt, since),
        ...(dineIn ? [lte(tickets.joinedAt, session!.endedAt)] : []),
      ),
    );

  let served = 0;
  let cancelled = 0;
  let noShow = 0;
  let walkins = 0;
  let totalVisitors = 0;
  const waitTimes: number[] = [];

  for (const t of rows) {
    const status = String(t.status || "").toLowerCase();
    const wasServed = status === "completed" || status === "served" || (dineIn && status === "arrived");
    if (wasServed) served++;
    else if (status === "cancelled" || status === "canceled") cancelled++;
    else if (status === "no_show") noShow++;

    const fd = (t.formData as any) || {};
    const isWalkin = fd.isWalkin === true || fd.walkin === true || fd.source === "walkin";
    if (isWalkin) walkins++;

    const partySize = Number(fd.partySize ?? fd.guests ?? 0);
    totalVisitors += Number.isFinite(partySize) && partySize > 0 ? partySize : 1;

    // Dine In performance uses measured waits for served/seated bookings,
    // starting when they joined. Predictions and unfinished bookings are
    // not actual wait samples. Other modes retain their existing calculation.
    let wait: number | null = null;
    if (dineIn) {
      const waitEndedAt = t.calledAt || t.servedAt || t.arrivedAt;
      if (wasServed && waitEndedAt && t.joinedAt) {
        wait = (new Date(waitEndedAt).getTime() - new Date(t.joinedAt).getTime()) / 60000;
      } else if (wasServed && typeof t.actualWaitTime === "number") {
        wait = t.actualWaitTime;
      }
    } else if (t.calledAt && t.createdAt) {
      wait = (new Date(t.calledAt).getTime() - new Date(t.createdAt).getTime()) / 60000;
    } else if (typeof t.estimatedWaitTime === "number") {
      wait = t.estimatedWaitTime;
    }
    if (wait !== null && Number.isFinite(wait) && wait >= 0) waitTimes.push(wait);
  }

  const avgWait = waitTimes.length
    ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
    : 0;
  const peakWait = waitTimes.length ? Math.max(...waitTimes) : 0;

  return {
    totalEntries: rows.length,
    totalVisitors,
    served,
    cancelled,
    noShow,
    walkins,
    avgWaitMinutes: Math.round(avgWait),
    peakWaitMinutes: Math.round(peakWait),
  };
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
  previousStatus?: "active" | "paused" | "ended",
): Promise<void> {
  try {
    // Capture the transition before network delivery. Slow opening alerts must
    // not move the session anchor past bookings made while they are sending.
    const transitionAt = new Date();
    const queueTemplateName =
      newStatus === "active"
        ? "org_alert_queue_start"
        : newStatus === "ended"
          ? "org_alert_queue_end"
          : null;
    const branch = await getBranch(branchId);
    if (!branch) {
      if (queueTemplateName) {
        console.log(
          `[org-queue-alert] skipped status=${newStatus} recipientCount=not_queried template=${queueTemplateName} reason=branch_not_found`,
        );
      }
      return;
    }

    const calendar = await getOrganizationCalendar(branch.organizationId);
    const state = await getOrCreateState(branchId, "queue_status", serviceId);
    const statusCode = newStatus === "active" ? 1 : newStatus === "paused" ? 2 : 3;
    // Dedicated status routes confirm a real service transition. Alert state
    // can be stale from the period when those routes bypassed this notifier.
    const confirmedTransition = previousStatus !== undefined && previousStatus !== newStatus;
    if (state.lastValue === statusCode && !confirmedTransition) {
      if (queueTemplateName) {
        console.log(
          `[org-queue-alert] skipped status=${newStatus} recipientCount=not_queried template=${queueTemplateName} reason=status_unchanged`,
        );
      }
      return;
    }

    // Track the explicit queue-open timestamp on a separate row using
    // its own triggerKind ("queue_open") with scopeId = serviceId. The
    // main queue_status row's lastTriggeredAt gets overwritten on every
    // transition (active/paused/ended), so it can't be used as the
    // "since queue started" anchor for end-of-day stats. We use a
    // distinct triggerKind rather than suffixing the scopeId because
    // the scope_id column is varchar(36) and a UUID already fills it.
    const openedState = await getOrCreateState(branchId, "queue_open", serviceId);
    const previousStatusCode = previousStatus === undefined
      ? state.lastValue
      : previousStatus === "active" ? 1 : previousStatus === "paused" ? 2 : 3;
    // A fresh start gets its anchor before sending alerts. A resume keeps it.
    if (newStatus === "active" && (previousStatusCode == null || previousStatusCode === 3)) {
      await db
        .update(branchAlertState)
        .set({ lastTriggeredAt: transitionAt, updatedAt: transitionAt })
        .where(
          and(
            eq(branchAlertState.branchId, branchId),
            eq(branchAlertState.triggerKind, "queue_open"),
            eq(branchAlertState.scopeId, serviceId),
          ),
        );
    }

    const recipients = await getRecipientsFor(branchId, "alertOnQueueOpenClose");
    if (queueTemplateName && recipients.length === 0) {
      console.log(
        `[org-queue-alert] skipped status=${newStatus} recipientCount=0 template=${queueTemplateName} reason=no_recipients`,
      );
    }
    if (recipients.length > 0) {
      const label =
        newStatus === "active" ? "OPENED" : newStatus === "paused" ? "PAUSED" : "CLOSED";
      const title = `Tiqkets · Queue ${label}`;
      const now = transitionAt;
      const location = locationLabelFor(branch);
      const body = `Branch: ${branch.name}\nService: ${serviceName}\nTime: ${now.toLocaleString("en-IN", { timeZone: calendar.timeZone })}`;

      const payload: AlertPayload = { title, message: body };

      if (newStatus === "active") {
        // org_alert_queue_start body params (after the {{1}} recipient
        // name prepended by sendAlertToRecipient):
        // {{2}} service name, {{3}} location, {{4}} start time
        payload.template = {
          name: "org_alert_queue_start",
          params: [serviceName, location, formatAlertTime(now, calendar.timeZone)],
        };
      } else if (newStatus === "ended") {
        // Use the dedicated queue-open timestamp as the session anchor.
        // Falls back to organisation midnight when no prior open transition was
        // ever recorded (e.g. first time this service flips to ended).
        const startedAt =
          openedState.lastTriggeredAt instanceof Date
            ? openedState.lastTriggeredAt
            : calendar.dayStart(calendar.dateKey(now));

        const service = await getServiceById(serviceId);
        const mode = (service?.serviceSettings as { queueMode?: string } | undefined)?.queueMode
          || branch.queueMode;
        const stats = await aggregateQueueEndStats(branchId, serviceId, startedAt, {
          dineIn: isDineInMode(mode),
          endedAt: now,
        });

        // org_alert_queue_end body params (after {{1}} recipient name):
        // {{2}} service, {{3}} location, {{4}} date, {{5}} start time,
        // {{6}} end time, {{7}} total entries, {{8}} total visitors,
        // {{9}} served, {{10}} cancelled, {{11}} no-show,
        // {{12}} walk-ins, {{13}} avg wait min, {{14}} peak wait min
        payload.template = {
          name: "org_alert_queue_end",
          params: [
            serviceName,
            location,
            formatAlertDate(now, calendar.timeZone),
            formatAlertTime(startedAt, calendar.timeZone),
            formatAlertTime(now, calendar.timeZone),
            stats.totalEntries,
            stats.totalVisitors,
            stats.served,
            stats.cancelled,
            stats.noShow,
            stats.walkins,
            stats.avgWaitMinutes,
            stats.peakWaitMinutes,
          ],
        };
      }

      if (queueTemplateName) {
        console.log(
          `[org-queue-alert] attempted status=${newStatus} recipientCount=${recipients.length} template=${queueTemplateName}`,
        );
      }
      await sendAlertToRecipients(recipients, payload);
    }

    await db
      .update(branchAlertState)
      .set({ lastValue: statusCode, lastTriggeredAt: transitionAt, updatedAt: transitionAt })
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
    const calendar = await getOrganizationCalendar(branch.organizationId);

    const waitingRows = await db
      .select({
        count: sql<number>`count(*)::int`,
        avgWait: sql<number>`coalesce(avg(${tickets.estimatedWaitTime}), 0)::int`,
      })
      .from(tickets)
      .where(and(eq(tickets.branchId, branchId), eq(tickets.status, "waiting")));

    const waitingCount = Number(waitingRows[0]?.count ?? 0);
    const avgWaitMinutes = Number(waitingRows[0]?.avgWait ?? 0);

    // The branch-wide thresholds don't target a single service, so the
    // template's "service" slot ({{3}}) is filled with the branch's
    // location label instead — keeping the placeholder informative.
    const branchLocation = locationLabelFor(branch);

    if (thresholds.waitingCountMax > 0) {
      const state = await getOrCreateState(branchId, "waiting_count", "");
      const overMax = waitingCount >= thresholds.waitingCountMax;
      const belowMin = waitingCount <= thresholds.waitingCountMin;
      if (!state.isTriggered && overMax) {
        const recipients = await getRecipientsFor(branchId, "alertOnWaitingCountMax");
        if (recipients.length > 0) {
          const now = new Date();
          const title = `Tiqkets · High waiting count`;
          const body = `Branch: ${branch.name}\nWaiting: ${waitingCount} (threshold ${thresholds.waitingCountMax})\nTime: ${now.toLocaleString("en-IN", { timeZone: calendar.timeZone })}`;
          // org_alert_high_volume body params (after {{1}} recipient name):
          // {{2}} branch, {{3}} location, {{4}} threshold,
          // {{5}} current entries, {{6}} date, {{7}} time
          await sendAlertToRecipients(recipients, {
            title,
            message: body,
            template: {
              name: "org_alert_high_volume",
              params: [
                branch.name,
                branchLocation,
                thresholds.waitingCountMax,
                waitingCount,
                formatAlertDate(now, calendar.timeZone),
                formatAlertTime(now, calendar.timeZone),
              ],
            },
          });
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
          const now = new Date();
          const title = `Tiqkets · High average wait time`;
          const body = `Branch: ${branch.name}\nAvg wait: ${formatMinutes(avgWaitMinutes)} (threshold ${formatMinutes(thresholds.avgWaitTimeMaxMinutes)})\nTime: ${now.toLocaleString("en-IN", { timeZone: calendar.timeZone })}`;
          // org_alert_wait_time body params (after {{1}} recipient name):
          // {{2}} branch, {{3}} location, {{4}} threshold mins,
          // {{5}} current avg mins, {{6}} date, {{7}} time,
          // {{8}} current queue size
          await sendAlertToRecipients(recipients, {
            title,
            message: body,
            template: {
              name: "org_alert_wait_time",
              params: [
                branch.name,
                branchLocation,
                thresholds.avgWaitTimeMaxMinutes,
                avgWaitMinutes,
                formatAlertDate(now, calendar.timeZone),
                formatAlertTime(now, calendar.timeZone),
                waitingCount,
              ],
            },
          });
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
