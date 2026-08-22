import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRouteOrderPayload,
  extractRouteOrderTransfers,
  localAllocationStatusForTransfer,
  routeOrderReceipt,
  routeAccountReferenceId,
  routeRefundAmountForAttempt,
  routeSettlementStatus,
  selectRouteTransfer,
  shouldUseAutomaticRouteReversal,
} from "./razorpay-route-contract";
import { onboardingPayloads, razorpayRequestFailureMessage, routeFailureReason, routeWebhookReceiptPayload } from "./route-payouts";

test("uses a stable, Razorpay-length-safe receipt per allocation", () => {
  const allocationId = "12345678-1234-1234-1234-123456789012";
  assert.equal(routeOrderReceipt(allocationId), routeOrderReceipt(allocationId));
  assert.ok(routeOrderReceipt(allocationId).length <= 40);
});

test("builds a Razorpay-safe linked-account reference for every organization", () => {
  const reference = routeAccountReferenceId("12345678-1234-1234-1234-123456789012");
  assert.equal(reference, "org12345678123412341");
  assert.equal(reference.length, 20);
  assert.match(reference, /^[a-zA-Z0-9]+$/);
});

test("builds a full-payment Route order with Razorpay's boolean contract", () => {
  const order = buildRouteOrderPayload({
    amount: 125000,
    allocationId: "allocation-123",
    registrationId: "registration-123",
    eventId: "event-123",
    providerAccountId: "acc_123",
  });
  assert.equal(order.partial_payment, false);
  assert.equal(typeof order.partial_payment, "boolean");
  assert.equal(order.amount, 125000);
  assert.deepEqual(order.transfers, [{
    account: "acc_123",
    amount: 125000,
    currency: "INR",
    notes: {
      type: "event_registration_payout",
      registrationId: "registration-123",
      eventId: "event-123",
      allocationId: "allocation-123",
    },
    linked_account_notes: ["registrationId", "eventId", "allocationId"],
  }]);
});

test("builds documented linked-account and derived stakeholder payloads", () => {
  const { account, stakeholder } = onboardingPayloads({
    email: "organizer@example.com",
    phone: "+91 98765 43210",
    legal_business_name: "Festival Events Pvt Ltd",
    customer_facing_business_name: "Festival Events",
    business_type: "private_limited",
    profile: {
      category: "events_and_entertainment",
      subcategory: "event_management",
      business_model: "Cultural and community events",
      addresses: {
        registered: {
          street1: "100 Main Street",
          street2: "Suite 4",
          city: "Chennai",
          state: "TN",
          postal_code: "600001",
          country: "IN",
        },
      },
    },
    legal_info: { pan: "AAACL1234C", gst: "33AAACL1234C1Z0" },
    apps: { websites: ["https://festival.example.com"] },
    bank_account: {
      account_number: "123456789012",
      confirm_account_number: "123456789012",
      account_type: "current",
      ifsc_code: "HDFC0001234",
      beneficiary_name: "Festival Events Pvt Ltd",
    },
  }, "org_test");
  assert.equal(account.email, "organizer@example.com");
  assert.equal(account.phone, 919876543210);
  assert.equal(account.legal_business_name, "Festival Events Pvt Ltd");
  assert.equal(account.customer_facing_business_name, "Festival Events");
  assert.equal(account.business_type, "private_limited");
  assert.equal(account.reference_id, "org_test");
  assert.deepEqual(account.legal_info, { pan: "AAACL1234C", gst: "33AAACL1234C1Z0" });
  assert.deepEqual(account.apps, { websites: ["https://festival.example.com"] });
  assert.deepEqual(account.contact_info, {
    chargeback: { email: "organizer@example.com", phone: 9876543210 },
    refund: { email: "organizer@example.com", phone: 9876543210 },
    support: { email: "organizer@example.com", phone: 9876543210 },
  });
  assert.equal("contact_name" in account, false);
  assert.equal((stakeholder as any).name, "Festival Events");
  assert.deepEqual((stakeholder as any).phone, { primary: "9876543210" });
  assert.deepEqual((stakeholder as any).kyc, { pan: "AAACL1234C" });
  assert.deepEqual((account as any).bank_account, {
    account_number: "123456789012",
    account_type: "current",
    ifsc_code: "HDFC0001234",
    beneficiary_name: "Festival Events Pvt Ltd",
  });
  assert.equal("confirm_account_number" in (account as any).bank_account, false);
});

