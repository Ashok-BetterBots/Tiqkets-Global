import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "./db";
import { events, eventRegistrations, organizerPayoutProfiles, payments, razorpayWebhookReceipts, routePayoutAllocations } from "@shared/schema";
import { assertOrgOwnership, getCallerContext, isSuperAdminRequest, requirePermission, writeAudit } from "./rbac";
import { buildLinkedAccountPayload, buildLinkedAccountUpdatePayload, buildRouteOnboardingPayloads, buildRouteProductRequestPayload, buildRouteProductUpdatePayload, buildStakeholderPayload, canReclaimWebhookReceipt, isFullRouteRefundAmount, isValidRazorpayProviderId, paymentRecoveryDisposition, redactRouteDiagnosticPayload, routeMoneyMovementKey, routeOrderIdempotencyKey, safePayoutProfile, validateAccountUpdateInput, validateLinkedAccountInput, validateOnboardingInput, validateSettlementInput, validateStakeholderInput, verifyRazorpaySignature } from "./razorpay-route-contract";
import { ACTIVE_ROUTE_ACCOUNT_STATUSES } from "@shared/razorpay-onboarding";

function credentials() {
  const keyId = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !secret) throw new Error("Razorpay platform credentials are not configured");
  return { keyId, auth: `Basic ${Buffer.from(`${keyId}:${secret}`).toString("base64")}` };
}
async function razorpay(path: string, init: RequestInit) {
  const { auth } = credentials();
  const versionedPath = path.startsWith("/v1/") || path.startsWith("/v2/") ? path : `/v1${path}`;
  return fetch(`https://api.razorpay.com${versionedPath}`, {
    ...init,
    headers: { Authorization: auth, "Content-Type": "application/json", ...(init.headers || {}) },
    signal: AbortSignal.timeout(10_000),
  });
}
export function razorpayApiUrl(path: string): string {
  return `https://api.razorpay.com${path.startsWith("/v1/") || path.startsWith("/v2/") ? path : `/v1${path}`}`;
}
function profileStatus(account: any): string {
  return String(account?.activation_status || account?.status || account?.account_status || "created").toLowerCase();
}
export function isRouteProfileActive(profile: { status: string; productStatus?: string | null } | undefined): boolean {
  // Linked Accounts remain "created" even after their Route product is active.
  // Product activation is the sale-readiness signal; suspended accounts are
  // deliberately excluded.
  return !!profile && ["created", "active", "activated"].includes(profile.status.toLowerCase()) &&
    (!("productStatus" in profile) || ACTIVE_ROUTE_ACCOUNT_STATUSES.has(String(profile.productStatus || "").toLowerCase()));
}

type RouteOnboardingStage = "linked_account" | "stakeholder" | "route_product" | "settlement" | "complete";

function nextRouteOnboardingStage(profile: {
  providerStakeholderId?: string | null;
  providerProductId?: string | null;
  status: string;
  productStatus?: string | null;
} | undefined): RouteOnboardingStage {
  if (!profile) return "linked_account";
  if (!profile.providerStakeholderId) return "stakeholder";
  if (!profile.providerProductId) return "route_product";
  return isRouteProfileActive(profile) ? "complete" : "settlement";
}

function payoutProfileView(profile: any | undefined) {
  const canAcceptPaidTickets = isRouteProfileActive(profile);
  const currentStage = nextRouteOnboardingStage(profile);
  const completed = new Set<RouteOnboardingStage>();
  if (profile) completed.add("linked_account");
  if (profile?.providerStakeholderId) completed.add("stakeholder");
  if (profile?.providerProductId) completed.add("route_product");
  if (canAcceptPaidTickets) completed.add("settlement");
  const stageLabels: Array<[Exclude<RouteOnboardingStage, "complete">, string]> = [
    ["linked_account", "Linked account"],
    ["stakeholder", "Account contact"],
    ["route_product", "Route product"],
    ["settlement", "Bank settlement"],
  ];
  return {
    ...(profile ? safePayoutProfile(profile) : {}),
    configured: !!profile,
    canAcceptPaidTickets,
    onboarding: {
      currentStage,
      steps: stageLabels.map(([id, label]) => ({
        id,
        label,
        status: completed.has(id) ? "complete" : currentStage === id ? "current" : "locked",
      })),
    },
    actionRequired: canAcceptPaidTickets
      ? null
      : currentStage === "linked_account"
        ? "Set up a Route payout account"
        : `Continue with ${stageLabels.find(([id]) => id === currentStage)?.[1] || "Route activation"}`,
  };
}

