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
        if (!reg.slotActiveSentAt && now >= slotStart && now - slotStart <= MAX_LATE_MS) {
          await sendOneShot(ev, reg, "slot_active", { slotActiveSentAt: new Date() });
        } else if (
          !reg.reminderHourSentAt &&
          now >= slotStart - 35 * 60 * 1000 &&
          now <= slotStart - 25 * 60 * 1000
        ) {
          await sendOneShot(ev, reg, "reminder_hour", { reminderHourSentAt: new Date() });
        } else if (
          !reg.reminderDaySentAt &&
          now >= slotStart - 24 * 60 * 60 * 1000 &&
          now - (slotStart - 24 * 60 * 60 * 1000) <= REMINDER_DAY_WINDOW_MS
        ) {
          await sendOneShot(ev, reg, "reminder_day", { reminderDaySentAt: new Date() });
        }
      } catch (e) {
        console.error("[event-reminders] send failed for", reg.id, e);
      }
    }
  }
}

async function sendOneShot(
  ev: typeof events.$inferSelect,
  reg: typeof eventRegistrations.$inferSelect,
  trigger: "reminder_day" | "reminder_hour" | "slot_active",
  patch: Partial<typeof eventRegistrations.$inferInsert>,
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
  let regForSend = claimed;
  let headerImageUrl: string | undefined;
  if (trigger === "reminder_hour") {
    // The 30-min reminder attaches the Tiqket image; generate it now if it
    // somehow hasn't been issued yet (issueTicket is a no-op otherwise).
    if (!regForSend.ticketImageUrl) {
      regForSend = await issueTicket(ev, regForSend);
    }
    headerImageUrl = regForSend.ticketImageUrl || undefined;
  }
  const sent = await sendEventTrigger(ev, regForSend, trigger, headerImageUrl);
  console.log(`[event-reminders] ${sent ? "sent" : "FAILED to send"} ${trigger} to ${regForSend.bookingId} (phone ${regForSend.customerPhone})`);
}
