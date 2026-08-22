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
  getCallerContext,
  getRequestUserId,
  isSuperAdminRequest,
  requirePermission,
} from "./rbac";
import {
  extractRouteOrderTransfers,
  localAllocationStatusForTransfer,
  routeRefundStatus,
  routeRefundAmountForAttempt,
  routeAccountReferenceId,
  routeSettlementStatus,
  routeTransferStatus,
  selectRouteTransfer,
  shouldUseAutomaticRouteReversal,
  type RouteTransfer,
} from "./razorpay-route-contract";
import {
  INDIA_STATES,
  RAZORPAY_BANK_ACCOUNT_TYPES,
  RAZORPAY_BUSINESS_TYPES,
  RAZORPAY_EVENT_BUSINESS_MODELS,
  RAZORPAY_EVENT_CATEGORIES,
  getIndiaCities,
  getRazorpaySubcategories,
  isIndiaCity,
  isIndiaState,
  isRazorpayBankAccountType,
  isRazorpayBusinessModel,
  isRazorpayBusinessType,
  isRazorpayCategory,
  isRazorpaySubcategory,
} from "@shared/razorpay-onboarding";

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

export function routeFailureReason(kind: "transfer" | "refund" | "reversal"): string {
  if (kind === "refund") return "Razorpay could not complete the customer refund.";
  if (kind === "reversal") return "Razorpay could not complete the Route transfer reversal.";
  return "Razorpay could not complete this Route transfer.";
}

function safeRouteResourceId(value: unknown, prefixes: string[]): string | null {
  const id = String(value || "");
  return prefixes.some((prefix) => new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(id)) ? id : null;
}

// Webhook receipts are used only for idempotency and operational auditing.
// Retain no raw provider body: Route account/product events can carry KYC
// review text and linked-account details which do not belong in our database.
export function routeWebhookReceiptPayload(eventType: string, payload: any) {
  const payment = payload?.payload?.payment?.entity;
  const transfer = payload?.payload?.transfer?.entity;
  const refund = payload?.payload?.refund?.entity;
  const reversal = payload?.payload?.reversal?.entity;
  const account = payload?.payload?.account?.entity;
  const product = payload?.payload?.product?.entity;
  return {
    event: eventType,
    resources: {
      accountId: safeRouteResourceId(account?.id || product?.account_id, ["acc"]),
      productId: safeRouteResourceId(product?.id, ["prod"]),
      paymentId: safeRouteResourceId(payment?.id, ["pay"]),
      orderId: safeRouteResourceId(payment?.order_id || transfer?.order_id || transfer?.source, ["order"]),
      transferId: safeRouteResourceId(transfer?.id, ["trf"]),
      refundId: safeRouteResourceId(refund?.id, ["rfnd"]),
      reversalId: safeRouteResourceId(reversal?.id, ["trf"]),
    },
  };
}

type RazorpayErrorResult = { ok: false; status: number; message: string | null };

export function razorpayRequestFailureMessage(status: number): string {
  if (status === 400) return "Razorpay rejected the submitted payout details. Review the fields and try again.";
  if (status === 401 || status === 403) return "Razorpay rejected this request. Check the payout integration credentials.";
  if (status === 409) return "Razorpay already has a matching payout account. Refresh the page and try again.";
  return "Razorpay could not process this request. Please try again.";
}

async function razorpayRequest(
  credentials: RazorpayCredentials,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: any } | RazorpayErrorResult> {
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
      const message = razorpayRequestFailureMessage(response.status);
      console.error(`[route-payouts] Razorpay ${init.method || "GET"} ${path} rejected (${response.status})`);
      return { ok: false, status: response.status, message };
    }
    return { ok: true, data: await response.json() };
  } catch (error) {
    console.error(`[route-payouts] Razorpay ${init.method || "GET"} ${path} failed`, error);
    return { ok: false, status: 502, message: "Could not reach Razorpay. Please try again." };
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
  const productReady = profile.productStatus === "active";
  const canAcceptPaidTickets = profile.status === "active" && productReady && !profile.deactivatedAt && !cooling;
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
        : !productReady
          ? (profile.productStatusReason || "Razorpay must activate the Route product configuration before paid registrations can begin.")
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
  const [updated] = await db.update(eventPaymentAllocations)
    .set({
      providerOrderId: orderId,
      status: "processing",
      providerTransferStatus: "created",
      updatedAt: new Date(),
    })
    .where(and(
      eq(eventPaymentAllocations.id, allocationId),
      or(isNull(eventPaymentAllocations.providerOrderId), eq(eventPaymentAllocations.providerOrderId, orderId)),
    ))
    .returning();
  if (updated) return updated;
  const [existing] = await db.select().from(eventPaymentAllocations)
    .where(eq(eventPaymentAllocations.id, allocationId)).limit(1);
  if (existing?.providerOrderId === orderId) return existing;
  if (existing?.providerOrderId) {
    throw new Error("This payout allocation is already bound to a different Razorpay order.");
  }
  throw new Error("Unable to bind the Razorpay order to its payout allocation.");
}

