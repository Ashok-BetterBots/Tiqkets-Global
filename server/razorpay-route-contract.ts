import crypto from "crypto";
import { EVENT_ROUTE_BUSINESS_PROFILE, RAZORPAY_BUSINESS_CATEGORIES } from "@shared/razorpay-onboarding";

export const SENSITIVE_PAYOUT_KEYS = /(?:bank|account_number|ifsc|pan|gst|tax|beneficiar)/i;
const ROUTE_DIAGNOSTIC_REDACTION_KEYS = /(?:bank|account_number|ifsc|pan|gst|tax|beneficiar|email|phone|contact|legal_business|street|city|state|postal|reference|^name$)/i;

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

/**
 * Keep Route request shape visible in diagnostics without logging organizer
 * identity, address, tax, banking, or provider-reference values.
 */
export function redactRouteDiagnosticPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactRouteDiagnosticPayload);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([key, val]) => [key, ROUTE_DIAGNOSTIC_REDACTION_KEYS.test(key) ? "[REDACTED]" : redactRouteDiagnosticPayload(val)]));
}

/** Razorpay provider IDs must be non-empty, bounded identifiers, never objects. */
export function isValidRazorpayProviderId(value: unknown, requiredPrefix?: string): value is string {
  return typeof value === "string" &&
    value.length >= 4 &&
    value.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(value) &&
    (!requiredPrefix || value.startsWith(requiredPrefix));
}

export function safePayoutProfile(profile: SafePayoutProfile) {
  return {
    organizationId: profile.organizationId, accountId: profile.razorpayAccountId,
    stakeholderId: (profile as SafePayoutProfile & { providerStakeholderId?: string | null }).providerStakeholderId || null,
    status: profile.status, accountType: profile.accountType,
    businessName: profile.businessName, contactName: profile.contactName,
    email: profile.email, phoneLast4: profile.phoneLast4,
    // Provider diagnostic text may have been written by older versions. Never
    // expose it; the dashboard uses safe generic activation guidance instead.
    lastReconciledAt: profile.lastReconciledAt || null, statusReason: null,
    productStatus: profile.productStatus || null, productStatusReason: null,
  };
}

type RouteAddress = {
  street1: string;
  street2: string;
  city: string;
  state: string;
  postal_code: string;
  country: "IN";
};

export type LinkedAccountInput = {
  type: "route";
  legal_business_name: string;
  email: string;
  phone: string;
  contact_name: string;
  business_type: string;
  profile: { category: string; subcategory: string; addresses: { registered: RouteAddress } };
  legal_info: { pan: string; gst: string };
  tnc_accepted: true;
};

export type StakeholderInput = {
  email: string;
  phone: string;
  contact_name: string;
};

export type SettlementInput = {
  bank_account: { account_number: string; ifsc_code: string; beneficiary_name: string };
  tnc_accepted: true;
};

export type AccountUpdateInput = {
  legal_business_name: string;
  email: string;
  profile: { addresses: { registered: RouteAddress } };
};

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function parseBody(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
}

function parseRegisteredAddress(profile: Record<string, unknown> | null): ValidationResult<RouteAddress> {
  const registeredAddress = profile?.addresses && typeof profile.addresses === "object" && !Array.isArray(profile.addresses)
    ? (profile.addresses as Record<string, unknown>).registered : null;
  if (!registeredAddress || typeof registeredAddress !== "object" || Array.isArray(registeredAddress)) {
    return { ok: false, error: "Registered business address is required" };
  }
  const address = registeredAddress as Record<string, unknown>;
  const street1 = String(address.street1 || "").trim();
  const street2 = String(address.street2 || "").trim();
  const city = String(address.city || "").trim();
  const state = String(address.state || "").trim().toUpperCase();
  const postalCode = String(address.postal_code || "").replace(/\s/g, "");
  if (!street1) return { ok: false, error: "Registered address line 1 is required" };
  if (street1.length > 100) return { ok: false, error: "Registered address line 1 must be 100 characters or fewer" };
  if (!street2) return { ok: false, error: "Registered address line 2 is required" };
  if (street2.length > 100) return { ok: false, error: "Registered address line 2 must be 100 characters or fewer" };
  if (!city) return { ok: false, error: "Registered address city is required" };
  if (!state) return { ok: false, error: "Registered address state is required" };
  if (!/^\d{6}$/.test(postalCode)) return { ok: false, error: "Registered address postal code must contain exactly 6 digits" };
  return { ok: true, value: { street1, street2, city, state, postal_code: postalCode, country: "IN" } };
}

