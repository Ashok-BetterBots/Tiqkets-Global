// ============================================
// EVENTS QUEUE MODE — automated WhatsApp reminders.
//
// Runs on an interval (mirrors queue-auto-end.ts) and sends three
// one-shot messages per registration, gated by the *SentAt timestamp
// columns so a message can never double-send:
//   • reminder_day  — ~24h before the slot start
//   • reminder_hour — ~30 min before the slot start (25-35 min window)
//   • slot_active   — at slot start
// Slot wall-clock times are interpreted in the branch's IANA timezone.
// ============================================

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db";
import { events, eventRegistrations, branches } from "@shared/schema";
import { slotStartUtc, sendEventTrigger, issueTicket } from "./events-routes";

const CHECK_INTERVAL_MS = 60 * 1000;
// Don't send a reminder that is already stale by more than this much
// (e.g. server was down); the next tier will still fire on time.
const MAX_LATE_MS = 6 * 60 * 60 * 1000;
// The "day before" reminder must fire exactly at the 24h-before mark, not
// at any point up to 24h before the slot. This bounds how late a missed
// tick (e.g. brief server downtime) is still allowed to catch up — beyond
// this window the reminder is skipped entirely rather than sent late with
// less than ~24h actually remaining.
const REMINDER_DAY_WINDOW_MS = 15 * 60 * 1000;

const REMINDABLE_STATUSES = ["ticket_generated", "payment_completed"];

export type EventReminderTrigger = "reminder_day" | "reminder_hour" | "slot_active";

export type EventReminderSentFlags = {
  reminderDaySentAt?: Date | null;
  reminderHourSentAt?: Date | null;
  slotActiveSentAt?: Date | null;
};

export function isEventReminderTriggerEnabled(
  whatsappTriggers: typeof events.$inferSelect["whatsappTriggers"] | null | undefined,
  trigger: EventReminderTrigger,
): boolean {
  return trigger === "slot_active" || whatsappTriggers?.[trigger] !== false;
}

/**
 * Select the highest-priority reminder due at a given instant. Keeping this
 * calculation separate makes the exact windows testable without waiting on a
 * real scheduler tick.
 */
export function getDueEventReminderTrigger(
  now: number,
  slotStart: number,
  sent: EventReminderSentFlags = {},
): EventReminderTrigger | null {
  if (!sent.slotActiveSentAt && now >= slotStart && now - slotStart <= MAX_LATE_MS) {
    return "slot_active";
  }
  if (
    !sent.reminderHourSentAt &&
    now >= slotStart - 35 * 60 * 1000 &&
    now <= slotStart - 25 * 60 * 1000
  ) {
    return "reminder_hour";
  }
  if (
    !sent.reminderDaySentAt &&
    now >= slotStart - 24 * 60 * 60 * 1000 &&
    now - (slotStart - 24 * 60 * 60 * 1000) <= REMINDER_DAY_WINDOW_MS
  ) {
    return "reminder_day";
  }
  return null;
}

// Connection-error messages that warrant a single automatic retry.
const CONNECTION_ERROR_PATTERNS = [
  "connection timeout",
  "connection terminated",
  "connection refused",
  "terminating connection",
  "econnreset",
  "enotfound",
];

function isConnectionError(e: unknown): boolean {
  const msg = String(e instanceof Error ? e.message : e).toLowerCase();
  return CONNECTION_ERROR_PATTERNS.some((p) => msg.includes(p));
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export function startEventReminders(): void {
  if (timer) return;
  timer = setInterval(() => {
    void tick();
  }, CHECK_INTERVAL_MS);
  console.log("[event-reminders] scheduler started");
}

export function stopEventReminders(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await runTick();
  } catch (e) {
    if (isConnectionError(e)) {
      // Single retry after a short pause to let the pool establish a fresh
      // connection — connection drops are transient on Replit's hosted PG.
      console.warn("[event-reminders] connection error, retrying in 5s:", (e as Error).message);
      await new Promise((r) => setTimeout(r, 5000));
      try {
        await runTick();
      } catch (e2) {
        console.error("[event-reminders] retry also failed:", e2);
      }
    } else {
      console.error("[event-reminders] tick failed:", e);
    }
  } finally {
    running = false;
  }
}

