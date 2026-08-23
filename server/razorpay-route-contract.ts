import crypto from "crypto";

export const SENSITIVE_PAYOUT_KEYS = /(?:bank|account_number|ifsc|pan|gst|tax|beneficiar)/i;

export type SafePayoutProfile = {
  organizationId: string; razorpayAccountId: string; status: string;
  accountType: string | null; businessName: string | null; contactName: string | null;
  email: string | null; phoneLast4: string | null; lastReconciledAt?: Date | null;
  statusReason?: string | null;
  productStatus?: string | null; productStatusReason?: string | null;
};

export function redactPayoutValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPayoutValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([key, val]) => [key, SENSITIVE_PAYOUT_KEYS.test(key) ? "[REDACTED]" : redactPayoutValue(val)]));
}

export function safePayoutProfile(profile: SafePayoutProfile) {
  return {
    organizationId: profile.organizationId, accountId: profile.razorpayAccountId,
    status: profile.status, accountType: profile.accountType,
    businessName: profile.businessName, contactName: profile.contactName,
    email: profile.email, phoneLast4: profile.phoneLast4,
    lastReconciledAt: profile.lastReconciledAt || null, statusReason: profile.statusReason || null,
    productStatus: profile.productStatus || null, productStatusReason: profile.productStatusReason || null,
  };
}

export function validateOnboardingInput(body: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Invalid onboarding request" };
  const b = body as Record<string, unknown>;
  // Dashboard sends Razorpay's documented nested linked-account form. Legacy
  // aliases are accepted without weakening validation during rollout.
  const legal = String(b.legal_business_name || b.businessName || "").trim();
  const display = String(b.customer_facing_business_name || b.businessName || "").trim();
  const email = String(b.email || b.contact_email || "").trim();
  const phone = String(b.phone || b.contact_phone || "").trim();
  const contact = String(b.contactName || b.contact_name || legal).trim();
  const profile = b.profile && typeof b.profile === "object" && !Array.isArray(b.profile) ? b.profile as Record<string, unknown> : null;
  const businessType = String(b.business_type || "").trim();
  const bank = b.bank_account && typeof b.bank_account === "object" && !Array.isArray(b.bank_account) ? b.bank_account as Record<string, unknown> : null;
  if (!legal || !display || !email || !phone || !profile || !bank || !businessType) return { ok: false, error: "Missing required linked-account fields" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Invalid email" };
  if (!["individual", "proprietorship", "partnership", "private_limited", "public_limited", "llp", "trust", "society"].includes(businessType)) return { ok: false, error: "Invalid business type" };
  if (!String(profile.category || "").trim() || !String(profile.address || profile.addresses || "").trim()) return { ok: false, error: "Profile category and address are required" };
  if (!String(bank.account_number || "").trim() || !String(bank.ifsc_code || bank.ifsc || "").trim()) return { ok: false, error: "Bank account number and IFSC are required" };
  if (bank.confirm_account_number && String(bank.confirm_account_number).replace(/\s/g, "") !== String(bank.account_number).replace(/\s/g, "")) {
    return { ok: false, error: "Bank account numbers do not match" };
  }
  // Return a transit-only v2 linked-account request. bank_account/PAN/GST are
  // intentionally retained only in this ephemeral provider request object.
  return { ok: true, value: {
    legal_business_name: legal, customer_facing_business_name: display,
    type: "route", email, business_type: businessType, phone, profile, bank_account: bank,
    legal_info: b.legal_info, apps: b.apps, contact_name: contact,
    businessName: legal, contactName: contact, accountType: "route",
  } };
}

export function verifyRazorpaySignature(rawBody: Buffer | string, signature: string | undefined, secret: string | undefined): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export function validatePaise(amount: unknown): amount is number {
  return typeof amount === "number" && Number.isSafeInteger(amount) && amount > 0;
}

/** Stable provider idempotency keys; never derive these from customer data. */
export function routeOrderIdempotencyKey(allocationId: string): string {
  return `route-order:${allocationId}`;
}
export function routeMoneyMovementKey(kind: "refund" | "reversal", allocationId: string): string {
  return `route-${kind}:${allocationId}`;
}
/**
 * The initial Route ledger stores one refund/reversal per ticket allocation.
 * Restricting this endpoint to a full refund prevents a partial customer refund
 * from being represented as a fully reversed organizer payout.
 */
export function isFullRouteRefundAmount(requestedAmount: unknown, allocationAmount: number): boolean {
  return validatePaise(requestedAmount) && requestedAmount === allocationAmount;
}
export function canReclaimWebhookReceipt(status: string | null | undefined, processedAt: Date | null | undefined, now = Date.now()): boolean {
  return status === "recovery_failed" || status === "received" ||
    (status === "processing" && (!processedAt || now - processedAt.getTime() > 5 * 60_000));
}

/** Webhook recovery must never treat a captured-but-unissued ticket as done. */
export function paymentRecoveryDisposition(registrationStatus: string): "terminal" | "issue_ticket" | "verify_payment" | "reject" {
  if (["ticket_generated", "arrived", "checked_in", "exited", "feedback_submitted"].includes(registrationStatus)) return "terminal";
  if (registrationStatus === "payment_completed") return "issue_ticket";
  if (registrationStatus === "registration_started") return "verify_payment";
  return "reject";
}