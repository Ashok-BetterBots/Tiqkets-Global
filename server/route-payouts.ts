import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { events, eventRegistrations, organizerPayoutProfiles, payments, razorpayWebhookReceipts, routePayoutAllocations } from "@shared/schema";
import { assertOrgOwnership, getCallerContext, isSuperAdminRequest, requirePermission, writeAudit } from "./rbac";
import { canReclaimWebhookReceipt, isFullRouteRefundAmount, paymentRecoveryDisposition, routeMoneyMovementKey, routeOrderIdempotencyKey, safePayoutProfile, validateOnboardingInput, verifyRazorpaySignature } from "./razorpay-route-contract";
import { ACTIVE_ROUTE_ACCOUNT_STATUSES } from "@shared/razorpay-onboarding";

function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !secret) throw new Error("Razorpay platform credentials are not configured");
  return { keyId, auth: `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}` };
}
async function razorpay(path: string, init: RequestInit) {
  const { auth } = credentials();
  const versionedPath = path.startsWith("/v1/") || path.startsWith("/v2/") ? path : `/v1${path}`;
  return fetch(`https://api.razorpay.com${versionedPath}`, { ...init, headers: { Authorization: auth, "Content-Type": "application/json", ...(init.headers || {}) }, signal: AbortSignal.timeout(10_000) });
}
export function razorpayApiUrl(path: string): string {
  return `https://api.razorpay.com${path.startsWith("/v1/") || path.startsWith("/v2/") ? path : `/v1${path}`}`;
}
function profileStatus(account: any): string {
  return String(account?.status || account?.account_status || "created").toLowerCase();
}
export function isRouteProfileActive(profile: { status: string; productStatus?: string | null } | undefined): boolean {
  return !!profile && ACTIVE_ROUTE_ACCOUNT_STATUSES.has(profile.status.toLowerCase()) &&
    (!("productStatus" in profile) || ACTIVE_ROUTE_ACCOUNT_STATUSES.has(String(profile.productStatus || "").toLowerCase()));
}
export async function createRouteOrder(input: { allocationId: string; registrationId: string; eventId: string; accountId: string; amount: number }) {
  const [known] = await db.select({ razorpayOrderId: routePayoutAllocations.razorpayOrderId, razorpayTransferId: routePayoutAllocations.razorpayTransferId })
    .from(routePayoutAllocations).where(eq(routePayoutAllocations.id, input.allocationId)).limit(1);
  if (known?.razorpayOrderId) return { id: known.razorpayOrderId, transfers: known.razorpayTransferId ? [{ id: known.razorpayTransferId }] : [] };
  const res = await razorpay("/orders", { method: "POST", body: JSON.stringify({
    amount: input.amount, currency: "INR", receipt: `route_${input.allocationId.slice(0, 20)}`,
    notes: { type: "event_route", allocationId: input.allocationId, registrationId: input.registrationId, eventId: input.eventId },
    transfers: [{ account: input.accountId, amount: input.amount, currency: "INR", notes: { allocationId: input.allocationId } }],
  }), headers: { "X-Razorpay-Idempotency-Key": routeOrderIdempotencyKey(input.allocationId) } });
  if (!res.ok) throw new Error("Razorpay Route order creation failed");
  const order = await res.json() as { id: string; transfers?: Array<{ id?: string }> };
  // First writer wins: a timeout/retry can safely discover this persisted
  // provider order rather than creating another transfer.
  await db.update(routePayoutAllocations).set({ razorpayOrderId: order.id, razorpayTransferId: order.transfers?.[0]?.id || null, status: "order_created", updatedAt: new Date() })
    .where(and(eq(routePayoutAllocations.id, input.allocationId), eq(routePayoutAllocations.status, "pending_order")));
  return order;
}

async function assertPayoutOrganizer(req: Request, res: Response, organizationId: string): Promise<boolean> {
  if (!await assertOrgOwnership(req, res, organizationId)) return false;
  const ctx = await getCallerContext(req);
  // Platform admins pass; organization-side access is deliberately narrower
  // than org.events.manage because billing data is owner/organizer-only.
  if (!ctx?.isPlatform && ctx?.roleKey !== "admin" && ctx?.roleKey !== "organizer") {
    res.status(403).json({ error: "Organizer or organization administrator required" }); return false;
  }
  // Event-account check is performed from organizations without trusting URL.
  const rows = await db.execute(sql`SELECT account_type FROM organizations WHERE id = ${organizationId}`);
  if (!rows.rows[0] || rows.rows[0].account_type !== "event") {
    res.status(403).json({ error: "Payouts are available only to event accounts" }); return false;
  }
  return true;
}

