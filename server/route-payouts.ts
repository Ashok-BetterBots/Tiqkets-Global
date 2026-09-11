import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "./db";
import { events, eventRegistrations, organizerPayoutProfiles, payments, razorpayWebhookReceipts, routePayoutAllocations } from "@shared/schema";
import { assertOrgOwnership, getCallerContext, isSuperAdminRequest, requirePermission, writeAudit } from "./rbac";
import { buildLinkedAccountPayload, buildLinkedAccountUpdatePayload, buildRouteOnboardingPayloads, buildRouteOrderPayload, buildRouteProductRequestPayload, buildRouteProductUpdatePayload, buildStakeholderPayload, canReclaimWebhookReceipt, isFullRouteRefundAmount, isValidRazorpayProviderId, paymentRecoveryDisposition, redactRouteDiagnosticPayload, routeAllocationStatusFromTransferEntity, routeMoneyMovementKey, routeOrderIdempotencyKey, safePayoutProfile, safeRouteTransferDetails, type SafeRouteTransferDetails, validateAccountUpdateInput, validateLinkedAccountInput, validateOnboardingInput, validateSettlementInput, validateStakeholderInput, verifyRazorpaySignature } from "./razorpay-route-contract";
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
export function payoutHistoryPagination(pageValue: unknown, limitValue: unknown): { page: number; limit: number } {
  const parsedPage = Number.parseInt(String(pageValue || ""), 10);
  const parsedLimit = Number.parseInt(String(limitValue || ""), 10);
  return {
    page: Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    limit: Number.isSafeInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 25) : 10,
  };
}
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  };
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
export async function lookupSafeRouteTransfer(
  expected: { transferId: string; amount: number; allocationId: string; recipientId?: string | null },
  loader: (transferId: string) => Promise<unknown>,
): Promise<SafeRouteTransferDetails | null> {
  try {
    return safeRouteTransferDetails(await loader(expected.transferId), expected);
  } catch {
    return null;
  }
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

export function isRazorpayTestMode(): boolean {
  // Development previews must be safe to exercise without a live payout
  // setup, even when a locally injected Razorpay key is unavailable or has
  // an unrecognised prefix. Production is opt-in: only an explicit test key
  // enables the non-transfer test checkout path there.
  return process.env.NODE_ENV !== "production" || razorpayCredentialMode() === "test";
}

export function isRazorpayCredentialTestMode(): boolean {
  return razorpayCredentialMode() === "test";
}

type RouteOnboardingStage = "linked_account" | "stakeholder" | "route_product" | "settlement" | "complete";
const ROUTE_INTENT_LINKED_ACCOUNT = "intent_linked_account";
const ROUTE_INTENT_STAKEHOLDER = "intent_stakeholder";
const ROUTE_INTENT_PRODUCT = "intent_route_product";
const ROUTE_INTENT_SETTLEMENT = "intent_settlement";

type RouteOnboardingProfileState = {
  providerStakeholderId?: string | null;
  providerProductId?: string | null;
  status: string;
  productStatus?: string | null;
  statusReason?: string | null;
};

export function pendingRouteOnboardingStages(profile: RouteOnboardingProfileState | undefined): Exclude<RouteOnboardingStage, "complete">[] {
  if (profile?.statusReason === ROUTE_INTENT_LINKED_ACCOUNT) return ["linked_account", "stakeholder", "route_product", "settlement"];
  if (profile && (isRouteProfileActive(profile) || profile.statusReason === "settlement_submitted")) return [];
  const stages: Exclude<RouteOnboardingStage, "complete">[] = [];
  if (!profile) stages.push("linked_account");
  if (!profile?.providerStakeholderId) stages.push("stakeholder");
  if (!profile?.providerProductId) stages.push("route_product");
  stages.push("settlement");
  return stages;
}

function nextRouteOnboardingStage(profile: RouteOnboardingProfileState | undefined): RouteOnboardingStage {
  return pendingRouteOnboardingStages(profile)[0] || "complete";
}

function payoutProfileView(profile: any | undefined) {
  const linkedAccountPending = profile?.statusReason === ROUTE_INTENT_LINKED_ACCOUNT;
  const routeActive = isRouteProfileActive(profile);
  const hasLinkedAccount = !!profile && !linkedAccountPending && isValidRazorpayProviderId(profile.razorpayAccountId, "acc_");
  const credentialTestMode = isRazorpayCredentialTestMode();
  // Test credentials may be used to exercise checkout before the provider
  // reports the account as fully active, but the linked account is still
  // mandatory because every paid order must include its organizer transfer.
  const canAcceptPaidTickets = hasLinkedAccount && (routeActive || isRazorpayTestMode());
  const currentStage = nextRouteOnboardingStage(profile);
  const completed = new Set<RouteOnboardingStage>();
  if (profile) completed.add("linked_account");
  if (profile?.providerStakeholderId) completed.add("stakeholder");
  if (profile?.providerProductId) completed.add("route_product");
  if (routeActive || profile?.statusReason === "settlement_submitted") completed.add("settlement");
  const stageLabels: Array<[Exclude<RouteOnboardingStage, "complete">, string]> = [
    ["linked_account", "Linked account"],
    ["stakeholder", "Account contact"],
    ["route_product", "Route product"],
    ["settlement", "Bank settlement"],
  ];
  return {
    ...(profile && !linkedAccountPending ? safePayoutProfile(profile) : {}),
    configured: !!profile && !linkedAccountPending,
    testMode: credentialTestMode,
    canAcceptPaidTickets,
    onboarding: {
      currentStage,
      steps: stageLabels.map(([id, label]) => ({
        id,
        label,
        status: completed.has(id) ? "complete" : currentStage === id ? "current" : "locked",
      })),
    },
    actionRequired: currentStage !== "complete"
      ? (currentStage === "linked_account"
        ? "Set up a Route payout account"
        : `Continue with ${stageLabels.find(([id]) => id === currentStage)?.[1] || "Route activation"}`)
      : !routeActive
        ? "Payout setup was submitted. Razorpay activation is pending; use Refresh status to check for updates."
        : hasLinkedAccount && credentialTestMode
          ? "Test checkout is enabled. Razorpay will validate the linked account when the order is created."
          : null,
  };
}

function providerItems(body: any): any[] {
  if (Array.isArray(body)) return body;
  return Array.isArray(body?.items) ? body.items : [];
}

async function fetchProviderCollection(path: string, label: string): Promise<any[]> {
  const all: any[] = [];
  for (let skip = 0; skip < 10_000; skip += 100) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await razorpay(`${path}${separator}count=100&skip=${skip}`, { method: "GET" });
    if (!response.ok) throw new Error(`${label} reconciliation unavailable`);
    const page = providerItems(await response.json());
    all.push(...page);
    if (page.length < 100) return all;
  }
  throw new Error(`${label} reconciliation exceeded the safe page limit`);
}