test("requires a complete selected address and matching bank details", () => {
  const body = {
    email: "organizer@example.com",
    phone: "+91 98765 43210",
    legal_business_name: "Festival Events Pvt Ltd",
    customer_facing_business_name: "Festival Events",
    business_type: "private_limited",
    profile: {
      category: "events_and_entertainment",
      subcategory: "event_management",
      business_model: "Ticketed live events and experiences",
      addresses: {
        registered: {
          street1: "100 Main Street",
          street2: "Suite 4",
          city: "Chennai",
          state: "TN",
          postal_code: "600001",
          country: "IN",
        },
      },
    },
    bank_account: {
      account_number: "123456789012",
      confirm_account_number: "123456789012",
      account_type: "savings",
      ifsc_code: "HDFC0001234",
      beneficiary_name: "Festival Events Pvt Ltd",
    },
  };
  assert.doesNotThrow(() => onboardingPayloads(body, "org_test"));
  assert.throws(() => onboardingPayloads({
    ...body,
    profile: { ...body.profile, addresses: { registered: { ...body.profile.addresses.registered, street2: "" } } },
  }, "org_test"), /complete registered address/);
  assert.throws(() => onboardingPayloads({
    ...body,
    bank_account: { ...body.bank_account, confirm_account_number: "987654321012" },
  }, "org_test"), /matching confirmation/);
  assert.throws(() => onboardingPayloads({
    ...body,
    bank_account: { ...body.bank_account, ifsc_code: "not-an-ifsc" },
  }, "org_test"), /valid IFSC/);
});

test("never exposes provider-supplied banking or KYC values in onboarding errors", () => {
  const sensitiveProviderText = "Account 1234-5678-9012, IFSC HDFC0001234, PAN AAACL1234C, GST 33AAACL1234C1Z0";
  for (const status of [400, 401, 403, 409, 500]) {
    const message = razorpayRequestFailureMessage(status);
    assert.equal(message.includes(sensitiveProviderText), false);
    assert.doesNotMatch(message, /1234[-\s]?5678|HDFC0001234|AAACL1234C|33AAACL1234C1Z0/);
  }
});

test("uses fixed local messages for Route operational failures", () => {
  const sensitiveProviderText = "Account 1234-5678-9012, IFSC HDFC0001234, PAN AAACL1234C, GST 33AAACL1234C1Z0";
  for (const kind of ["transfer", "refund", "reversal"] as const) {
    const message = routeFailureReason(kind);
    assert.equal(message.includes(sensitiveProviderText), false);
    assert.doesNotMatch(message, /1234[-\s]?5678|HDFC0001234|AAACL1234C|33AAACL1234C1Z0/);
  }
});

test("keeps Route webhook receipts free of provider onboarding data", () => {
  const receipt = routeWebhookReceiptPayload("product.route.needs_clarification", {
    payload: {
      account: { entity: { id: "acc_Abc123" } },
      product: {
        entity: {
          id: "prod_Def456",
          account_id: "acc_Abc123",
          status_details: { description: "Account 1234-5678-9012, IFSC HDFC0001234, PAN AAACL1234C" },
          bank_account: { account_number: "123456789012", ifsc_code: "HDFC0001234" },
        },
      },
    },
  });
  assert.deepEqual(receipt, {
    event: "product.route.needs_clarification",
    resources: {
      accountId: "acc_Abc123",
      productId: "prod_Def456",
      paymentId: null,
      orderId: null,
      transferId: null,
      refundId: null,
      reversalId: null,
    },
  });
  assert.doesNotMatch(JSON.stringify(receipt), /1234[-\s]?5678|HDFC0001234|AAACL1234C/);
});

test("reads Route transfers from the documented expanded order response", () => {
  const transfers = extractRouteOrderTransfers({
    id: "order_test",
    transfers: {
      items: [
        { id: "trf_other", recipient: "acc_other", notes: { allocationId: "other" } },
        { id: "trf_target", recipient: "acc_target", status: "processed", notes: { allocationId: "allocation_target" } },
      ],
    },
  });
  assert.equal(selectRouteTransfer(transfers, "allocation_target", "acc_target")?.id, "trf_target");
});

test("also accepts the documented array-shaped transfer collection", () => {
  const transfers = extractRouteOrderTransfers({
    transfers: [
      { id: "trf_target", recipient: "acc_target", status: "created" },
    ],
  });
  assert.equal(transfers[0]?.id, "trf_target");
});

test("preserves documented Route lifecycle states", () => {
  assert.equal(localAllocationStatusForTransfer("created"), "processing");
  assert.equal(localAllocationStatusForTransfer("processed"), "completed");
  assert.equal(localAllocationStatusForTransfer("partially_reversed"), "partially_reversed");
  assert.equal(routeSettlementStatus("on_hold"), "on_hold");
});

test("uses automatic reversals only for full or single-transfer refunds", () => {
  assert.equal(shouldUseAutomaticRouteReversal({ refundAmount: 1000, remainingAllocationAmount: 1000, transferCount: 2 }), true);
  assert.equal(shouldUseAutomaticRouteReversal({ refundAmount: 100, remainingAllocationAmount: 1000, transferCount: 1 }), true);
  assert.equal(shouldUseAutomaticRouteReversal({ refundAmount: 100, remainingAllocationAmount: 1000, transferCount: 2 }), false);
});

test("uses the persisted amount when a failed Route reversal is retried", () => {
  assert.equal(routeRefundAmountForAttempt({
    requestedAmount: 500,
    persistedAmount: 500,
    isRetry: true,
  }), 500);
  assert.throws(() => routeRefundAmountForAttempt({
    requestedAmount: 900,
    persistedAmount: 500,
    isRetry: true,
  }), /original refund amount/);
});