function parseBusinessProfile(profile: Record<string, unknown>): ValidationResult<{ category: string; subcategory: string }> {
  const submittedCategory = String(profile.category || "").trim();
  const submittedSubcategory = String(profile.subcategory || "").trim();
  // Older clients did not expose these selectors. Keep their event-ticketing
  // default, but never repair a partial or mismatched explicit selection.
  const usesDefault = (!submittedCategory && !submittedSubcategory) ||
    (submittedCategory === "events_and_entertainment" && submittedSubcategory === "event_management");
  const category = usesDefault ? EVENT_ROUTE_BUSINESS_PROFILE.category : submittedCategory;
  const subcategory = usesDefault ? EVENT_ROUTE_BUSINESS_PROFILE.subcategory : submittedSubcategory;
  const categoryDefinition = RAZORPAY_BUSINESS_CATEGORIES.find(item => item.value === category);
  if (!categoryDefinition || !categoryDefinition.subcategories.some(item => item.value === subcategory)) {
    return { ok: false, error: "Choose a valid Razorpay business category and matching subcategory" };
  }
  return { ok: true, value: { category, subcategory } };
}

export function validateLinkedAccountInput(body: unknown): ValidationResult<LinkedAccountInput> {
  const b = parseBody(body);
  if (!b) return { ok: false, error: "Invalid linked-account request" };
  const legal = String(b.legal_business_name || b.businessName || "").trim();
  const email = String(b.email || b.contact_email || "").trim();
  const phone = String(b.phone || b.contact_phone || "").replace(/\D/g, "");
  const contact = String(b.contact_name || b.contactName || "").trim();
  const profile = b.profile && typeof b.profile === "object" && !Array.isArray(b.profile) ? b.profile as Record<string, unknown> : null;
  const businessType = String(b.business_type || "").trim();
  const legalInfo = b.legal_info && typeof b.legal_info === "object" && !Array.isArray(b.legal_info) ? b.legal_info as Record<string, unknown> : {};
  if (!legal) return { ok: false, error: "Legal business name is required" };
  if (legal.length < 4 || legal.length > 200) return { ok: false, error: "Legal business name must contain 4–200 characters" };
  if (!/^[A-Za-z0-9 ]+$/.test(legal)) return { ok: false, error: "Legal business name may contain only letters, numbers, and spaces" };
  if (!email) return { ok: false, error: "Business email is required" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Business email must be a valid email address" };
  if (!phone) return { ok: false, error: "Business phone is required" };
  const nationalPhone = phone.startsWith("91") && phone.length === 12 ? phone.slice(2) : phone;
  if (!/^\d{8,15}$/.test(nationalPhone)) return { ok: false, error: "Business phone must contain 8–15 digits without the +91 country code" };
  if (!contact) return { ok: false, error: "Account contact name is required" };
  if (contact.length < 4 || contact.length > 255) return { ok: false, error: "Account contact name must contain 4–255 characters" };
  if (!/^[A-Za-z][A-Za-z0-9 .'-]*$/.test(contact)) return { ok: false, error: "Account contact name contains unsupported characters" };
  if (!profile) return { ok: false, error: "Razorpay business category, subcategory, and registered address are required" };
  if (!businessType) return { ok: false, error: "Business type is required" };
  if (!["individual", "proprietorship", "partnership", "private_limited", "public_limited", "llp", "trust", "society", "ngo", "other", "not_yet_registered", "educational_institutes"].includes(businessType)) return { ok: false, error: "Business type is not accepted by Razorpay" };
  const address = parseRegisteredAddress(profile);
  if (!address.ok) return address;
  const businessProfile = parseBusinessProfile(profile);
  if (!businessProfile.ok) return businessProfile;
  if (b.tnc_accepted !== true) return { ok: false, error: "Accept the Razorpay Route terms before submitting payout setup" };
  const pan = String(legalInfo.pan || "").trim().toUpperCase();
  const gst = String(legalInfo.gst || "").trim().toUpperCase();
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan)) return { ok: false, error: "PAN must use the 10-character format ABCDE1234F" };
  if (gst && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d][Z][A-Z\d]$/.test(gst)) return { ok: false, error: "GST identification number must use the 15-character GSTIN format" };
  return {
    ok: true,
    value: {
      type: "route",
      legal_business_name: legal,
      email,
      phone,
      contact_name: contact,
      business_type: businessType,
      profile: { category: businessProfile.value.category, subcategory: businessProfile.value.subcategory, addresses: { registered: address.value } },
      legal_info: { pan, gst },
      tnc_accepted: true,
    },
  };
}

