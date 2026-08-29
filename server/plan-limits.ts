// Subscription-plan limit enforcement.
//
// Super-admin defines plans (server/templates/super-admin.html) with caps for
// branches, staff users, desks, services per branch, and daily tickets. When
// an organization activates a plan via /api/billing/subscribe, those caps
// must be enforced at every resource-creation entry point so a tenant cannot
// quietly exceed what they paid for.
//
// Semantics — for any cap field a value is treated as "unlimited" when it is:
//   * null / undefined
//   * <= 0  (super-admin form leaves 0 as the "no limit" placeholder)
//   * -1    (matches the seed convention used in storage.seedDefaultPlans)
// Anything else (positive integer) is the hard cap. The check is a strict
// greater-than-or-equal: if currentUsage >= cap the next create is refused.
//
// Orgs without an active subscription are *not* enforced — this matches the
// product rule "When an org subscribes to a plan, those caps must be enforced"
// and avoids breaking organisations that pre-date the billing flow.

import type { Request, Response } from "express";
import { storage } from "./storage";
import { lazyApplyTransitions, isSubscriptionActive } from "./subscription-service";

export type LimitKind =
  | "branches"
  | "staffUsers"
  | "desks"
  | "servicesPerBranch"
  | "dailyTickets";

export interface NormalizedPlanLimits {
  planId: string | null;
  planName: string | null;
  planSlug: string | null;
  status: string | null; // "trialing" | "active" | "cancelled" | null
  enforced: boolean; // false → org has no active subscription, all checks pass
  maxBranches: number | null; // null = unlimited
  maxStaffUsers: number | null;
  maxDesks: number | null;
  maxServicesPerBranch: number | null;
  maxDailyTickets: number | null;
}

const UNENFORCED_STATUSES = new Set(["cancelled", "expired"]);

/** Normalise a raw plan-cap field to either a positive cap or null=unlimited. */
function normaliseCap(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null; // 0 / -1 / NaN → unlimited
  return Math.floor(n);
}

/**
 * Resolve the effective plan caps for an organization. Returns
 * `{ enforced: false, ... all caps null }` when the org has no active or
 * trialing subscription, in which case callers should allow the operation.
 */
export async function getOrgPlanLimits(
  organizationId: string,
): Promise<NormalizedPlanLimits> {
  const empty: NormalizedPlanLimits = {
    planId: null,
    planName: null,
    planSlug: null,
    status: null,
    enforced: false,
    maxBranches: null,
    maxStaffUsers: null,
    maxDesks: null,
    maxServicesPerBranch: null,
    maxDailyTickets: null,
  };
  // Lazy-apply trial expiry / scheduled plan-change before reading caps so
  // the dashboard widget always reflects the live state (no cron required).
  const sub = await lazyApplyTransitions(organizationId);
  if (!sub || UNENFORCED_STATUSES.has(sub.status)) return empty;
  const plan = await storage.getPlanById(sub.planId);
  if (!plan) return empty;
  const features = (plan.features && typeof plan.features === "object" ? plan.features : {}) as Record<string, unknown>;
  // The super-admin UI exposes "unlimited" toggles independently of the
  // numeric inputs; honour them even if a non-zero number was left in the
  // field. Likewise treat features.deskCount as the canonical desk cap
  // since the schema does not yet have a maxDesks column.
  const unlimitedLocation = !!features.unlimitedLocation;
  const unlimitedUsers = !!features.unlimitedUsers; // maps to daily tickets per super-admin form
  return {
    planId: plan.id,
    planName: plan.name,
    planSlug: plan.slug,
    status: sub.status,
    enforced: true,
    maxBranches: unlimitedLocation ? null : normaliseCap(plan.maxBranches),
    maxStaffUsers: normaliseCap(plan.maxStaffUsers),
    maxDesks: normaliseCap(features.deskCount),
    maxServicesPerBranch: normaliseCap(plan.maxServicesPerBranch),
    maxDailyTickets: unlimitedUsers ? null : normaliseCap(plan.maxDailyTickets),
  };
}

/** Send a uniform 402 (Payment Required) response when a cap is hit. */
function sendLimitExceeded(
  res: Response,
  kind: LimitKind,
  current: number,
  cap: number,
  planName: string | null,
): void {
  const labels: Record<LimitKind, string> = {
    branches: "branches",
    staffUsers: "staff users",
    desks: "desks",
    servicesPerBranch: "services for this branch",
    dailyTickets: "tickets today",
  };
  const label = labels[kind];
  const planTxt = planName ? ` on the ${planName} plan` : "";
  res.status(402).json({
    error: "Plan limit reached",
    message: `Your ${label} limit has been reached${planTxt} (${current} of ${cap}). Upgrade your subscription to add more.`,
    limitKind: kind,
    current,
    cap,
    planName,
  });
}