function safeProviderReason(value: unknown): string | null {
  const reason = typeof value === "string" ? value.trim().toUpperCase() : "";
  // Do not infer that a code-shaped provider string is safe: a bank account or
  // PAN can also be code-shaped. Only Razorpay's generic, documented API error
  // categories may cross the privacy boundary.
  return new Set([
    "BAD_REQUEST_ERROR",
    "AUTHENTICATION_ERROR",
    "GATEWAY_ERROR",
    "SERVER_ERROR",
    "INVALID_REQUEST_ERROR",
    "NOT_FOUND_ERROR",
    "RATE_LIMIT_ERROR",
  ]).has(reason) ? reason : null;
}

function safeProviderRequestId(value: string | null): string | null {
  const requestId = value?.trim() || "";
  return /^[A-Za-z0-9_.-]{1,128}$/.test(requestId) ? requestId : null;
}

function razorpayCredentialMode(): "test" | "live" | "unknown" {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  if (keyId.startsWith("rzp_test_")) return "test";
  if (keyId.startsWith("rzp_live_")) return "live";
  return "unknown";
}

function warnForTestModePan(value: Record<string, unknown>) {
  if (process.env.NODE_ENV === "production" || razorpayCredentialMode() !== "test") return;
  const legalInfo = value.legal_info as Record<string, string> | undefined;
  const pan = String(legalInfo?.pan || "").trim().toUpperCase();
  const gst = String(legalInfo?.gst || "").trim().toUpperCase();
  if (pan !== "AAACL1234C") {
    console.warn("[razorpay-route][TEST MODE PAN WARNING]", {
      mode: "test",
      message: "Test mode submissions should use Razorpay's documented dummy PAN.",
      panIsDummy: false,
    });
  }
  if (gst && gst !== "36AAECL6705C1ZS") {
    console.warn("[razorpay-route][TEST MODE GST WARNING]", {
      mode: "test",
      message: "Test mode submissions should use Razorpay's documented dummy GST.",
      gstIsDummy: false,
    });
  }
}

export type RazorpayFailure = {
  httpStatus: number;
  errorCode: string | null;
  requestId: string | null;
  field: string | null;
};

function safeProviderField(value: unknown): string | null {
  const field = typeof value === "string" ? value.trim() : "";
  return /^(?:street1|street2|city|state|postal_code|phone|email|contact_name|legal_business_name|business_type|pan|gst|ifsc_code|account_number|beneficiary_name|code)$/.test(field)
    ? field
    : null;
}

export async function razorpayFailure(response: globalThis.Response): Promise<RazorpayFailure> {
  const requestId = safeProviderRequestId(
    response.headers.get("x-razorpay-request-id") ||
    response.headers.get("x-request-id") ||
    response.headers.get("request-id"),
  );
  try {
    const body: any = await response.json();
    const error = body?.error && typeof body.error === "object" ? body.error : body;
    return { httpStatus: response.status, errorCode: safeProviderReason(error?.code), requestId, field: safeProviderField(error?.field) };
  } catch {
    return { httpStatus: response.status, errorCode: null, requestId, field: null };
  }
}

function productRequirementsReason(product: any): string | null {
  // Product requirements and status reasons are provider-controlled free text
  // rather than a stable public code contract. Never persist or return them.
  void product;
  return null;
}

export function payoutProviderMessage(stage: string, failure: Pick<RazorpayFailure, "errorCode" | "requestId">): string {
  const reasonCode = failure.errorCode;
  let message: string;
  if (reasonCode === "BAD_REQUEST_ERROR") {
    if (stage === "Razorpay onboarding") {
      message = "Razorpay could not accept the linked-account details. Check the legal business name, account contact, phone, business type, registered address, PAN, and GST if applicable, then try again.";
    } else if (stage === "Razorpay stakeholder setup") {
      message = "Razorpay could not accept the account contact details. Check the contact name, email, phone, and optional PAN, then try again.";
    } else if (stage === "Razorpay bank verification") {
      message = "Razorpay could not verify the bank details. Check the beneficiary name, account number, and IFSC, then try again.";
    } else {
      message = `${stage} was rejected by Razorpay. Check the submitted details and contact Razorpay support if it continues.`;
    }
  } else {
    message = `${stage} was rejected by Razorpay. Check the submitted details and contact Razorpay support if it continues.`;
  }
  const code = reasonCode ? ` Razorpay code: ${reasonCode}.` : "";
  const reference = failure.requestId ? ` Provider reference: ${failure.requestId}.` : "";
  return `${message}${code}${reference}`;
}