export function validateStakeholderInput(body: unknown): ValidationResult<StakeholderInput> {
  const b = parseBody(body);
  if (!b) return { ok: false, error: "Invalid stakeholder request" };
  const email = String(b.email || b.contact_email || "").trim();
  const phone = String(b.phone || b.contact_phone || "").replace(/\D/g, "");
  const contact = String(b.contact_name || b.contactName || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Enter a valid account-contact email" };
  if (!/^\d{8,15}$/.test(phone)) return { ok: false, error: "Enter an account-contact phone number with country code, using 8–15 digits" };
  if (contact.length < 4 || contact.length > 255) return { ok: false, error: "Enter the authorized account contact name" };
  return { ok: true, value: { email, phone, contact_name: contact } };
}

export function validateSettlementInput(body: unknown): ValidationResult<SettlementInput> {
  const b = parseBody(body);
  if (!b) return { ok: false, error: "Invalid settlement request" };
  const bank = b.bank_account && typeof b.bank_account === "object" && !Array.isArray(b.bank_account) ? b.bank_account as Record<string, unknown> : null;
  if (!bank) return { ok: false, error: "Bank account details are required" };
  const accountNumber = String(bank.account_number || "").replace(/\s/g, "");
  const ifscCode = String(bank.ifsc_code || bank.ifsc || "").trim().toUpperCase();
  const beneficiaryName = String(bank.beneficiary_name || "").trim();
  if (!beneficiaryName || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode) || accountNumber.length < 5 || accountNumber.length > 35) {
    return { ok: false, error: "Enter a valid beneficiary name, bank account number, and IFSC" };
  }
  if (bank.confirm_account_number && String(bank.confirm_account_number).replace(/\s/g, "") !== accountNumber) {
    return { ok: false, error: "Bank account numbers do not match" };
  }
  if (b.tnc_accepted !== true) return { ok: false, error: "Accept the Razorpay Route terms before submitting settlement details" };
  return { ok: true, value: { bank_account: { account_number: accountNumber, ifsc_code: ifscCode, beneficiary_name: beneficiaryName }, tnc_accepted: true } };
}