async function reconcileStakeholderIntent(accountId: string, payload: ReturnType<typeof buildStakeholderPayload>): Promise<any | null> {
  const expectedEmail = String(payload.email || "").trim().toLowerCase();
  const expectedPhone = String(payload.phone?.primary || "").replace(/\D/g, "");
  return (await fetchProviderCollection(`/v2/accounts/${encodeURIComponent(accountId)}/stakeholders`, "Stakeholder")).find((stakeholder) =>
    String(stakeholder?.email || "").trim().toLowerCase() === expectedEmail &&
    String(stakeholder?.phone?.primary || stakeholder?.phone || "").replace(/\D/g, "") === expectedPhone &&
    isValidRazorpayProviderId(stakeholder?.id, "sth_"),
  ) || null;
}

async function reconcileProductIntent(accountId: string): Promise<any | null> {
  return (await fetchProviderCollection(`/v2/accounts/${encodeURIComponent(accountId)}/products`, "Route product")).find((product) =>
    String(product?.product_name || product?.name || "").toLowerCase() === "route" &&
    isValidRazorpayProviderId(product?.id, "acc_prd_"),
  ) || null;
}

async function refreshSavedRouteProfile(profile: typeof organizerPayoutProfiles.$inferSelect) {
  const accountResponse = await razorpay(`/v2/accounts/${encodeURIComponent(profile.razorpayAccountId)}`, { method: "GET" });
  if (!accountResponse.ok) return profile;
  const account: any = await accountResponse.json();
  let productStatus = profile.productStatus;
  let productStatusReason = profile.productStatusReason;
  if (profile.providerProductId) {
    const productResponse = await razorpay(
      `/v2/accounts/${encodeURIComponent(profile.razorpayAccountId)}/products/${encodeURIComponent(profile.providerProductId)}`,
      { method: "GET" },
    );
    if (productResponse.ok) {
      const product: any = await productResponse.json();
      productStatus = profileStatus(product);
      productStatusReason = productRequirementsReason(product);
    }
  }
  const nextStatus = profileStatus(account);
  const [updated] = await db.update(organizerPayoutProfiles).set({
    status: nextStatus,
    productStatus,
    productStatusReason,
    lastReconciledAt: new Date(),
    statusReason: isRouteProfileActive({ status: nextStatus, productStatus })
      ? null
      : profile.statusReason === "settlement_submitted" ? "settlement_submitted" : null,
    updatedAt: new Date(),
  }).where(eq(organizerPayoutProfiles.id, profile.id)).returning();
  return updated || profile;
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

export function razorpayTestDataError(value: Record<string, unknown>): string | null {
  if (razorpayCredentialMode() !== "test") return null;
  const legalInfo = value.legal_info as Record<string, string> | undefined;
  const pan = String(legalInfo?.pan || "").trim().toUpperCase();
  const gst = String(legalInfo?.gst || "").trim().toUpperCase();
  if (pan !== "AAACL1234C") {
    return "PAN: Razorpay Test Mode requires the documented dummy PAN AAACL1234C. Configure platform live keys before submitting a real organizer PAN.";
  }
  if (gst && gst !== "36AAECL6705C1ZS") {
    return "GST identification number: Razorpay Test Mode requires the documented dummy GSTIN 36AAECL6705C1ZS, or leave GST blank when not applicable. Configure platform live keys before submitting real GST details.";
  }
  return null;
}

export type RazorpayIssue =
  | "duplicate_email"
  | "required"
  | "invalid_value"
  | "invalid_length"
  | "invalid_characters"
  | "feature_not_enabled";

export type RazorpayFailure = {
  httpStatus: number;
  errorCode: string | null;
  requestId: string | null;
  field: string | null;
  issue: RazorpayIssue | null;
};

export function isDefinitiveProviderRejection(httpStatus: number): boolean {
  return httpStatus >= 400 && httpStatus < 500 && ![408, 409, 425, 429].includes(httpStatus);
}

function safeProviderField(value: unknown): string | null {
  const field = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!field) return null;
  const normalized = field.replace(/[\[\].'"-]+/g, "_").replace(/_+/g, "_");
  const known = [
    "legal_business_name", "contact_name", "business_type", "subcategory", "category",
    "postal_code", "street1", "street2", "city", "state", "country", "phone", "email",
    "pan", "gst", "ifsc_code", "account_number", "beneficiary_name", "tnc_accepted",
    "product_name", "reference_id", "code",
  ];
  return known.find(candidate => normalized === candidate || normalized.endsWith(`_${candidate}`)) || null;
}

function providerErrorText(error: any): string {
  return [error?.description, error?.reason, error?.step]
    .filter(value => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function safeProviderIssue(error: any): RazorpayIssue | null {
  const text = providerErrorText(error);
  if (/email.*already exists|already.*email|duplicate.*email/.test(text)) return "duplicate_email";
  if (/required|must not be blank|cannot be blank|missing/.test(text)) return "required";
  if (/only contain|unsupported characters|format is invalid/.test(text)) return "invalid_characters";
  if (/length|characters|digits|too long|too short|at least|at most|between/.test(text)) return "invalid_length";
  if (/not enabled|not allowed|access denied|requested url was not found/.test(text)) return "feature_not_enabled";
  if (/invalid|incorrect|not valid|could not accept/.test(text)) return "invalid_value";
  return null;
}

function inferProviderField(error: any): string | null {
  const direct = safeProviderField(error?.field) ||
    safeProviderField(error?.metadata?.field) ||
    safeProviderField(error?.metadata?.parameter);
  if (direct) return direct;
  const text = providerErrorText(error);
  const patterns: Array<[RegExp, string]> = [
    [/\bsubcategor/, "subcategory"], [/\bcategory\b/, "category"],
    [/\blegal business name\b|\bbusiness name\b|\bname may only\b/, "legal_business_name"],
    [/\bcontact name\b/, "contact_name"], [/\bbusiness type\b/, "business_type"],
    [/\bpostal|\bpincode|\bpin code\b/, "postal_code"], [/\bstreet ?2|address line ?2/, "street2"],
    [/\bstreet ?1|address line ?1/, "street1"], [/\bcity\b/, "city"], [/\bstate\b/, "state"],
    [/\bphone\b|\bmobile\b/, "phone"], [/\bemail\b/, "email"], [/\bpan\b/, "pan"], [/\bgst/, "gst"],
    [/\bifsc\b/, "ifsc_code"], [/\baccount number\b/, "account_number"], [/\bbeneficiary\b/, "beneficiary_name"],
  ];
  return patterns.find(([pattern]) => pattern.test(text))?.[1] || null;
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
    return {
      httpStatus: response.status,
      errorCode: safeProviderReason(error?.code),
      requestId,
      field: inferProviderField(error),
      issue: safeProviderIssue(error),
    };
  } catch {
    return { httpStatus: response.status, errorCode: null, requestId, field: null, issue: null };
  }
}

function productRequirementsReason(product: any): string | null {
  // Product requirements and status reasons are provider-controlled free text
  // rather than a stable public code contract. Never persist or return them.
  void product;
  return null;
}

export function payoutProviderMessage(stage: string, failure: {
  errorCode: string | null;
  requestId: string | null;
  field?: string | null;
  issue?: RazorpayIssue | null;
}): string {
  const reasonCode = failure.errorCode;
  let message: string;
  if (reasonCode === "BAD_REQUEST_ERROR") {
    if (stage === "Razorpay onboarding") {
      const fieldMessages: Record<string, string> = {
        legal_business_name: "Legal business name: use 4–200 characters containing only letters, numbers, and spaces.",
        email: failure.issue === "duplicate_email"
          ? "Business email: this email is already linked to another Razorpay account. Use a unique business email or ask Razorpay Support to recover the existing linked account."
          : "Business email: enter a valid email address that is not already linked to another Razorpay account.",
        phone: "Business phone: enter 8–15 digits without the +91 country code. Example: 9876543210.",
        contact_name: "Account contact name: use 4–255 characters and remove unsupported symbols.",
        business_type: "Business type: select one of the values shown in the Ticket Payments form.",
        category: "Razorpay business category: select a value from the uploaded Razorpay category list.",
        subcategory: "Razorpay business subcategory: select a value belonging to the chosen category.",
        street1: "Registered address line 1: enter the primary street or building address, up to 100 characters.",
        street2: "Registered address line 2: this field is required by Razorpay and must be 100 characters or fewer.",
        city: "Registered address city: enter the city name.",
        state: "Registered address state: Razorpay rejected this value. Select the full Indian state name (for example, Tamil Nadu), not an unrecognized abbreviation.",
        postal_code: "Registered address postal code: enter exactly 6 digits.",
        pan: razorpayCredentialMode() === "test"
          ? "PAN: Test Mode requires AAACL1234C. Configure platform live keys before submitting a real PAN."
          : "PAN: enter the 10-character value in the format ABCDE1234F.",
        gst: razorpayCredentialMode() === "test"
          ? "GST identification number: Test Mode requires 36AAECL6705C1ZS, or leave it blank when not applicable."
          : "GST identification number: enter the 15-character GSTIN, or leave it blank when not applicable.",
      };
      message = failure.field && fieldMessages[failure.field]
        ? fieldMessages[failure.field]
        : failure.issue === "duplicate_email"
          ? fieldMessages.email
          : "Razorpay did not identify one field. Verify Legal business name (4–200 letters, numbers, and spaces), Business email (valid and unique in Razorpay), Business phone (8–15 digits without +91), Account contact name (4–255 characters), Business type, Razorpay category and matching subcategory, Registered address line 1, Registered address line 2, City, State, 6-digit postal code, PAN (ABCDE1234F), and optional 15-character GSTIN.";
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
    issue: diagnostic.issue,
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
  const res = await razorpay("/orders", {
    method: "POST",
    body: JSON.stringify(buildRouteOrderPayload(input)),
    headers: { "X-Razorpay-Idempotency-Key": routeOrderIdempotencyKey(input.allocationId) },
  });
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

type WebhookProcessResult = "processed" | "ignored" | "failed";

async function recoverCapturedPayment(orderId: string, paymentId: string): Promise<WebhookProcessResult> {
  const [allocation] = await db.select().from(routePayoutAllocations).where(eq(routePayoutAllocations.razorpayOrderId, orderId)).limit(1);
  // The platform Razorpay account can also receive non-event payments. Those
  // are valid webhook deliveries but do not belong to the Route payout ledger.
  if (!allocation) return "ignored";
  if (allocation.amount <= 0) return "failed";
  const [reg] = await db.select().from(eventRegistrations).where(eq(eventRegistrations.id, allocation.registrationId)).limit(1);
  if (!reg) return "failed";
  const [ev] = await db.select().from(events).where(eq(events.id, reg.eventId)).limit(1);
  if (!ev || ev.organizationId !== allocation.organizationId) return "failed";
  const disposition = paymentRecoveryDisposition(reg.status);
  if (disposition === "terminal") return "processed";
  if (disposition === "reject") return "failed";
  if (disposition === "issue_ticket") {
    const { issueTicket } = await import("./events-routes");
    const issued = await issueTicket(ev, reg);
    return issued.status === "ticket_generated" ? "processed" : "failed";
  }
  const [orderRes, paymentRes] = await Promise.all([
    razorpay(`/orders/${encodeURIComponent(orderId)}`, { method: "GET" }),
    razorpay(`/payments/${encodeURIComponent(paymentId)}`, { method: "GET" }),
  ]);
  if (!orderRes.ok || !paymentRes.ok) return "failed";
  const order: any = await orderRes.json(), payment: any = await paymentRes.json();
  if (order.status !== "paid" || payment.status !== "captured" || payment.order_id !== orderId ||
      Number(order.amount) !== allocation.amount || Number(payment.amount) !== allocation.amount ||
      String(order.currency).toUpperCase() !== "INR" || String(payment.currency).toUpperCase() !== "INR" ||
      String(order.notes?.allocationId || "") !== allocation.id || String(order.notes?.registrationId || "") !== reg.id) return "failed";
  let paymentRow: any;
  try {
    [paymentRow] = await db.insert(payments).values({ organizationId: ev.organizationId, amount: allocation.amount, currency: "INR", status: "captured", razorpayPaymentId: paymentId, razorpayOrderId: orderId, paymentMethod: payment.method || null, description: `Event registration — ${ev.name}`, paidAt: new Date() }).returning();
  } catch { [paymentRow] = await db.select().from(payments).where(eq(payments.razorpayPaymentId, paymentId)).limit(1); }
  const [paid] = await db.update(eventRegistrations).set({ status: "payment_completed", amountPaid: allocation.amount, paymentId: paymentRow?.id || null, updatedAt: new Date() })
    .where(and(eq(eventRegistrations.id, reg.id), eq(eventRegistrations.status, "registration_started"))).returning();
  if (!paid) return "processed";
  await db.update(routePayoutAllocations).set({ status: "captured", updatedAt: new Date() }).where(eq(routePayoutAllocations.id, allocation.id));
  await db.execute(sql`INSERT INTO event_stage_log (registration_id, stage, metadata) VALUES (${reg.id}, 'payment_completed', ${JSON.stringify({ amount: allocation.amount, allocationId: allocation.id })}::jsonb)`);
  const { issueTicket } = await import("./events-routes");
  const issued = await issueTicket(ev, paid);
  return issued.status === "ticket_generated" ? "processed" : "failed";
}

async function applyVerifiedTransferEntity(
  transfer: any,
  expectedEvent?: "transfer.processed" | "transfer.failed" | "settlement.processed",
): Promise<WebhookProcessResult> {
  const transferId = String(transfer?.id || "");
  if (!isValidRazorpayProviderId(transferId, "trf_")) return "failed";
  const [allocation] = await db.select().from(routePayoutAllocations)
    .where(eq(routePayoutAllocations.razorpayTransferId, transferId)).limit(1);
  if (!allocation) return "ignored";
  const [profile] = await db.select().from(organizerPayoutProfiles)
    .where(eq(organizerPayoutProfiles.id, allocation.payoutProfileId)).limit(1);
  if (!profile ||
      Number(transfer.amount) !== allocation.amount ||
      String(transfer.currency || "").toUpperCase() !== "INR" ||
      (transfer.recipient && String(transfer.recipient) !== profile.razorpayAccountId) ||
      (transfer.notes?.allocationId && String(transfer.notes.allocationId) !== allocation.id)) {
    return "failed";
  }
  const nextStatus = routeAllocationStatusFromTransferEntity(transfer);
  if (!nextStatus) return "failed";
  if (expectedEvent === "transfer.processed" && !["processed", "settled"].includes(nextStatus)) return "failed";
  if (expectedEvent === "transfer.failed" && nextStatus !== "failed") return "failed";
  if (expectedEvent === "settlement.processed" && nextStatus !== "settled") return "failed";

  // Late provider retries must not regress a terminal allocation.
  if (["refunded", "reversed"].includes(allocation.status) ||
      (allocation.status === "settled" && nextStatus === "processed")) {
    return "processed";
  }
  await db.update(routePayoutAllocations)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(routePayoutAllocations.id, allocation.id));
  return "processed";
}

async function reconcileTransferWebhook(
  transferId: string,
  event: "transfer.processed" | "transfer.failed",
): Promise<WebhookProcessResult> {
  if (!isValidRazorpayProviderId(transferId, "trf_")) return "failed";
  const [known] = await db.select({ id: routePayoutAllocations.id })
    .from(routePayoutAllocations).where(eq(routePayoutAllocations.razorpayTransferId, transferId)).limit(1);
  if (!known) return "ignored";
  const response = await razorpay(`/transfers/${encodeURIComponent(transferId)}`, { method: "GET" });
  if (!response.ok) return "failed";
  return applyVerifiedTransferEntity(await response.json(), event);
}

async function reconcileSettlementWebhook(settlementId: string): Promise<WebhookProcessResult> {
  if (!isValidRazorpayProviderId(settlementId, "setl_")) return "failed";
  const response = await razorpay(`/transfers?recipient_settlement_id=${encodeURIComponent(settlementId)}`, { method: "GET" });
  if (!response.ok) return "failed";
  const body: any = await response.json();
  const transfers = Array.isArray(body?.items) ? body.items : [];
  let matched = 0;
  for (const transfer of transfers) {
    const outcome = await applyVerifiedTransferEntity(
      { ...transfer, recipient_settlement_id: transfer?.recipient_settlement_id || settlementId },
      "settlement.processed",
    );
    if (outcome === "failed") return "failed";
    if (outcome === "processed") matched++;
  }
  return matched > 0 ? "processed" : "ignored";
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
    let refreshedProfile = profile;
    // Profile reads are also status reads. Refresh only a real saved provider
    // account; pending local intents must not be sent to Razorpay.
    if (profile && isValidRazorpayProviderId(profile.razorpayAccountId, "acc_")) {
      try {
        refreshedProfile = await refreshSavedRouteProfile(profile);
      } catch {
        // Keep the last safe local state if Razorpay is temporarily unavailable.
      }
    }
    return res.json({ profile: payoutProfileView(refreshedProfile) });
  };
  const saveProfileLegacy = async (req: Request, res: Response) => {
    const organizationId = String(req.params.orgId || req.params.organizationId); if (!await assertPayoutOrganizer(req, res, organizationId)) return;
    const parsed = validateOnboardingInput(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const testDataError = razorpayTestDataError(parsed.value);
    if (testDataError) return res.status(400).json({ error: testDataError });
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
        const [existing] = await db.select().from(organizerPayoutProfiles)
          .where(eq(organizerPayoutProfiles.organizationId, organizationId)).limit(1);
        if (existing && existing.statusReason !== ROUTE_INTENT_LINKED_ACCOUNT && savedRouteProfileIdError(existing)) {
          return { error: "The saved Razorpay payout setup has an invalid provider reference. Contact support before retrying." };
        }

        let profile = existing;
        const updateProfile = async (values: Record<string, unknown>) => {
          const [saved] = await db.update(organizerPayoutProfiles)
            .set({ ...values, lastReconciledAt: new Date(), updatedAt: new Date() })
            .where(eq(organizerPayoutProfiles.organizationId, organizationId))
            .returning();
          profile = saved;
          return saved;
        };

        const action = typeof req.body?.action === "string" ? req.body.action : "";
        if (profile && action === "update_account") {
          const parsed = validateAccountUpdateInput(req.body);
          if (!parsed.ok) return { clientError: parsed.error };
          const payload = buildLinkedAccountUpdatePayload(parsed.value);
          const response = await razorpay(`/v2/accounts/${encodeURIComponent(profile.razorpayAccountId)}`, { method: "PATCH", body: JSON.stringify(payload) });
          if (!response.ok) {
            const failure = await routeProviderFailure({ stage: "Razorpay linked-account update", endpoint: "/v2/accounts/:accountId", payload, response });
            return { error: payoutProviderMessage("Razorpay linked-account update", failure), diagnostics: failure };
          }
          const account: any = await response.json();
          const returnedStatus = account?.activation_status || account?.status || account?.account_status;
          const saved = await updateProfile({
            businessName: parsed.value.legal_business_name,
            email: parsed.value.email,
            status: returnedStatus ? profileStatus(account) : profile.status,
            statusReason: profile.statusReason === "settlement_submitted" ? "settlement_submitted" : null,
          });
          return { profile: saved, stage: "complete" as RouteOnboardingStage };
        }
        if (profile && action === "update_stakeholder") {
          if (!profile.providerStakeholderId) return { clientError: "Create the stakeholder before updating its details." };
          const parsed = validateStakeholderInput(req.body);
          if (!parsed.ok) return { clientError: parsed.error };
          const payload = buildStakeholderPayload(parsed.value);
          const response = await razorpay(
            `/v2/accounts/${encodeURIComponent(profile.razorpayAccountId)}/stakeholders/${encodeURIComponent(profile.providerStakeholderId)}`,
            { method: "PATCH", body: JSON.stringify(payload) },
          );
          if (!response.ok) {
            const failure = await routeProviderFailure({ stage: "Razorpay stakeholder update", endpoint: "/v2/accounts/:accountId/stakeholders/:stakeholderId", payload, response });
            return { error: payoutProviderMessage("Razorpay stakeholder update", failure), diagnostics: failure };
          }
          const saved = await updateProfile({
            contactName: parsed.value.contact_name,
            email: parsed.value.email,
            phoneLast4: parsed.value.phone.replace(/\D/g, "").slice(-4),
            statusReason: profile.statusReason === "settlement_submitted" ? "settlement_submitted" : null,
          });
          return { profile: saved, stage: "complete" as RouteOnboardingStage };
        }
        if (profile && action === "update_settlement") {
          if (!profile.providerProductId) return { clientError: "Request the Route product before updating settlement details." };
          const parsed = validateSettlementInput(req.body);
          if (!parsed.ok) return { clientError: parsed.error };
          const payload = buildRouteProductUpdatePayload(parsed.value);
          const response = await razorpay(
            `/v2/accounts/${encodeURIComponent(profile.razorpayAccountId)}/products/${encodeURIComponent(profile.providerProductId)}`,
            { method: "PATCH", body: JSON.stringify(payload) },
          );
          if (!response.ok) {
            const failure = await routeProviderFailure({ stage: "Razorpay settlement update", endpoint: "/v2/accounts/:accountId/products/:productId", payload, response });
            return { error: payoutProviderMessage("Razorpay settlement update", failure), diagnostics: failure };
          }
          const product: any = await response.json();
          const saved = await updateProfile({
            productStatus: profileStatus(product),
            productStatusReason: productRequirementsReason(product),
            statusReason: "settlement_submitted",
          });
          return { profile: saved, stage: "complete" as RouteOnboardingStage };
        }

        let completedStage: RouteOnboardingStage = nextRouteOnboardingStage(profile);
        let progressed = false;

        if (!profile || profile.statusReason === ROUTE_INTENT_LINKED_ACCOUNT) {
          const parsed = validateLinkedAccountInput(req.body);
          if (!parsed.ok) return { clientError: parsed.error };
          const testDataError = razorpayTestDataError(parsed.value);
          if (testDataError) return { clientError: testDataError };
          const accountPayload = buildLinkedAccountPayload(parsed.value);

          if (profile?.statusReason === ROUTE_INTENT_LINKED_ACCOUNT) {
            return {
              error: "A previous linked-account request has an uncertain provider outcome. To prevent a duplicate payout account, contact support before retrying.",
            };
          }

          const pendingAccountId = `pending_${crypto.createHash("sha256").update(organizationId).digest("hex").slice(0, 24)}`;
          const [intent] = await db.insert(organizerPayoutProfiles).values({
            organizationId,
            razorpayAccountId: pendingAccountId,
            routeReferenceId: routeAccountReferenceId(organizationId),
            status: "pending",
            accountType: "route",
            businessName: parsed.value.legal_business_name,
            contactName: parsed.value.contact_name,
            email: parsed.value.email,
            phoneLast4: parsed.value.phone.replace(/\D/g, "").slice(-4),
            productStatus: "pending",
            statusReason: ROUTE_INTENT_LINKED_ACCOUNT,
            lastReconciledAt: new Date(),
          }).onConflictDoNothing().returning();
          if (!intent) return { error: "Could not reserve the linked-account setup." };
          profile = intent;

          const accountResponse = await razorpay("/v2/accounts", { method: "POST", body: JSON.stringify(accountPayload) });
          if (!accountResponse.ok) {
            const failure = await routeProviderFailure({ stage: "Razorpay onboarding", endpoint: "/v2/accounts", payload: accountPayload, response: accountResponse });
            if (isDefinitiveProviderRejection(failure.httpStatus)) {
              await db.delete(organizerPayoutProfiles).where(and(
                eq(organizerPayoutProfiles.organizationId, organizationId),
                eq(organizerPayoutProfiles.statusReason, ROUTE_INTENT_LINKED_ACCOUNT),
              ));
            }
            return { error: payoutProviderMessage("Razorpay onboarding", failure), diagnostics: failure };
          }
          const account: any = await accountResponse.json();
          if (!isValidRazorpayProviderId(account?.id, "acc_")) {
            invalidRouteProviderResponse("Razorpay onboarding", "/v2/accounts");
            return { error: "Razorpay returned an invalid linked-account response." };
          }
          const saved = await updateProfile({
            razorpayAccountId: account.id,
            status: profileStatus(account),
            businessName: parsed.value.legal_business_name,
            contactName: parsed.value.contact_name,
            email: parsed.value.email,
            phoneLast4: parsed.value.phone.replace(/\D/g, "").slice(-4),
            productStatus: "pending",
            statusReason: null,
          });
          profile = saved;
          completedStage = "linked_account";
          progressed = true;
        }

        if (!profile) return { error: "Payout setup could not be resumed." };
        if (nextRouteOnboardingStage(profile) === "complete") return { profile, stage: "complete" as RouteOnboardingStage };

        if (!profile.providerStakeholderId) {
          const parsed = validateStakeholderInput(req.body);
          if (!parsed.ok) return progressed ? { profile, stage: completedStage } : { clientError: parsed.error };
          const payload = buildStakeholderPayload(parsed.value);
          const recovering = profile.statusReason === ROUTE_INTENT_STAKEHOLDER;
          if (!recovering) await updateProfile({ statusReason: ROUTE_INTENT_STAKEHOLDER });
          let stakeholder: any = recovering ? await reconcileStakeholderIntent(profile.razorpayAccountId, payload) : null;
          if (!stakeholder) {
            const response = await razorpay(`/v2/accounts/${encodeURIComponent(profile.razorpayAccountId)}/stakeholders`, { method: "POST", body: JSON.stringify(payload) });
            if (!response.ok) {
              const failure = await routeProviderFailure({ stage: "Razorpay stakeholder setup", endpoint: "/v2/accounts/:accountId/stakeholders", payload, response });
              if (isDefinitiveProviderRejection(failure.httpStatus)) {
                await updateProfile({ statusReason: failure.errorCode });
              }
              return { error: payoutProviderMessage("Razorpay stakeholder setup", failure), diagnostics: failure };
            }
            stakeholder = await response.json();
          }
          const stakeholderId = stakeholder?.id;
          if (!isValidRazorpayProviderId(stakeholderId, "sth_")) return { error: "Razorpay returned an invalid stakeholder response." };
          await updateProfile({ providerStakeholderId: stakeholderId, statusReason: null });
          completedStage = "stakeholder";
          progressed = true;
        }

        if (!profile.providerProductId) {
          const payload = buildRouteProductRequestPayload();
          const recovering = profile.statusReason === ROUTE_INTENT_PRODUCT;
          if (!recovering) await updateProfile({ statusReason: ROUTE_INTENT_PRODUCT });
          let product: any = recovering ? await reconcileProductIntent(profile.razorpayAccountId) : null;
          if (!product) {
            const response = await razorpay(`/v2/accounts/${encodeURIComponent(profile.razorpayAccountId)}/products`, { method: "POST", body: JSON.stringify(payload) });
            if (!response.ok) {
              const failure = await routeProviderFailure({ stage: "Razorpay Route activation", endpoint: "/v2/accounts/:accountId/products", payload, response });
              if (isDefinitiveProviderRejection(failure.httpStatus)) {
                await updateProfile({ statusReason: failure.errorCode });
              }
              return { error: payoutProviderMessage("Razorpay Route activation", failure), diagnostics: failure };
            }
            product = await response.json();
          }
          if (!isValidRazorpayProviderId(product?.id, "acc_prd_")) return { error: "Razorpay returned an invalid Route product response." };
          await updateProfile({
            providerProductId: product.id,
            productStatus: profileStatus(product),
            productStatusReason: productRequirementsReason(product),
            statusReason: null,
          });
          completedStage = "route_product";
          progressed = true;
        }

        if (!isRouteProfileActive(profile)) {
          const parsed = validateSettlementInput(req.body);
          if (!parsed.ok) return progressed ? { profile, stage: completedStage } : { clientError: parsed.error };
          const payload = buildRouteProductUpdatePayload(parsed.value);
          await updateProfile({ statusReason: ROUTE_INTENT_SETTLEMENT });
          const response = await razorpay(
            `/v2/accounts/${encodeURIComponent(profile.razorpayAccountId)}/products/${encodeURIComponent(profile.providerProductId!)}`,
            { method: "PATCH", body: JSON.stringify(payload) },
          );
          if (!response.ok) {
            const failure = await routeProviderFailure({ stage: "Razorpay bank verification", endpoint: "/v2/accounts/:accountId/products/:productId", payload, response });
            await updateProfile({ statusReason: failure.errorCode });
            return { error: payoutProviderMessage("Razorpay bank verification", failure), diagnostics: failure };
          }
          const product: any = await response.json();
          await updateProfile({
            productStatus: profileStatus(product),
            productStatusReason: productRequirementsReason(product),
            statusReason: "settlement_submitted",
          });
          completedStage = "settlement";
        }

        profile = await refreshSavedRouteProfile(profile);
        return { profile, stage: completedStage };
      });

      if ("clientError" in outcome) return res.status(400).json({ error: outcome.clientError });
      if ("error" in outcome) {
        const diagnostics = "diagnostics" in outcome ? outcome.diagnostics : undefined;
        return res.status(502).json({
          error: outcome.error,
          ...(diagnostics ? {
            diagnostics: {
              stage: diagnostics.stage,
              errorCode: diagnostics.errorCode,
              requestId: diagnostics.requestId,
              field: diagnostics.field,
              issue: diagnostics.issue,
            },
            ...(diagnostics.field ? { fieldErrors: { [diagnostics.field]: outcome.error } } : {}),
          } : {}),
        });
      }

      let refreshedProfile = outcome.profile;
      try {
        refreshedProfile = await refreshSavedRouteProfile(outcome.profile);
      } catch {
        // The provider mutation and its safe local status are already durable.
      }
      await writeAudit(req, { action: "route_payout_onboarding_step_completed", targetType: "organization", targetId: organizationId, diff: { stage: outcome.stage } });
      return res.json({ profile: payoutProfileView(refreshedProfile), completedStage: outcome.stage });
    } catch (error) {
      const configurationError = error instanceof Error && error.message === "Razorpay platform credentials are not configured";
      console.error("[razorpay-route] onboarding unavailable", { reason: configurationError ? "credentials_missing" : "unexpected_error" });
      return res.status(503).json({ error: "Payout onboarding service unavailable" });
    }
  };
  const history = async (req: Request, res: Response) => {
    const organizationId = String(req.params.orgId || req.params.organizationId); if (!await assertPayoutOrganizer(req, res, organizationId)) return;
    const requested = payoutHistoryPagination(req.query.page, req.query.limit);
    const [totalsRow] = await db.select({
      total: sql<number>`count(*)::int`,
      gross: sql<number>`coalesce(sum(${routePayoutAllocations.amount}), 0)::int`,
      transferred: sql<number>`coalesce(sum(case when ${routePayoutAllocations.status} in ('processed', 'settled', 'reversed', 'refunded') then ${routePayoutAllocations.amount} else 0 end), 0)::int`,
      settled: sql<number>`coalesce(sum(case when ${routePayoutAllocations.status} = 'settled' then ${routePayoutAllocations.amount} else 0 end), 0)::int`,
      refunded: sql<number>`coalesce(sum(case when ${routePayoutAllocations.status} = 'refunded' then ${routePayoutAllocations.amount} else 0 end), 0)::int`,
    }).from(routePayoutAllocations).where(eq(routePayoutAllocations.organizationId, organizationId));
    const total = Number(totalsRow?.total || 0);
    const totalPages = total ? Math.ceil(total / requested.limit) : 0;
    const page = totalPages ? Math.min(requested.page, totalPages) : 1;
    const rows = await db.select({ allocation: routePayoutAllocations, registration: eventRegistrations, event: events, profile: organizerPayoutProfiles }).from(routePayoutAllocations)
      .innerJoin(eventRegistrations, eq(routePayoutAllocations.registrationId, eventRegistrations.id))
      .innerJoin(events, eq(eventRegistrations.eventId, events.id))
      .innerJoin(organizerPayoutProfiles, eq(routePayoutAllocations.payoutProfileId, organizerPayoutProfiles.id))
      .where(eq(routePayoutAllocations.organizationId, organizationId))
      .orderBy(desc(routePayoutAllocations.createdAt))
      .limit(requested.limit)
      .offset((page - 1) * requested.limit);
    const items = await mapWithConcurrency(rows, 4, async ({ allocation, registration, event, profile }) => {
      const localTransferStatus = allocation.status === "settled" ? "processed" : allocation.status;
      const localSettlementStatus = allocation.status === "settled"
        ? "settled"
        : allocation.status === "processed" ? "settlement_pending"
        : allocation.status === "captured" ? "transfer_pending"
        : allocation.status;
      const base = {
        id: allocation.id,
        eventName: event.name,
        bookingId: registration.bookingId,
        netAmount: allocation.amount,
        transferStatus: localTransferStatus,
        settlementStatus: localSettlementStatus,
        transferId: allocation.razorpayTransferId,
        sourceId: null as string | null,
        recipientId: null as string | null,
        amount: null as number | null,
        providerCreatedAt: null as string | null,
        createdAt: allocation.createdAt,
        providerTransferStatus: null as string | null,
        providerSettlementStatus: null as string | null,
        orderTransferred: allocation.razorpayTransferId ? null as boolean | null : false,
        providerSyncStatus: allocation.razorpayTransferId ? "unavailable" : "not_transferred",
        razorpayOrderId: allocation.razorpayOrderId,
        razorpayTransferId: allocation.razorpayTransferId,
        failureReason: allocation.status === "failed" ? "Razorpay marked this organizer transfer as failed." : null,
      };

      if (!allocation.razorpayTransferId || !isValidRazorpayProviderId(allocation.razorpayTransferId, "trf_")) return base;
      const details = await lookupSafeRouteTransfer({
        transferId: allocation.razorpayTransferId,
        amount: allocation.amount,
        allocationId: allocation.id,
        recipientId: profile.razorpayAccountId,
      }, async transferId => {
        const response = await razorpay(`/transfers/${encodeURIComponent(transferId)}`, { method: "GET" });
        if (!response.ok) throw new Error("Razorpay transfer lookup unavailable");
        return response.json();
      });
      if (!details) return base;
      return {
        ...base,
        transferId: details.transferId,
        sourceId: details.sourceId,
        recipientId: details.recipientId,
        amount: details.amount,
        providerCreatedAt: details.createdAt,
        createdAt: details.createdAt || allocation.createdAt,
        transferStatus: details.transferStatus || localTransferStatus,
        settlementStatus: details.settlementStatus || localSettlementStatus,
        providerTransferStatus: details.transferStatus,
        providerSettlementStatus: details.settlementStatus,
        orderTransferred: details.orderTransferred,
        providerSyncStatus: "synced",
      };
    });
    return res.json({
      totals: {
        gross: Number(totalsRow?.gross || 0),
        transferred: Number(totalsRow?.transferred || 0),
        settled: Number(totalsRow?.settled || 0),
        refunded: Number(totalsRow?.refunded || 0),
      },
      pagination: { page, limit: requested.limit, total, totalPages },
      items,
    });
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
      const nextStatus = profileStatus(account);
      const [updated] = await db.update(organizerPayoutProfiles).set({
        status: nextStatus,
        productStatus,
        productStatusReason,
        lastReconciledAt: new Date(),
        statusReason: isRouteProfileActive({ status: nextStatus, productStatus })
          ? null
          : profile.statusReason === "settlement_submitted" ? "settlement_submitted" : null,
        updatedAt: new Date(),
      }).where(eq(organizerPayoutProfiles.id, profile.id)).returning();
      await writeAudit(req, { action: "route_payout_profile_reconciled", targetType: "organization", targetId: organizationId, diff: { status: updated.status } });
      // Reconcile linked account state and each known transfer so history
      // reflects settlement/reversal changes without retaining provider payloads.
      const allocations = await db.select().from(routePayoutAllocations).where(eq(routePayoutAllocations.organizationId, organizationId));
      for (const allocation of allocations) {
        if (!allocation.razorpayTransferId || ["reversed", "refunded"].includes(allocation.status)) continue;
        const transferRes = await razorpay(`/transfers/${encodeURIComponent(allocation.razorpayTransferId)}`, { method: "GET" });
        if (transferRes.ok) {
          const transfer: any = await transferRes.json();
          await applyVerifiedTransferEntity(transfer);
        }
      }
      return res.json({ profile: payoutProfileView(updated) });
    } catch { return res.status(503).json({ error: "Payout reconciliation unavailable" }); }
  };
  app.post("/api/admin/payouts/recover-linked-account", async (req, res) => {
    if (!isSuperAdminRequest(req)) return res.status(403).json({ error: "Platform administrator required" });
    const organizationId = typeof req.body?.organizationId === "string" ? req.body.organizationId.trim() : "";
    const accountId = typeof req.body?.accountId === "string" ? req.body.accountId.trim() : "";
    if (!organizationId || !isValidRazorpayProviderId(accountId, "acc_")) {
      return res.status(400).json({ error: "Valid organization and Razorpay account IDs are required" });
    }
    try {
      const [pending] = await db.select().from(organizerPayoutProfiles)
        .where(and(
          eq(organizerPayoutProfiles.organizationId, organizationId),
          eq(organizerPayoutProfiles.statusReason, ROUTE_INTENT_LINKED_ACCOUNT),
        )).limit(1);
      if (!pending) return res.status(409).json({ error: "No unresolved linked-account request exists for this organization" });

      const provider = await razorpay(`/v2/accounts/${encodeURIComponent(accountId)}`, { method: "GET" });
      if (!provider.ok) return res.status(502).json({ error: "Razorpay account verification failed" });
      const account: any = await provider.json();
      const identityMatches =
        account?.id === accountId &&
        String(account?.legal_business_name || "").trim().toLowerCase() === String(pending.businessName || "").trim().toLowerCase() &&
        String(account?.email || "").trim().toLowerCase() === String(pending.email || "").trim().toLowerCase() &&
        String(account?.phone || "").replace(/\D/g, "").endsWith(String(pending.phoneLast4 || ""));
      if (!identityMatches) return res.status(409).json({ error: "The selected Razorpay account does not match the pending organizer" });

      const [recovered] = await db.update(organizerPayoutProfiles).set({
        razorpayAccountId: accountId,
        status: profileStatus(account),
        statusReason: null,
        lastReconciledAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(organizerPayoutProfiles.organizationId, organizationId),
        eq(organizerPayoutProfiles.statusReason, ROUTE_INTENT_LINKED_ACCOUNT),
      )).returning();
      if (!recovered) return res.status(409).json({ error: "The pending request was already resolved" });
      await writeAudit(req, {
        action: "route_linked_account_recovered",
        targetType: "organizer_payout_profile",
        targetId: organizationId,
        diff: { accountId },
      });
      return res.json({ success: true, profile: payoutProfileView(recovered) });
    } catch {
      return res.status(503).json({ error: "Linked-account recovery is unavailable" });
    }
  });

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
      .where(and(eq(routePayoutAllocations.id, allocation.id), inArray(routePayoutAllocations.status, ["captured", "processed", "settled"]))).returning();
    if (!reserved) return res.status(409).json({ error: "Allocation is already being refunded, reversed, or is ineligible" });
    try {
      const provider = await razorpay(`/transfers/${encodeURIComponent(allocation.razorpayTransferId)}/reversals`, { method: "POST", body: JSON.stringify({ amount: allocation.amount }), headers: { "X-Razorpay-Idempotency-Key": routeMoneyMovementKey("reversal", allocation.id) } });
      if (!provider.ok) {
        await db.update(routePayoutAllocations).set({ status: allocation.status, updatedAt: new Date() }).where(eq(routePayoutAllocations.id, allocation.id));
        return res.status(502).json({ error: "Razorpay reversal failed" });
      }
      const reversal: any = await provider.json();
      await db.update(routePayoutAllocations).set({ status: "reversed", reversalId: reversal.id || null, updatedAt: new Date() }).where(eq(routePayoutAllocations.id, allocation.id));
      await writeAudit(req, { action: "route_transfer_reversed", targetType: "route_allocation", targetId: allocation.id, diff: { amount: allocation.amount, reversalId: reversal.id || null } });
      return res.json({ success: true });
    } catch {
      await db.update(routePayoutAllocations).set({ status: allocation.status, updatedAt: new Date() }).where(eq(routePayoutAllocations.id, allocation.id));
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
        .where(and(eq(routePayoutAllocations.id, allocation.id), inArray(routePayoutAllocations.status, ["captured", "processed", "settled"]))).returning();
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
          await db.update(routePayoutAllocations).set({ status: allocation.status, updatedAt: new Date() }).where(eq(routePayoutAllocations.id, allocation.id));
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
        await db.update(routePayoutAllocations).set({ status: allocation.status, updatedAt: new Date() }).where(eq(routePayoutAllocations.id, allocation.id));
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
      const eventType = String(payload?.event || "");
      let outcome: WebhookProcessResult = "ignored";
      if (eventType === "payment.captured") {
        // Payload only supplies lookup ids. recoverCapturedPayment independently
        // fetches order + payment and verifies every binding before issuing.
        const paymentId = String(payload?.payload?.payment?.entity?.id || "");
        const orderId = String(payload?.payload?.payment?.entity?.order_id || "");
        outcome = paymentId && orderId ? await recoverCapturedPayment(orderId, paymentId) : "failed";
      } else if (eventType === "transfer.processed" || eventType === "transfer.failed") {
        const transferId = String(payload?.payload?.transfer?.entity?.id || "");
        outcome = await reconcileTransferWebhook(transferId, eventType);
      } else if (eventType === "settlement.processed") {
        const settlementId = String(payload?.payload?.settlement?.entity?.id || "");
        outcome = await reconcileSettlementWebhook(settlementId);
      }
      await db.update(razorpayWebhookReceipts).set({
        status: outcome === "failed" ? "recovery_failed" : outcome,
        processedAt: new Date(),
        errorCode: outcome === "failed" ? "provider_verification_failed" : null,
      }).where(eq(razorpayWebhookReceipts.id, claimed.id));
      return res.status(200).json({ received: true });
    } catch { return res.status(503).json({ error: "Webhook receipt unavailable" }); }
  });
}