async function recoverCapturedPayment(orderId: string, paymentId: string): Promise<boolean> {
  const [allocation] = await db.select().from(routePayoutAllocations).where(eq(routePayoutAllocations.razorpayOrderId, orderId)).limit(1);
  if (!allocation || allocation.amount <= 0) return false;
  const [reg] = await db.select().from(eventRegistrations).where(eq(eventRegistrations.id, allocation.registrationId)).limit(1);
  if (!reg) return false;
  const [ev] = await db.select().from(events).where(eq(events.id, reg.eventId)).limit(1);
  if (!ev || ev.organizationId !== allocation.organizationId) return false;
  const disposition = paymentRecoveryDisposition(reg.status);
  if (disposition === "terminal") return true;
  if (disposition === "reject") return false;
  if (disposition === "issue_ticket") {
    const { issueTicket } = await import("./events-routes");
    const issued = await issueTicket(ev, reg);
    return issued.status === "ticket_generated";
  }
  const [orderRes, paymentRes] = await Promise.all([
    razorpay(`/orders/${encodeURIComponent(orderId)}`, { method: "GET" }),
    razorpay(`/payments/${encodeURIComponent(paymentId)}`, { method: "GET" }),
  ]);
  if (!orderRes.ok || !paymentRes.ok) return false;
  const order: any = await orderRes.json(), payment: any = await paymentRes.json();
  if (order.status !== "paid" || payment.status !== "captured" || payment.order_id !== orderId ||
      Number(order.amount) !== allocation.amount || Number(payment.amount) !== allocation.amount ||
      String(order.currency).toUpperCase() !== "INR" || String(payment.currency).toUpperCase() !== "INR" ||
      String(order.notes?.allocationId || "") !== allocation.id || String(order.notes?.registrationId || "") !== reg.id) return false;
  let paymentRow: any;
  try {
    [paymentRow] = await db.insert(payments).values({ organizationId: ev.organizationId, amount: allocation.amount, currency: "INR", status: "captured", razorpayPaymentId: paymentId, razorpayOrderId: orderId, paymentMethod: payment.method || null, description: `Event registration — ${ev.name}`, paidAt: new Date() }).returning();
  } catch { [paymentRow] = await db.select().from(payments).where(eq(payments.razorpayPaymentId, paymentId)).limit(1); }
  const [paid] = await db.update(eventRegistrations).set({ status: "payment_completed", amountPaid: allocation.amount, paymentId: paymentRow?.id || null, updatedAt: new Date() })
    .where(and(eq(eventRegistrations.id, reg.id), eq(eventRegistrations.status, "registration_started"))).returning();
  if (!paid) return true;
  await db.update(routePayoutAllocations).set({ status: "captured", updatedAt: new Date() }).where(eq(routePayoutAllocations.id, allocation.id));
  await db.execute(sql`INSERT INTO event_stage_log (registration_id, stage, metadata) VALUES (${reg.id}, 'payment_completed', ${JSON.stringify({ amount: allocation.amount, allocationId: allocation.id })}::jsonb)`);
  const { issueTicket } = await import("./events-routes");
  const issued = await issueTicket(ev, paid);
  return issued.status === "ticket_generated";
}

