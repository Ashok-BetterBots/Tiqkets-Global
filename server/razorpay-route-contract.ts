import crypto from "crypto";
import { EVENT_ROUTE_BUSINESS_PROFILE } from "@shared/razorpay-onboarding";

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
    // Provider diagnostic text may have been written by older versions. Never
    // expose it; the dashboard uses safe generic activation guidance instead.
    lastReconciledAt: profile.lastReconciledAt || null, statusReason: null,
    productStatus: profile.productStatus || null, productStatusReason: null,
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
  const phone = String(b.phone || b.contact_phone || "").replace(/\D/g, "");
  const contact = String(b.contactName || b.contact_name || legal).trim();
  const profile = b.profile && typeof b.profile === "object" && !Array.isArray(b.profile) ? b.profile as Record<string, unknown> : null;
  const businessType = String(b.business_type || "").trim();
  const bank = b.bank_account && typeof b.bank_account === "object" && !Array.isArray(b.bank_account) ? b.bank_account as Record<string, unknown> : null;
  const legalInfo = b.legal_info && typeof b.legal_info === "object" && !Array.isArray(b.legal_info) ? b.legal_info as Record<string, unknown> : {};
  const registeredAddress = profile?.addresses && typeof profile.addresses === "object" && !Array.isArray(profile.addresses)
    ? (profile.addresses as Record<string, unknown>).registered : null;
  if (!legal || !display || !email || !phone || !profile || !bank || !businessType) return { ok: false, error: "Missing required linked-account fields" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Invalid email" };
  if (legal.length < 4 || legal.length > 200 || display.length > 255 || contact.length < 4 || contact.length > 255) return { ok: false, error: "Business and contact names must meet Razorpay's length requirements" };
  if (!/^\d{8,15}$/.test(phone)) return { ok: false, error: "Enter a valid business phone number with country code, using 8–15 digits" };
  if (!["individual", "proprietorship", "partnership", "private_limited", "public_limited", "llp", "trust", "society", "ngo", "other", "not_yet_registered", "educational_institutes"].includes(businessType)) return { ok: false, error: "Invalid business type" };
  if (!registeredAddress || typeof registeredAddress !== "object" || Array.isArray(registeredAddress)) return { ok: false, error: "Registered business address is required" };
  const address = registeredAddress as Record<string, unknown>;
  const businessModel = String(profile.business_model || "").trim();
  const street1 = String(address.street1 || "").trim();
  const city = String(address.city || "").trim();
  const state = String(address.state || "").trim();
  const postalCode = String(address.postal_code || "").replace(/\s/g, "");
  if (!businessModel || businessModel.length > 255 || !street1 || street1.length > 100 || !city || !state || !/^\d{6}$/.test(postalCode)) {
    return { ok: false, error: "Complete the business description and registered address with a six-digit postal code" };
  }
  const accountNumber = String(bank.account_number || "").replace(/\s/g, "");
  const ifscCode = String(bank.ifsc_code || bank.ifsc || "").trim().toUpperCase();
  const beneficiaryName = String(bank.beneficiary_name || "").trim();
  if (!beneficiaryName || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode) || accountNumber.length < 5 || accountNumber.length > 35) return { ok: false, error: "Enter a valid beneficiary name, bank account number, and IFSC" };
  if (bank.confirm_account_number && String(bank.confirm_account_number).replace(/\s/g, "") !== String(bank.account_number).replace(/\s/g, "")) {
    return { ok: false, error: "Bank account numbers do not match" };
  }
  if (b.tnc_accepted !== true) return { ok: false, error: "Accept the Razorpay Route terms before submitting payout setup" };
  // Return transit-only normalized data. Bank and PAN values are mapped to
  // their specific Route product/stakeholder requests and never persisted.
  return { ok: true, value: {
    legal_business_name: legal, customer_facing_business_name: display,
    type: "route", email, business_type: businessType, phone,
    profile: {
      category: EVENT_ROUTE_BUSINESS_PROFILE.category,
      subcategory: EVENT_ROUTE_BUSINESS_PROFILE.subcategory,
      business_model: businessModel,
      addresses: { registered: { street1, city, state, postal_code: postalCode, country: "IN" } },
    },
    bank_account: { account_number: accountNumber, ifsc_code: ifscCode, beneficiary_name: beneficiaryName },
    legal_info: { pan: String(legalInfo.pan || "").trim().toUpperCase() },
    tnc_accepted: true, contact_name: contact,
    businessName: legal, contactName: contact, accountType: "route",
  } };
}

/** Build documented Route requests while keeping sensitive fields transit-only. */
export function buildRouteOnboardingPayloads(value: Record<string, unknown>) {
  const phone = Number(value.phone);
  const bank = value.bank_account as Record<string, string>;
  const pan = String((value.legal_info as Record<string, unknown> | undefined)?.pan || "");
  const accountBase = {
    phone,
    legal_business_name: value.legal_business_name,
    customer_facing_business_name: value.customer_facing_business_name,
    profile: value.profile,
    contact_name: value.contact_name,
  };
  return {
    accountCreate: { ...accountBase, type: "route", email: value.email, business_type: value.business_type },
    // Razorpay does not permit changing a linked account's email or business
    // type. Excluding them makes an interrupted setup safely retryable.
    accountUpdate: accountBase,
    stakeholder: {
      name: value.contact_name,
      email: value.email,
      phone: { primary: String(value.phone) },
      percentage_ownership: 100,
      relationship: { executive: true },
      ...(pan ? { kyc: { pan } } : {}),
    },
    productRequest: { product_name: "route", tnc_accepted: true },
    productUpdate: {
      tnc_accepted: true,
      settlements: {
        account_number: bank.account_number,
        ifsc_code: bank.ifsc_code,
        beneficiary_name: bank.beneficiary_name,
      },
    },
  };
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