type RouteProviderFailure = RazorpayFailure & {
  stage: string;
  endpoint: string;
};

async function routeProviderFailure(input: {
  stage: string;
  endpoint: string;
  payload: unknown;
  response: globalThis.Response;
}): Promise<RouteProviderFailure> {
  const failure = await razorpayFailure(input.response);
  const diagnostic: RouteProviderFailure = { ...failure, stage: input.stage, endpoint: input.endpoint };
  console.error("[razorpay-route] onboarding request rejected", {
    stage: diagnostic.stage,
    endpoint: diagnostic.endpoint,
    httpStatus: diagnostic.httpStatus,
    errorCode: diagnostic.errorCode,
    requestId: diagnostic.requestId,
    field: diagnostic.field,
    payload: redactRouteDiagnosticPayload(input.payload),
  });
  return diagnostic;
}

function invalidRouteProviderResponse(stage: string, endpoint: string) {
  console.error("[razorpay-route] onboarding response did not include a valid provider id", { stage, endpoint });
}

export function savedRouteProfileIdError(profile: {
  razorpayAccountId: unknown;
  providerStakeholderId?: unknown;
  providerProductId?: unknown;
}): string | null {
  if (!isValidRazorpayProviderId(profile.razorpayAccountId, "acc_")) return "linked account";
  if (profile.providerStakeholderId != null && !isValidRazorpayProviderId(profile.providerStakeholderId)) return "stakeholder";
  if (profile.providerProductId != null && !isValidRazorpayProviderId(profile.providerProductId)) return "Route product";
  return null;
}

function routeAccountReferenceId(organizationId: string): string {
  // Stable per organizer, safe to retry, and generated on the server so a
  // browser cannot select another organizer's provider reference.
  return `tiqkets_${crypto.createHash("sha256").update(organizationId).digest("hex").slice(0, 24)}`;
}

/**
 * Hold a session-scoped database lock while an organizer's Route setup runs.
 * Unlike a transaction-scoped lock, this allows each safe progress write to
 * commit before the next provider request while still serializing requests
 * across application instances.
 */