async function runTick(): Promise<void> {
  const activeEvents = await db.select().from(events).where(eq(events.status, "published"));
  if (activeEvents.length === 0) return;

  const branchIds = [...new Set(activeEvents.map((e) => e.branchId))];
  const branchRows = await db.select().from(branches).where(inArray(branches.id, branchIds));
  const tzByBranch = new Map(branchRows.map((b) => [b.id, b.timezone || "Asia/Kolkata"]));

  const now = Date.now();
  for (const ev of activeEvents) {
    const tz = tzByBranch.get(ev.branchId) || "Asia/Kolkata";
    const regs = await db
      .select()
      .from(eventRegistrations)
      .where(and(
        eq(eventRegistrations.eventId, ev.id),
        inArray(eventRegistrations.status, REMINDABLE_STATUSES),
      ));
    for (const reg of regs) {
      let slotStart: number;
      try {
        slotStart = slotStartUtc(reg, tz).getTime();
      } catch {
        continue;
      }
      try {
        const trigger = getDueEventReminderTrigger(now, slotStart, reg);
        if (
          trigger &&
          isEventReminderTriggerEnabled(ev.whatsappTriggers, trigger)
        ) {
          const patch = trigger === "slot_active"
            ? { slotActiveSentAt: new Date() }
            : trigger === "reminder_hour"
              ? { reminderHourSentAt: new Date() }
              : { reminderDaySentAt: new Date() };
          await sendEventReminderOnce(ev, reg, trigger, patch);
        }
      } catch (e) {
        console.error("[event-reminders] send failed for", reg.id, e);
      }
    }
  }
}

export async function sendEventReminderOnce(
  ev: typeof events.$inferSelect,
  reg: typeof eventRegistrations.$inferSelect,
  trigger: EventReminderTrigger,
  patch: Partial<typeof eventRegistrations.$inferInsert>,
  sendTrigger: typeof sendEventTrigger = sendEventTrigger,
  issueTicketForSend: typeof issueTicket = issueTicket,
): Promise<void> {
  // Claim the flag first (conditional update) so two ticks can't both send.
  const flagCol =
    trigger === "reminder_day" ? eventRegistrations.reminderDaySentAt :
    trigger === "reminder_hour" ? eventRegistrations.reminderHourSentAt :
    eventRegistrations.slotActiveSentAt;
  const [claimed] = await db
    .update(eventRegistrations)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(eventRegistrations.id, reg.id), isNull(flagCol)))
    .returning();
  if (!claimed) return;
  const claimFlagName = flagName(trigger);
  const claimedAt = claimed[claimFlagName];
  if (!claimedAt) return;
  let regForSend = claimed;
  let headerImageUrl: string | undefined;
  const releaseClaim = async () => {
    try {
      // Keep the claim as a lock while the send is in flight, but make a
      // failed attempt eligible for the next scheduler tick.
      await db
        .update(eventRegistrations)
        .set({ [claimFlagName]: null, updatedAt: new Date() })
        .where(and(eq(eventRegistrations.id, claimed.id), eq(flagCol, claimedAt)));
    } catch (e) {
      console.error("[event-reminders] failed to release send claim for", reg.id, e);
    }
  };
  try {
    if (trigger === "reminder_hour") {
      // The 30-min reminder attaches the Tiqket image; generate it now if it
      // somehow hasn't been issued yet (issueTicket is a no-op otherwise).
      if (!regForSend.ticketImageUrl) {
        regForSend = await issueTicketForSend(ev, regForSend);
      }
      headerImageUrl = regForSend.ticketImageUrl || undefined;
    }
    const sent = await sendTrigger(ev, regForSend, trigger, headerImageUrl);
    if (!sent) await releaseClaim();
    console.log(`[event-reminders] ${sent ? "sent" : "FAILED to send"} ${trigger} to ${regForSend.bookingId} (phone ${regForSend.customerPhone})`);
  } catch (e) {
    await releaseClaim();
    throw e;
  }
}

function flagName(trigger: EventReminderTrigger): "reminderDaySentAt" | "reminderHourSentAt" | "slotActiveSentAt" {
  return trigger === "reminder_day"
    ? "reminderDaySentAt"
    : trigger === "reminder_hour"
      ? "reminderHourSentAt"
      : "slotActiveSentAt";
}
