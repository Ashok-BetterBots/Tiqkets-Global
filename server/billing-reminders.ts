import { db } from "./db";
import { subscriptions } from "@shared/schema";
import { and, eq, gt, isNotNull, isNull, lte, or } from "drizzle-orm";
import { storage } from "./storage";
import { sendExpiryReminderEmail } from "./mailer";

const SCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const REMINDER_BUCKETS = [7, 3, 1] as const;
type Bucket = (typeof REMINDER_BUCKETS)[number];

function pickBucket(daysRemaining: number): Bucket | null {
  if (daysRemaining <= 1) return 1;
  if (daysRemaining <= 3) return 3;
  if (daysRemaining <= 7) return 7;
  return null;
}

function effectiveExpiryDate(sub: {
  status: string | null;
  trialEndDate: Date | null;
  currentPeriodEnd: Date | null;
}): Date | null {
  if (sub.status === "trialing") return sub.trialEndDate ?? sub.currentPeriodEnd ?? null;
  return sub.currentPeriodEnd ?? sub.trialEndDate ?? null;
}

async function scanAndSendOnce(): Promise<{ scanned: number; sent: number; skipped: number }> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

  // Status-aware candidate query: a trialing sub's effective expiry is
  // its trialEndDate, an active sub's is its currentPeriodEnd. Mixing
  // both into a single OR (an earlier draft) over-selects active subs
  // that still carry a stale trialEndDate from when they upgraded out
  // of trial — leading to an ever-growing scan set.
  const candidates = await db
    .select({
      id: subscriptions.id,
      organizationId: subscriptions.organizationId,
      planId: subscriptions.planId,
      status: subscriptions.status,
      trialEndDate: subscriptions.trialEndDate,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      lastReminderDayBucket: subscriptions.lastReminderDayBucket,
    })
    .from(subscriptions)
    .where(
      or(
        and(
          eq(subscriptions.status, "trialing"),
          isNotNull(subscriptions.trialEndDate),
          lte(subscriptions.trialEndDate, horizon),
        ),
        and(
          eq(subscriptions.status, "active"),
          isNotNull(subscriptions.currentPeriodEnd),
          lte(subscriptions.currentPeriodEnd, horizon),
        ),
      ),
    );

  let sent = 0;
  let skipped = 0;
  for (const sub of candidates) {
    const expiry = effectiveExpiryDate(sub);
    if (!expiry) {
      skipped++;
      continue;
    }
    const msRemaining = expiry.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
    // Skip on or after the deadline. lazyApplyTransitions will flip the
    // status to "expired" on its next read; no point sending a "1 day
    // left" email when the period is already over.
    if (daysRemaining <= 0) {
      skipped++;
      continue;
    }
    const bucket = pickBucket(daysRemaining);
    if (!bucket) {
      skipped++;
      continue;
    }
    const prev = sub.lastReminderDayBucket;
    if (prev != null && prev <= bucket) {
      skipped++;
      continue;
    }

    try {
      // Resolve recipient + plan FIRST. We only want to consume our
      // claim when we are certain we can actually deliver. Any throw
      // here lands in the catch below without ever touching the bucket.
      const org = await storage.getOrganizationById(sub.organizationId);
      if (!org?.email) {
        skipped++;
        continue;
      }
      const plan = await storage.getPlanById(sub.planId);

      // Atomic claim: only one process / overlapping scan can advance
      // the bucket. The WHERE clause guarantees the new bucket is
      // strictly closer-to-expiry than what's already stored, so
      // duplicate sends are impossible even with multiple instances.
      const claimed = await db
        .update(subscriptions)
        .set({ lastReminderDayBucket: bucket, updatedAt: new Date() })
        .where(
          and(
            eq(subscriptions.id, sub.id),
            or(
              isNull(subscriptions.lastReminderDayBucket),
              gt(subscriptions.lastReminderDayBucket, bucket),
            ),
          ),
        )
        .returning({ id: subscriptions.id });
      if (claimed.length === 0) {
        skipped++;
        continue;
      }

      const ok = await sendExpiryReminderEmail({
        to: org.email,
        orgName: org.name || "your organization",
        recipientName: org.name || "there",
        planName: plan?.name || "your subscription",
        daysRemaining: Math.max(0, daysRemaining),
        expiresAt: expiry,
        isTrial: sub.status === "trialing",
      });
      if (ok) {
        sent++;
      } else {
        // Best-effort rollback so the next tick can retry this bucket.
        // Conditional revert: only undo if our claim is still in place
        // (a concurrent verify-payment may have reset to NULL — don't
        // trample that fresher state).
        await db
          .update(subscriptions)
          .set({ lastReminderDayBucket: prev, updatedAt: new Date() })
          .where(
            and(
              eq(subscriptions.id, sub.id),
              eq(subscriptions.lastReminderDayBucket, bucket),
            ),
          );
        skipped++;
      }
    } catch (err) {
      console.error("[billing-reminders] failed for sub", sub.id, err);
      skipped++;
    }
  }

  return { scanned: candidates.length, sent, skipped };
}

let started = false;
let timer: NodeJS.Timeout | null = null;

export function startBillingReminders(): void {
  if (started) return;
  started = true;
  const tick = async () => {
    try {
      const result = await scanAndSendOnce();
      if (result.sent > 0 || result.scanned > 0) {
        console.log(
          `[billing-reminders] scan complete: scanned=${result.scanned} sent=${result.sent} skipped=${result.skipped}`,
        );
      }
    } catch (err) {
      console.error("[billing-reminders] scan failed:", err);
    }
  };
  setTimeout(tick, 30_000);
  timer = setInterval(tick, SCAN_INTERVAL_MS);
  if (timer.unref) timer.unref();
  console.log(`[billing-reminders] scheduler started (every ${SCAN_INTERVAL_MS / 1000 / 60 / 60}h)`);
}

export const __test = { scanAndSendOnce, pickBucket, effectiveExpiryDate };