export function validateAccountUpdateInput(body: unknown): ValidationResult<AccountUpdateInput> {
  const b = parseBody(body);
  if (!b) return { ok: false, error: "Invalid linked-account update request" };
  const legal = String(b.legal_business_name || b.businessName || "").trim();
  const email = String(b.email || b.contact_email || "").trim();
  const profile = b.profile && typeof b.profile === "object" && !Array.isArray(b.profile) ? b.profile as Record<string, unknown> : null;
  if (legal.length < 4 || legal.length > 200) return { ok: false, error: "Enter the legal business name (4–200 characters)" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Enter a valid business email" };
  const address = parseRegisteredAddress(profile);
  if (!address.ok) return address;
  return { ok: true, value: { legal_business_name: legal, email, profile: { addresses: { registered: address.value } } } };
}

/** @deprecated Use the stage-specific validators for Route onboarding. */
export function validateOnboardingInput(body: unknown): ValidationResult<LinkedAccountInput & SettlementInput> {
  const account = validateLinkedAccountInput(body);
  if (!account.ok) return account;
  const settlement = validateSettlementInput(body);
  if (!settlement.ok) return settlement;
  return { ok: true, value: { ...account.value, ...settlement.value } };
}

export function buildLinkedAccountPayload(value: LinkedAccountInput) {
  const nationalPhone = value.phone.startsWith("91") && value.phone.length === 12 ? value.phone.slice(2) : value.phone;
  return {
    // Razorpay's v2 account onboarding example expects the Indian national
    // number without the +91 country code.
    phone: nationalPhone,
    legal_business_name: value.legal_business_name,
    profile: value.profile,
    contact_name: value.contact_name,
    type: "route",
    email: value.email,
    business_type: value.business_type,
    legal_info: { pan: value.legal_info.pan, ...(value.legal_info.gst ? { gst: value.legal_info.gst } : {}) },
  };
}

export function buildLinkedAccountUpdatePayload(value: AccountUpdateInput) {
  return {
    email: value.email,
    legal_business_name: value.legal_business_name,
    profile: { addresses: { operation: value.profile.addresses.registered } },
  };
}

export function buildStakeholderPayload(value: StakeholderInput) {
  const stakeholderPhone = value.phone.startsWith("91") && value.phone.length === 12 ? value.phone.slice(2) : value.phone;
  return {
    name: value.contact_name,
    email: value.email,
    phone: { primary: stakeholderPhone },
    percentage_ownership: 100,
    relationship: { executive: true, director: true },
  };
}

export function buildRouteProductRequestPayload() {
  return { product_name: "route", tnc_accepted: true };
}

export function buildRouteProductUpdatePayload(value: SettlementInput) {
  return {
    tnc_accepted: true,
    settlements: {
      account_number: value.bank_account.account_number,
      ifsc_code: value.bank_account.ifsc_code,
      beneficiary_name: value.bank_account.beneficiary_name,
    },
  };
}

/** Every paid event order routes its full ticket amount to the organizer account. */
export function buildRouteOrderPayload(input: {
  allocationId: string;
  registrationId: string;
  eventId: string;
  accountId: string;
  amount: number;
}) {
  return {
    amount: input.amount,
    currency: "INR",
    receipt: `route_${input.allocationId.slice(0, 20)}`,
    notes: {
      type: "event_route",
      allocationId: input.allocationId,
      registrationId: input.registrationId,
      eventId: input.eventId,
    },
    transfers: [{
      account: input.accountId,
      amount: input.amount,
      currency: "INR",
      notes: { allocationId: input.allocationId },
    }],
  };
}

export function buildRouteOnboardingPayloads(value: LinkedAccountInput & SettlementInput) {
  return {
    accountCreate: buildLinkedAccountPayload(value),
    stakeholder: buildStakeholderPayload(value),
    productRequest: buildRouteProductRequestPayload(),
    productUpdate: buildRouteProductUpdatePayload(value),
  };
}

/* Legacy all-at-once validation retained for focused contract coverage. */
function legacyValidateOnboardingInput(body: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Invalid onboarding request" };
  const b = body as Record<string, unknown>;
  // Dashboard sends Razorpay's documented nested linked-account form. Legacy
  // aliases are accepted without weakening validation during rollout.
  const legal = String(b.legal_business_name || b.businessName || "").trim();
  const email = String(b.email || b.contact_email || "").trim();
  const phone = String(b.phone || b.contact_phone || "").replace(/\D/g, "");
  const contact = String(b.contact_name || b.contactName || "").trim();
  const profile = b.profile && typeof b.profile === "object" && !Array.isArray(b.profile) ? b.profile as Record<string, unknown> : null;
  const businessType = String(b.business_type || "").trim();
  const bank = b.bank_account && typeof b.bank_account === "object" && !Array.isArray(b.bank_account) ? b.bank_account as Record<string, unknown> : null;
  const legalInfo = b.legal_info && typeof b.legal_info === "object" && !Array.isArray(b.legal_info) ? b.legal_info as Record<string, unknown> : {};
  const registeredAddress = profile?.addresses && typeof profile.addresses === "object" && !Array.isArray(profile.addresses)
    ? (profile.addresses as Record<string, unknown>).registered : null;
  if (!legal || !email || !phone || !profile || !bank || !businessType) return { ok: false, error: "Missing required linked-account fields" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Invalid email" };
  if (legal.length < 4 || legal.length > 200 || contact.length < 4 || contact.length > 255) return { ok: false, error: "Business and contact names must meet Razorpay's length requirements" };
  if (!/^\d{8,15}$/.test(phone)) return { ok: false, error: "Enter a valid business phone number with country code, using 8–15 digits" };
  if (!["individual", "proprietorship", "partnership", "private_limited", "public_limited", "llp", "trust", "society", "ngo", "other", "not_yet_registered", "educational_institutes"].includes(businessType)) return { ok: false, error: "Invalid business type" };
  if (!registeredAddress || typeof registeredAddress !== "object" || Array.isArray(registeredAddress)) return { ok: false, error: "Registered business address is required" };
  const address = registeredAddress as Record<string, unknown>;
  const street1 = String(address.street1 || "").trim();
  const street2 = String(address.street2 || "").trim();
  const city = String(address.city || "").trim();
  const state = String(address.state || "").trim().toUpperCase();
  const postalCode = String(address.postal_code || "").replace(/\s/g, "");
  if (!street1 || !street2 || street1.length > 100 || street2.length > 100 || !city || !state || !/^\d{6}$/.test(postalCode)) {
    return { ok: false, error: "Complete both address lines and the registered address with a six-digit postal code" };
  }
  const businessProfile = parseBusinessProfile(profile);
  if (!businessProfile.ok) return businessProfile;
  const accountNumber = String(bank.account_number || "").replace(/\s/g, "");
  const ifscCode = String(bank.ifsc_code || bank.ifsc || "").trim().toUpperCase();
  const beneficiaryName = String(bank.beneficiary_name || "").trim();
  if (!beneficiaryName || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode) || accountNumber.length < 5 || accountNumber.length > 35) return { ok: false, error: "Enter a valid beneficiary name, bank account number, and IFSC" };
  if (bank.confirm_account_number && String(bank.confirm_account_number).replace(/\s/g, "") !== String(bank.account_number).replace(/\s/g, "")) {
    return { ok: false, error: "Bank account numbers do not match" };
  }
  if (b.tnc_accepted !== true) return { ok: false, error: "Accept the Razorpay Route terms before submitting payout setup" };
  const pan = String(legalInfo.pan || "").trim().toUpperCase();
  const gst = String(legalInfo.gst || "").trim().toUpperCase();
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(pan) || (gst && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d][Z][A-Z\d]$/.test(gst))) {
    return { ok: false, error: "Enter a valid PAN and, if registered for GST, a valid GST identification number" };
  }
  // Return transit-only normalized data. Legal identifiers, bank details, and
  // PAN stakeholder KYC are sent only to their documented Razorpay requests
  // and are never persisted.
  return { ok: true, value: {
    legal_business_name: legal,
    type: "route", email, business_type: businessType, phone,
    profile: {
       category: businessProfile.value.category,
       subcategory: businessProfile.value.subcategory,
      addresses: { registered: { street1, street2, city, state, postal_code: postalCode, country: "IN" } },
    },
    bank_account: { account_number: accountNumber, ifsc_code: ifscCode, beneficiary_name: beneficiaryName },
    legal_info: { pan, gst },
    tnc_accepted: true, contact_name: contact,
    businessName: legal, contactName: contact, accountType: "route",
  } };
}