export function registerRoutePayoutRoutes(app: Express) {
  app.get("/api/dashboard/payouts/onboarding-options", requirePermission("org.events.manage"), async (req, res) => {
    const ctx = await getCallerContext(req);
    if (!ctx?.isPlatform && ctx?.roleKey !== "admin" && ctx?.roleKey !== "organizer") return res.status(403).json({ error: "Organizer or organization administrator required" });
    return res.json({ accountTypes: ["route"], currency: "INR", currencyUnit: "paise", requiresPlatformCredentials: true });
  });
  const getProfile = async (req: Request, res: Response) => {
    const organizationId = String(req.params.orgId || req.params.organizationId); if (!await assertPayoutOrganizer(req, res, organizationId)) return;
    const [profile] = await db.select().from(organizerPayoutProfiles).where(eq(organizerPayoutProfiles.organizationId, organizationId)).limit(1);
    const active = isRouteProfileActive(profile);
    return res.json({ profile: { ...(profile ? safePayoutProfile(profile) : {}), configured: !!profile, canAcceptPaidTickets: active, actionRequired: active ? null : (profile ? "Complete Route product activation" : "Set up a Route payout account") } });
  };
  const saveProfile = async (req: Request, res: Response) => {
    const organizationId = String(req.params.orgId || req.params.organizationId); if (!await assertPayoutOrganizer(req, res, organizationId)) return;
    const parsed = validateOnboardingInput(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    try {
      // Sensitive values in parsed.value are only serialized to Razorpay. Never
      // log this request, attach it to audit metadata, or persist it.
      const [existingProfile] = await db.select().from(organizerPayoutProfiles).where(eq(organizerPayoutProfiles.organizationId, organizationId)).limit(1);
      // Reuse the linked account on retries/updates; do not create duplicate
      // Razorpay accounts for an organization.
      const {
        // These are local, safe bookkeeping aliases. Razorpay accepts only the
        // documented linked-account fields below, not our display metadata.
        businessName: _businessName,
        contactName: _contactName,
        accountType: _accountType,
        contact_name: _contactNameField,
        ...providerAccountPayload
      } = parsed.value as Record<string, unknown>;
      const accountRes = await razorpay(existingProfile ? `/v2/accounts/${encodeURIComponent(existingProfile.razorpayAccountId)}` : "/v2/accounts", {
        method: existingProfile ? "PATCH" : "POST", body: JSON.stringify(providerAccountPayload),
      });
      if (!accountRes.ok) return res.status(502).json({ error: "Razorpay onboarding request was rejected" });
      const account: any = await accountRes.json();
      if (!account?.id || (existingProfile && account.id !== existingProfile.razorpayAccountId)) return res.status(502).json({ error: "Razorpay returned an invalid account" });
      const status = profileStatus(account);
      const b = parsed.value;
      // Route is not sale-ready until both stakeholder and product readiness
      // are confirmed. These calls use only transit data and provider IDs.
      let stakeholderId: string | null = existingProfile?.providerStakeholderId || null;
      let productId: string | null = existingProfile?.providerProductId || null;
      let productStatus = existingProfile?.productStatus || "pending";
      if (!stakeholderId) {
        const stakeholder = await razorpay(`/v2/accounts/${encodeURIComponent(account.id)}/stakeholders`, { method: "POST", body: JSON.stringify({ name: b.contactName, email: b.email, phone: b.phone }) });
        if (stakeholder.ok) stakeholderId = (await stakeholder.json() as any).id || null;
      }
      if (!productId) {
        const product = await razorpay(`/v2/accounts/${encodeURIComponent(account.id)}/products`, { method: "POST", body: JSON.stringify({ product_name: "route" }) });
        if (product.ok) { const p: any = await product.json(); productId = p.id || null; productStatus = profileStatus(p); }
      }
      const values = { organizationId, razorpayAccountId: account.id, status, accountType: String(b.accountType), businessName: String(b.businessName), contactName: String(b.contactName), email: String(b.email), phoneLast4: String(b.phone).replace(/\D/g, "").slice(-4), lastReconciledAt: new Date(), statusReason: null, providerStakeholderId: stakeholderId, providerProductId: productId, productStatus, productStatusReason: null };
      const [profile] = await db.insert(organizerPayoutProfiles).values(values).onConflictDoUpdate({ target: organizerPayoutProfiles.organizationId, set: { ...values, updatedAt: new Date() } }).returning();
      await writeAudit(req, { action: "route_payout_onboarding_submitted", targetType: "organization", targetId: organizationId, diff: { accountId: account.id, status } });
      const active = isRouteProfileActive(profile);
      return res.json({ profile: { ...safePayoutProfile(profile), configured: true, canAcceptPaidTickets: active, actionRequired: active ? null : "Complete Route product activation" } });
    } catch {
      return res.status(503).json({ error: "Payout onboarding service unavailable" });
    }
  };
  const history = async (req: Request, res: Response) => {
    const organizationId = String(req.params.orgId || req.params.organizationId); if (!await assertPayoutOrganizer(req, res, organizationId)) return;
    const rows = await db.select({ allocation: routePayoutAllocations, registration: eventRegistrations, event: events }).from(routePayoutAllocations)
      .innerJoin(eventRegistrations, eq(routePayoutAllocations.registrationId, eventRegistrations.id))
      .innerJoin(events, eq(eventRegistrations.eventId, events.id)).where(eq(routePayoutAllocations.organizationId, organizationId));
    const items = rows.map(({ allocation, registration, event }) => ({ id: allocation.id, eventName: event.name, bookingId: registration.bookingId, netAmount: allocation.amount, transferStatus: allocation.status, settlementStatus: allocation.status === "captured" ? "pending" : allocation.status, createdAt: allocation.createdAt, failureReason: null }));
    const sum = (filter: (x: typeof items[number]) => boolean) => items.filter(filter).reduce((n, x) => n + x.netAmount, 0);
    return res.json({ totals: { gross: sum(() => true), transferred: sum(x => ["captured", "reversed", "refunded"].includes(x.transferStatus)), settled: 0, refunded: sum(x => x.transferStatus === "refunded") }, items });
  };
  const reconcile = async (req: Request, res: Response) => {
    const organizationId = String(req.params.orgId || req.params.organizationId); if (!await assertPayoutOrganizer(req, res, organizationId)) return;
    const [profile] = await db.select().from(organizerPayoutProfiles).where(eq(organizerPayoutProfiles.organizationId, organizationId)).limit(1);
    if (!profile) return res.status(404).json({ error: "Payout profile not found" });
    try {
      const provider = await razorpay(`/v2/accounts/${encodeURIComponent(profile.razorpayAccountId)}`, { method: "GET" });
      if (!provider.ok) return res.status(502).json({ error: "Could not reconcile payout profile" });
      const account: any = await provider.json();
      let productStatus = profile.productStatus, productStatusReason = profile.productStatusReason;
      if (profile.providerProductId) {
        const productRes = await razorpay(`/v2/accounts/${encodeURIComponent(profile.razorpayAccountId)}/products/${encodeURIComponent(profile.providerProductId)}`, { method: "GET" });
        if (productRes.ok) { const product: any = await productRes.json(); productStatus = profileStatus(product); productStatusReason = product.status_reason || null; }
      }
      const [updated] = await db.update(organizerPayoutProfiles).set({ status: profileStatus(account), productStatus, productStatusReason, lastReconciledAt: new Date(), statusReason: null, updatedAt: new Date() }).where(eq(organizerPayoutProfiles.id, profile.id)).returning();
      await writeAudit(req, { action: "route_payout_profile_reconciled", targetType: "organization", targetId: organizationId, diff: { status: updated.status } });
      // Reconcile linked account state and each known transfer so history
      // reflects settlement/reversal changes without retaining provider payloads.
      const allocations = await db.select().from(routePayoutAllocations).where(eq(routePayoutAllocations.organizationId, organizationId));
      for (const allocation of allocations) {
        if (!allocation.razorpayTransferId || ["reversed", "refunded"].includes(allocation.status)) continue;
        const transferRes = await razorpay(`/transfers/${encodeURIComponent(allocation.razorpayTransferId)}`, { method: "GET" });
        if (transferRes.ok) {
          const transfer: any = await transferRes.json();
          const state = String(transfer.status || "").toLowerCase();
          if (state === "reversed") await db.update(routePayoutAllocations).set({ status: "reversed", updatedAt: new Date() }).where(eq(routePayoutAllocations.id, allocation.id));
        }
      }
      const active = isRouteProfileActive(updated);
      return res.json({ profile: { ...safePayoutProfile(updated), configured: true, canAcceptPaidTickets: active, actionRequired: active ? null : "Complete Route product activation" } });
    } catch { return res.status(503).json({ error: "Payout reconciliation unavailable" }); }
  };
  app.get("/api/dashboard/payouts/:orgId/profile", requirePermission("org.events.manage"), getProfile);
  app.post("/api/dashboard/payouts/:orgId/profile", requirePermission("org.events.manage"), saveProfile);
  app.get("/api/dashboard/payouts/:orgId/history", requirePermission("org.events.manage"), history);
  app.post("/api/dashboard/payouts/:orgId/reconcile", requirePermission("org.events.manage"), reconcile);
  // Legacy aliases.
  app.get("/api/dashboard/payouts/profile/:organizationId", requirePermission("org.events.manage"), getProfile);
  app.post("/api/dashboard/payouts/profile/:organizationId/onboard", requirePermission("org.events.manage"), saveProfile);
  app.post("/api/admin/payouts/allocations/:allocationId/reverse", async (req, res) => {
    if (!isSuperAdminRequest(req)) return res.status(403).json({ error: "Platform administrator required" });
    const [allocation] = await db.select().from(routePayoutAllocations).where(eq(routePayoutAllocations.id, req.params.allocationId)).limit(1);
    if (!allocation?.razorpayTransferId) return res.status(400).json({ error: "Allocation cannot be reversed" });
    if (allocation.reversalId || allocation.status === "reversed") return res.json({ success: true, reversalId: allocation.reversalId, idempotent: true });
    const [reserved] = await db.update(routePayoutAllocations).set({ status: "processing_reversal", updatedAt: new Date() })
      .where(and(eq(routePayoutAllocations.id, allocation.id), eq(routePayoutAllocations.status, "captured"))).returning();
    if (!reserved) return res.status(409).json({ error: "Allocation is already being refunded, reversed, or is ineligible" });
    try {
      const provider = await razorpay(`/transfers/${encodeURIComponent(allocation.razorpayTransferId)}/reversals`, { method: "POST", body: JSON.stringify({ amount: allocation.amount }), headers: { "X-Razorpay-Idempotency-Key": routeMoneyMovementKey("reversal", allocation.id) } });
      if (!provider.ok) {
        await db.update(routePayoutAllocations).set({ status: "captured", updatedAt: new Date() }).where(eq(routePayoutAllocations.id, allocation.id));
        return res.status(502).json({ error: "Razorpay reversal failed" });
      }
      const reversal: any = await provider.json();
      await db.update(routePayoutAllocations).set({ status: "reversed", reversalId: reversal.id || null, updatedAt: new Date() }).where(eq(routePayoutAllocations.id, allocation.id));
      await writeAudit(req, { action: "route_transfer_reversed", targetType: "route_allocation", targetId: allocation.id, diff: { amount: allocation.amount, reversalId: reversal.id || null } });
      return res.json({ success: true });
    } catch {
      await db.update(routePayoutAllocations).set({ status: "captured", updatedAt: new Date() }).where(eq(routePayoutAllocations.id, allocation.id));
      return res.status(503).json({ error: "Payout reversal unavailable" });
    }
  });
  app.post("/api/admin/payouts/refunds", async (req, res) => {
    if (!isSuperAdminRequest(req)) return res.status(403).json({ error: "Platform administrator required" });
    const paymentId = typeof req.body?.razorpayPaymentId === "string" ? req.body.razorpayPaymentId : "";
    const amount = req.body?.amount;
    if (!paymentId || !Number.isSafeInteger(amount) || amount <= 0) return res.status(400).json({ error: "Valid Razorpay payment id and paise amount are required" });
    try {
      const [payment] = await db.select().from(payments).where(eq(payments.razorpayPaymentId, paymentId)).limit(1);
      if (!payment?.razorpayOrderId) return res.status(404).json({ error: "Payment not found" });
      const [allocation] = await db.select().from(routePayoutAllocations).where(eq(routePayoutAllocations.razorpayOrderId, payment.razorpayOrderId)).limit(1);
      if (!allocation || !isFullRouteRefundAmount(amount, allocation.amount)) {
        return res.status(400).json({ error: "Only a full ticket refund is supported for Route payouts." });
      }
      if (allocation.refundId) return res.json({ success: true, refundId: allocation.refundId, idempotent: true });
      const [reserved] = await db.update(routePayoutAllocations).set({ status: "processing_refund", updatedAt: new Date() })
        .where(and(eq(routePayoutAllocations.id, allocation.id), eq(routePayoutAllocations.status, "captured"))).returning();
      if (!reserved) return res.status(409).json({ error: "Allocation is already being refunded, reversed, or is ineligible" });
      try {
        // Route reverses the linked-account transfer as part of this same
        // full-refund operation. Never declare an allocation refunded without
        // asking Razorpay to reverse its associated organizer transfer.
        const provider = await razorpay(`/payments/${encodeURIComponent(paymentId)}/refund`, {
          method: "POST",
          body: JSON.stringify({
            amount,
            reverse_all: true,
            notes: { allocationId: allocation.id, type: "event_ticket_full_refund" },
          }),
          headers: { "X-Razorpay-Idempotency-Key": routeMoneyMovementKey("refund", allocation.id) },
        });
        if (!provider.ok) {
          await db.update(routePayoutAllocations).set({ status: "captured", updatedAt: new Date() }).where(eq(routePayoutAllocations.id, allocation.id));
          return res.status(502).json({ error: "Razorpay refund failed" });
        }
        const refund: any = await provider.json();
        await db.update(routePayoutAllocations).set({ status: "refunded", refundId: refund.id || null, updatedAt: new Date() }).where(eq(routePayoutAllocations.id, allocation.id));
        await writeAudit(req, { action: "route_payment_refunded", targetType: "razorpay_payment", targetId: paymentId, diff: { amount, refundId: refund.id || null } });
        return res.json({ success: true, refundId: refund.id || null });
      } catch {
        await db.update(routePayoutAllocations).set({ status: "captured", updatedAt: new Date() }).where(eq(routePayoutAllocations.id, allocation.id));
        return res.status(503).json({ error: "Refund service unavailable" });
      }
    } catch { return res.status(503).json({ error: "Refund service unavailable" }); }
  });
  app.post("/api/webhooks/razorpay", async (req, res) => {
    const raw = req.rawBody;
    const signature = req.header("x-razorpay-signature");
    if (!Buffer.isBuffer(raw) || !verifyRazorpaySignature(raw, signature, process.env.RAZORPAY_WEBHOOK_SECRET)) return res.status(401).json({ error: "Invalid webhook signature" });
    const payload: any = req.body;
    const eventId = String(req.header("x-razorpay-event-id") || crypto.createHash("sha256").update(raw).digest("hex"));
    try {
      const [receipt] = await db.insert(razorpayWebhookReceipts).values({ eventId, eventType: String(payload?.event || "unknown"), payloadHash: crypto.createHash("sha256").update(raw).digest("hex") }).onConflictDoNothing().returning();
      let claimed = receipt;
      if (!claimed) {
        const [existing] = await db.select().from(razorpayWebhookReceipts).where(eq(razorpayWebhookReceipts.eventId, eventId)).limit(1);
        if (!existing || !canReclaimWebhookReceipt(existing.status, existing.processedAt)) return res.status(200).json({ received: true, duplicate: true });
        [claimed] = await db.update(razorpayWebhookReceipts)
          .set({ status: "received", processedAt: null, errorCode: null })
          .where(and(eq(razorpayWebhookReceipts.id, existing.id), eq(razorpayWebhookReceipts.status, existing.status))).returning();
        if (!claimed) return res.status(200).json({ received: true, duplicate: true });
      }
      if (payload?.event === "payment.captured") {
        // Payload only supplies lookup ids. recoverCapturedPayment independently
        // fetches order + payment and verifies every binding before issuing.
        const paymentId = String(payload?.payload?.payment?.entity?.id || "");
        const orderId = String(payload?.payload?.payment?.entity?.order_id || "");
        const recovered = paymentId && orderId && await recoverCapturedPayment(orderId, paymentId);
        await db.update(razorpayWebhookReceipts).set({ status: recovered ? "processed" : "recovery_failed", processedAt: new Date(), errorCode: recovered ? null : "provider_verification_failed" }).where(eq(razorpayWebhookReceipts.id, claimed.id));
      } else {
        await db.update(razorpayWebhookReceipts).set({ status: "ignored", processedAt: new Date() }).where(eq(razorpayWebhookReceipts.id, claimed.id));
      }
      return res.status(200).json({ received: true });
    } catch { return res.status(503).json({ error: "Webhook receipt unavailable" }); }
  });
}