interface AssertOpts {
  // Number of new resources being created in this request (defaults to 1).
  // Useful if a future endpoint creates several at once.
  delta?: number;
}

/** Refuse the request if creating one more branch would exceed `maxBranches`. */
export async function assertCanCreateBranch(
  _req: Request,
  res: Response,
  organizationId: string,
  opts: AssertOpts = {},
): Promise<boolean> {
  const limits = await getOrgPlanLimits(organizationId);
  if (!limits.enforced || limits.maxBranches === null) return true;
  const current = await storage.countActiveBranchesByOrg(organizationId);
  const delta = opts.delta ?? 1;
  if (current + delta > limits.maxBranches) {
    sendLimitExceeded(res, "branches", current, limits.maxBranches, limits.planName);
    return false;
  }
  return true;
}

/** Refuse the request if creating one more org user would exceed `maxStaffUsers`. */
export async function assertCanCreateOrgUser(
  _req: Request,
  res: Response,
  organizationId: string,
  opts: AssertOpts = {},
): Promise<boolean> {
  const limits = await getOrgPlanLimits(organizationId);
  if (!limits.enforced || limits.maxStaffUsers === null) return true;
  const current = await storage.countActiveOrgUsersByOrg(organizationId);
  const delta = opts.delta ?? 1;
  if (current + delta > limits.maxStaffUsers) {
    sendLimitExceeded(res, "staffUsers", current, limits.maxStaffUsers, limits.planName);
    return false;
  }
  return true;
}

/**
 * Refuse the request if creating one more desk would exceed the org-wide
 * `features.deskCount` cap. Branch-level desk caps are not currently part
 * of the plan schema; we count desks across all of the org's branches.
 */
export async function assertCanCreateDesk(
  _req: Request,
  res: Response,
  organizationId: string,
  opts: AssertOpts = {},
): Promise<boolean> {
  const limits = await getOrgPlanLimits(organizationId);
  if (!limits.enforced || limits.maxDesks === null) return true;
  const current = await storage.countActiveDesksByOrg(organizationId);
  const delta = opts.delta ?? 1;
  if (current + delta > limits.maxDesks) {
    sendLimitExceeded(res, "desks", current, limits.maxDesks, limits.planName);
    return false;
  }
  return true;
}

/**
 * Refuse the request if creating one more service in `branchId` would
 * exceed `maxServicesPerBranch`. The branch must already be confirmed to
 * belong to `organizationId` by the caller (assertBranchOwnership).
 */
export async function assertCanCreateService(
  _req: Request,
  res: Response,
  organizationId: string,
  branchId: string,
  opts: AssertOpts = {},
): Promise<boolean> {
  const limits = await getOrgPlanLimits(organizationId);
  if (!limits.enforced || limits.maxServicesPerBranch === null) return true;
  const current = await storage.countActiveServicesByBranch(branchId);
  const delta = opts.delta ?? 1;
  if (current + delta > limits.maxServicesPerBranch) {
    sendLimitExceeded(res, "servicesPerBranch", current, limits.maxServicesPerBranch, limits.planName);
    return false;
  }
  return true;
}

/**
 * Refuse the request if creating one more ticket today would exceed the
 * org-wide `maxDailyTickets` cap. Counts every ticket created since local
 * midnight across all of the org's branches.
 */
export async function assertCanCreateTicketForOrg(
  _req: Request,
  res: Response,
  organizationId: string,
  opts: AssertOpts = {},
): Promise<boolean> {
  const limits = await getOrgPlanLimits(organizationId);
  if (!limits.enforced || limits.maxDailyTickets === null) return true;
  const current = await storage.countTodayTicketsByOrg(organizationId);
  const delta = opts.delta ?? 1;
  if (current + delta > limits.maxDailyTickets) {
    sendLimitExceeded(res, "dailyTickets", current, limits.maxDailyTickets, limits.planName);
    return false;
  }
  return true;
}

/**
 * Build a usage-vs-cap snapshot for one organization, intended for the
 * dashboard "plan limits" widget. Caps that are unlimited are returned as
 * `null` so the UI can display an infinity glyph.
 */
