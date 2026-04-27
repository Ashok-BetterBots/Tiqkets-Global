// Subscription lifecycle + proration service.
//
// Handles three concerns the rest of the codebase delegates to a single
// place so the rules stay consistent across endpoints, the cron-less expiry
// model works correctly, and the proration math is testable in isolation:
//
//   1. Auto-trial enrolment on org register (14 days, "trial" plan).
//   2. Lazy state transitions on every read of a subscription:
//        - Trialing -> expired   when trialEndDate <= now and never billed.
//        - Active   -> expired   when currentPeriodEnd <= now and there is
//                                no scheduled pending plan change to apply.
//        - Pending plan change   applied at currentPeriodEnd (downgrade).
//   3. Pro-rated charge calculation for plan changes:
//        - Upgrade   -> charge difference for the remainder of the period.
//        - Downgrade -> $0 now, scheduled at next currentPeriodEnd.
//        - Same plan, billing cycle change -> treat like upgrade/downgrade
//          based on price comparison.
//
// The math intentionally uses calendar days rather than seconds to keep the
// proration legible on invoices ("9 of 30 days remaining").

import { storage } from "./storage";
import type { Subscription, SubscriptionPlan } from "@shared/schema";

export const TRIAL_PLAN_SLUG = "trial";
export const TRIAL_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type BillingCycle = "monthly" | "yearly";

export interface ProrationBreakdown {
  type: "upgrade" | "downgrade" | "same" | "initial";
  // Whole minor-units (paise for INR) the customer must pay now. 0 for
  // downgrades and same-plan no-ops; full plan price for initial purchases.
  amountDueNow: number;
  // Reference numbers for the invoice line items.
  newPlanFullPrice: number;
  unusedCreditFromCurrentPlan: number;
  daysInPeriod: number;
  daysRemaining: number;
  currency: string;
  // ISO strings for the resulting subscription period after this change is
  // applied. For downgrades the change is scheduled and these fields refer
  // to the *future* period that will start at the current periodEnd.
  newPeriodStart: string;
  newPeriodEnd: string;
  // True when the change does not take effect immediately (downgrade).
  scheduled: boolean;
  // Human-readable plain-English explanation rendered on the preview UI.
  description: string;
}

function getPlanPrice(plan: SubscriptionPlan, cycle: BillingCycle): number {
  return cycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
}

function getCycleDays(cycle: BillingCycle): number {
  return cycle === "yearly" ? 365 : 30;
}

/**
 * Calendar-day delta, never negative.
 *
 * Uses ceil so that any partial day still in the future counts as "1 day
 * remaining" — this keeps us on the customer-friendly side of every
 * boundary (we never under-credit unused time on a downgrade nor
 * under-charge new prorated days). For period lengths we round to the
 * nearest day because periods are always built from `addDays(start, N)`
 * and are exactly N whole days apart in wall-clock terms — Math.round
 * absorbs the small DST drift that can arise across spring/fall changes.
 */
function daysRemainingCeil(later: Date, earlier: Date): number {
  const diff = later.getTime() - earlier.getTime();
  if (diff <= 0) return 0;
  return Math.max(0, Math.ceil(diff / MS_PER_DAY));
}

