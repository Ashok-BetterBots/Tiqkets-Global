// ============================================
// EVENTS QUEUE MODE — automated WhatsApp reminders.
//
// Runs on an interval (mirrors queue-auto-end.ts) and sends three
// one-shot messages per registration, gated by the *SentAt timestamp
// columns so a message can never double-send:
//   • reminder_day  — ~24h before the slot start
//   • reminder_hour — ~1h before the slot start
//   • slot_active   — at slot start
// Slot wall-clock times are interpreted in the branch's IANA timezone.
// ============================================

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db";
import { events, eventRegistrations, branches } from "@shared/schema";
import { slotStartUtc, sendEventTrigger } from "./events-routes";

const CHECK_INTERVAL_MS = 60 * 1000;
// Don't send a reminder that is already stale by more than this much
// (e.g. server was down); the next tier will still fire on time.
const MAX_LATE_MS = 6 * 60 * 60 * 1000;

const REMINDABLE_STATUSES = ["ticket_generated", "payment_completed"];

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
          } else if (!reg.reminderHourSentAt && now >= slotStart - 60 * 60 * 1000 && slotStart - now > 5 * 60 * 1000) {
            await sendOneShot(ev, reg, "reminder_hour", { reminderHourSentAt: new Date() });
          } else if (!reg.reminderDaySentAt && now >= slotStart - 24 * 60 * 60 * 1000 && slotStart - now > 2 * 60 * 60 * 1000) {
            await sendOneShot(ev, reg, "reminder_day", { reminderDaySentAt: new Date() });
          }
        } catch (e) {
          console.error("[event-reminders] send failed for", reg.id, e);
        }
      }
    }
  } catch (e) {
    console.error("[event-reminders] tick failed:", e);
  } finally {
    running = false;
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
  await sendEventTrigger(ev, claimed, trigger);
  console.log(`[event-reminders] sent ${trigger} to ${claimed.bookingId}`);
}