async function withRouteOnboardingLock<T>(organizationId: string, work: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [organizationId]);
    return await work();
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(hashtext($1))", [organizationId]); } catch { /* connection teardown releases advisory locks */ }
    client.release();
  }
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
    return res.json({ profile: payoutProfileView(profile) });
  };
  const saveProfileLegacy = async (req: Request, res: Response) => {
    const organizationId = String(req.params.orgId || req.params.organizationId); if (!await assertPayoutOrganizer(req, res, organizationId)) return;
    const parsed = validateOnboardingInput(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    try {
      // Sensitive values in parsed.value are only serialized to Razorpay. Never
      // log this request, attach it to audit metadata, or persist it.
      // Serialise onboarding per organizer across server instances. Each
      // provider ID is durably saved before the next Route call, so a retry
      // resumes its linked account instead of producing another one.
      const outcome = await withRouteOnboardingLock(organizationId, async () => {
        const [existingProfile] = await db.select().from(organizerPayoutProfiles).where(eq(organizerPayoutProfiles.organizationId, organizationId)).limit(1);
        if (existingProfile) {
          const savedIdError = savedRouteProfileIdError(existingProfile);
          if (savedIdError) {
            invalidRouteProviderResponse(`saved ${savedIdError}`, "payout profile");
            return { error: "The saved Razorpay payout setup has an invalid provider reference. Contact support before retrying." };
          }
        }
        const routeReferenceId = routeAccountReferenceId(organizationId);
        const providerPayloads = buildRouteOnboardingPayloads(parsed.value);
        if (process.env.NODE_ENV !== "production") {
          warnForTestModePan(parsed.value);
        }
        let account: any;
        if (existingProfile) {
          // Once Razorpay has created a linked account, a broad PATCH is not a
          // valid retry. Accounts in "needs clarification" accept only the
          // provider-requested fields, which are not part of this generic
          // organizer form. Resume from the stored account instead.
          account = { id: existingProfile.razorpayAccountId, activation_status: existingProfile.status };
        } else {
          const accountPayload = providerPayloads.accountCreate;
          const accountRes = await razorpay("/v2/accounts", {
            method: "POST",
            body: JSON.stringify(accountPayload),
          });
          if (!accountRes.ok) {
            const failure = await routeProviderFailure({ stage: "Razorpay onboarding", endpoint: "/v2/accounts", payload: accountPayload, response: accountRes });
            return { error: payoutProviderMessage("Razorpay onboarding", failure), diagnostics: failure };
          }
          account = await accountRes.json();
        }
        if (!isValidRazorpayProviderId(account?.id, "acc_")) {
          invalidRouteProviderResponse("Razorpay onboarding", existingProfile ? "saved payout profile" : "/v2/accounts");
          return { error: "Razorpay returned an invalid linked-account response." };
        }
        const status = profileStatus(account);
        const b: any = parsed.value;
        let stakeholderId: string | null = existingProfile?.providerStakeholderId || null;
        let productId: string | null = existingProfile?.providerProductId || null;
        let productStatus = existingProfile?.productStatus || "pending";
        let productStatusReason: string | null = null;
        const baseValues = {
            organizationId, razorpayAccountId: account.id, routeReferenceId, status, accountType: String(b.accountType),
          businessName: String(b.businessName), contactName: String(b.contactName), email: String(b.email),
          phoneLast4: String(b.phone).slice(-4), lastReconciledAt: new Date(),
        };
        const saveProgress = async (reason: string | null) => {
          const values = {
            ...baseValues, statusReason: reason, providerStakeholderId: stakeholderId,
            providerProductId: productId, productStatus, productStatusReason,
          };
          const [saved] = await db.insert(organizerPayoutProfiles).values(values)
            .onConflictDoUpdate({ target: organizerPayoutProfiles.organizationId, set: { ...values, updatedAt: new Date() } }).returning();
          return saved;
        };
        await saveProgress(null);

        if (!stakeholderId) {
          const stakeholderPayload = providerPayloads.stakeholder;
          const stakeholder = await razorpay(`/v2/accounts/${encodeURIComponent(account.id)}/stakeholders`, { method: "POST", body: JSON.stringify(stakeholderPayload) });
          if (!stakeholder.ok) {
            const failure = await routeProviderFailure({ stage: "Razorpay stakeholder setup", endpoint: "/v2/accounts/:accountId/stakeholders", payload: stakeholderPayload, response: stakeholder });
            await saveProgress(failure.errorCode);
            return { error: payoutProviderMessage("Razorpay stakeholder setup", failure), diagnostics: failure };
          }
          stakeholderId = (await stakeholder.json() as any).id || null;
          if (!isValidRazorpayProviderId(stakeholderId)) {
            invalidRouteProviderResponse("Razorpay stakeholder setup", "/v2/accounts/:accountId/stakeholders");
            await saveProgress("invalid_provider_response");
            return { error: "Razorpay returned an invalid stakeholder response." };
          }
          await saveProgress(null);
        }

        if (!productId) {
          const productPayload = providerPayloads.productRequest;
          const product = await razorpay(`/v2/accounts/${encodeURIComponent(account.id)}/products`, { method: "POST", body: JSON.stringify(productPayload) });
          if (!product.ok) {
            const failure = await routeProviderFailure({ stage: "Razorpay Route activation", endpoint: "/v2/accounts/:accountId/products", payload: productPayload, response: product });
            await saveProgress(failure.errorCode);
            return { error: payoutProviderMessage("Razorpay Route activation", failure), diagnostics: failure };
          }
          const p: any = await product.json();
          productId = p.id || null;
          productStatus = profileStatus(p);
          productStatusReason = productRequirementsReason(p);
          if (!isValidRazorpayProviderId(productId)) {
            invalidRouteProviderResponse("Razorpay Route activation", "/v2/accounts/:accountId/products");
            await saveProgress("invalid_provider_response");
            return { error: "Razorpay returned an invalid Route product response." };
          }
          await saveProgress(null);
        }

        const productUpdatePayload = providerPayloads.productUpdate;
        const productUpdate = await razorpay(`/v2/accounts/${encodeURIComponent(account.id)}/products/${encodeURIComponent(productId)}`, {
          method: "PATCH", body: JSON.stringify(productUpdatePayload),
        });
        if (!productUpdate.ok) {
          const failure = await routeProviderFailure({ stage: "Razorpay bank verification", endpoint: "/v2/accounts/:accountId/products/:productId", payload: productUpdatePayload, response: productUpdate });
          await saveProgress(failure.errorCode);
          return { error: payoutProviderMessage("Razorpay bank verification", failure), diagnostics: failure };
        }
        const updatedProduct: any = await productUpdate.json();
        productStatus = profileStatus(updatedProduct);
        productStatusReason = productRequirementsReason(updatedProduct);
        return { profile: await saveProgress(null), accountId: account.id, status };
      });
      if ("error" in outcome) {
        const diagnostics = "diagnostics" in outcome ? outcome.diagnostics : undefined;
        return res.status(502).json({
          error: outcome.error,
          ...(diagnostics ? {
            diagnostics: {
              stage: diagnostics.stage,
              errorCode: diagnostics.errorCode,
              requestId: diagnostics.requestId,
            },
          } : {}),
        });
      }
      const { profile, accountId, status } = outcome;
      await writeAudit(req, { action: "route_payout_onboarding_submitted", targetType: "organization", targetId: organizationId, diff: { accountId, status } });
      const active = isRouteProfileActive(profile);
      return res.json({ profile: { ...safePayoutProfile(profile), configured: true, canAcceptPaidTickets: active, actionRequired: active ? null : "Complete Route product activation" } });
    } catch (error) {
      const configurationError = error instanceof Error && error.message === "Razorpay platform credentials are not configured";
      console.error("[razorpay-route] onboarding unavailable", { reason: configurationError ? "credentials_missing" : "unexpected_error" });
      return res.status(503).json({ error: "Payout onboarding service unavailable" });
    }
  };
  const saveProfile = async (req: Request, res: Response) => {
    const organizationId = String(req.params.orgId || req.params.organizationId);
    if (!await assertPayoutOrganizer(req, res, organizationId)) return;
    try {
      const outcome = await withRouteOnboardingLock(organizationId, async () => {
        const [existing] = await db.select().from(organizerPayoutProfiles).where(eq(organizerPayoutProfiles.organizationId, organizationId)).limit(1);
        if (existing) {
          const savedIdError = savedRouteProfileIdError(existing);
          if (savedIdError) return { error: "The saved Razorpay payout setup has an invalid provider reference. Contact support before retrying." };
        }
        const stage = nextRouteOnboardingStage(existing);
        const updateExisting = async (values: Record<string, unknown>) => {
          const [saved] = await db.update(organizerPayoutProfiles)
            .set({ ...values, lastReconciledAt: new Date(), updatedAt: new Date() })
            .where(eq(organizerPayoutProfiles.organizationId, organizationId))
            .returning();
          return saved;
        };
        const action = typeof req.body?.action === "string" ? req.body.action : "";
        if (existing && action === "update_account") {
          const parsed = validateAccountUpdateInput(req.body);
          if (!parsed.ok) return { clientError: parsed.error };
          const payload = buildLinkedAccountUpdatePayload(parsed.value);
          const response = await razorpay(`/v2/accounts/${encodeURIComponent(existing.razorpayAccountId)}`, { method: "PATCH", body: JSON.stringify(payload) });
          if (!response.ok) {
            const failure = await routeProviderFailure({ stage: "Razorpay linked-account update", endpoint: "/v2/accounts/:accountId", payload, response });
            return { error: payoutProviderMessage("Razorpay linked-account update", failure), diagnostics: failure };
          }
          const account: any = await response.json();
          const returnedStatus = account?.activation_status || account?.status || account?.account_status;
          return { profile: await updateExisting({ businessName: parsed.value.legal_business_name, email: parsed.value.email, status: returnedStatus ? profileStatus(account) : existing.status, statusReason: null }), stage: "complete" as RouteOnboardingStage };
        }
        if (existing && action === "update_stakeholder") {
          if (!existing.providerStakeholderId) return { clientError: "Create the stakeholder before updating its details." };
          const parsed = validateStakeholderInput(req.body);
          if (!parsed.ok) return { clientError: parsed.error };
          const payload = buildStakeholderPayload(parsed.value);
          const response = await razorpay(`/v2/accounts/${encodeURIComponent(existing.razorpayAccountId)}/stakeholders/${encodeURIComponent(existing.providerStakeholderId)}`, { method: "PATCH", body: JSON.stringify(payload) });
          if (!response.ok) {
            const failure = await routeProviderFailure({ stage: "Razorpay stakeholder update", endpoint: "/v2/accounts/:accountId/stakeholders/:stakeholderId", payload, response });
            return { error: payoutProviderMessage("Razorpay stakeholder update", failure), diagnostics: failure };
          }
          return { profile: await updateExisting({ contactName: parsed.value.contact_name, email: parsed.value.email, phoneLast4: parsed.value.phone.slice(-4), statusReason: null }), stage: "complete" as RouteOnboardingStage };
        }
        if (existing && action === "update_settlement") {
          if (!existing.providerProductId) return { clientError: "Request the Route product before updating settlement details." };
          const parsed = validateSettlementInput(req.body);
          if (!parsed.ok) return { clientError: parsed.error };
          const payload = buildRouteProductUpdatePayload(parsed.value);
          const response = await razorpay(`/v2/accounts/${encodeURIComponent(existing.razorpayAccountId)}/products/${encodeURIComponent(existing.providerProductId)}`, { method: "PATCH", body: JSON.stringify(payload) });
          if (!response.ok) {
            const failure = await routeProviderFailure({ stage: "Razorpay settlement update", endpoint: "/v2/accounts/:accountId/products/:productId", payload, response });
            return { error: payoutProviderMessage("Razorpay settlement update", failure), diagnostics: failure };
          }
          const product: any = await response.json();
          return { profile: await updateExisting({ productStatus: profileStatus(product), productStatusReason: productRequirementsReason(product), statusReason: null }), stage: "complete" as RouteOnboardingStage };
        }
        if (stage === "linked_account") {
          const parsed = validateLinkedAccountInput(req.body);
          if (!parsed.ok) return { clientError: parsed.error };
          if (process.env.NODE_ENV !== "production") warnForTestModePan(parsed.value);
          const accountPayload = buildLinkedAccountPayload(parsed.value);
          const accountRes = await razorpay("/v2/accounts", { method: "POST", body: JSON.stringify(accountPayload) });
          if (!accountRes.ok) {
            const failure = await routeProviderFailure({ stage: "Razorpay onboarding", endpoint: "/v2/accounts", payload: accountPayload, response: accountRes });
            return { error: payoutProviderMessage("Razorpay onboarding", failure), diagnostics: failure };
          }
          const account: any = await accountRes.json();
          if (!isValidRazorpayProviderId(account?.id, "acc_")) {
            invalidRouteProviderResponse("Razorpay onboarding", "/v2/accounts");
            return { error: "Razorpay returned an invalid linked-account response." };
          }
          const [saved] = await db.insert(organizerPayoutProfiles).values({
            organizationId,
            razorpayAccountId: account.id,
            routeReferenceId: routeAccountReferenceId(organizationId),
            status: profileStatus(account),
            accountType: "route",
            businessName: parsed.value.legal_business_name,
            contactName: parsed.value.contact_name,
            email: parsed.value.email,
            phoneLast4: parsed.value.phone.slice(-4),
            productStatus: "pending",
            lastReconciledAt: new Date(),
          }).onConflictDoNothing().returning();
          if (!saved) {
            const [persisted] = await db.select().from(organizerPayoutProfiles).where(eq(organizerPayoutProfiles.organizationId, organizationId)).limit(1);
            return persisted ? { profile: persisted, stage: nextRouteOnboardingStage(persisted) } : { error: "Could not save the linked-account setup." };
          }
          return { profile: saved, stage: "stakeholder" as RouteOnboardingStage };
        }
        if (!existing) return { error: "Payout setup could not be resumed." };
        if (stage === "complete") return { profile: existing, stage };
        if (stage === "stakeholder") {
          const parsed = validateStakeholderInput(req.body);
          if (!parsed.ok) return { clientError: parsed.error };
          const payload = buildStakeholderPayload(parsed.value);
          const response = await razorpay(`/v2/accounts/${encodeURIComponent(existing.razorpayAccountId)}/stakeholders`, { method: "POST", body: JSON.stringify(payload) });
          if (!response.ok) {
            const failure = await routeProviderFailure({ stage: "Razorpay stakeholder setup", endpoint: "/v2/accounts/:accountId/stakeholders", payload, response });
            await updateExisting({ statusReason: failure.errorCode });
            return { error: payoutProviderMessage("Razorpay stakeholder setup", failure), diagnostics: failure };
          }
          const stakeholderId = (await response.json() as any).id;
          if (!isValidRazorpayProviderId(stakeholderId)) return { error: "Razorpay returned an invalid stakeholder response." };
          return { profile: await updateExisting({ providerStakeholderId: stakeholderId, statusReason: null }), stage: "route_product" as RouteOnboardingStage };
        }
        if (stage === "route_product") {
          const payload = buildRouteProductRequestPayload();
          const response = await razorpay(`/v2/accounts/${encodeURIComponent(existing.razorpayAccountId)}/products`, { method: "POST", body: JSON.stringify(payload) });
          if (!response.ok) {
            const failure = await routeProviderFailure({ stage: "Razorpay Route activation", endpoint: "/v2/accounts/:accountId/products", payload, response });
            await updateExisting({ statusReason: failure.errorCode });
            return { error: payoutProviderMessage("Razorpay Route activation", failure), diagnostics: failure };
          }
          const product: any = await response.json();
          if (!isValidRazorpayProviderId(product?.id)) return { error: "Razorpay returned an invalid Route product response." };
          return { profile: await updateExisting({ providerProductId: product.id, productStatus: profileStatus(product), productStatusReason: productRequirementsReason(product), statusReason: null }), stage: "settlement" as RouteOnboardingStage };
        }
        const parsed = validateSettlementInput(req.body);
        if (!parsed.ok) return { clientError: parsed.error };
        const payload = buildRouteProductUpdatePayload(parsed.value);
        const response = await razorpay(`/v2/accounts/${encodeURIComponent(existing.razorpayAccountId)}/products/${encodeURIComponent(existing.providerProductId!)}`, { method: "PATCH", body: JSON.stringify(payload) });
        if (!response.ok) {
          const failure = await routeProviderFailure({ stage: "Razorpay bank verification", endpoint: "/v2/accounts/:accountId/products/:productId", payload, response });
          await updateExisting({ statusReason: failure.errorCode });
          return { error: payoutProviderMessage("Razorpay bank verification", failure), diagnostics: failure };
        }
        const product: any = await response.json();
        return { profile: await updateExisting({ productStatus: profileStatus(product), productStatusReason: productRequirementsReason(product), statusReason: null }), stage: nextRouteOnboardingStage({ ...existing, productStatus: profileStatus(product) }) };
      });
      if ("clientError" in outcome) return res.status(400).json({ error: outcome.clientError });
      if ("error" in outcome) {
        const diagnostics = "diagnostics" in outcome ? outcome.diagnostics : undefined;
        return res.status(502).json({ error: outcome.error, ...(diagnostics ? { diagnostics: { stage: diagnostics.stage, errorCode: diagnostics.errorCode, requestId: diagnostics.requestId } } : {}) });
      }
      await writeAudit(req, { action: "route_payout_onboarding_step_completed", targetType: "organization", targetId: organizationId, diff: { stage: outcome.stage } });
      return res.json({ profile: payoutProfileView(outcome.profile), completedStage: outcome.stage });
    } catch (error) {
      const configurationError = error instanceof Error && error.message === "Razorpay platform credentials are not configured";
      console.error("[razorpay-route] onboarding unavailable", { reason: configurationError ? "credentials_missing" : "unexpected_error" });
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
      let productStatus = profile.productStatus, productStatusReason: string | null = null;
      if (profile.providerProductId) {
        const productRes = await razorpay(`/v2/accounts/${encodeURIComponent(profile.razorpayAccountId)}/products/${encodeURIComponent(profile.providerProductId)}`, { method: "GET" });
        if (productRes.ok) { const product: any = await productRes.json(); productStatus = profileStatus(product); productStatusReason = productRequirementsReason(product); }
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
      return res.json({ profile: payoutProfileView(updated) });
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
        const [registration] = await db.select({ id: eventRegistrations.id, ticketImageUrl: eventRegistrations.ticketImageUrl })
          .from(eventRegistrations)
          .where(eq(eventRegistrations.id, allocation.registrationId))
          .limit(1);
        if (registration) {
          const { cleanupEventTicketImage } = await import("./events-routes");
          await cleanupEventTicketImage(registration.ticketImageUrl, `refunded registration ${registration.id}`);
        }
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