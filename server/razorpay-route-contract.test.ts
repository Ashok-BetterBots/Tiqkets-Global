import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { buildLinkedAccountPayload, buildRouteOnboardingPayloads, buildRouteOrderPayload, buildRouteProductRequestPayload, buildRouteProductUpdatePayload, buildStakeholderPayload, canReclaimWebhookReceipt, isFullRouteRefundAmount, isValidRazorpayProviderId, normalizeIndianState, paymentRecoveryDisposition, redactPayoutValue, redactRouteDiagnosticPayload, routeAllocationStatusFromTransferEntity, routeMoneyMovementKey, routeOrderIdempotencyKey, safePayoutProfile, safeRouteTransferDetails, validateLinkedAccountInput, validateOnboardingInput, validatePaise, validateSettlementInput, validateStakeholderInput, verifyRazorpaySignature } from "./razorpay-route-contract";
import { isDefinitiveProviderRejection, isRazorpayCredentialTestMode, isRazorpayTestMode, lookupSafeRouteTransfer, mapWithConcurrency, payoutHistoryPagination, payoutProviderMessage, pendingRouteOnboardingStages, razorpayApiUrl, razorpayFailure, razorpayTestDataError, savedRouteProfileIdError } from "./route-payouts";

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
    assert.equal(payloads.accountCreate.phone, "9876543210");
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
    assert.deepEqual(payloads.stakeholder.relationship, { executive: true, director: true });
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
  const invalidName = validateOnboardingInput({ ...base, legal_business_name: "Venue & Co" });
  assert.equal(invalidName.ok, false);
  if (!invalidName.ok) assert.match(invalidName.error, /Legal business name/);
  assert.equal(validateOnboardingInput({ ...base, business_type: "individual", legal_info: { ...base.legal_info, gst: "" } }).ok, true);
});
test("linked-account state is normalized to Razorpay's canonical full name", () => {
  assert.equal(normalizeIndianState("TN"), "TAMIL NADU");
  assert.equal(normalizeIndianState("Tamilnadu"), "TAMIL NADU");
  assert.equal(normalizeIndianState("Tamil Nadu"), "TAMIL NADU");
  assert.equal(normalizeIndianState("not a state"), null);
  const linked = validateLinkedAccountInput({
    legal_business_name: "Venue Pvt Ltd", email: "organizer@example.com", phone: "9876543210",
    contact_name: "Venue Owner", business_type: "proprietorship", tnc_accepted: true,
    profile: { addresses: { registered: { street1: "1 Road", street2: "Hall 2", city: "Coimbatore", state: "TN", postal_code: "641010" } } },
    legal_info: { pan: "ABCDE1234F", gst: "" },
  });
  assert.equal(linked.ok, true);
  if (linked.ok) assert.equal(buildLinkedAccountPayload(linked.value).profile.addresses.registered.state, "TAMIL NADU");
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
test("one resumable onboarding submission plans every missing provider stage in order", () => {
  assert.deepEqual(pendingRouteOnboardingStages(undefined), ["linked_account", "stakeholder", "route_product", "settlement"]);
  assert.deepEqual(pendingRouteOnboardingStages({
    status: "created",
    providerStakeholderId: null,
    providerProductId: null,
    productStatus: "pending",
  }), ["stakeholder", "route_product", "settlement"]);
  assert.deepEqual(pendingRouteOnboardingStages({
    status: "created",
    providerStakeholderId: "sth_123",
    providerProductId: "acc_prd_123",
    productStatus: "requested",
    statusReason: "settlement_submitted",
  }), []);
  assert.deepEqual(pendingRouteOnboardingStages({
    status: "pending",
    statusReason: "intent_linked_account",
  }), ["linked_account", "stakeholder", "route_product", "settlement"]);
  assert.deepEqual(pendingRouteOnboardingStages({
    status: "created",
    providerStakeholderId: "sth_123",
    providerProductId: "acc_prd_123",
    productStatus: "requested",
    statusReason: "intent_settlement",
  }), ["settlement"]);
});
test("safe payout profiles expose provider IDs but never payout credentials", () => {
  const safe = safePayoutProfile({
    organizationId: "org_123", razorpayAccountId: "acc_123456", providerStakeholderId: "sth_123456",
    providerProductId: "acc_prd_123456",
    status: "created", accountType: "route", businessName: "Venue Pvt Ltd", contactName: "Venue Owner",
    email: "organizer@example.com", phoneLast4: "3210",
  } as any);
  assert.equal(safe.accountId, "acc_123456");
  assert.equal(safe.stakeholderId, "sth_123456");
  assert.equal(safe.productId, "acc_prd_123456");
  assert.equal(safe.finalActivationStatus, "created");
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
test("safe transfer details expose provider movement and confirmation fields", () => {
  const details = safeRouteTransferDetails({
    id: "trf_123456", source: "order_123456", recipient: "acc_123456",
    amount: 49900, currency: "INR", status: "processed", settlement_status: "pending",
    created_at: 1_700_000_000, notes: { allocationId: "allocation_123" },
  }, { transferId: "trf_123456", amount: 49900, allocationId: "allocation_123", recipientId: "acc_123456" });
  assert.deepEqual(details, {
    transferId: "trf_123456", sourceId: "order_123456", recipientId: "acc_123456",
    amount: 49900, createdAt: "2023-11-14T22:13:20.000Z", transferStatus: "processed",
    settlementStatus: "pending", orderTransferred: true,
  });
});
test("safe transfer details reject mismatched movement data and keep missing transfers explicit", () => {
  assert.equal(safeRouteTransferDetails({
    id: "trf_123456", source: "order_123456", recipient: "acc_other",
    amount: 49900, currency: "INR", status: "processed",
  }, { transferId: "trf_123456", amount: 49900, allocationId: "allocation_123", recipientId: "acc_123456" }), null);
  assert.equal(safeRouteTransferDetails({
    id: "trf_123456", source: "order_123456", recipient: "acc_123456",
    amount: 49900, currency: "INR", status: "pending",
  }, { transferId: "trf_123456", amount: 49900, allocationId: "allocation_123", recipientId: "acc_123456" })?.orderTransferred, false);
});
test("ticket payment history pagination is bounded and defaults safely", () => {
  assert.deepEqual(payoutHistoryPagination(undefined, undefined), { page: 1, limit: 10 });
  assert.deepEqual(payoutHistoryPagination("3", "20"), { page: 3, limit: 20 });
  assert.deepEqual(payoutHistoryPagination("-2", "500"), { page: 1, limit: 25 });
});
test("ticket payment history limits simultaneous provider lookups", async () => {
  let active = 0, maximum = 0;
  const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async value => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    return value * 2;
  });
  assert.deepEqual(result, [2, 4, 6, 8, 10, 12, 14]);
  assert.equal(maximum, 3);
});
test("ticket payment history keeps safe local fallback when Razorpay lookup fails", async () => {
  const expected = { transferId: "trf_123456", amount: 49900, allocationId: "allocation_123", recipientId: "acc_123456" };
  assert.equal(await lookupSafeRouteTransfer(expected, async () => {
    throw new Error("rate limited");
  }), null);
  assert.equal(await lookupSafeRouteTransfer(expected, async () => ({
    id: "trf_wrong", amount: 49900, currency: "INR", recipient: "acc_123456",
  })), null);
});
test("development enables the safe Razorpay test checkout path", () => {
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    assert.equal(isRazorpayTestMode(), true);
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
});
test("Razorpay credential test mode is distinct from the development checkout fallback", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalKey = process.env.RAZORPAY_KEY_ID;
  try {
    process.env.NODE_ENV = "development";
    process.env.RAZORPAY_KEY_ID = "rzp_live_example";
    assert.equal(isRazorpayTestMode(), true);
    assert.equal(isRazorpayCredentialTestMode(), false);
    assert.equal(razorpayTestDataError({ legal_info: { pan: "ABCDE1234F", gst: "" } }), null);

    process.env.RAZORPAY_KEY_ID = "rzp_test_example";
    assert.equal(isRazorpayCredentialTestMode(), true);
    assert.match(razorpayTestDataError({ legal_info: { pan: "ABCDE1234F", gst: "" } }) || "", /^PAN:/);

    process.env.NODE_ENV = "production";
    assert.equal(isRazorpayTestMode(), true);
    assert.equal(isRazorpayCredentialTestMode(), true);
  } finally {
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
    if (originalKey === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = originalKey;
  }
});
test("Razorpay test credentials reject real PAN and GST before provider submission", () => {
  const originalKey = process.env.RAZORPAY_KEY_ID;
  try {
    process.env.RAZORPAY_KEY_ID = "rzp_test_example";
    assert.match(razorpayTestDataError({ legal_info: { pan: "ABCDE1234F", gst: "" } }) || "", /^PAN:/);
    assert.match(razorpayTestDataError({ legal_info: { pan: "AAACL1234C", gst: "22ABCDE1234F1Z5" } }) || "", /^GST identification number:/);
    assert.equal(razorpayTestDataError({ legal_info: { pan: "AAACL1234C", gst: "36AAECL6705C1ZS" } }), null);
    assert.equal(razorpayTestDataError({ legal_info: { pan: "AAACL1234C", gst: "" } }), null);
  } finally {
    if (originalKey === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = originalKey;
  }
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
  const response = new Response(JSON.stringify({ error: { code: "BAD_REQUEST_ERROR", field: "street2", description: "PAN ZZZZZ9999Z is invalid" } }), {
    status: 400,
    headers: { "x-razorpay-request-id": "req_123-abc" },
  });
  assert.deepEqual(await razorpayFailure(response), {
    httpStatus: 400,
    errorCode: "BAD_REQUEST_ERROR",
    requestId: "req_123-abc",
    field: "street2",
    issue: "invalid_value",
  });
  const message = payoutProviderMessage("Razorpay onboarding", { errorCode: "BAD_REQUEST_ERROR", requestId: "req_123-abc" });
  assert.match(message, /Razorpay code: BAD_REQUEST_ERROR/);
  assert.match(message, /Provider reference: req_123-abc/);
  assert.doesNotMatch(message, /ZZZZZ9999Z/);
});

test("ambiguous provider failures retain onboarding intents", () => {
  assert.equal(isDefinitiveProviderRejection(400), true);
  assert.equal(isDefinitiveProviderRejection(422), true);
  assert.equal(isDefinitiveProviderRejection(408), false);
  assert.equal(isDefinitiveProviderRejection(409), false);
  assert.equal(isDefinitiveProviderRejection(429), false);
  assert.equal(isDefinitiveProviderRejection(500), false);
  assert.equal(isDefinitiveProviderRejection(503), false);
});
test("Route provider errors become field-specific without exposing raw descriptions", async () => {
  const duplicateEmail = new Response(JSON.stringify({
    error: {
      code: "BAD_REQUEST_ERROR",
      field: null,
      description: "Merchant email already exists for account - acc_sensitive",
      reason: "invalid_request",
      metadata: {},
    },
  }), { status: 400 });
  const duplicateFailure = await razorpayFailure(duplicateEmail);
  assert.equal(duplicateFailure.field, "email");
  assert.equal(duplicateFailure.issue, "duplicate_email");
  const duplicateMessage = payoutProviderMessage("Razorpay onboarding", duplicateFailure);
  assert.match(duplicateMessage, /^Business email:/);
  assert.doesNotMatch(duplicateMessage, /acc_sensitive/);

  const nestedField = new Response(JSON.stringify({
    error: {
      code: "BAD_REQUEST_ERROR",
      field: "profile.addresses.registered.postal_code",
      description: "The postal code must be 6 digits",
    },
  }), { status: 400 });
  const fieldFailure = await razorpayFailure(nestedField);
  assert.equal(fieldFailure.field, "postal_code");
  assert.equal(fieldFailure.issue, "invalid_length");
  assert.match(payoutProviderMessage("Razorpay onboarding", fieldFailure), /^Registered address postal code:/);

  const stateFailure = await razorpayFailure(new Response(JSON.stringify({
    error: { code: "BAD_REQUEST_ERROR", field: "profile.addresses.registered.state", description: "State is invalid" },
  }), { status: 400 }));
  assert.equal(stateFailure.field, "state");
  assert.match(payoutProviderMessage("Razorpay onboarding", stateFailure), /^Registered address state: Razorpay rejected this value/);
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
test("provider-verified Route transfer states map to app payout statuses", () => {
  assert.equal(routeAllocationStatusFromTransferEntity({ status: "processed" }), "processed");
  assert.equal(routeAllocationStatusFromTransferEntity({ transfer_status: "failed" }), "failed");
  assert.equal(routeAllocationStatusFromTransferEntity({ status: "processed", recipient_settlement_id: "setl_123" }), "settled");
  assert.equal(routeAllocationStatusFromTransferEntity({ status: "processed", settlement_status: "processed" }), "settled");
  assert.equal(routeAllocationStatusFromTransferEntity({ status: "pending" }), null);
  assert.equal(routeAllocationStatusFromTransferEntity(null), null);
});
test("selected business category keeps its matching subcategory in the Route payload", () => {
  const parsed = validateLinkedAccountInput({
    legal_business_name: "Event Services", email: "organizer@example.com", phone: "919876543210",
    contact_name: "Event Owner", business_type: "proprietorship", tnc_accepted: true,
    profile: {
      category: "services",
      subcategory: "event_planning",
      addresses: { registered: { street1: "1 Road", street2: "Hall 2", city: "Pune", state: "Maharashtra", postal_code: "411001", country: "IN" } },
    },
    legal_info: { pan: "ABCDE1234F", gst: "" },
  });
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.profile.category, "services");
    assert.equal(parsed.value.profile.subcategory, "event_planning");
    assert.equal(buildLinkedAccountPayload(parsed.value).profile.category, "services");
    assert.equal(buildLinkedAccountPayload(parsed.value).profile.subcategory, "event_planning");
  }
  assert.equal(validateLinkedAccountInput({
    legal_business_name: "Event Services", email: "organizer@example.com", phone: "919876543210",
    contact_name: "Event Owner", business_type: "proprietorship", tnc_accepted: true,
    profile: {
      category: "services",
      subcategory: "ticketing",
      addresses: { registered: { street1: "1 Road", street2: "Hall 2", city: "Pune", state: "Maharashtra", postal_code: "411001", country: "IN" } },
    },
    legal_info: { pan: "ABCDE1234F", gst: "" },
  }).ok, false);
});