/** Build documented Route requests while keeping sensitive fields transit-only. */
function legacyBuildRouteOnboardingPayloads(value: Record<string, unknown>) {
  // Keep phone as normalized digits. Razorpay's linked-account examples send
  // this field as a JSON string, and preserving it avoids accidental numeric
  // coercion or formatting changes at the provider boundary.
  const phone = String(value.phone);
  // The linked-account endpoint accepts an international digit string, while
  // Route stakeholder.phone.primary requires an Indian national number of
  // 8–11 digits. All Event Route accounts are registered in India, so strip
  // the +91 country prefix only for that nested stakeholder field.
  const stakeholderPhone = phone.startsWith("91") && phone.length === 12
    ? phone.slice(2)
    : phone;
  const bank = value.bank_account as Record<string, string>;
  const legalInfo = value.legal_info as Record<string, string>;
  const pan = String(legalInfo?.pan || "");
  const accountBase = {
    phone,
    legal_business_name: value.legal_business_name,
    profile: value.profile,
    contact_name: value.contact_name,
  };
  return {
    // Route accounts in this platform configuration reject linked-account
    // reference_id values. Keep the app's internal organizer reference in its
    // own payout-profile record instead of sending it to Razorpay.
    accountCreate: { ...accountBase, type: "route", email: value.email, business_type: value.business_type, legal_info: { pan, ...(legalInfo?.gst ? { gst: String(legalInfo.gst) } : {}) } },
    stakeholder: {
      name: value.contact_name,
      email: value.email,
      phone: { primary: stakeholderPhone },
      percentage_ownership: 100,
      relationship: { executive: true },
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

/**
 * Convert a provider-verified Razorpay transfer entity into the durable status
 * exposed in Ticket Payments. A settlement id is stronger than the transfer's
 * own "processed" state because it confirms the linked-account bank settlement.
 */
export function routeAllocationStatusFromTransferEntity(
  transfer: unknown,
): "processed" | "failed" | "reversed" | "settled" | null {
  if (!transfer || typeof transfer !== "object" || Array.isArray(transfer)) return null;
  const entity = transfer as Record<string, unknown>;
  const settlementStatus = String(entity.settlement_status || "").toLowerCase();
  const recipientSettlementId = String(entity.recipient_settlement_id || "");
  if (recipientSettlementId || settlementStatus === "processed" || settlementStatus === "settled") {
    return "settled";
  }
  const state = String(entity.status || entity.transfer_status || "").toLowerCase();
  if (state === "processed" || state === "failed" || state === "reversed") return state;
  return null;
}