import type { Express, Request, Response } from "express";
import { storage, hashPassword } from "./storage";
import crypto from "crypto";
import {
  requirePermission,
  writeAudit,
  publicRoute,
  assertOrgOwnership,
  assertBranchOwnership,
  assertServiceOwnership,
  assertOrgUserOwnership,
  assertOperatingHourOwnership,
  assertBreakOwnership,
  assertHolidayOwnership,
  assertJourneyOwnership,
  resolveAssignableRole,
  sanitizeOrgUser,
  getCallerContext,
  callerCanAccessBranch,
  callerCanManageTargetUser,
} from "./rbac";
import { getRoleRank } from "@shared/permissions";
import {
  assertCanCreateBranch,
  assertCanCreateOrgUser,
  assertCanCreateService,
  getPlanUsageSnapshot,
} from "./plan-limits";
import {
  calculateProration,
  lazyApplyTransitions,
  type BillingCycle,
} from "./subscription-service";
import {
  sendPaymentSuccessEmail,
  sendPaymentFailureEmail,
  sendSubscriptionCancelledEmail,
} from "./mailer";
import { streamInvoicePdf } from "./invoice-pdf";

/**
 * Build a unique, monotonic invoice number. Format: `INV-YYYYMM-XXXXXX`
 * where XXXXXX is the lower 6 hex chars of a random uuid. We don't gate on
 * a sequence to avoid table-wide locks; the random suffix is enough for
 * audit-friendly uniqueness across the lifetime of a single org.
 */
function generateInvoiceNumber(): string {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `INV-${ym}-${suffix}`;
}

