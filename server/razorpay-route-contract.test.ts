import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { buildLinkedAccountPayload, buildRouteOnboardingPayloads, buildRouteOrderPayload, buildRouteProductRequestPayload, buildRouteProductUpdatePayload, buildStakeholderPayload, canReclaimWebhookReceipt, isFullRouteRefundAmount, isValidRazorpayProviderId, paymentRecoveryDisposition, redactPayoutValue, redactRouteDiagnosticPayload, routeMoneyMovementKey, routeOrderIdempotencyKey, safePayoutProfile, validateLinkedAccountInput, validateOnboardingInput, validatePaise, validateSettlementInput, validateStakeholderInput, verifyRazorpaySignature } from "./razorpay-route-contract";
import { payoutProviderMessage, razorpayApiUrl, razorpayFailure, savedRouteProfileIdError } from "./route-payouts";

test("onboarding validation accepts transit-only business request", () => {
  const parsed = validateOnboardingInput({
    legal_business_name: "Venue Pvt Ltd", customer_facing_business_name: "Venue", business_type: "private_limited",
    email: "o@example.com", phone: "+91 98765 43210", contact_name: "Venue Owner", tnc_accepted: true,
    reference_id: "unsupported-for-this-platform", legal_info: { pan: "ABCDE1234F", gst: "22ABCDE1234F1Z5" },
    profile: { category: "events_and_entertainment", subcategory: "event_management", unexpected_bank_hint: "do-not-send", addresses: { registered: { street1: "1 Road", street2: "Hall 2", city: "Pune", state: "Maharashtra", postal_code: "411001", unexpected_pan_hint: "do-not-send" } } },
    bank_account: { beneficiary_name: "Venue Pvt Ltd", account_number: "123456789", ifsc_code: "ABCD0123456" },
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.type, "route");
    assert.equal((parsed.value.profile as any).category, "media_and_entertainment");
    assert.equal((parsed.value.profile as any).subcategory, "ticketing");
    const payloads = buildRouteOnboardingPayloads(parsed.value);
    assert.equal(payloads.accountCreate.phone, "919876543210");
    assert.equal("bank_account" in payloads.accountCreate, false);
    assert.equal("reference_id" in payloads.accountCreate, false);
    assert.equal("customer_facing_business_name" in payloads.accountCreate, false);
    assert.equal("accountUpdate" in payloads, false);
    assert.deepEqual(payloads.accountCreate.legal_info, { pan: "ABCDE1234F", gst: "22ABCDE1234F1Z5" });
    assert.equal(payloads.accountCreate.contact_name, "Venue Owner");
    assert.equal("unexpected_bank_hint" in (payloads.accountCreate.profile as any), false);
    assert.equal("unexpected_pan_hint" in (payloads.accountCreate.profile as any).addresses.registered, false);
    assert.equal("business_model" in (payloads.accountCreate.profile as any), false);
    assert.equal((payloads.accountCreate.profile as any).addresses.registered.street2, "Hall 2");
    assert.deepEqual(payloads.stakeholder.phone, { primary: "9876543210" });
    assert.equal("kyc" in payloads.stakeholder, false);
    assert.deepEqual(payloads.productRequest, { product_name: "route", tnc_accepted: true });
    assert.equal(payloads.productUpdate.settlements.account_number, "123456789");
  }
  assert.equal(validateOnboardingInput({ businessName: "Venue" }).ok, false);
});
test("linked-account form requires the documented contact and legal information", () => {
  const base = {
    legal_business_name: "Venue Pvt Ltd", business_type: "private_limited",
    email: "o@example.com", phone: "919876543210", contact_name: "Venue Owner", tnc_accepted: true,
    legal_info: { pan: "ABCDE1234F", gst: "22ABCDE1234F1Z5" },
    profile: { addresses: { registered: { street1: "1 Road", street2: "Hall 2", city: "Pune", state: "Maharashtra", postal_code: "411001" } } },
    bank_account: { beneficiary_name: "Venue Pvt Ltd", account_number: "123456789", ifsc_code: "ABCD0123456" },
  };
  assert.equal(validateOnboardingInput({ ...base, contact_name: "" }).ok, false);
  assert.equal(validateOnboardingInput({ ...base, profile: { addresses: { registered: { ...base.profile.addresses.registered, street2: "" } } } }).ok, false);
  assert.equal(validateOnboardingInput({ ...base, legal_info: { ...base.legal_info, pan: "" } }).ok, false);
  assert.equal(validateOnboardingInput({ ...base, legal_info: { ...base.legal_info, gst: "invalid" } }).ok, false);
  assert.equal(validateOnboardingInput({ ...base, business_type: "individual", legal_info: { ...base.legal_info, gst: "" } }).ok, true);
});
test("non-GST organizers omit GST from the linked-account provider payload", () => {
  const input = {
    legal_business_name: "Individual Organizer", email: "organizer@example.com", phone: "919876543210",
    contact_name: "Event Host", business_type: "individual", tnc_accepted: true,
    profile: { addresses: { registered: { street1: "1 Road", street2: "Hall 2", city: "Pune", state: "Maharashtra", postal_code: "411001" } } },
    legal_info: { pan: "ABCDE1234F", gst: "" },
    bank_account: { beneficiary_name: "Event Host", account_number: "123456789", ifsc_code: "ABCD0123456" },
  };
  const parsed = validateOnboardingInput(input);
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.deepEqual(buildRouteOnboardingPayloads(parsed.value).accountCreate.legal_info, { pan: "ABCDE1234F" });
});
test("staged Route payloads accept only the fields needed for each saved step", () => {
  const linked = validateLinkedAccountInput({
    legal_business_name: "Venue Pvt Ltd", email: "organizer@example.com", phone: "+91 98765 43210",
    contact_name: "Venue Owner", business_type: "private_limited", tnc_accepted: true,
    profile: { addresses: { registered: { street1: "1 Road", street2: "Hall 2", city: "Pune", state: "Maharashtra", postal_code: "411001" } } },
    legal_info: { pan: "ABCDE1234F", gst: "" },
  });
  assert.equal(linked.ok, true);
  if (linked.ok) {
    const payload = buildLinkedAccountPayload(linked.value);
    assert.equal(payload.type, "route");
    assert.equal("bank_account" in payload, false);
  }
  const stakeholder = validateStakeholderInput({ contact_name: "Venue Owner", email: "organizer@example.com", phone: "+91 98765 43210" });
  assert.equal(stakeholder.ok, true);
  if (stakeholder.ok) assert.deepEqual(buildStakeholderPayload(stakeholder.value).phone, { primary: "9876543210" });
  assert.deepEqual(buildRouteProductRequestPayload(), { product_name: "route", tnc_accepted: true });
  const settlement = validateSettlementInput({ tnc_accepted: true, bank_account: { beneficiary_name: "Venue Pvt Ltd", account_number: "123456789", confirm_account_number: "123456789", ifsc_code: "ABCD0123456" } });
  assert.equal(settlement.ok, true);
  if (settlement.ok) assert.equal("legal_info" in buildRouteProductUpdatePayload(settlement.value), false);
});
test("safe payout profiles expose provider IDs but never payout credentials", () => {
  const safe = safePayoutProfile({
    organizationId: "org_123", razorpayAccountId: "acc_123456", providerStakeholderId: "sth_123456",
    status: "created", accountType: "route", businessName: "Venue Pvt Ltd", contactName: "Venue Owner",
    email: "organizer@example.com", phoneLast4: "3210",
  } as any);
  assert.equal(safe.accountId, "acc_123456");
  assert.equal(safe.stakeholderId, "sth_123456");
  assert.equal("bank_account" in safe, false);
  assert.equal("pan" in safe, false);
});
test("paid event orders transfer the full ticket amount to the linked account", () => {
  const order = buildRouteOrderPayload({
    allocationId: "allocation_123", registrationId: "registration_123", eventId: "event_123",
    accountId: "acc_123456", amount: 49900,
  });
  assert.equal(order.amount, 49900);
  assert.deepEqual(order.transfers, [{
    account: "acc_123456", amount: 49900, currency: "INR", notes: { allocationId: "allocation_123" },
  }]);
});
test("native Ticket Payments form shape satisfies the shared Route contract", () => {
  const mobilePayload = {
    email: "organizer@example.com", phone: "+91 98765 43210", contact_name: "Venue Owner",
    legal_business_name: "Venue Pvt Ltd", business_type: "private_limited", tnc_accepted: true,
    profile: { category: "media_and_entertainment", subcategory: "ticketing", addresses: { registered: { street1: "1 Road", street2: "Hall 2", city: "Pune", state: "Maharashtra", postal_code: "411001", country: "IN" } } },
    legal_info: { pan: "ABCDE1234F", gst: "22ABCDE1234F1Z5" },
    bank_account: { beneficiary_name: "Venue Pvt Ltd", account_type: "savings", account_number: "123456789", confirm_account_number: "123456789", ifsc_code: "ABCD0123456" },
  };
  assert.equal(validateOnboardingInput(mobilePayload).ok, true);
});
test("Razorpay API versions are never double-prefixed", () => {
  assert.equal(razorpayApiUrl("/orders"), "https://api.razorpay.com/v1/orders");
  assert.equal(razorpayApiUrl("/v2/accounts"), "https://api.razorpay.com/v2/accounts");
});
test("allocation-derived idempotency and webhook recovery are stable", () => {
  assert.equal(routeOrderIdempotencyKey("alloc-1"), "route-order:alloc-1");
  assert.equal(routeMoneyMovementKey("refund", "alloc-1"), "route-refund:alloc-1");
  assert.equal(isFullRouteRefundAmount(1500, 1500), true);
  assert.equal(isFullRouteRefundAmount(1499, 1500), false);
  assert.equal(canReclaimWebhookReceipt("recovery_failed", new Date()), true);
  assert.equal(canReclaimWebhookReceipt("processed", new Date()), false);
  assert.equal(canReclaimWebhookReceipt("processing", new Date(Date.now() - 6 * 60_000)), true);
  assert.equal(paymentRecoveryDisposition("payment_completed"), "issue_ticket");
  assert.equal(paymentRecoveryDisposition("ticket_generated"), "terminal");
  assert.equal(paymentRecoveryDisposition("registration_started"), "verify_payment");
});
test("redaction removes bank, PAN and GST values recursively", () => {
  const result = redactPayoutValue({ bank_account: "123", pan: "ABCDE", nested: { gst_number: "GST" }, businessName: "Safe" }) as any;
  assert.deepEqual(result, { bank_account: "[REDACTED]", pan: "[REDACTED]", nested: { gst_number: "[REDACTED]" }, businessName: "Safe" });
  const view = safePayoutProfile({ organizationId: "org", razorpayAccountId: "acc", status: "active", accountType: "route", businessName: "Venue", contactName: "Owner", email: "o@example.com", phoneLast4: "3210" });
  assert.equal("bank_account" in view, false);
  assert.equal("pan" in view, false);
});
test("Route diagnostics preserve request shape without logging organizer or KYC values", () => {
  const payload = redactRouteDiagnosticPayload({
    type: "route", business_type: "proprietorship", legal_business_name: "Venue Pvt Ltd",
    email: "organizer@example.com", phone: "919876543210", reference_id: "tiqkets_ref",
    profile: { category: "media_and_entertainment", subcategory: "ticketing", addresses: { registered: { street1: "1 Road", city: "Pune", state: "MH", postal_code: "411001", country: "IN" } } },
    legal_info: { pan: "ABCDE1234F", gst: "22ABCDE1234F1Z5" },
    settlements: { beneficiary_name: "Venue Pvt Ltd", account_number: "123456789", ifsc_code: "ABCD0123456" },
  }) as any;
  assert.equal(payload.type, "route");
  assert.equal(payload.business_type, "proprietorship");
  assert.equal(payload.profile.category, "media_and_entertainment");
  assert.equal(payload.profile.addresses.registered.country, "IN");
  assert.equal(payload.legal_business_name, "[REDACTED]");
  assert.equal(payload.email, "[REDACTED]");
  assert.equal(payload.phone, "[REDACTED]");
  assert.equal(payload.profile.addresses.registered.street1, "[REDACTED]");
  assert.equal(payload.legal_info.pan, "[REDACTED]");
  assert.equal(payload.settlements.account_number, "[REDACTED]");
});
test("Route provider failures retain only safe correlation metadata", async () => {
  const response = new Response(JSON.stringify({ error: { code: "BAD_REQUEST_ERROR", field: "street2", description: "PAN ABCDE1234F is invalid" } }), {
    status: 400,
    headers: { "x-razorpay-request-id": "req_123-abc" },
  });
  assert.deepEqual(await razorpayFailure(response), { httpStatus: 400, errorCode: "BAD_REQUEST_ERROR", requestId: "req_123-abc", field: "street2" });
  const message = payoutProviderMessage("Razorpay onboarding", { errorCode: "BAD_REQUEST_ERROR", requestId: "req_123-abc" });
  assert.match(message, /Razorpay code: BAD_REQUEST_ERROR/);
  assert.match(message, /Provider reference: req_123-abc/);
  assert.doesNotMatch(message, /ABCDE1234F/);
});
test("Route onboarding only accepts valid provider identifiers", () => {
  assert.equal(isValidRazorpayProviderId("acc_123abc", "acc_"), true);
  assert.equal(isValidRazorpayProviderId("acct 123", "acc_"), false);
  assert.equal(isValidRazorpayProviderId("prod_123"), true);
  assert.equal(isValidRazorpayProviderId({ id: "prod_123" }), false);
});
test("Route retries reject malformed saved provider IDs before resuming a step", () => {
  assert.equal(savedRouteProfileIdError({ razorpayAccountId: "account-not-valid" }), "linked account");
  assert.equal(savedRouteProfileIdError({ razorpayAccountId: "acc_123", providerStakeholderId: "stake holder" }), "stakeholder");
  assert.equal(savedRouteProfileIdError({ razorpayAccountId: "acc_123", providerProductId: "product id" }), "Route product");
  assert.equal(savedRouteProfileIdError({ razorpayAccountId: "acc_123", providerStakeholderId: "stakeholder_123", providerProductId: "prod_123" }), null);
});
test("webhook HMAC and paise contract fail closed", () => {
  const raw = Buffer.from('{"event":"payment.captured"}');
  const signature = crypto.createHmac("sha256", "secret").update(raw).digest("hex");
  assert.equal(verifyRazorpaySignature(raw, signature, "secret"), true);
  assert.equal(verifyRazorpaySignature(raw, "00", "secret"), false);
  assert.equal(validatePaise(100), true);
  assert.equal(validatePaise(1.5), false);
  assert.equal(validatePaise(0), false);
});