export interface PlanUsageSnapshot {
  enforced: boolean;
  plan: { id: string | null; name: string | null; slug: string | null; status: string | null };
  usage: {
    branches: { current: number; cap: number | null };
    staffUsers: { current: number; cap: number | null };
    desks: { current: number; cap: number | null };
    dailyTickets: { current: number; cap: number | null };
  };
  servicesPerBranchCap: number | null;
  // Subscription metadata used by the billing UI's header card.
  subscription: {
    id: string | null;
    status: string | null; // "trialing" | "active" | "expired" | "cancelled" | null
    isTrial: boolean;
    billingCycle: "monthly" | "yearly" | null;
    currentPeriodStart: string | null; // ISO
    currentPeriodEnd: string | null;   // ISO
    trialEndDate: string | null;       // ISO
    daysRemaining: number | null;      // until trialEnd or periodEnd
    pendingPlan: {
      id: string;
      name: string;
      slug: string;
      billingCycle: "monthly" | "yearly";
      effectiveAt: string; // ISO
    } | null;
  };
}

export async function getPlanUsageSnapshot(organizationId: string): Promise<PlanUsageSnapshot> {
  const limits = await getOrgPlanLimits(organizationId);
  const [branchCount, userCount, deskCount, ticketCount, sub] = await Promise.all([
    storage.countActiveBranchesByOrg(organizationId),
    storage.countActiveOrgUsersByOrg(organizationId),
    storage.countActiveDesksByOrg(organizationId),
    storage.countTodayTicketsByOrg(organizationId),
    storage.getSubscriptionByOrg(organizationId),
  ]);

  let pendingPlan: PlanUsageSnapshot["subscription"]["pendingPlan"] = null;
  if (sub?.pendingPlanId && sub.pendingChangeAt) {
    const p = await storage.getPlanById(sub.pendingPlanId);
    if (p) {
      pendingPlan = {
        id: p.id,
        name: p.name,
        slug: p.slug,
        billingCycle: ((sub.pendingBillingCycle as "monthly" | "yearly") || "monthly"),
        effectiveAt: new Date(sub.pendingChangeAt).toISOString(),
      };
    }
  }

  // daysRemaining counts whole calendar days until expiry (trial first,
  // then current paid period). Negative deltas are clamped to 0 so the UI
  // never shows "-3 days remaining".
  const now = Date.now();
  const expiryDate = sub?.status === "trialing"
    ? sub.trialEndDate
    : sub?.currentPeriodEnd ?? null;
  const daysRemaining = expiryDate
    ? Math.max(0, Math.ceil((new Date(expiryDate).getTime() - now) / 86_400_000))
    : null;

  const features = limits.planSlug
    ? ((await storage.getPlanById(limits.planId!))?.features as Record<string, unknown> | null) ?? null
    : null;
  const isTrial = !!(features && (features as any).isTrial);

  return {
    enforced: limits.enforced,
    plan: {
      id: limits.planId,
      name: limits.planName,
      slug: limits.planSlug,
      status: limits.status,
    },
    usage: {
      branches: { current: branchCount, cap: limits.maxBranches },
      staffUsers: { current: userCount, cap: limits.maxStaffUsers },
      desks: { current: deskCount, cap: limits.maxDesks },
      dailyTickets: { current: ticketCount, cap: limits.maxDailyTickets },
    },
    servicesPerBranchCap: limits.maxServicesPerBranch,
    subscription: {
      id: sub?.id ?? null,
      status: sub?.status ?? null,
      isTrial,
      billingCycle: (sub?.billingCycle as "monthly" | "yearly") ?? null,
      currentPeriodStart: sub?.currentPeriodStart ? new Date(sub.currentPeriodStart).toISOString() : null,
      currentPeriodEnd: sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toISOString() : null,
      trialEndDate: sub?.trialEndDate ? new Date(sub.trialEndDate).toISOString() : null,
      daysRemaining,
      pendingPlan,
    },
  };
}

/**
 * Refuse the request when the org's subscription is not active (no sub,
 * trial expired, period elapsed, cancelled). Returns true on success so
 * callers can `if (!await assertSubscriptionActive(...)) return;`.
 */
export async function assertSubscriptionActive(
  _req: Request,
  res: Response,
  organizationId: string,
): Promise<boolean> {
  const { active, subscription, reason } = await isSubscriptionActive(organizationId);
  if (active) return true;
  const messages: Record<string, string> = {
    no_subscription: "Your organization does not have an active subscription. Please subscribe to a plan to continue.",
    trial_expired: "Your 14-day free trial has ended. Please choose a plan to continue using TIQKETS.",
    period_expired: "Your subscription period has ended. Please renew or change your plan to continue.",
    cancelled: "Your subscription has been cancelled. Please choose a plan to continue.",
    expired: "Your subscription has expired. Please choose a plan to continue.",
  };
  res.status(402).json({
    error: "Subscription required",
    message: messages[reason || "expired"] || messages.expired,
    reason: reason || "expired",
    subscriptionStatus: subscription?.status ?? null,
  });
  return false;
}