export function registerBillingRoutes(app: Express) {
  storage.seedDefaultPlans().catch(console.error);

  app.get("/api/billing/plans", publicRoute("public plan catalog used by signup/marketing"), async (_req: Request, res: Response) => {
    try {
      const plans = await storage.getAllPlans();
      res.json({ plans });
    } catch (error) {
      console.error("Error getting plans:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/billing/subscription/:orgId", requirePermission("org.billing.view"), async (req: Request, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      if (!(await assertOrgOwnership(req, res, orgId))) return;
      // Run lazy state transitions before reading so callers (especially
      // the dashboard expiry banner) see the current canonical status —
      // e.g. a trial whose end date has just passed flips to "expired"
      // here, instead of staying "trialing" until another path notices.
      const subscription = await lazyApplyTransitions(orgId);
      if (!subscription) {
        return res.json({ subscription: null });
      }
      const plan = await storage.getPlanById(subscription.planId);
      res.json({ subscription: { ...subscription, plan } });
    } catch (error) {
      console.error("Error getting subscription:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/billing/subscribe", requirePermission("org.billing.payment_method"), async (req: Request, res: Response) => {
    try {
      const { orgId, planId } = req.body;
      if (!orgId || !planId) {
        return res.status(400).json({ error: "orgId and planId are required" });
      }
      if (!(await assertOrgOwnership(req, res, orgId))) return;
      const plan = await storage.getPlanById(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      const existing = await storage.getSubscriptionByOrg(orgId);
      if (existing && (existing.status === "active" || existing.status === "trialing")) {
        return res.status(400).json({ error: "Organization already has an active subscription" });
      }
      const subscription = await storage.createTrialSubscription(orgId, planId);
      res.json({ subscription });
    } catch (error) {
      console.error("Error creating subscription:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/billing/create-order", requirePermission("org.billing.payment_method"), async (req: Request, res: Response) => {
    try {
      const { orgId, planId, amount } = req.body;
      if (!orgId || !planId || !amount) {
        return res.status(400).json({ error: "orgId, planId, and amount are required" });
      }
      if (!(await assertOrgOwnership(req, res, orgId))) return;
      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keyId || !keySecret) {
        return res.status(500).json({ error: "Razorpay credentials not configured" });
      }
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
      const response = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({
          amount,
          currency: "INR",
          receipt: `sub_${orgId}_${Date.now()}`,
        }),
      });
      if (!response.ok) {
        const errorData = await response.text();
        console.error("Razorpay order creation failed:", errorData);
        return res.status(500).json({ error: "Failed to create Razorpay order" });
      }
      const order = await response.json();
      res.json({ orderId: order.id, order });
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/billing/proration-preview — compute the amount due and the
  // resulting period dates for a hypothetical plan change. Read-only; safe
  // to call from the UI as the user toggles between options.
  app.post("/api/billing/proration-preview", requirePermission("org.billing.view"), async (req: Request, res: Response) => {
    try {
      const { orgId, planId, billingCycle } = req.body as {
        orgId?: string; planId?: string; billingCycle?: BillingCycle;
      };
      if (!orgId || !planId || !billingCycle) {
        return res.status(400).json({ error: "orgId, planId, and billingCycle are required" });
      }
      if (billingCycle !== "monthly" && billingCycle !== "yearly") {
        return res.status(400).json({ error: "billingCycle must be 'monthly' or 'yearly'" });
      }
      if (!(await assertOrgOwnership(req, res, orgId))) return;
      const newPlan = await storage.getPlanById(planId);
      if (!newPlan) return res.status(404).json({ error: "Plan not found" });
      // The trial is a one-time, registration-only sku. Block any attempt
      // to switch into it from a paid or already-trialing plan.
      if (newPlan.slug === "trial" || (newPlan.features as any)?.isTrial) {
        return res.status(400).json({ error: "The trial plan is only available at registration and cannot be selected as a plan change." });
      }
      const sub = await lazyApplyTransitions(orgId);
      const currentPlan = sub ? await storage.getPlanById(sub.planId) : null;
      const breakdown = calculateProration({
        currentSubscription: sub ?? null,
        currentPlan: currentPlan ?? null,
        newPlan,
        newCycle: billingCycle,
        now: new Date(),
      });
      res.json({
        breakdown,
        newPlan: { id: newPlan.id, name: newPlan.name, slug: newPlan.slug },
        currentPlan: currentPlan ? { id: currentPlan.id, name: currentPlan.name, slug: currentPlan.slug } : null,
      });
    } catch (error) {
      console.error("Error computing proration preview:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/billing/change-plan — initiate a plan change. For upgrades
  // and initial purchases we create a Razorpay order for the prorated
  // amount; the client opens checkout and then calls verify-payment with
  // the same `subscriptionId` + `pendingChange` payload to apply the
  // change. For downgrades and same-plan no-ops we mutate the subscription
  // directly (no payment required).
  app.post("/api/billing/change-plan", requirePermission("org.billing.payment_method"), async (req: Request, res: Response) => {
    try {
      const { orgId, planId, billingCycle } = req.body as {
        orgId?: string; planId?: string; billingCycle?: BillingCycle;
      };
      if (!orgId || !planId || !billingCycle) {
        return res.status(400).json({ error: "orgId, planId, and billingCycle are required" });
      }
      if (billingCycle !== "monthly" && billingCycle !== "yearly") {
        return res.status(400).json({ error: "billingCycle must be 'monthly' or 'yearly'" });
      }
      if (!(await assertOrgOwnership(req, res, orgId))) return;
      const newPlan = await storage.getPlanById(planId);
      if (!newPlan) return res.status(404).json({ error: "Plan not found" });
      // The trial is a one-time, registration-only sku. Block any attempt
      // to switch into it from a paid or already-trialing plan.
      if (newPlan.slug === "trial" || (newPlan.features as any)?.isTrial) {
        return res.status(400).json({ error: "The trial plan is only available at registration and cannot be selected as a plan change." });
      }

      // Always operate on the post-transition state: a subscription whose
      // trial just expired must be treated as expired here, otherwise we'd
      // try to "downgrade" from it instead of charging for a new period.
      let sub = await lazyApplyTransitions(orgId);
      const currentPlan = sub ? await storage.getPlanById(sub.planId) : null;
      const breakdown = calculateProration({
        currentSubscription: sub ?? null,
        currentPlan: currentPlan ?? null,
        newPlan,
        newCycle: billingCycle,
        now: new Date(),
      });

      // No charge needed: same plan / downgrade / fully credited upgrade.
      if (breakdown.amountDueNow <= 0) {
        if (breakdown.type === "downgrade" && sub) {
          // Schedule for the end of the current paid period. Clear any
          // payment-pending state — a downgrade is never paid.
          const updated = await storage.updateSubscription(sub.id, {
            pendingPlanId: newPlan.id,
            pendingBillingCycle: billingCycle,
            pendingChangeAt: new Date(breakdown.newPeriodStart),
            pendingOrderId: null,
            pendingAmount: null,
            pendingPeriodStart: null,
            pendingPeriodEnd: null,
          });
          await writeAudit(req, {
            action: "billing.downgrade.scheduled",
            targetType: "subscription",
            targetId: sub.id,
            targetLabel: newPlan.name,
            diff: { newPlanId: newPlan.id, billingCycle, effectiveAt: breakdown.newPeriodStart },
          });
          return res.json({ requiresPayment: false, breakdown, subscription: updated });
        }
        if (breakdown.type === "same") {
          return res.json({ requiresPayment: false, breakdown, subscription: sub });
        }
        // Initial purchase of a $0 plan (the trial). Activate immediately.
        if (!sub) {
          const created = await storage.createTrialSubscription(orgId, newPlan.id);
          return res.json({ requiresPayment: false, breakdown, subscription: created });
        }
      }

      // Payment required. Make sure we have a subscription row to attach
      // the upcoming verify-payment call to (creates a placeholder trial
      // row for orgs that have never subscribed).
      if (!sub) {
        sub = await storage.createTrialSubscription(orgId, newPlan.id);
      }

      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keyId || !keySecret) {
        return res.status(500).json({ error: "Razorpay credentials not configured" });
      }
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
      const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
        body: JSON.stringify({
          amount: breakdown.amountDueNow,
          currency: breakdown.currency || "INR",
          receipt: `chg_${orgId.slice(0, 8)}_${Date.now()}`.slice(0, 40),
          notes: {
            organizationId: orgId,
            subscriptionId: sub.id,
            newPlanId: newPlan.id,
            newBillingCycle: billingCycle,
            type: breakdown.type,
          },
        }),
      });
      if (!orderRes.ok) {
        const errText = await orderRes.text();
        console.error("Razorpay change-plan order failed:", errText);
        return res.status(500).json({ error: "Failed to create payment order" });
      }
      const order = await orderRes.json();

      // Persist the pending payment intent on the subscription row so
      // /verify-payment can validate it without trusting any field the
      // client round-trips. This is the source of truth for the dates
      // and amount we'll apply on successful payment.
      sub = await storage.updateSubscription(sub.id, {
        pendingPlanId: newPlan.id,
        pendingBillingCycle: billingCycle,
        pendingOrderId: order.id,
        pendingAmount: breakdown.amountDueNow,
        pendingPeriodStart: new Date(breakdown.newPeriodStart),
        pendingPeriodEnd: new Date(breakdown.newPeriodEnd),
        // Upgrades take effect on payment, not on a calendar date —
        // never carry forward a stale downgrade timer.
        pendingChangeAt: null,
      });

      res.json({
        requiresPayment: true,
        breakdown,
        subscription: sub,
        razorpay: {
          keyId,
          orderId: order.id,
          amount: breakdown.amountDueNow,
          currency: breakdown.currency || "INR",
        },
        // Display-only echo of the new plan; the server ignores any
        // pendingChange the client passes back to /verify-payment.
        pendingChange: {
          newPlanId: newPlan.id,
          newPlanName: newPlan.name,
          newBillingCycle: billingCycle,
          newPeriodStart: breakdown.newPeriodStart,
          newPeriodEnd: breakdown.newPeriodEnd,
        },
      });
    } catch (error) {
      console.error("Error initiating plan change:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/billing/cancel-pending-change — undo a scheduled downgrade
  // before its effective date. After the effective date the lazy
  // transition has already promoted the row, and there's nothing to
  // cancel (the response body indicates that case).
  app.post("/api/billing/cancel-pending-change/:orgId", requirePermission("org.billing.payment_method"), async (req: Request, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      if (!(await assertOrgOwnership(req, res, orgId))) return;
      const sub = await storage.getSubscriptionByOrg(orgId);
      if (!sub) return res.status(404).json({ error: "Subscription not found" });
      if (!sub.pendingPlanId) {
        return res.status(400).json({ error: "No pending plan change to cancel" });
      }
      const updated = await storage.updateSubscription(sub.id, {
        pendingPlanId: null,
        pendingBillingCycle: null,
        pendingChangeAt: null,
      });
      await writeAudit(req, {
        action: "billing.downgrade.cancelled",
        targetType: "subscription",
        targetId: sub.id,
        targetLabel: sub.id,
      });
      res.json({ subscription: updated });
    } catch (error) {
      console.error("Error cancelling pending change:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/billing/verify-payment", requirePermission("org.billing.payment_method"), async (req: Request, res: Response) => {
    try {
      const {
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature,
        orgId,
        subscriptionId,
        // NOTE: `amount` and `pendingChange` are intentionally accepted
        // but ignored. The server reads the authoritative amount, plan,
        // and period dates from the subscription row's pending* fields,
        // which were written by /change-plan. Echoing those values back
        // through the client would let a tampered request charge any
        // amount and apply any plan.
      } = req.body as {
        razorpay_payment_id?: string;
        razorpay_order_id?: string;
        razorpay_signature?: string;
        orgId?: string;
        subscriptionId?: string;
        amount?: number;
        pendingChange?: unknown;
      };

      if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
        return res.status(400).json({ error: "Payment verification details are required" });
      }
      if (!orgId) return res.status(400).json({ error: "orgId is required" });
      if (!(await assertOrgOwnership(req, res, orgId))) return;

      let sub = subscriptionId ? await storage.getSubscriptionById(subscriptionId) : undefined;
      if (subscriptionId) {
        if (!sub) return res.status(404).json({ error: "Subscription not found" });
        if (sub.organizationId !== orgId) {
          return res.status(403).json({ error: "Subscription does not belong to this organization" });
        }
      }

      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keyId || !keySecret) {
        return res.status(500).json({ error: "Razorpay credentials not configured" });
      }

      // 1. HMAC: confirms the order/payment pair came from Razorpay and
      // was not forged by the client. Required by Razorpay's docs.
      const expectedSignature = crypto
        .createHmac("sha256", keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");
      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({ error: "Invalid payment signature" });
      }

      // 2. Idempotency: if we've already processed this Razorpay payment
      // id (browser retry, double-click, network blip), return the
      // existing record instead of charging again.
      const existingPayment = await storage.getPaymentByRazorpayId(razorpay_payment_id);
      if (existingPayment) {
        if (existingPayment.organizationId !== orgId) {
          // The same Razorpay payment id is being claimed by a
          // different org — this should never happen with our
          // unique-index, so treat it as a hard failure.
          return res.status(409).json({ error: "Payment already recorded for a different organization" });
        }
        const existingSub = existingPayment.subscriptionId
          ? await storage.getSubscriptionById(existingPayment.subscriptionId)
          : null;
        return res.json({ success: true, payment: existingPayment, subscription: existingSub, idempotent: true });
      }

      // 3. Authoritative server check: fetch the order from Razorpay and
      // confirm it's actually paid, that the amount matches what we
      // recorded as pending, and that its notes still point at this
      // subscription. Without this step a malicious client could
      // succeed by HMAC alone using any old order they made.
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
      const orderRes = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpay_order_id)}`, {
        method: "GET",
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!orderRes.ok) {
        const errText = await orderRes.text();
        console.error("Razorpay order lookup failed:", errText);
        return res.status(502).json({ error: "Could not verify payment with provider" });
      }
      const order = await orderRes.json() as {
        id: string;
        amount: number;
        amount_paid: number;
        currency: string;
        status: string;
        notes?: Record<string, string>;
      };
      if (order.status !== "paid" || order.amount_paid < order.amount) {
        return res.status(400).json({ error: "Payment not captured by provider" });
      }
      // Mandatory cross-check: the order's notes were stamped by us at
      // /change-plan time. If they're missing, or point at another org
      // or subscription, refuse to apply — even with a valid HMAC. This
      // closes the gap where an attacker who somehow obtained a valid
      // (signature, payment_id, order_id) tuple for a *different*
      // org/sub could activate this org's subscription.
      if (!sub) {
        return res.status(400).json({ error: "subscriptionId is required for payment verification" });
      }
      if (!order.notes?.organizationId || order.notes.organizationId !== orgId) {
        return res.status(403).json({ error: "Order is not bound to this organization" });
      }
      if (!order.notes?.subscriptionId || order.notes.subscriptionId !== sub.id) {
        return res.status(403).json({ error: "Order is not bound to this subscription" });
      }

      // 4. Bind to the subscription's persisted pending intent. We do
      // NOT support a "legacy / first-time" path that activates a sub
      // without a matching pending intent — every paid activation must
      // be the redemption of an order created by /change-plan, which
      // wrote pendingOrderId/pendingAmount/pendingPlanId/pendingPeriod*
      // server-side. This makes the order_id <-> subscription binding
      // strict and tamper-proof.
      if (
        sub.pendingOrderId !== razorpay_order_id ||
        !sub.pendingPlanId ||
        !sub.pendingPeriodStart ||
        !sub.pendingPeriodEnd
      ) {
        return res.status(400).json({ error: "Payment is not bound to a pending plan change" });
      }
      if (sub.pendingAmount != null && sub.pendingAmount !== order.amount) {
        // Belt-and-braces: order amount must equal the amount we
        // computed in /change-plan. If Razorpay returns something
        // different we refuse to apply.
        return res.status(400).json({ error: "Order amount does not match pending change" });
      }

      const newPlan = await storage.getPlanById(sub.pendingPlanId);
      if (!newPlan) return res.status(404).json({ error: "Pending plan not found" });

      // Snapshot pending state BEFORE the update clears it. We use
      // pendingAmount (the amount we actually invoiced the customer)
      // for the payment record, not order.amount, so that a future
      // refund/dispute reconciliation matches what we billed.
      const pendingAmountSnapshot = sub.pendingAmount ?? order.amount;
      const pendingCycleSnapshot = (sub.pendingBillingCycle as BillingCycle) || (sub.billingCycle as BillingCycle);
      const pendingPeriodStartSnapshot = sub.pendingPeriodStart;
      const pendingPeriodEndSnapshot = sub.pendingPeriodEnd;

      sub = await storage.updateSubscription(sub.id, {
        planId: newPlan.id,
        billingCycle: pendingCycleSnapshot,
        status: "active",
        currentPeriodStart: pendingPeriodStartSnapshot,
        currentPeriodEnd: pendingPeriodEndSnapshot,
        // Clear all pending state — payment-pending and any older
        // scheduled downgrade are both superseded by this upgrade.
        pendingPlanId: null,
        pendingBillingCycle: null,
        pendingChangeAt: null,
        pendingOrderId: null,
        pendingAmount: null,
        pendingPeriodStart: null,
        pendingPeriodEnd: null,
        // Reset the expiry-reminder dedup bucket: a fresh paid period
        // means the prior reminders (if any) are no longer relevant
        // and the next 7/3/1-day reminder cycle should be re-issued.
        lastReminderDayBucket: null,
      });
      const newPlanName = newPlan.name;
      const chargedAmount = pendingAmountSnapshot;

      // 5. Record the payment. The unique index on razorpayPaymentId
      // makes this our final idempotency backstop — a parallel verify
      // that loses the race here will throw, and the caller will see
      // the existing-payment branch on its retry.
      let payment;
      try {
        payment = await storage.createPayment({
          organizationId: orgId,
          subscriptionId: sub?.id ?? null,
          amount: chargedAmount,
          currency: order.currency || "INR",
          status: "captured",
          razorpayPaymentId: razorpay_payment_id,
          razorpayOrderId: razorpay_order_id,
          razorpaySignature: razorpay_signature,
          invoiceNumber: generateInvoiceNumber(),
          description: newPlanName ? `Subscription — ${newPlanName}` : "Subscription payment",
          paidAt: new Date(),
          // Freeze plan + period at capture time so the invoice PDF
          // remains historically accurate even after the subscription
          // rolls forward or the org changes plans.
          planSnapshotName: newPlanName ?? null,
          planSnapshotId: newPlan.id ?? null,
          billingCycleSnapshot: pendingCycleSnapshot ?? null,
          periodStartSnapshot: pendingPeriodStartSnapshot ?? null,
          periodEndSnapshot: pendingPeriodEndSnapshot ?? null,
        });
      } catch (insertErr: unknown) {
        // Unique-violation on razorpayPaymentId means a parallel verify
        // beat us; re-read and return the persisted record.
        const code = (insertErr as { code?: string })?.code;
        if (code === "23505") {
          const persisted = await storage.getPaymentByRazorpayId(razorpay_payment_id);
          if (persisted) {
            return res.json({ success: true, payment: persisted, subscription: sub, idempotent: true });
          }
        }
        throw insertErr;
      }

      await writeAudit(req, {
        action: "billing.payment.captured",
        targetType: "payment",
        targetId: payment.id,
        targetLabel: payment.invoiceNumber || payment.id,
      });

      // Fire-and-forget: combined success + invoice email to the org
      // owner. We do NOT await — a slow SMTP relay must not block the
      // checkout-completion response (the client is waiting on this to
      // close the Razorpay modal). Best-effort delivery; the payment
      // record persists either way and is the source of truth.
      void (async () => {
        try {
          const org = await storage.getOrganizationById(orgId);
          if (!org?.email) return;
          await sendPaymentSuccessEmail({
            to: org.email,
            orgName: org.name || "your organization",
            recipientName: org.name || "there",
            planName: newPlanName || "Subscription",
            billingCycle: pendingCycleSnapshot,
            amountMinor: chargedAmount,
            currency: payment.currency || "INR",
            invoiceNumber: payment.invoiceNumber || payment.id,
            paidAt: payment.paidAt || new Date(),
            periodStart: pendingPeriodStartSnapshot ?? null,
            periodEnd: pendingPeriodEndSnapshot ?? null,
          });
        } catch (err) {
          console.error("[verify-payment] success email failed for org", orgId, err);
        }
      })();

      res.json({ success: true, payment, subscription: sub });
    } catch (error) {
      console.error("Error verifying payment:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/billing/payment-failed
  // The Razorpay checkout modal calls this when the customer's payment
  // attempt fails (declined card, network error, modal dismissed after
  // attempt, etc). We don't store anything — Razorpay is the source of
  // truth for failed attempts — we just notify the owner so they aren't
  // left wondering why nothing happened. Auth is via the standard
  // billing permission so callers can only report failures for their
  // own org.
  app.post("/api/billing/payment-failed", requirePermission("org.billing.payment_method"), async (req: Request, res: Response) => {
    try {
      const { organizationId, planId, amount, reason } = req.body as {
        organizationId?: string;
        planId?: string;
        amount?: number;
        reason?: string;
      };
      if (!organizationId) {
        return res.status(400).json({ error: "organizationId is required" });
      }
      if (!(await assertOrgOwnership(req, res, organizationId))) return;

      // Fire-and-forget so we don't block the client (which is showing
      // the user the post-checkout state). The endpoint returns 200 as
      // long as the request was authorized; whether SMTP actually
      // accepted the message is best-effort.
      void (async () => {
        try {
          const org = await storage.getOrganizationById(organizationId);
          if (!org?.email) return;
          let planName: string | undefined;
          if (planId) {
            const plan = await storage.getPlanById(planId);
            planName = plan?.name;
          }
          await sendPaymentFailureEmail({
            to: org.email,
            orgName: org.name || "your organization",
            recipientName: org.name || "there",
            planName: planName || "your selected plan",
            amountMinor: typeof amount === "number" ? amount : 0,
            currency: "INR",
            reason: typeof reason === "string" && reason.trim()
              ? reason.trim()
              : "Payment was declined or the checkout was interrupted.",
          });
        } catch (err) {
          console.error("[payment-failed] email send failed for org", organizationId, err);
        }
      })();
      res.json({ success: true, queued: true });
    } catch (error) {
      console.error("Error sending payment-failed email:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/billing/payments/:orgId", requirePermission("org.billing.view"), async (req: Request, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      if (!(await assertOrgOwnership(req, res, orgId))) return;
      const paymentList = await storage.getPaymentsByOrg(orgId);
      res.json({ payments: paymentList });
    } catch (error) {
      console.error("Error getting payments:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/billing/payments/:paymentId/invoice
  // Streams a one-page PDF invoice for a captured payment. Auth via the
  // standard org.billing.view permission AND a payment-level ownership
  // check (assertOrgOwnership against the payment's org) so a user with
  // billing.view on org A cannot pull an invoice for a payment that
  // belongs to org B by guessing/incrementing payment ids.
  //
  // The 2-segment path (paymentId/invoice) does NOT collide with the
  // 1-segment listing route above (/payments/:orgId) because Express
  // distinguishes them by segment count.
  //
  // Query string ?download=1 sets Content-Disposition: attachment so the
  // browser downloads instead of inlining. Default is inline view.
  //
  // Only "captured" payments get a PDF — pending/failed rows aren't real
  // invoices and would mislead the customer if rendered.
  app.get("/api/billing/payments/:paymentId/invoice", requirePermission("org.billing.view"), async (req: Request, res: Response) => {
    try {
      const paymentId = req.params.paymentId as string;
      if (!paymentId) return res.status(400).json({ error: "paymentId is required" });

      const payment = await storage.getPaymentById(paymentId);
      if (!payment) return res.status(404).json({ error: "Invoice not found" });
      if (!(await assertOrgOwnership(req, res, payment.organizationId))) return;
      if (payment.status !== "captured") {
        return res.status(404).json({ error: "Invoice is not available for this payment" });
      }

      const [organization, subscription] = await Promise.all([
        storage.getOrganizationById(payment.organizationId),
        payment.subscriptionId
          ? storage.getSubscriptionById(payment.subscriptionId)
          : Promise.resolve(undefined),
      ]);
      if (!organization) return res.status(404).json({ error: "Organization not found" });

      const plan = subscription?.planId
        ? (await storage.getPlanById(subscription.planId)) ?? null
        : null;

      // Resolve the plan that was actually billed: prefer the snapshot
      // id stored on the payment row (immutable, historically correct),
      // fall back to the subscription's current plan for legacy rows.
      const billedPlan = payment.planSnapshotId
        ? (await storage.getPlanById(payment.planSnapshotId)) ?? plan
        : plan;

      // Period dates: streamInvoicePdf will prefer payment.*Snapshot
      // when present and only fall back to these ctx fields for legacy
      // rows (pre-snapshot). We pass the current subscription's period
      // as the legacy fallback — it's a best-effort guess for old data
      // but the invoice number + paidAt + amount on the payment row
      // remain authoritative for the actual transaction either way.
      const mode = req.query.download === "1" ? "download" : "view";
      streamInvoicePdf(
        res,
        {
          payment,
          organization,
          plan: billedPlan,
          subscription: subscription ?? null,
          periodStart: subscription?.currentPeriodStart ?? null,
          periodEnd: subscription?.currentPeriodEnd ?? null,
          billingCycle: subscription?.billingCycle ?? null,
        },
        { mode },
      );
    } catch (error) {
      console.error("Error generating invoice PDF:", error);
      // If headers were already flushed (PDF stream started), we can't
      // change the status. Best-effort: end the connection.
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      } else {
        try { res.end(); } catch { /* ignore */ }
      }
    }
  });

  app.post("/api/billing/cancel-subscription/:subscriptionId", requirePermission("org.billing.payment_method"), async (req: Request, res: Response) => {
    try {
      const subId = req.params.subscriptionId as string;
      // Resolve the subscription's org first, then verify the caller owns
      // that org. Without this, any user with org.billing.payment_method on
      // any org could cancel another org's subscription via its id (IDOR).
      const existing = await storage.getSubscriptionById(subId);
      if (!existing) {
        return res.status(404).json({ error: "Subscription not found" });
      }
      if (!(await assertOrgOwnership(req, res, existing.organizationId))) return;
      const subscription = await storage.updateSubscription(subId, {
        status: "cancelled",
        cancelledAt: new Date(),
      });
      if (!subscription) {
        return res.status(404).json({ error: "Subscription not found" });
      }

      // Fire-and-forget cancellation confirmation. The org keeps access
      // until currentPeriodEnd (existing entitlement contract), so we
      // surface that date in the email so the owner isn't surprised.
      void (async () => {
        try {
          const org = await storage.getOrganizationById(existing.organizationId);
          if (!org?.email) return;
          const plan = await storage.getPlanById(subscription.planId);
          await sendSubscriptionCancelledEmail({
            to: org.email,
            orgName: org.name || "your organization",
            recipientName: org.name || "there",
            planName: plan?.name || "your subscription",
            accessUntil: subscription.currentPeriodEnd ?? null,
          });
        } catch (err) {
          console.error("[cancel-subscription] cancellation email failed:", err);
        }
      })();

      res.json({ subscription });
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // DASHBOARD MANAGEMENT ROUTES
  // ============================================

  // GET /api/dashboard/plan-limits/:orgId — current usage and caps for the
  // dashboard "subscription" widget. Reuses org.billing.view since it
  // exposes plan name + remaining seats, which is billing-relevant info.
  app.get("/api/dashboard/plan-limits/:orgId", requirePermission("org.billing.view"), async (req: Request, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      if (!await assertOrgOwnership(req, res, orgId)) return;
      const snapshot = await getPlanUsageSnapshot(orgId);
      res.json(snapshot);
    } catch (error) {
      console.error("Error getting plan limits:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/dashboard/branches/:orgId", requirePermission("org.branches.view"), async (req: Request, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      if (!await assertOrgOwnership(req, res, orgId)) return;
      const branchList = await storage.getBranchesByOrganization(orgId);
      const branchesWithServices = await Promise.all(
        branchList.map(async (branch) => {
          const branchServices = await storage.getServicesByBranch(branch.id);
          const branchDesks = await storage.getDesksByBranch(branch.id);
          const servicesWithDesks = branchServices.map(s => ({
            ...s,
            desks: branchDesks.filter(d => d.serviceId === s.id),
          }));
          const journeys = await storage.getJourneysByBranch(branch.id);
          const journeysWithStages = await Promise.all(journeys.map(async (j) => {
            const data = await storage.getJourneyWithStages(j.id);
            return data ? { ...data.journey, stages: data.stages } : j;
          }));
          const operatingHoursList = await storage.getOperatingHours(branch.id);
          const operatingHoursWithBreaks = await Promise.all(operatingHoursList.map(async (oh) => {
            const breaks = await storage.getBreakTimes(oh.id);
            return { ...oh, breaks };
          }));
          const holidaysList = await storage.getHolidays(branch.id);
          return {
            ...branch,
            services: servicesWithDesks,
            journeys: journeysWithStages,
            settings: {
              queueMode: branch.queueMode,
              notificationMode: branch.notificationMode,
              autoCallNext: branch.autoCallNext,
              maxQueueSize: branch.maxQueueSize,
              defaultSlotDuration: branch.defaultSlotDuration,
              defaultSlotCapacity: branch.defaultSlotCapacity,
              display: branch.displaySettings,
              api: branch.apiSettings,
              operatingHours: operatingHoursWithBreaks,
              holidays: holidaysList,
            },
          };
        })
      );
      res.json({ branches: branchesWithServices });
    } catch (error) {
      console.error("Error getting branches:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/branches", requirePermission("org.branches.create"), async (req: Request, res: Response) => {
    try {
      const { orgId, name, address, city, state, pincode, phone, latitude, longitude } = req.body;
      if (!orgId || !name) {
        return res.status(400).json({ error: "orgId and name are required" });
      }
      if (!await assertOrgOwnership(req, res, orgId)) return;
      if (!await assertCanCreateBranch(req, res, orgId)) return;
      const branch = await storage.createBranch({
        organizationId: orgId,
        name,
        address,
        city,
        state,
        pincode,
        phone,
        latitude,
        longitude,
      });
      await writeAudit(req, { action: "branch.create", targetType: "branch", targetId: branch.id, targetLabel: branch.name, diff: req.body });

      // Auto-provision "Main Service" + "Counter 1" so a freshly created
      // branch is immediately usable. Best-effort: if it fails (e.g. plan
      // cap reached on services/desks) we still return the branch — the
      // owner can add them manually.
      try {
        const mainService = await storage.createService({
          branchId: branch.id,
          name: "Main Service",
          averageWaitTime: 15,
          estimatedDuration: 20,
          inputFields: [],
          requiresInPersonRegistration: false,
          inPersonPerimeterMeters: 100,
          isActive: true,
          queueStatus: "active",
        });
        await storage.createDesk({
          serviceId: mainService.id,
          branchId: branch.id,
          name: "Counter 1",
          isActive: true,
          queueStatus: "active",
          sortOrder: 0,
        });
      } catch (seedErr) {
        console.warn(`[branches] Failed to seed Main Service/Counter 1 for branch=${branch.id}:`, seedErr);
      }

      res.json({ branch });
    } catch (error) {
      console.error("Error creating branch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/dashboard/branches/:branchId", requirePermission("org.branches.edit"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const branch = await storage.updateBranch(branchId, req.body);
      if (!branch) {
        return res.status(404).json({ error: "Branch not found" });
      }
      await writeAudit(req, { action: "branch.update", targetType: "branch", targetId: branchId, targetLabel: branch.name, diff: req.body });
      res.json({ branch });
    } catch (error) {
      console.error("Error updating branch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/dashboard/branches/:branchId", requirePermission("org.branches.delete"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const branch = await storage.updateBranch(branchId, { isActive: false });
      if (!branch) {
        return res.status(404).json({ error: "Branch not found" });
      }
      await writeAudit(req, { action: "branch.delete", targetType: "branch", targetId: branchId, targetLabel: branch.name });
      res.json({ success: true, branch });
    } catch (error) {
      console.error("Error deleting branch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/services", requirePermission("org.services.create"), async (req: Request, res: Response) => {
    try {
      const { branchId, name, description, averageWaitTime, estimatedDuration, maxDailyCapacity, inputFields, sortOrder } = req.body;
      if (!branchId || !name) {
        return res.status(400).json({ error: "branchId and name are required" });
      }
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const ownerBranch = await storage.getBranchById(branchId);
      if (!ownerBranch) return res.status(404).json({ error: "Branch not found" });
      if (!await assertCanCreateService(req, res, ownerBranch.organizationId, branchId)) return;
      const service = await storage.createService({
        branchId,
        name,
        description,
        averageWaitTime,
        estimatedDuration,
        maxDailyCapacity,
        inputFields,
        sortOrder,
      });
      res.json({ service });
    } catch (error) {
      console.error("Error creating service:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/dashboard/services/:serviceId", requirePermission("org.services.edit"), async (req: Request, res: Response) => {
    try {
      const serviceId = req.params.serviceId as string;
      if (!await assertServiceOwnership(req, res, serviceId)) return;
      const { name, description, averageWaitTime, estimatedDuration, maxDailyCapacity, inputFields, isActive, requiresInPersonRegistration, inPersonPerimeterMeters, serviceSettings, sortOrder } = req.body;
      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (averageWaitTime !== undefined) updateData.averageWaitTime = parseInt(averageWaitTime) || 15;
      if (estimatedDuration !== undefined) updateData.estimatedDuration = parseInt(estimatedDuration) || 10;
      if (maxDailyCapacity !== undefined) updateData.maxDailyCapacity = parseInt(maxDailyCapacity) || null;
      if (inputFields !== undefined) updateData.inputFields = inputFields;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (requiresInPersonRegistration !== undefined) updateData.requiresInPersonRegistration = requiresInPersonRegistration;
      if (inPersonPerimeterMeters !== undefined) updateData.inPersonPerimeterMeters = parseInt(inPersonPerimeterMeters) || 100;
      if (serviceSettings !== undefined) updateData.serviceSettings = serviceSettings;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      const service = await storage.updateService(serviceId, updateData);
      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }
      res.json({ service });
    } catch (error) {
      console.error("Error updating service:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/dashboard/services/:serviceId", requirePermission("org.services.delete"), async (req: Request, res: Response) => {
    try {
      const serviceId = req.params.serviceId as string;
      if (!await assertServiceOwnership(req, res, serviceId)) return;
      const service = await storage.updateService(serviceId, { isActive: false });
      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }
      await writeAudit(req, { action: "service.delete", targetType: "service", targetId: serviceId, targetLabel: service.name });
      res.json({ success: true, service });
    } catch (error) {
      console.error("Error deleting service:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/dashboard/users/:orgId", requirePermission("org.users.view"), async (req: Request, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      if (!await assertOrgOwnership(req, res, orgId)) return;
      const ctx = await getCallerContext(req);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      const allUsers = await storage.getOrgUsersByOrganization(orgId);
      const branchesList = await storage.getBranchesByOrganization(orgId);
      // Enrich every user with branchIds + branchName + role rank, then apply
      // hierarchy + branch filter (Owner/Platform: see all; others: only
      // strictly-lower-rank users in branches the caller has access to).
      const enriched = await Promise.all(allUsers.map(async (u) => {
        const branchIds = await storage.getOrgUserBranches(u.id);
        const userBranch = u.branchId ? branchesList.find((b) => b.id === u.branchId) : null;
        const role = u.roleId ? await storage.getRoleById(u.roleId) : (u.role ? await storage.getRoleByKey(u.role) : undefined);
        const rank = role ? getRoleRank(role) : getRoleRank(u.role || "");
        return {
          ...sanitizeOrgUser(u)!,
          branchIds,
          branchName: userBranch?.name,
          rank,
        };
      }));
      const visible = enriched.filter((u) => callerCanManageTargetUser(ctx, { role: u.role, rank: u.rank, branchId: u.branchId, branchIds: u.branchIds }));
      res.json({ users: visible });
    } catch (error) {
      console.error("Error getting users:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/users", requirePermission("org.users.invite"), async (req: Request, res: Response) => {
    try {
      const { organizationId, name, email, phone, password, role, branchId, branchIds, assignedServiceIds } = req.body;
      if (!organizationId || !name || !email || !password || !role) {
        return res.status(400).json({ error: "organizationId, name, email, password, and role are required" });
      }
      if (!await assertOrgOwnership(req, res, organizationId)) return;
      const ctx = await getCallerContext(req);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      // Normalize: form sends "" when no branch selected; coerce to null so the FK isn't violated.
      const branchIdNorm = (typeof branchId === "string" && branchId.trim() === "") || branchId == null ? null : branchId;
      if (branchIdNorm && !await assertBranchOwnership(req, res, branchIdNorm)) return;
      // Branch hierarchy: non-Owner callers must own every assigned branch.
      if (branchIdNorm && !callerCanAccessBranch(ctx, branchIdNorm)) {
        return res.status(403).json({ error: "Branch is not in your scope" });
      }
      if (Array.isArray(branchIds)) {
        for (const bid of branchIds) {
          if (!await assertBranchOwnership(req, res, bid)) return;
          if (!callerCanAccessBranch(ctx, bid)) {
            return res.status(403).json({ error: "Branch is not in your scope" });
          }
        }
      }
      const roleRow = await resolveAssignableRole(res, role, organizationId, ctx.rank);
      if (!roleRow) return;
      if (!await assertCanCreateOrgUser(req, res, organizationId)) return;
      const user = await storage.createOrgUser({
        organizationId,
        name,
        email,
        phone,
        role: roleRow.key,
        roleId: roleRow.id,
        branchId: branchIdNorm,
        assignedServiceIds,
        password,
      });
      if (Array.isArray(branchIds) && branchIds.length > 0) {
        await storage.setOrgUserBranches(user.id, branchIds);
      }
      const userBranchIds = await storage.getOrgUserBranches(user.id);
      res.json({ user: { ...sanitizeOrgUser(user)!, branchIds: userBranchIds } });
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/dashboard/users/:userId", requirePermission("org.users.edit"), async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId as string;
      if (!await assertOrgUserOwnership(req, res, userId)) return;
      const ctx = await getCallerContext(req);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      const target = await storage.getOrgUserById(userId);
      if (!target) return res.status(404).json({ error: "User not found" });
      const targetBranchIds = await storage.getOrgUserBranches(userId);
      if (!callerCanManageTargetUser(ctx, { role: target.role, branchId: target.branchId, branchIds: targetBranchIds })) {
        return res.status(403).json({ error: "You cannot manage this user" });
      }
      // Strict allowlist: never trust roleId/passwordHash/organizationId/role
      // (and other authz-sensitive keys) from the request body — they are
      // derived server-side from the resolved role and the existing user row.
      const { name, email, phone, password, role, branchId, branchIds, assignedServiceIds, isActive, profilePictureUrl } = req.body ?? {};
      // Normalize: form sends "" when no branch selected; coerce to null so the FK isn't violated.
      const branchIdNorm = branchId === undefined ? undefined : ((typeof branchId === "string" && branchId.trim() === "") || branchId == null ? null : branchId);
      if (branchIdNorm && !await assertBranchOwnership(req, res, branchIdNorm)) return;
      if (branchIdNorm && !callerCanAccessBranch(ctx, branchIdNorm)) {
        return res.status(403).json({ error: "Branch is not in your scope" });
      }
      if (Array.isArray(branchIds)) {
        for (const bid of branchIds) {
          if (!await assertBranchOwnership(req, res, bid)) return;
          if (!callerCanAccessBranch(ctx, bid)) {
            return res.status(403).json({ error: "Branch is not in your scope" });
          }
        }
      }
      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (branchIdNorm !== undefined) updateData.branchId = branchIdNorm;
      if (assignedServiceIds !== undefined) updateData.assignedServiceIds = assignedServiceIds;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (profilePictureUrl !== undefined) updateData.profilePictureUrl = profilePictureUrl;
      if (password) {
        updateData.passwordHash = await hashPassword(password);
      }
      if (role !== undefined) {
        const roleRow = await resolveAssignableRole(res, role, target.organizationId, ctx.rank);
        if (!roleRow) return;
        updateData.role = roleRow.key;
        updateData.roleId = roleRow.id;
      }
      const user = await storage.updateOrgUser(userId, updateData);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      if (Array.isArray(branchIds)) {
        await storage.setOrgUserBranches(userId, branchIds);
      }
      const finalBranchIds = await storage.getOrgUserBranches(userId);
      res.json({ user: { ...sanitizeOrgUser(user)!, branchIds: finalBranchIds } });
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/dashboard/users/:userId", requirePermission("org.users.deactivate"), async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId as string;
      if (!await assertOrgUserOwnership(req, res, userId)) return;
      const ctx = await getCallerContext(req);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      const target = await storage.getOrgUserById(userId);
      if (!target) return res.status(404).json({ error: "User not found" });
      const targetBranchIds = await storage.getOrgUserBranches(userId);
      if (!callerCanManageTargetUser(ctx, { role: target.role, branchId: target.branchId, branchIds: targetBranchIds })) {
        return res.status(403).json({ error: "You cannot manage this user" });
      }
      const user = await storage.updateOrgUser(userId, { isActive: false });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      await writeAudit(req, { action: "user.deactivate", targetType: "org_user", targetId: userId, targetLabel: user.email });
      res.json({ success: true, user: sanitizeOrgUser(user) });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/dashboard/bookings/:branchId", requirePermission("org.bookings.view"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const dateStr = req.query.date as string | undefined;
      const date = dateStr ? new Date(dateStr) : undefined;
      const appointmentList = await storage.getAppointmentsByBranch(branchId, date);
      res.json({ appointments: appointmentList });
    } catch (error) {
      console.error("Error getting bookings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/dashboard/branches/:branchId/settings", requirePermission("org.settings.queue.edit"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const { queueMode, notificationMode, autoCallNext, maxQueueSize, defaultSlotDuration, defaultSlotCapacity, displaySettings, apiSettings, announcerUserId } = req.body;
      const updateData: any = {
        queueMode,
        notificationMode,
        autoCallNext,
        maxQueueSize,
        defaultSlotDuration,
        defaultSlotCapacity,
        displaySettings,
        apiSettings,
      };
      if (announcerUserId !== undefined) {
        if (announcerUserId === null || announcerUserId === "") {
          updateData.announcerUserId = null;
        } else {
          const target = await storage.getOrgUserById(announcerUserId);
          const existingBranch = await storage.getBranchById(branchId);
          if (!target || !existingBranch || target.organizationId !== existingBranch.organizationId) {
            return res.status(400).json({ error: "announcerUserId must belong to the same organization" });
          }
          updateData.announcerUserId = announcerUserId;
        }
      }
      const branch = await storage.updateBranch(branchId, updateData);
      if (!branch) {
        return res.status(404).json({ error: "Branch not found" });
      }
      await writeAudit(req, { action: "branch.settings.update", targetType: "branch", targetId: branchId, targetLabel: branch.name, diff: req.body });
      res.json({ branch });
    } catch (error) {
      console.error("Error updating branch settings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Operating Hours endpoints
  app.put("/api/dashboard/operating-hours/:id", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertOperatingHourOwnership(req, res, id)) return;
      const { openTime, closeTime, isOpen } = req.body;
      const hour = await storage.updateOperatingHour(id, { openTime, closeTime, isOpen });
      if (!hour) return res.status(404).json({ error: "Operating hour not found" });
      await writeAudit(req, { action: "operating_hours.update", targetType: "operating_hours", targetId: id, diff: req.body });
      res.json({ operatingHour: hour });
    } catch (error) {
      console.error("Error updating operating hour:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Break Times endpoints
  app.get("/api/dashboard/breaks/:operatingHourId", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const operatingHourId = req.params.operatingHourId as string;
      if (!await assertOperatingHourOwnership(req, res, operatingHourId)) return;
      const breaks = await storage.getBreakTimes(operatingHourId);
      res.json({ breaks });
    } catch (error) {
      console.error("Error getting breaks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/breaks", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const { operatingHourId, name, startTime, endTime } = req.body;
      if (!operatingHourId || !name || !startTime || !endTime) {
        return res.status(400).json({ error: "operatingHourId, name, startTime, endTime required" });
      }
      if (!await assertOperatingHourOwnership(req, res, operatingHourId)) return;
      const bt = await storage.createBreakTime({ operatingHourId, name, startTime, endTime });
      await writeAudit(req, { action: "break.create", targetType: "break", targetId: bt.id, targetLabel: name, diff: req.body });
      res.json({ break: bt });
    } catch (error) {
      console.error("Error creating break:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/dashboard/breaks/:id", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertBreakOwnership(req, res, id)) return;
      const { name, startTime, endTime, isActive } = req.body;
      const bt = await storage.updateBreakTime(id, { name, startTime, endTime, isActive });
      if (!bt) return res.status(404).json({ error: "Break not found" });
      await writeAudit(req, { action: "break.update", targetType: "break", targetId: id, targetLabel: bt.name, diff: req.body });
      res.json({ break: bt });
    } catch (error) {
      console.error("Error updating break:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/dashboard/breaks/:id", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertBreakOwnership(req, res, id)) return;
      await storage.deleteBreakTime(id);
      await writeAudit(req, { action: "break.delete", targetType: "break", targetId: id });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting break:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Holiday endpoints
  app.post("/api/dashboard/holidays", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const { branchId, date, name, isRecurring } = req.body;
      if (!branchId || !date || !name) {
        return res.status(400).json({ error: "branchId, date, name required" });
      }
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const holiday = await storage.createHoliday({ branchId, date: new Date(date), name, isRecurring: isRecurring || false });
      await writeAudit(req, { action: "holiday.create", targetType: "holiday", targetId: holiday.id, targetLabel: name, diff: req.body });
      res.json({ holiday });
    } catch (error) {
      console.error("Error creating holiday:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/dashboard/holidays/:id", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertHolidayOwnership(req, res, id)) return;
      await storage.deleteHoliday(id);
      await writeAudit(req, { action: "holiday.delete", targetType: "holiday", targetId: id });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting holiday:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/dashboard/journeys/:branchId", requirePermission("org.journeys.view"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const journeyList = await storage.getJourneysByBranch(branchId);
      const journeysWithStages = await Promise.all(
        journeyList.map(async (journey) => {
          const data = await storage.getJourneyWithStages(journey.id);
          return data ? { ...data.journey, stages: data.stages } : { ...journey, stages: [] };
        })
      );
      res.json({ journeys: journeysWithStages });
    } catch (error) {
      console.error("Error getting journeys:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/journeys", requirePermission("org.journeys.create"), async (req: Request, res: Response) => {
    try {
      const { branchId, name, description, isActive, stages } = req.body;
      if (!branchId || !name) {
        return res.status(400).json({ error: "branchId and name are required" });
      }
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const journey = await storage.createJourney({ branchId, name, description, isActive });
      if (stages && Array.isArray(stages) && stages.length > 0) {
        await storage.updateJourneyStages(journey.id, stages);
      }
      const data = await storage.getJourneyWithStages(journey.id);
      res.json({ journey: data ? { ...data.journey, stages: data.stages } : journey });
    } catch (error) {
      console.error("Error creating journey:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/dashboard/journeys/:journeyId", requirePermission("org.journeys.edit"), async (req: Request, res: Response) => {
    try {
      const journeyId = req.params.journeyId as string;
      if (!await assertJourneyOwnership(req, res, journeyId)) return;
      const { name, description, isActive, stages } = req.body;
      const journey = await storage.updateJourney(journeyId, { name, description, isActive });
      if (!journey) {
        return res.status(404).json({ error: "Journey not found" });
      }
      if (stages && Array.isArray(stages)) {
        await storage.updateJourneyStages(journeyId, stages);
      }
      const data = await storage.getJourneyWithStages(journeyId);
      res.json({ journey: data ? { ...data.journey, stages: data.stages } : journey });
    } catch (error) {
      console.error("Error updating journey:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/dashboard/journeys/:journeyId", requirePermission("org.journeys.delete"), async (req: Request, res: Response) => {
    try {
      const journeyId = req.params.journeyId as string;
      if (!await assertJourneyOwnership(req, res, journeyId)) return;
      await storage.deleteJourney(journeyId);
      await writeAudit(req, { action: "journey.delete", targetType: "journey", targetId: journeyId });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting journey:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