function daysSpan(later: Date, earlier: Date): number {
  const diff = later.getTime() - earlier.getTime();
  if (diff <= 0) return 0;
  return Math.max(0, Math.round(diff / MS_PER_DAY));
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/**
 * Compute the proration breakdown for moving an org from `current` (their
 * current sub + plan) to `newPlan` on `newCycle`. Designed so the same call
 * powers both the preview endpoint and the actual change-plan endpoint.
 */
export function calculateProration(args: {
  currentSubscription: Subscription | null;
  currentPlan: SubscriptionPlan | null;
  newPlan: SubscriptionPlan;
  newCycle: BillingCycle;
  now: Date;
}): ProrationBreakdown {
  const { currentSubscription, currentPlan, newPlan, newCycle, now } = args;
  const newFullPrice = getPlanPrice(newPlan, newCycle);
  const cycleDays = getCycleDays(newCycle);

  // No active sub / trialing on the trial plan -> initial purchase. Charge
  // the full price; the new period starts now.
  const isTrialingOrEmpty =
    !currentSubscription ||
    currentSubscription.status === "trialing" ||
    currentSubscription.status === "expired" ||
    currentSubscription.status === "cancelled" ||
    !currentPlan ||
    !!(currentPlan.features && (currentPlan.features as any).isTrial);

  if (isTrialingOrEmpty) {
    const periodStart = now;
    const periodEnd = addDays(periodStart, cycleDays);
    return {
      type: "initial",
      amountDueNow: newFullPrice,
      newPlanFullPrice: newFullPrice,
      unusedCreditFromCurrentPlan: 0,
      daysInPeriod: cycleDays,
      daysRemaining: cycleDays,
      currency: newPlan.currency || "INR",
      newPeriodStart: periodStart.toISOString(),
      newPeriodEnd: periodEnd.toISOString(),
      scheduled: false,
      description: `Subscribe to ${newPlan.name} (${newCycle}). Billed for ${cycleDays} days.`,
    };
  }

  const periodStart = currentSubscription.currentPeriodStart
    ? new Date(currentSubscription.currentPeriodStart)
    : now;
  const periodEnd = currentSubscription.currentPeriodEnd
    ? new Date(currentSubscription.currentPeriodEnd)
    : addDays(periodStart, getCycleDays((currentSubscription.billingCycle as BillingCycle) || "monthly"));

  const daysInPeriod = Math.max(1, daysSpan(periodEnd, periodStart));
  const daysRemaining = Math.min(daysInPeriod, daysRemainingCeil(periodEnd, now));

  const currentCycle = (currentSubscription.billingCycle as BillingCycle) || "monthly";
  const currentFullPrice = getPlanPrice(currentPlan, currentCycle);
  // Same plan + same cycle is a no-op: no charge, no schedule.
  if (currentPlan.id === newPlan.id && currentCycle === newCycle) {
    return {
      type: "same",
      amountDueNow: 0,
      newPlanFullPrice: newFullPrice,
      unusedCreditFromCurrentPlan: 0,
      daysInPeriod,
      daysRemaining,
      currency: newPlan.currency || "INR",
      newPeriodStart: periodStart.toISOString(),
      newPeriodEnd: periodEnd.toISOString(),
      scheduled: false,
      description: `You're already on ${newPlan.name} (${newCycle}).`,
    };
  }

  // Upgrade rule: new plan is more expensive (per-day comparison so that a
  // monthly -> yearly switch on the same plan still classifies correctly).
  const currentPerDay = currentFullPrice / Math.max(1, getCycleDays(currentCycle));
  const newPerDay = newFullPrice / Math.max(1, cycleDays);
  const isUpgrade = newPerDay > currentPerDay;

  if (!isUpgrade) {
    // Downgrade: schedule for the end of the current paid period, charge
    // nothing now. The customer keeps their current plan until then.
    return {
      type: "downgrade",
      amountDueNow: 0,
      newPlanFullPrice: newFullPrice,
      unusedCreditFromCurrentPlan: 0,
      daysInPeriod: cycleDays,
      daysRemaining: cycleDays,
      currency: newPlan.currency || "INR",
      newPeriodStart: periodEnd.toISOString(),
      newPeriodEnd: addDays(periodEnd, cycleDays).toISOString(),
      scheduled: true,
      description: `Downgrade to ${newPlan.name} (${newCycle}) scheduled for ${periodEnd.toDateString()}. No charge today.`,
    };
  }

  // Upgrade: pay the difference for the remaining days of the period. The
  // resulting period_end stays put (we don't reset the cycle) so the
  // customer keeps the same renewal date and isn't penalised mid-cycle.
  const unusedCredit = Math.round(currentPerDay * daysRemaining);
  const newProrated = Math.round(newPerDay * daysRemaining);
  const amountDueNow = Math.max(0, newProrated - unusedCredit);

  return {
    type: "upgrade",
    amountDueNow,
    newPlanFullPrice: newFullPrice,
    unusedCreditFromCurrentPlan: unusedCredit,
    daysInPeriod,
    daysRemaining,
    currency: newPlan.currency || "INR",
    newPeriodStart: periodStart.toISOString(),
    newPeriodEnd: periodEnd.toISOString(),
    scheduled: false,
    description: `Upgrade to ${newPlan.name} (${newCycle}). Pay only the prorated difference for the ${daysRemaining} days remaining in your billing cycle.`,
  };
}

/**
 * Lazy state transitions. Called from getOrgPlanLimits + every billing
 * route; cheap when nothing is due. We never write unless we'd change the
 * row, so repeated calls are no-ops.
 */
export async function lazyApplyTransitions(
  organizationId: string,
): Promise<Subscription | undefined> {
  const sub = await storage.getSubscriptionByOrg(organizationId);
  if (!sub) return undefined;
  const now = new Date();

  // All transitions below use updateSubscriptionIfStatus, which only
  // applies the change when the row is still in the status we read. If
  // a concurrent /verify-payment (or another process) already mutated
  // the row — e.g. promoted "trialing" -> "active" — the conditional
  // update returns undefined and we re-read the row instead of
  // clobbering the newer state.

  // 1. Apply scheduled plan change (downgrade) when its time has come.
  // Gated on the row still pointing at the same pending plan: if
  // /cancel-pending-change just cleared it, we must not re-apply.
  if (
    sub.pendingPlanId &&
    sub.pendingChangeAt &&
    new Date(sub.pendingChangeAt) <= now
  ) {
    const newCycle = (sub.pendingBillingCycle as BillingCycle) || "monthly";
    const periodStart = new Date(sub.pendingChangeAt);
    const periodEnd = addDays(periodStart, getCycleDays(newCycle));
    const updated = await storage.updateSubscriptionIfPending(sub.id, sub.pendingPlanId, {
      planId: sub.pendingPlanId,
      billingCycle: newCycle,
      status: "active",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      pendingPlanId: null,
      pendingBillingCycle: null,
      pendingChangeAt: null,
    });
    if (updated) return updated;
    return (await storage.getSubscriptionByOrg(organizationId)) ?? sub;
  }

  // 2. Expire trials whose trialEndDate has passed and were never paid.
  if (
    sub.status === "trialing" &&
    sub.trialEndDate &&
    new Date(sub.trialEndDate) <= now
  ) {
    const updated = await storage.updateSubscriptionIfStatus(sub.id, "trialing", {
      status: "expired",
    });
    if (updated) return updated;
    return (await storage.getSubscriptionByOrg(organizationId)) ?? sub;
  }

  // 3. Expire active subs whose paid period elapsed without a renewal.
  // Real renewal is the responsibility of the next change-plan / verify
  // payment flow; until that exists for auto-renewal, mark as expired so
  // the org is forced to re-checkout.
  if (
    sub.status === "active" &&
    sub.currentPeriodEnd &&
    new Date(sub.currentPeriodEnd) <= now &&
    !sub.pendingPlanId
  ) {
    const updated = await storage.updateSubscriptionIfStatus(sub.id, "active", {
      status: "expired",
    });
    if (updated) return updated;
    return (await storage.getSubscriptionByOrg(organizationId)) ?? sub;
  }

  return sub;
}

/**
 * Look up or create a trial subscription for the org. Used by
 * /api/organizations/register so every new org starts with a 14-day trial,
 * and as a safety net for orgs created before this code shipped.
 */
export async function ensureTrialSubscription(
  organizationId: string,
): Promise<Subscription> {
  const existing = await storage.getSubscriptionByOrg(organizationId);
  if (existing) return existing;
  const trialPlan = await storage.getPlanBySlug(TRIAL_PLAN_SLUG);
  if (!trialPlan) {
    // Defensive: if seed hasn't run yet for some reason, run it now.
    await storage.seedDefaultPlans();
    const retry = await storage.getPlanBySlug(TRIAL_PLAN_SLUG);
    if (!retry) {
      throw new Error("Trial plan is not configured");
    }
    return storage.createTrialSubscription(organizationId, retry.id, TRIAL_DAYS);
  }
  return storage.createTrialSubscription(organizationId, trialPlan.id, TRIAL_DAYS);
}

/**
 * Returns true when the org has any access (trialing within window OR
 * active within paid period). Used by the queue join + queue-process
 * endpoints to hard-block work on expired subscriptions.
 */
export async function isSubscriptionActive(
  organizationId: string,
): Promise<{ active: boolean; subscription: Subscription | undefined; reason?: string }> {
  const sub = await lazyApplyTransitions(organizationId);
  if (!sub) {
    return { active: false, subscription: undefined, reason: "no_subscription" };
  }
  if (sub.status === "trialing") {
    if (sub.trialEndDate && new Date(sub.trialEndDate) <= new Date()) {
      return { active: false, subscription: sub, reason: "trial_expired" };
    }
    return { active: true, subscription: sub };
  }
  if (sub.status === "active") {
    if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) <= new Date()) {
      return { active: false, subscription: sub, reason: "period_expired" };
    }
    return { active: true, subscription: sub };
  }
  // cancelled / expired
  return { active: false, subscription: sub, reason: sub.status };
}
