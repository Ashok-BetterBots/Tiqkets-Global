import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "./db";
import {
  eventPaymentAllocations,
  eventRegistrations,
  events,
  organizerPaymentProfiles,
  organizations,
  payments,
  paymentRefunds,
  paymentWebhookReceipts,
} from "@shared/schema";
import {
  assertOrgOwnership,
  getRequestUserId,
  isSuperAdminRequest,
  requirePermission,
} from "./rbac";

const PROVIDER = "razorpay";
const ROUTE_COOLING_MS = 24 * 60 * 60 * 1000;

type RazorpayCredentials = { keyId: string; keySecret: string };

function credentials(): RazorpayCredentials | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  return keyId && keySecret ? { keyId, keySecret } : null;
}

function providerStatus(value: unknown): string {
  const status = String(value || "").toLowerCase();
  if (["activated", "active"].includes(status)) return "active";
  if (["needs_clarification", "needs clarification"].includes(status)) return "needs_clarification";
  if (["suspended", "disabled", "rejected"].includes(status)) return status;
  if (["under_review", "under review", "created", "pending"].includes(status)) return "under_review";
  return "pending";
}

async function razorpayRequest(
  credentials: RazorpayCredentials,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: any } | { ok: false; status: number }> {
  const auth = Buffer.from(`${credentials.keyId}:${credentials.keySecret}`).toString("base64");
  try {
    const response = await fetch(`https://api.razorpay.com${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${auth}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      console.error(`[route-payouts] Razorpay ${init.method || "GET"} ${path} rejected (${response.status})`);
      return { ok: false, status: response.status };
    }
    return { ok: true, data: await response.json() };
  } catch (error) {
    console.error(`[route-payouts] Razorpay ${init.method || "GET"} ${path} failed`, error);
    return { ok: false, status: 502 };
  }
}

function routeProfileShape(profile: typeof organizerPaymentProfiles.$inferSelect | undefined) {
  if (!profile) {
    return {
      configured: false,
      status: "not_started",
      canAcceptPaidTickets: false,
      coolingEndsAt: null,
      actionRequired: "Set up a Razorpay Route payout account before accepting paid registrations.",
    };
  }
  const coolingEndsAt = new Date(profile.createdAt.getTime() + ROUTE_COOLING_MS);
  const cooling = profile.status === "active" && coolingEndsAt.getTime() > Date.now();
  const canAcceptPaidTickets = profile.status === "active" && !profile.deactivatedAt && !cooling;
  return {
    configured: true,
    id: profile.id,
    displayName: profile.displayName,
    accountReference: profile.providerAccountId.length > 8
      ? `••••${profile.providerAccountId.slice(-8)}`
      : profile.providerAccountId,
    status: profile.status,
    statusReason: profile.statusReason,
    canAcceptPaidTickets,
    coolingEndsAt: coolingEndsAt.toISOString(),
    actionRequired: canAcceptPaidTickets
      ? null
      : profile.status === "needs_clarification"
        ? (profile.statusReason || "Razorpay needs more payout information.")
        : cooling
          ? "Razorpay's 24-hour cooling period is still in progress."
          : "Razorpay must activate this payout account before paid registrations can begin.",
  };
}

async function latestRouteProfile(organizationId: string) {
  const [profile] = await db
    .select()
    .from(organizerPaymentProfiles)
    .where(and(
      eq(organizerPaymentProfiles.organizationId, organizationId),
      eq(organizerPaymentProfiles.provider, PROVIDER),
      isNull(organizerPaymentProfiles.deactivatedAt),
    ))
    .orderBy(desc(organizerPaymentProfiles.createdAt))
    .limit(1);
  return profile;
}

export async function getRoutePayoutReadiness(organizationId: string) {
  return routeProfileShape(await latestRouteProfile(organizationId));
}

export async function getEligibleRouteProfile(organizationId: string) {
  const profile = await latestRouteProfile(organizationId);
  const readiness = routeProfileShape(profile);
  return { profile: readiness.canAcceptPaidTickets ? profile || null : null, readiness };
}

export async function createRouteAllocation(input: {
  registrationId: string;
  profileId: string;
  amount: number;
}) {
  const key = `route-order:${input.registrationId}:${input.profileId}`;
  const [created] = await db.insert(eventPaymentAllocations)
    .values({
      registrationId: input.registrationId,
      profileId: input.profileId,
      grossAmount: input.amount,
      platformFee: 0,
      netAmount: input.amount,
      currency: "INR",
      status: "pending",
      idempotencyKey: key,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [existing] = await db.select()
    .from(eventPaymentAllocations)
    .where(and(
      eq(eventPaymentAllocations.registrationId, input.registrationId),
      eq(eventPaymentAllocations.profileId, input.profileId),
    ))
    .limit(1);
  if (!existing) throw new Error("Unable to create a payout allocation");
  if (existing.grossAmount !== input.amount || existing.netAmount !== input.amount || existing.platformFee !== 0) {
    throw new Error("Existing payout allocation does not match the registration amount");
  }
  return existing;
}

export async function bindRouteOrder(allocationId: string, orderId: string) {
  await db.update(eventPaymentAllocations)
    .set({ providerOrderId: orderId, status: "processing", updatedAt: new Date() })
    .where(eq(eventPaymentAllocations.id, allocationId));
}

export async function attachCapturedRoutePayment(input: {
  allocationId: string;
  paymentId: string;
}) {
  await db.update(eventPaymentAllocations)
    .set({ paymentId: input.paymentId, updatedAt: new Date() })
    .where(eq(eventPaymentAllocations.id, input.allocationId));
}

function accountPayload(body: any, referenceId: string) {
  const legalBusinessName = String(body.legalBusinessName || "").trim();
  const customerFacingBusinessName = String(body.customerFacingBusinessName || legalBusinessName).trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").replace(/\D/g, "");
  const businessType = String(body.businessType || "").trim();
  const category = String(body.businessCategory || "").trim();
  const subcategory = String(body.businessSubcategory || "").trim();
  if (!legalBusinessName || !customerFacingBusinessName || !email || phone.length < 8 || !businessType || !category || !subcategory) {
    throw new Error("Business name, contact email, phone, business type, category, and subcategory are required.");
  }

  const profile: Record<string, unknown> = { category, subcategory };
  if (body.addressLine1 || body.city || body.state || body.postalCode) {
    profile.addresses = {
      registered: {
        street1: String(body.addressLine1 || "").trim(),
        street2: String(body.addressLine2 || "").trim(),
        city: String(body.city || "").trim(),
        state: String(body.state || "").trim(),
        postal_code: String(body.postalCode || "").trim(),
        country: String(body.country || "IN").trim().toUpperCase(),
      },
    };
  }
  const payload: Record<string, unknown> = {
    type: "route",
    email,
    phone,
    legal_business_name: legalBusinessName,
    customer_facing_business_name: customerFacingBusinessName,
    business_type: businessType,
    reference_id: referenceId.slice(0, 40),
    profile,
  };
  // PAN is transmitted to Razorpay only when supplied. It is never logged or
  // persisted in our database.
  if (body.pan) payload.legal_info = { pan: String(body.pan).trim().toUpperCase() };
  return payload;
}

async function createOrUpdateRouteProfile(orgId: string, body: any) {
  const creds = credentials();
  if (!creds) throw new Error("Razorpay credentials are not configured.");
  const existing = await latestRouteProfile(orgId);
  const payload = accountPayload(body, `org_${orgId.replace(/-/g, "").slice(0, 24)}`);
  const result = existing
    ? await razorpayRequest(creds, `/v2/accounts/${encodeURIComponent(existing.providerAccountId)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      })
    : await razorpayRequest(creds, "/v2/accounts", { method: "POST", body: JSON.stringify(payload) });
  if (!result.ok) throw new Error("Razorpay could not save the payout profile. Check the supplied business details and try again.");

  const account = result.data;
  const accountId = String(account.id || existing?.providerAccountId || "");
  if (!accountId) throw new Error("Razorpay did not return a linked-account reference.");
  const contactName = String(body.contactName || "").trim();
  if (contactName) {
    await razorpayRequest(creds, `/v2/accounts/${encodeURIComponent(accountId)}/stakeholders`, {
      method: "POST",
      body: JSON.stringify({
        name: contactName,
        email: String(body.email || "").trim().toLowerCase(),
        phone: String(body.phone || "").replace(/\D/g, ""),
        relationship: "owner",
        ...(body.stakeholderPan ? { kyc: { pan: String(body.stakeholderPan).trim().toUpperCase() } } : {}),
      }),
    });
  }
  await razorpayRequest(creds, `/v2/accounts/${encodeURIComponent(accountId)}/products`, {
    method: "POST",
    body: JSON.stringify({ product_name: "route" }),
  });

  const status = providerStatus(account.status);
  const statusReason = status === "active"
    ? null
    : "Your Route account has been submitted to Razorpay. Complete any clarification they request before accepting paid registrations.";
  const [profile] = existing
    ? await db.update(organizerPaymentProfiles)
        .set({
          displayName: String(body.customerFacingBusinessName || body.legalBusinessName || "").trim() || null,
          status,
          statusReason,
          statusUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(organizerPaymentProfiles.id, existing.id))
        .returning()
    : await db.insert(organizerPaymentProfiles)
        .values({
          organizationId: orgId,
          provider: PROVIDER,
          providerAccountId: accountId,
          displayName: String(body.customerFacingBusinessName || body.legalBusinessName || "").trim() || null,
          status,
          statusReason,
          statusUpdatedAt: new Date(),
        })
        .returning();
  return profile;
}

async function assertEventOrganization(orgId: string) {
  const [org] = await db.select({ accountType: organizations.accountType })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return org?.accountType === "event";
}

async function payoutHistory(orgId: string) {
  const rows = await db
    .select({
      allocation: eventPaymentAllocations,
      profile: organizerPaymentProfiles,
      registration: eventRegistrations,
      event: events,
      payment: payments,
    })
    .from(eventPaymentAllocations)
    .innerJoin(organizerPaymentProfiles, eq(eventPaymentAllocations.profileId, organizerPaymentProfiles.id))
    .innerJoin(eventRegistrations, eq(eventPaymentAllocations.registrationId, eventRegistrations.id))
    .innerJoin(events, eq(eventRegistrations.eventId, events.id))
    .leftJoin(payments, eq(eventPaymentAllocations.paymentId, payments.id))
    .where(eq(organizerPaymentProfiles.organizationId, orgId))
    .orderBy(desc(eventPaymentAllocations.createdAt));
  const allocationIds = rows.map((r) => r.allocation.id);
  const refunds = allocationIds.length
    ? await db.select().from(paymentRefunds).where(inArray(paymentRefunds.allocationId, allocationIds))
    : [];
  const refundsByAllocation = new Map<string, typeof refunds>();
  for (const refund of refunds) {
    const items = refundsByAllocation.get(refund.allocationId) || [];
    items.push(refund);
    refundsByAllocation.set(refund.allocationId, items);
  }
  const items = rows.map((row) => {
    const rowRefunds = refundsByAllocation.get(row.allocation.id) || [];
    const refundedAmount = rowRefunds
      .filter((refund) => ["processing", "succeeded"].includes(refund.status))
      .reduce((sum, refund) => sum + refund.amount, 0);
    return {
      id: row.allocation.id,
      eventName: row.event.name,
      bookingId: row.registration.bookingId,
      customerName: row.registration.customerName,
      grossAmount: row.allocation.grossAmount,
      netAmount: row.allocation.netAmount,
      refundedAmount,
      currency: row.allocation.currency,
      paymentStatus: row.payment?.status || "pending",
      transferStatus: row.allocation.status,
      settlementStatus: row.allocation.settledAt ? "settled" : "pending",
      providerTransferId: row.allocation.providerTransferId,
      settlementUtr: row.allocation.settlementUtr,
      createdAt: row.allocation.createdAt,
      transferredAt: row.allocation.transferredAt,
      settledAt: row.allocation.settledAt,
      failureReason: row.allocation.failureReason,
      refunds: rowRefunds.map((refund) => ({
        id: refund.id,
        amount: refund.amount,
        status: refund.status,
        reason: refund.reason,
        createdAt: refund.createdAt,
      })),
    };
  });
  const totals = items.reduce((acc, item) => {
    acc.gross += item.grossAmount;
    acc.transferred += item.transferStatus === "completed" || item.transferStatus === "settled" ? item.netAmount : 0;
    acc.settled += item.settlementStatus === "settled" ? item.netAmount : 0;
    acc.refunded += item.refundedAmount;
    acc.actionRequired += ["failed", "pending", "processing"].includes(item.transferStatus) || item.settlementStatus === "pending" ? 1 : 0;
    return acc;
  }, { gross: 0, transferred: 0, settled: 0, refunded: 0, actionRequired: 0 });
  return { items, totals };
}

async function refreshProfileFromProvider(profileId: string) {
  const creds = credentials();
  const [profile] = await db.select().from(organizerPaymentProfiles)
    .where(eq(organizerPaymentProfiles.id, profileId)).limit(1);
  if (!creds || !profile) return profile;
  const response = await razorpayRequest(creds, `/v2/accounts/${encodeURIComponent(profile.providerAccountId)}`);
  if (!response.ok) return profile;
  const status = providerStatus(response.data.status);
  const reason = status === "needs_clarification"
    ? String(response.data?.status_details?.description || response.data?.status_reason || "Razorpay needs more information.")
    : profile.statusReason;
  const [updated] = await db.update(organizerPaymentProfiles)
    .set({ status, statusReason: reason, statusUpdatedAt: new Date(), updatedAt: new Date() })
    .where(eq(organizerPaymentProfiles.id, profile.id))
    .returning();
  return updated || profile;
}

async function reconcileAllocations(orgId: string) {
  const creds = credentials();
  if (!creds) throw new Error("Razorpay credentials are not configured.");
  const profiles = await db.select().from(organizerPaymentProfiles)
    .where(and(eq(organizerPaymentProfiles.organizationId, orgId), eq(organizerPaymentProfiles.provider, PROVIDER)));
  await Promise.all(profiles.map((profile) => refreshProfileFromProvider(profile.id)));
  const profileIds = profiles.map((profile) => profile.id);
  if (!profileIds.length) return { checked: 0, updated: 0 };
  const allocations = await db.select().from(eventPaymentAllocations)
    .where(and(
      inArray(eventPaymentAllocations.profileId, profileIds),
      inArray(eventPaymentAllocations.status, ["pending", "processing", "failed"]),
    ))
    .orderBy(desc(eventPaymentAllocations.createdAt))
    .limit(100);
  let updated = 0;
  for (const allocation of allocations) {
    if (!allocation.providerOrderId) continue;
    const response = await razorpayRequest(creds, `/v1/orders/${encodeURIComponent(allocation.providerOrderId)}/transfers`);
    if (!response.ok) continue;
    const transfer = Array.isArray(response.data?.items) ? response.data.items[0] : null;
    if (!transfer) continue;
    await db.update(eventPaymentAllocations)
      .set({
        providerTransferId: transfer.id || allocation.providerTransferId,
        status: transfer.status === "processed" ? "completed" : transfer.status === "failed" ? "failed" : allocation.status,
        failureReason: transfer.status === "failed" ? String(transfer.error_description || "Razorpay transfer failed") : null,
        transferredAt: transfer.status === "processed" ? new Date() : allocation.transferredAt,
        updatedAt: new Date(),
      })
      .where(eq(eventPaymentAllocations.id, allocation.id));
    updated += 1;
  }
  return { checked: allocations.length, updated };
}

async function processWebhook(eventType: string, payload: any) {
  const transfer = payload?.payload?.transfer?.entity || payload?.transfer?.entity || payload?.transfer;
  const settlement = payload?.payload?.settlement?.entity || payload?.settlement?.entity || payload?.settlement;
  const account = payload?.payload?.account?.entity || payload?.account?.entity || payload?.account;
  const refund = payload?.payload?.refund?.entity || payload?.refund?.entity || payload?.refund;
  const payment = payload?.payload?.payment?.entity || payload?.payment?.entity || payload?.payment;

  if (eventType === "payment.captured" && payment?.id && payment?.order_id) {
    const { reconcileCapturedRouteEventPayment } = await import("./events-routes");
    const result = await reconcileCapturedRouteEventPayment({
      razorpayOrderId: String(payment.order_id),
      razorpayPaymentId: String(payment.id),
      amount: Number(payment.amount || 0),
    });
    return result.handled ? "captured payment reconciled" : result.reason;
  }

  if (eventType.startsWith("product.route.") && account?.id) {
    const status = providerStatus(eventType.endsWith("activated") ? "active" : account.status || eventType.replace("product.route.", ""));
    const reason = eventType.endsWith("needs_clarification")
      ? String(account?.status_details?.description || account?.status_reason || "Razorpay needs more information.")
      : null;
    await db.update(organizerPaymentProfiles)
      .set({ status, statusReason: reason, statusUpdatedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(organizerPaymentProfiles.provider, PROVIDER), eq(organizerPaymentProfiles.providerAccountId, String(account.id))));
    return "profile updated";
  }

  if (eventType.startsWith("transfer.") && transfer?.id) {
    const transferStatus = eventType === "transfer.processed" ? "completed"
      : eventType === "transfer.failed" ? "failed"
      : eventType === "transfer.reversed" ? "reversed"
      : "processing";
    const conditions = [
      eq(eventPaymentAllocations.providerTransferId, String(transfer.id)),
      transfer.order_id ? eq(eventPaymentAllocations.providerOrderId, String(transfer.order_id)) : undefined,
    ].filter(Boolean) as any[];
    await db.update(eventPaymentAllocations)
      .set({
        providerTransferId: String(transfer.id),
        status: transferStatus,
        failureReason: transferStatus === "failed" ? String(transfer.error_description || "Razorpay transfer failed") : null,
        transferredAt: transferStatus === "completed" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(or(...conditions));
    return "transfer updated";
  }

  if (eventType === "settlement.processed" && settlement) {
    const transferId = settlement.transfer_id || transfer?.id;
    if (transferId) {
      await db.update(eventPaymentAllocations)
        .set({
          status: "settled",
          providerSettlementId: settlement.id ? String(settlement.id) : null,
          settlementUtr: settlement.utr ? String(settlement.utr) : null,
          settledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(eventPaymentAllocations.providerTransferId, String(transferId)));
      return "settlement updated";
    }
  }

  if (eventType.startsWith("refund.") && refund?.id) {
    const refundWhere = refund.notes?.refundId
      ? eq(paymentRefunds.id, String(refund.notes.refundId))
      : eq(paymentRefunds.providerRefundId, String(refund.id));
    await db.update(paymentRefunds)
      .set({
        status: eventType === "refund.failed" ? "failed" : "succeeded",
        providerRefundId: String(refund.id),
        refundedAt: eventType === "refund.failed" ? null : new Date(),
        failureReason: eventType === "refund.failed" ? String(refund.error_description || "Razorpay refund failed") : null,
        updatedAt: new Date(),
      })
      .where(refundWhere);
    return "refund updated";
  }
  return "recorded";
}

async function resolveTransferId(allocation: typeof eventPaymentAllocations.$inferSelect, creds: RazorpayCredentials) {
  if (allocation.providerTransferId) return allocation.providerTransferId;
  if (!allocation.providerOrderId) throw new Error("This payment has no Route order to reverse.");
  const response = await razorpayRequest(creds, `/v1/orders/${encodeURIComponent(allocation.providerOrderId)}/transfers`);
  if (!response.ok) throw new Error("Razorpay could not find the Route transfer to reverse.");
  const transfer = Array.isArray(response.data?.items) ? response.data.items[0] : null;
  if (!transfer?.id) throw new Error("Razorpay has not created a Route transfer for this payment yet.");
  await db.update(eventPaymentAllocations)
    .set({ providerTransferId: String(transfer.id), updatedAt: new Date() })
    .where(eq(eventPaymentAllocations.id, allocation.id));
  return String(transfer.id);
}

export function registerRoutePayoutRoutes(app: Express) {
  app.get("/api/dashboard/payouts/:orgId/profile", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    const orgId = String(req.params.orgId || "");
    if (!(await assertOrgOwnership(req, res, orgId))) return;
    if (!(await assertEventOrganization(orgId))) return res.status(400).json({ error: "Payouts are available for event accounts only." });
    res.json({ profile: await getRoutePayoutReadiness(orgId) });
  });

  app.post("/api/dashboard/payouts/:orgId/profile", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    try {
      const orgId = String(req.params.orgId || "");
      if (!(await assertOrgOwnership(req, res, orgId))) return;
      if (!(await assertEventOrganization(orgId))) return res.status(400).json({ error: "Payouts are available for event accounts only." });
      const profile = await createOrUpdateRouteProfile(orgId, req.body || {});
      res.json({ profile: routeProfileShape(profile) });
    } catch (error: any) {
      res.status(error?.message?.includes("required") ? 400 : 502).json({ error: error?.message || "Unable to save the payout profile." });
    }
  });

  app.get("/api/dashboard/payouts/:orgId/history", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    const orgId = String(req.params.orgId || "");
    if (!(await assertOrgOwnership(req, res, orgId))) return;
    if (!(await assertEventOrganization(orgId))) return res.status(400).json({ error: "Payouts are available for event accounts only." });
    res.json(await payoutHistory(orgId));
  });

  app.post("/api/dashboard/payouts/:orgId/reconcile", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    try {
      const orgId = String(req.params.orgId || "");
      if (!(await assertOrgOwnership(req, res, orgId))) return;
      if (!(await assertEventOrganization(orgId))) return res.status(400).json({ error: "Payouts are available for event accounts only." });
      res.json(await reconcileAllocations(orgId));
    } catch (error: any) {
      res.status(502).json({ error: error?.message || "Unable to reconcile payout activity." });
    }
  });

  app.get("/api/super-admin/route-payouts", async (req: Request, res: Response) => {
    if (!isSuperAdminRequest(req)) return res.status(403).json({ error: "Super-admin access required." });
    const rows = await db.select({
      allocation: eventPaymentAllocations,
      profile: organizerPaymentProfiles,
      registration: eventRegistrations,
      event: events,
      organization: organizations,
    })
      .from(eventPaymentAllocations)
      .innerJoin(organizerPaymentProfiles, eq(eventPaymentAllocations.profileId, organizerPaymentProfiles.id))
      .innerJoin(eventRegistrations, eq(eventPaymentAllocations.registrationId, eventRegistrations.id))
      .innerJoin(events, eq(eventRegistrations.eventId, events.id))
      .innerJoin(organizations, eq(organizerPaymentProfiles.organizationId, organizations.id))
      .orderBy(desc(eventPaymentAllocations.createdAt))
      .limit(500);
    res.json({ payouts: rows.map((row) => ({
      id: row.allocation.id,
      organizationName: row.organization.name,
      eventName: row.event.name,
      bookingId: row.registration.bookingId,
      grossAmount: row.allocation.grossAmount,
      netAmount: row.allocation.netAmount,
      status: row.allocation.status,
      settlementUtr: row.allocation.settlementUtr,
      createdAt: row.allocation.createdAt,
      failureReason: row.allocation.failureReason,
    })) });
  });

  app.post("/api/super-admin/route-payouts/:allocationId/refund", async (req: Request, res: Response) => {
    if (!isSuperAdminRequest(req)) return res.status(403).json({ error: "Super-admin access required." });
    try {
      const allocationId = String(req.params.allocationId || "");
      const amount = Math.max(0, Math.floor(Number(req.body?.amount || 0)));
      const reason = String(req.body?.reason || "").trim().slice(0, 500);
      const idempotencyKey = String(req.body?.idempotencyKey || "").trim();
      if (!amount || !reason || idempotencyKey.length < 12) {
        return res.status(400).json({ error: "Amount, reason, and idempotency key are required." });
      }
      const created = await db.transaction(async (tx) => {
        const [allocation] = await tx.select().from(eventPaymentAllocations)
          .where(eq(eventPaymentAllocations.id, allocationId)).limit(1);
        if (!allocation?.paymentId) throw new Error("This payout has no captured payment to refund.");
        await tx.execute(sql`SELECT id FROM event_payment_allocations WHERE id = ${allocationId} FOR UPDATE`);
        const refunds = await tx.select().from(paymentRefunds).where(eq(paymentRefunds.allocationId, allocationId));
        const [existing] = refunds.filter((refund) => refund.idempotencyKey === idempotencyKey);
        if (existing) return { refund: existing, allocation, duplicate: true };
        const alreadyCommitted = refunds
          .filter((refund) => ["pending", "processing", "succeeded"].includes(refund.status))
          .reduce((sum, refund) => sum + refund.amount, 0);
        if (alreadyCommitted + amount > allocation.netAmount) throw new Error("Refund amount exceeds the remaining payout balance.");
        const [refund] = await tx.insert(paymentRefunds).values({
          allocationId,
          amount,
          currency: allocation.currency,
          status: "processing",
          idempotencyKey,
          reason,
          initiatedByUserId: null,
        }).returning();
        return { refund, allocation, duplicate: false };
      });
      // A completed saga is idempotent. A partially completed one deliberately
      // resumes below so a successful customer refund cannot strand funds with
      // the organizer if the reversal had a transient failure.
      if (created.duplicate && created.refund.providerReversalId) {
        return res.json({ refund: created.refund, idempotent: true });
      }
      if (created.duplicate && created.refund.status === "failed" && !created.refund.providerRefundId) {
        return res.status(409).json({ error: created.refund.failureReason || "This refund was rejected and cannot be retried with the same key." });
      }
      const [payment] = await db.select().from(payments).where(eq(payments.id, created.allocation.paymentId!)).limit(1);
      if (!payment?.razorpayPaymentId) throw new Error("The captured payment cannot be refunded through Razorpay.");
      const creds = credentials();
      if (!creds) throw new Error("Razorpay credentials are not configured.");
      let refundId = created.refund.providerRefundId;
      if (!refundId) {
        const result = await razorpayRequest(creds, `/v1/payments/${encodeURIComponent(payment.razorpayPaymentId)}/refund`, {
          method: "POST",
          headers: { "X-Razorpay-Idempotency-Key": created.refund.idempotencyKey || created.refund.id },
          body: JSON.stringify({
            amount,
            // Route reversals are created below against the linked transfer so
            // partial refunds reverse the matching partial payout too.
            reverse_all: false,
            notes: { allocationId, refundId: created.refund.id, reason },
          }),
        });
        if (!result.ok) {
          // Timeouts / gateway failures are indeterminate. Keep the durable
          // request processing so retrying cannot create a second refund.
          if (result.status >= 500) {
            return res.status(202).json({ refund: created.refund, pending: true });
          }
          await db.update(paymentRefunds).set({
            status: "failed",
            failureReason: "Razorpay rejected the customer refund.",
            updatedAt: new Date(),
          }).where(eq(paymentRefunds.id, created.refund.id));
          return res.status(502).json({ error: "Razorpay could not start this customer refund." });
        }
        await db.update(paymentRefunds).set({
          status: "processing",
          providerRefundId: result.data.id ? String(result.data.id) : null,
          updatedAt: new Date(),
        }).where(eq(paymentRefunds.id, created.refund.id));
        refundId = result.data.id ? String(result.data.id) : null;
      }
      let reversal: { ok: true; data: any } | { ok: false; status: number };
      try {
        const transferId = await resolveTransferId(created.allocation, creds);
        reversal = await razorpayRequest(creds, `/v1/transfers/${encodeURIComponent(transferId)}/reversals`, {
          method: "POST",
          headers: { "X-Razorpay-Idempotency-Key": `reverse:${created.refund.idempotencyKey || created.refund.id}` },
          body: JSON.stringify({ amount, notes: { allocationId, refundId: created.refund.id, reason } }),
        });
      } catch (error) {
        await db.update(paymentRefunds).set({
          failureReason: error instanceof Error ? error.message : "Could not prepare Route reversal.",
          updatedAt: new Date(),
        }).where(eq(paymentRefunds.id, created.refund.id));
        return res.status(202).json({ refund: created.refund, pending: true });
      }
      if (!reversal.ok) {
        if (reversal.status >= 500) return res.status(202).json({ refund: created.refund, pending: true });
        await db.update(paymentRefunds).set({
          status: "failed",
          failureReason: "The customer refund succeeded but Razorpay rejected its Route transfer reversal.",
          updatedAt: new Date(),
        }).where(eq(paymentRefunds.id, created.refund.id));
        return res.status(502).json({ error: "Customer refund completed, but the organizer reversal needs attention." });
      }
      const [updated] = await db.update(paymentRefunds).set({
        status: "succeeded",
        providerRefundId: refundId,
        providerReversalId: reversal.data.id ? String(reversal.data.id) : null,
        refundedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(paymentRefunds.id, created.refund.id)).returning();
      const allRefunds = await db.select().from(paymentRefunds).where(eq(paymentRefunds.allocationId, allocationId));
      const refunded = allRefunds.filter((row) => ["processing", "succeeded"].includes(row.status)).reduce((sum, row) => sum + row.amount, 0);
      if (refunded >= created.allocation.netAmount) {
        await db.update(eventPaymentAllocations).set({ status: "reversed", updatedAt: new Date() })
          .where(eq(eventPaymentAllocations.id, allocationId));
      }
      res.json({ refund: updated });
    } catch (error: any) {
      res.status(400).json({ error: error?.message || "Unable to issue the refund." });
    }
  });

  app.post("/api/webhooks/razorpay-route", async (req: Request, res: Response) => {
    const secret = process.env.RAZORPAY_ROUTE_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ error: "Route webhook secret is not configured." });
    const raw = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.from(JSON.stringify(req.body || {}));
    const supplied = String(req.header("x-razorpay-signature") || "");
    const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    const valid = supplied.length === expected.length
      && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
    if (!valid) return res.status(401).json({ error: "Invalid webhook signature." });
    let payload: any;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "Invalid webhook JSON." });
    }
    const eventType = String(payload.event || "unknown");
    const providerEventId = String(req.header("x-razorpay-event-id") || `${eventType}:${crypto.createHash("sha256").update(raw).digest("hex")}`);
    const [receipt] = await db.insert(paymentWebhookReceipts).values({
      provider: PROVIDER,
      providerEventId,
      eventType,
      payload,
      processingStatus: "processing",
    }).onConflictDoNothing().returning();
    let receiptToProcess = receipt;
    if (!receiptToProcess) {
      // A delivery that failed after being durably recorded must be retryable;
      // Razorpay's retries are our recovery mechanism for transient DB errors.
      const [retried] = await db.update(paymentWebhookReceipts)
        .set({ processingStatus: "processing", processingNote: null, processedAt: null })
        .where(and(
          eq(paymentWebhookReceipts.provider, PROVIDER),
          eq(paymentWebhookReceipts.providerEventId, providerEventId),
          or(
            inArray(paymentWebhookReceipts.processingStatus, ["pending", "error"]),
            and(
              eq(paymentWebhookReceipts.processingStatus, "processing"),
              lt(paymentWebhookReceipts.createdAt, new Date(Date.now() - 5 * 60_000)),
            ),
          ),
        ))
        .returning();
      if (!retried) return res.json({ received: true, duplicate: true });
      receiptToProcess = retried;
    }
    try {
      const note = await processWebhook(eventType, payload);
      await db.update(paymentWebhookReceipts).set({
        processingStatus: "processed",
        processingNote: note,
        processedAt: new Date(),
      }).where(eq(paymentWebhookReceipts.id, receiptToProcess.id));
      return res.json({ received: true });
    } catch (error) {
      console.error("[route-payouts] webhook processing failed", error);
      await db.update(paymentWebhookReceipts).set({
        processingStatus: "error",
        processingNote: "Processing failed; this event remains available for reconciliation.",
      }).where(eq(paymentWebhookReceipts.id, receiptToProcess.id));
      return res.status(500).json({ error: "Webhook processing failed." });
    }
  });
}