export async function attachCapturedRoutePayment(input: {
  allocationId: string;
  paymentId: string;
}) {
  await db.update(eventPaymentAllocations)
    .set({ paymentId: input.paymentId, updatedAt: new Date() })
    .where(eq(eventPaymentAllocations.id, input.allocationId));
}

export function onboardingPayloads(body: any, referenceId: string, update = false) {
  const profileInput = body?.profile || {};
  const registeredAddress = profileInput?.addresses?.registered || {};
  const legalInfoInput = body?.legal_info || {};
  const appsInput = body?.apps || {};
  const bankAccountInput = body?.bank_account || {};
  const legalBusinessName = String(body?.legal_business_name || "").trim();
  const customerFacingBusinessName = String(body?.customer_facing_business_name || legalBusinessName).trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const phone = String(body?.phone || "").replace(/\D/g, "");
  const businessType = String(body?.business_type || "").trim();
  const category = String(profileInput?.category || "").trim();
  const subcategory = String(profileInput?.subcategory || "").trim();
  const addressLine1 = String(registeredAddress?.street1 || "").trim();
  const addressLine2 = String(registeredAddress?.street2 || "").trim();
  const city = String(registeredAddress?.city || "").trim();
  const state = String(registeredAddress?.state || "").trim();
  const postalCode = String(registeredAddress?.postal_code || "").replace(/\D/g, "");
  const country = String(registeredAddress?.country || "IN").trim().toUpperCase();
  const businessModel = String(profileInput?.business_model || "").trim();
  const accountNumber = String(bankAccountInput?.account_number || "").replace(/\s/g, "");
  const confirmAccountNumber = String(bankAccountInput?.confirm_account_number || "").replace(/\s/g, "");
  const ifscCode = String(bankAccountInput?.ifsc_code || "").trim().toUpperCase();
  const beneficiaryName = String(bankAccountInput?.beneficiary_name || "").trim();
  const accountType = String(bankAccountInput?.account_type || "").trim().toLowerCase();
  if (
    legalBusinessName.length < 4 || !customerFacingBusinessName
    || !email.includes("@") || phone.length < 8 || phone.length > 15
    || !businessType || !category || !subcategory || !businessModel
  ) {
    throw new Error("A valid business name, email, phone, business type, category, subcategory, and business model are required.");
  }
  if (!isRazorpayBusinessType(businessType)) throw new Error("Select a supported Razorpay business type.");
  if (!isRazorpayCategory(category) || !isRazorpaySubcategory(category, subcategory)) {
    throw new Error("Select a supported Razorpay business category and subcategory.");
  }
  if (!isRazorpayBusinessModel(businessModel)) throw new Error("Select a supported business model.");
  if (!addressLine1 || !addressLine2 || !isIndiaState(state) || !isIndiaCity(state, city) || !/^\d{6}$/.test(postalCode) || country !== "IN") {
    throw new Error("A complete registered address and a six-digit postal code are required for Razorpay Route.");
  }
  if (!/^[A-Z0-9]{5,35}$/.test(accountNumber) || accountNumber !== confirmAccountNumber) {
    throw new Error("Enter a valid bank account number and matching confirmation.");
  }
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) throw new Error("Enter a valid IFSC code.");
  if (beneficiaryName.length < 2 || beneficiaryName.length > 120) throw new Error("Enter the bank beneficiary name.");
  if (!isRazorpayBankAccountType(accountType)) throw new Error("Select a supported bank account type.");
  const profile: Record<string, unknown> = {
    category,
    subcategory,
    addresses: {
      registered: {
        street1: addressLine1,
        street2: addressLine2,
        city,
        state,
        postal_code: postalCode,
        country,
      },
    },
  };
  profile.business_model = businessModel;
  const account: Record<string, unknown> = {
    phone: Number(phone),
    legal_business_name: legalBusinessName,
    customer_facing_business_name: customerFacingBusinessName,
    profile,
    // The Route API validates these fields when creating/updating a linked
    // account. They remain request-only: never persist, return, or log them.
    bank_account: {
      account_number: accountNumber,
      account_type: accountType,
      ifsc_code: ifscCode,
      beneficiary_name: beneficiaryName,
    },
  };
  const supportPhone = Number(phone.slice(-10));
  account.contact_info = {
    chargeback: { email, phone: supportPhone },
    refund: { email, phone: supportPhone },
    support: { email, phone: supportPhone },
  };
  if (!update) {
    account.type = "route";
    account.email = email;
    account.business_type = businessType;
    account.reference_id = referenceId.slice(0, 40);
  }
  // Tax identifiers are forwarded only to Razorpay. They are never persisted
  // or logged by this app.
  const legalInfo: Record<string, string> = {};
  if (legalInfoInput?.pan) legalInfo.pan = String(legalInfoInput.pan).trim().toUpperCase();
  if (legalInfoInput?.gst) legalInfo.gst = String(legalInfoInput.gst).trim().toUpperCase();
  if (Object.keys(legalInfo).length) account.legal_info = legalInfo;

  const websites = Array.isArray(appsInput?.websites)
    ? appsInput.websites.map((website: unknown) => String(website || "").trim()).filter(Boolean).slice(0, 10)
    : [];
  if (websites.length) account.apps = { websites };

  // Stakeholder data is derived from the documented linked-account data so
  // organizers are not asked for a second, custom contact profile.
  const stakeholder: Record<string, unknown> = {
    name: customerFacingBusinessName,
    email,
    percentage_ownership: 100,
    relationship: { director: true, executive: true },
    phone: { primary: phone.slice(-10) },
    addresses: {
      residential: {
        street: addressLine1,
        city,
        state,
        postal_code: postalCode,
        country,
      },
    },
  };
  if (legalInfo.pan) stakeholder.kyc = { pan: legalInfo.pan };
  return { account, stakeholder };
}

async function createOrUpdateRouteProfile(orgId: string, body: any) {
  const creds = credentials();
  if (!creds) throw new Error("Razorpay credentials are not configured.");
  const existing = await latestRouteProfile(orgId);
  const payloads = onboardingPayloads(body, routeAccountReferenceId(orgId), !!existing);
  const result = existing
    ? await razorpayRequest(creds, `/v2/accounts/${encodeURIComponent(existing.providerAccountId)}`, {
        method: "PATCH",
        body: JSON.stringify(payloads.account),
      })
    : await razorpayRequest(creds, "/v2/accounts", { method: "POST", body: JSON.stringify(payloads.account) });
  if (!result.ok) throw new Error(result.message || "Razorpay could not save the payout profile. Check the supplied business details and try again.");

  const account = result.data;
  const accountId = String(account.id || existing?.providerAccountId || "");
  if (!accountId) throw new Error("Razorpay did not return a linked-account reference.");
  const accountStatus = providerStatus(account.status);
  const [baseProfile] = existing
    ? await db.update(organizerPaymentProfiles)
        .set({
          displayName: String(body.customer_facing_business_name || body.legal_business_name || "").trim() || null,
          status: accountStatus,
          statusReason: "Linked account saved. Completing Razorpay Route setup.",
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
          displayName: String(body.customer_facing_business_name || body.legal_business_name || "").trim() || null,
          status: accountStatus,
          statusReason: "Linked account saved. Completing Razorpay Route setup.",
          statusUpdatedAt: new Date(),
        })
        .returning();
  if (!baseProfile) throw new Error("Unable to save the Route onboarding record.");

  const stakeholderResult = baseProfile.providerStakeholderId
    ? await razorpayRequest(creds, `/v2/accounts/${encodeURIComponent(accountId)}/stakeholders/${encodeURIComponent(baseProfile.providerStakeholderId)}`, {
        method: "PATCH",
        body: JSON.stringify(payloads.stakeholder),
      })
    : await razorpayRequest(creds, `/v2/accounts/${encodeURIComponent(accountId)}/stakeholders`, {
        method: "POST",
        body: JSON.stringify(payloads.stakeholder),
      });
  if (!stakeholderResult.ok) {
    await db.update(organizerPaymentProfiles).set({
      status: "needs_clarification",
      statusReason: "Razorpay could not save the Route stakeholder details. Review the details and resubmit.",
      statusUpdatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(organizerPaymentProfiles.id, baseProfile.id));
    throw new Error("Razorpay could not save the Route stakeholder details.");
  }
  const stakeholderId = String(stakeholderResult.data?.id || baseProfile.providerStakeholderId || "");

  const productResult = baseProfile.providerProductId
    ? await razorpayRequest(creds, `/v2/accounts/${encodeURIComponent(accountId)}/products/${encodeURIComponent(baseProfile.providerProductId)}`)
    : await razorpayRequest(creds, `/v2/accounts/${encodeURIComponent(accountId)}/products`, {
        method: "POST",
        body: JSON.stringify({ product_name: "route" }),
      });
  if (!productResult.ok || !productResult.data?.id) {
    await db.update(organizerPaymentProfiles).set({
      providerStakeholderId: stakeholderId || null,
      productStatus: "pending",
      productStatusReason: "Razorpay could not create or fetch the Route product configuration.",
      status: "pending",
      statusReason: "Route product setup needs attention before paid registrations can begin.",
      statusUpdatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(organizerPaymentProfiles.id, baseProfile.id));
    throw new Error("Razorpay could not configure the Route product.");
  }
  const productStatus = providerStatus(productResult.data.status);
  // Product activation is necessary but does not promote an account that is
  // still under review or needs clarification.
  const status = accountStatus;
  const [profile] = await db.update(organizerPaymentProfiles).set({
    providerStakeholderId: stakeholderId || null,
    providerProductId: String(productResult.data.id),
    productStatus,
    productStatusReason: productStatus === "active" ? null : String(
      "Razorpay is reviewing the Route product configuration. Check back later or contact support if this continues.",
    ),
    status,
    statusReason: status === "active" ? null : "Your Route setup has been submitted to Razorpay.",
    statusUpdatedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(organizerPaymentProfiles.id, baseProfile.id)).returning();
  return profile || baseProfile;
}

async function assertEventOrganization(orgId: string) {
  const [org] = await db.select({ accountType: organizations.accountType })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return org?.accountType === "event";
}

async function assertTicketPaymentsRole(req: Request, res: Response): Promise<boolean> {
  const caller = await getCallerContext(req);
  if (!caller) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  if (!["admin", "organizer", "super_admin"].includes(caller.roleKey)) {
    res.status(403).json({ error: "Ticket Payments is restricted to event organizers and admins." });
    return false;
  }
  return true;
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
      transferStatus: row.allocation.providerTransferStatus || row.allocation.status,
      settlementStatus: row.allocation.settlementStatus || (row.allocation.settledAt ? "settled" : "pending"),
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
    acc.transferred += ["processed", "completed"].includes(item.transferStatus) ? item.netAmount : 0;
    acc.settled += item.settlementStatus === "settled" ? item.netAmount : 0;
    acc.refunded += item.refundedAmount;
    acc.actionRequired += ["failed", "pending", "processing", "created"].includes(item.transferStatus)
      || ["pending", "on_hold"].includes(item.settlementStatus) ? 1 : 0;
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
  let productStatus = profile.productStatus;
  let productStatusReason = profile.productStatusReason;
  if (profile.providerProductId) {
    const product = await razorpayRequest(
      creds,
      `/v2/accounts/${encodeURIComponent(profile.providerAccountId)}/products/${encodeURIComponent(profile.providerProductId)}`,
    );
    if (product.ok) {
      productStatus = providerStatus(product.data?.status);
      productStatusReason = productStatus === "active"
        ? null
        : "Razorpay is reviewing the Route product configuration. Check back later or contact support if this continues.";
    }
  }
  const accountStatus = providerStatus(response.data.status);
  const status = accountStatus === "suspended"
    ? "suspended"
    : accountStatus;
  const reason = status === "needs_clarification"
    ? "Razorpay needs more information before activating this payout account. Review the submitted details and resubmit."
    : status === "active"
      ? null
      : "Razorpay is reviewing this payout account. Paid registrations remain disabled until activation.";
  const [updated] = await db.update(organizerPaymentProfiles)
    .set({
      status,
      statusReason: reason,
      productStatus,
      productStatusReason,
      statusUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(organizerPaymentProfiles.id, profile.id))
    .returning();
  return updated || profile;
}

function transferFailureReason(transfer: RouteTransfer): string | null {
  return transfer.error || transfer.error_description ? routeFailureReason("transfer") : null;
}

async function applyRouteTransferSnapshot(
  allocationId: string,
  transfer: RouteTransfer,
) {
  const providerTransferStatus = routeTransferStatus(transfer.status);
  const update: Record<string, unknown> = {
    providerTransferStatus,
    status: localAllocationStatusForTransfer(providerTransferStatus),
    updatedAt: new Date(),
  };
  if (transfer.id) update.providerTransferId = String(transfer.id);
  // A transfer response can arrive after settlement/reversal webhooks. Null
  // means "not available in this response", not "erase the known state".
  if (transfer.settlement_status != null) {
    const settlementStatus = routeSettlementStatus(transfer.settlement_status);
    update.settlementStatus = settlementStatus;
    if (settlementStatus === "settled") update.settledAt = new Date();
  }
  if (transfer.amount_reversed != null) {
    update.amountReversed = Math.max(0, Math.floor(Number(transfer.amount_reversed)));
  }
  if (transfer.recipient_settlement_id != null) {
    update.providerSettlementId = String(transfer.recipient_settlement_id);
  }
  if (providerTransferStatus === "failed") {
    update.failureReason = transferFailureReason(transfer) || "Razorpay transfer failed";
  }
  if (providerTransferStatus === "processed") update.transferredAt = new Date();
  await db.update(eventPaymentAllocations)
    .set(update as any)
    .where(eq(eventPaymentAllocations.id, allocationId));
}

async function fetchRouteOrderTransfers(
  orderId: string,
  creds: RazorpayCredentials,
): Promise<RouteTransfer[]> {
  const response = await razorpayRequest(
    creds,
    `/v1/orders/${encodeURIComponent(orderId)}/?expand[]=transfers&status=processing`,
  );
  return response.ok ? extractRouteOrderTransfers(response.data) : [];
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
      inArray(eventPaymentAllocations.status, ["pending", "processing", "completed", "failed", "partially_reversed", "settled"]),
    ))
    .orderBy(desc(eventPaymentAllocations.createdAt))
    .limit(100);
  let updated = 0;
  for (const allocation of allocations) {
    if (!allocation.providerOrderId) continue;
    const transfers = await fetchRouteOrderTransfers(allocation.providerOrderId, creds);
    const profile = profiles.find((candidate) => candidate.id === allocation.profileId);
    const transfer = selectRouteTransfer(transfers, allocation.id, profile?.providerAccountId);
    if (!transfer) continue;
    await applyRouteTransferSnapshot(allocation.id, transfer);
    updated += 1;
  }
  return { checked: allocations.length, updated };
}

async function processWebhook(eventType: string, payload: any) {
  const transfer = payload?.payload?.transfer?.entity || payload?.transfer?.entity || payload?.transfer;
  const settlement = payload?.payload?.settlement?.entity || payload?.settlement?.entity || payload?.settlement;
  const account = payload?.payload?.account?.entity || payload?.account?.entity || payload?.account;
  const product = payload?.payload?.product?.entity || payload?.product?.entity || payload?.product;
  const refund = payload?.payload?.refund?.entity || payload?.refund?.entity || payload?.refund;
  const reversal = payload?.payload?.reversal?.entity || payload?.reversal?.entity || payload?.reversal;
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

  if (eventType.startsWith("product.route.")) {
    const accountId = account?.id || product?.account_id || product?.accountId;
    if (!accountId) return "product event recorded without account reference";
    const productStatus = providerStatus(eventType.endsWith("activated") ? "active" : product?.status || eventType.replace("product.route.", ""));
    const status = productStatus === "active" ? "active" : productStatus;
    const reason = productStatus === "active"
      ? null
      : eventType.endsWith("needs_clarification")
        ? "Razorpay needs more information before activating this Route product. Review the submitted details and resubmit."
        : "Razorpay is reviewing the Route product configuration. Paid registrations remain disabled until activation.";
    const [currentProfile] = await db.select().from(organizerPaymentProfiles)
      .where(and(
        eq(organizerPaymentProfiles.provider, PROVIDER),
        eq(organizerPaymentProfiles.providerAccountId, String(accountId)),
      )).limit(1);
    if (!currentProfile) return "product event recorded without local profile";
    // Product activation is asynchronous. Re-read the linked account on the
    // same signed webhook so readiness reflects both current provider states;
    // never infer an account activation from the product event alone.
    let accountStatus = currentProfile.status;
    const creds = credentials();
    if (creds) {
      const accountResponse = await razorpayRequest(
        creds,
        `/v2/accounts/${encodeURIComponent(String(accountId))}`,
      );
      if (accountResponse.ok) accountStatus = providerStatus(accountResponse.data?.status);
    }
    await db.update(organizerPaymentProfiles)
      .set({
        // Product state and account state are persisted independently. The
        // readiness check requires both to be active.
        status: accountStatus,
        statusReason: reason,
        providerProductId: product?.id ? String(product.id) : undefined,
        productStatus,
        productStatusReason: reason,
        statusUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(organizerPaymentProfiles.provider, PROVIDER), eq(organizerPaymentProfiles.providerAccountId, String(accountId))));
    return "profile updated";
  }

  if (eventType.startsWith("transfer.") && transfer?.id) {
    const transferStatus = transfer.status
      || (eventType === "transfer.processed" ? "processed"
        : eventType === "transfer.failed" ? "failed"
        : eventType === "transfer.reversed" ? "reversed"
        : eventType === "transfer.partially_reversed" ? "partially_reversed"
        : "pending");
    const conditions = [
      eq(eventPaymentAllocations.providerTransferId, String(transfer.id)),
      (transfer.order_id || transfer.source) ? eq(eventPaymentAllocations.providerOrderId, String(transfer.order_id || transfer.source)) : undefined,
      transfer.notes?.allocationId ? eq(eventPaymentAllocations.id, String(transfer.notes.allocationId)) : undefined,
    ].filter(Boolean) as any[];
    if (!conditions.length) return "transfer event recorded without allocation reference";
    const matches = await db.select({ id: eventPaymentAllocations.id })
      .from(eventPaymentAllocations)
      .where(or(...conditions));
    await Promise.all(matches.map(({ id }) => applyRouteTransferSnapshot(id, { ...transfer, status: transferStatus })));
    return "transfer updated";
  }

  if (eventType === "settlement.processed" && settlement) {
    const transferId = settlement.transfer_id || transfer?.id;
    if (transferId || settlement.id) {
      await db.update(eventPaymentAllocations)
        .set({
          settlementStatus: "settled",
          providerSettlementId: settlement.id ? String(settlement.id) : null,
          settlementUtr: settlement.utr ? String(settlement.utr) : null,
          settledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(transferId
          ? eq(eventPaymentAllocations.providerTransferId, String(transferId))
          : eq(eventPaymentAllocations.providerSettlementId, String(settlement.id)));
      return "settlement updated";
    }
  }

  if (eventType.startsWith("refund.") && refund?.id) {
    const refundWhere = refund.notes?.refundId
      ? eq(paymentRefunds.id, String(refund.notes.refundId))
      : eq(paymentRefunds.providerRefundId, String(refund.id));
    await db.update(paymentRefunds)
      .set({
        status: routeRefundStatus(refund.status || (eventType === "refund.failed" ? "failed" : "processing")),
        providerRefundId: String(refund.id),
        providerRefundStatus: String(refund.status || ""),
        refundedAt: routeRefundStatus(refund.status || (eventType === "refund.failed" ? "failed" : "processing")) === "succeeded" ? new Date() : null,
        failureReason: eventType === "refund.failed" ? routeFailureReason("refund") : null,
        updatedAt: new Date(),
      })
      .where(refundWhere);
    return "refund updated";
  }
  if (eventType.includes("reversal") && reversal?.id) {
    const reversalWhere = reversal.notes?.refundId
      ? eq(paymentRefunds.id, String(reversal.notes.refundId))
      : eq(paymentRefunds.providerReversalId, String(reversal.id));
    await db.update(paymentRefunds).set({
      providerReversalId: String(reversal.id),
      providerReversalStatus: String(reversal.status || eventType),
      failureReason: String(reversal.status || "").toLowerCase() === "failed"
        ? routeFailureReason("reversal")
        : null,
      updatedAt: new Date(),
    }).where(reversalWhere);
    return "reversal updated";
  }
  return "recorded";
}

async function resolveRouteTransfer(
  allocation: typeof eventPaymentAllocations.$inferSelect,
  creds: RazorpayCredentials,
) {
  const [profile] = await db.select().from(organizerPaymentProfiles)
    .where(eq(organizerPaymentProfiles.id, allocation.profileId)).limit(1);
  if (!profile) throw new Error("This payout no longer has a Route organizer profile.");
  if (!allocation.providerOrderId) throw new Error("This payment has no Route order to reverse.");
  const transfers = await fetchRouteOrderTransfers(allocation.providerOrderId, creds);
  const transfer = selectRouteTransfer(transfers, allocation.id, profile.providerAccountId);
  if (!transfer?.id) throw new Error("Razorpay has not created a Route transfer for this payment yet.");
  await applyRouteTransferSnapshot(allocation.id, transfer);
  return { id: String(transfer.id), transferCount: transfers.length };
}

export function registerRoutePayoutRoutes(app: Express) {
  app.get("/api/dashboard/payouts/onboarding-options", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    if (!(await assertTicketPaymentsRole(req, res))) return;
    const state = String(req.query.state || "").trim().toUpperCase();
    res.json({
      businessTypes: RAZORPAY_BUSINESS_TYPES,
      categories: RAZORPAY_EVENT_CATEGORIES.map(({ value, label }) => ({ value, label })),
      subcategories: getRazorpaySubcategories(String(req.query.category || "events_and_entertainment")),
      businessModels: RAZORPAY_EVENT_BUSINESS_MODELS,
      bankAccountTypes: RAZORPAY_BANK_ACCOUNT_TYPES,
      states: INDIA_STATES,
      cities: state && isIndiaState(state) ? getIndiaCities(state) : [],
    });
  });

  app.get("/api/dashboard/payouts/:orgId/profile", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    const orgId = String(req.params.orgId || "");
    if (!(await assertTicketPaymentsRole(req, res))) return;
    if (!(await assertOrgOwnership(req, res, orgId))) return;
    if (!(await assertEventOrganization(orgId))) return res.status(400).json({ error: "Payouts are available for event accounts only." });
    res.json({ profile: await getRoutePayoutReadiness(orgId) });
  });

  app.post("/api/dashboard/payouts/:orgId/profile", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    try {
      const orgId = String(req.params.orgId || "");
      if (!(await assertTicketPaymentsRole(req, res))) return;
      if (!(await assertOrgOwnership(req, res, orgId))) return;
      if (!(await assertEventOrganization(orgId))) return res.status(400).json({ error: "Payouts are available for event accounts only." });
      const profile = await createOrUpdateRouteProfile(orgId, req.body || {});
      res.json({ profile: routeProfileShape(profile) });
    } catch (error: any) {
      const message = String(error?.message || "Unable to save the payout profile.");
      res.status(/(required|valid|matching|select|complete|beneficiary)/i.test(message) ? 400 : 502).json({ error: message });
    }
  });

  app.get("/api/dashboard/payouts/:orgId/history", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    const orgId = String(req.params.orgId || "");
    if (!(await assertTicketPaymentsRole(req, res))) return;
    if (!(await assertOrgOwnership(req, res, orgId))) return;
    if (!(await assertEventOrganization(orgId))) return res.status(400).json({ error: "Payouts are available for event accounts only." });
    res.json(await payoutHistory(orgId));
  });

  app.post("/api/dashboard/payouts/:orgId/reconcile", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    try {
      const orgId = String(req.params.orgId || "");
      if (!(await assertTicketPaymentsRole(req, res))) return;
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
       status: row.allocation.providerTransferStatus || row.allocation.status,
       settlementStatus: row.allocation.settlementStatus,
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
        if (existing) {
          const committedBeforeThisRefund = refunds
            .filter((refund) => refund.id !== existing.id && ["pending", "processing", "succeeded"].includes(refund.status))
            .reduce((sum, refund) => sum + refund.amount, 0);
          return {
            refund: existing,
            allocation,
            duplicate: true,
            remainingAllocationAmount: allocation.netAmount - committedBeforeThisRefund,
          };
        }
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
        return {
          refund,
          allocation,
          duplicate: false,
          remainingAllocationAmount: allocation.netAmount - alreadyCommitted,
        };
      });
      // A completed saga is idempotent. A partially completed one deliberately
      // resumes below so a successful customer refund cannot strand funds with
      // the organizer if the reversal had a transient failure.
       if (created.duplicate && (
         created.refund.providerReversalId
         || created.refund.providerReversalStatus === "automatic"
       )) {
        return res.json({ refund: created.refund, idempotent: true });
      }
      if (created.duplicate && created.refund.status === "failed" && !created.refund.providerRefundId) {
        return res.status(409).json({ error: created.refund.failureReason || "This refund was rejected and cannot be retried with the same key." });
      }
      const refundAmount = routeRefundAmountForAttempt({
        requestedAmount: amount,
        persistedAmount: created.refund.amount,
        isRetry: created.duplicate,
      });
      const [payment] = await db.select().from(payments).where(eq(payments.id, created.allocation.paymentId!)).limit(1);
      if (!payment?.razorpayPaymentId) throw new Error("The captured payment cannot be refunded through Razorpay.");
      const creds = credentials();
      if (!creds) throw new Error("Razorpay credentials are not configured.");
       let transferDetails: { id: string; transferCount: number } | null = null;
        const fullRemainingRefund = refundAmount >= created.remainingAllocationAmount;
       if (!fullRemainingRefund) {
         try {
           transferDetails = await resolveRouteTransfer(created.allocation, creds);
         } catch (error) {
           return res.status(202).json({
             refund: created.refund,
             pending: true,
             message: error instanceof Error ? error.message : "Awaiting the Route transfer before the refund can be reversed.",
           });
         }
       }
       const automaticReversal = shouldUseAutomaticRouteReversal({
          refundAmount,
         remainingAllocationAmount: created.remainingAllocationAmount,
         transferCount: transferDetails?.transferCount || 2,
       });
      let refundId = created.refund.providerRefundId;
       let providerRefundStatus = created.refund.providerRefundStatus || "processing";
      if (!refundId) {
        const result = await razorpayRequest(creds, `/v1/payments/${encodeURIComponent(payment.razorpayPaymentId)}/refund`, {
          method: "POST",
          headers: { "X-Razorpay-Idempotency-Key": created.refund.idempotencyKey || created.refund.id },
          body: JSON.stringify({
            amount: refundAmount,
            // Route can atomically reverse every transfer for a complete
            // refund, and a partial refund with exactly one recipient. Multi-
            // transfer partial refunds are reversed explicitly below.
            reverse_all: automaticReversal,
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
            providerRefundStatus: "failed",
            failureReason: "Razorpay rejected the customer refund.",
            updatedAt: new Date(),
          }).where(eq(paymentRefunds.id, created.refund.id));
          return res.status(502).json({ error: "Razorpay could not start this customer refund." });
        }
        providerRefundStatus = String(result.data?.status || "processing");
        await db.update(paymentRefunds).set({
          status: routeRefundStatus(providerRefundStatus),
          providerRefundId: result.data.id ? String(result.data.id) : null,
          providerRefundStatus,
          updatedAt: new Date(),
        }).where(eq(paymentRefunds.id, created.refund.id));
        refundId = result.data.id ? String(result.data.id) : null;
      }
       if (automaticReversal) {
         const [updated] = await db.update(paymentRefunds).set({
           status: routeRefundStatus(providerRefundStatus),
           providerRefundId: refundId,
           providerReversalStatus: "automatic",
           refundedAt: routeRefundStatus(providerRefundStatus) === "succeeded" ? new Date() : null,
           updatedAt: new Date(),
         }).where(eq(paymentRefunds.id, created.refund.id)).returning();
         return res.json({ refund: updated, automaticReversal: true });
       }
      let reversal: { ok: true; data: any } | { ok: false; status: number };
      try {
         const routeTransfer = transferDetails || await resolveRouteTransfer(created.allocation, creds);
         reversal = await razorpayRequest(creds, `/v1/transfers/${encodeURIComponent(routeTransfer.id)}/reversals`, {
          method: "POST",
          headers: { "X-Razorpay-Idempotency-Key": `reverse:${created.refund.idempotencyKey || created.refund.id}` },
          body: JSON.stringify({ amount: refundAmount, notes: { allocationId, refundId: created.refund.id, reason } }),
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
           // The customer refund may already be successful. Keep this saga
           // resumable so an operator can retry only the Route reversal.
           status: "processing",
           providerReversalStatus: "failed",
          failureReason: "The customer refund succeeded but Razorpay rejected its Route transfer reversal.",
          updatedAt: new Date(),
        }).where(eq(paymentRefunds.id, created.refund.id));
         return res.status(202).json({ error: "Customer refund completed, but the organizer reversal needs attention.", pending: true });
      }
      const [updated] = await db.update(paymentRefunds).set({
         status: routeRefundStatus(providerRefundStatus),
        providerRefundId: refundId,
        providerReversalId: reversal.data.id ? String(reversal.data.id) : null,
         providerReversalStatus: String(reversal.data?.status || "processing"),
         refundedAt: routeRefundStatus(providerRefundStatus) === "succeeded" ? new Date() : null,
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
      payload: routeWebhookReceiptPayload(eventType, payload),
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