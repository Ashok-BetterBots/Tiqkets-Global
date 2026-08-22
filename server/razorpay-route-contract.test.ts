import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRouteOrderPayload,
  extractRouteOrderTransfers,
  localAllocationStatusForTransfer,
  routeOrderReceipt,
  routeRefundAmountForAttempt,
  routeSettlementStatus,
  selectRouteTransfer,
  shouldUseAutomaticRouteReversal,
} from "./razorpay-route-contract";
import { onboardingPayloads } from "./route-payouts";

test("uses a stable, Razorpay-length-safe receipt per allocation", () => {
  const allocationId = "12345678-1234-1234-1234-123456789012";
  assert.equal(routeOrderReceipt(allocationId), routeOrderReceipt(allocationId));
  assert.ok(routeOrderReceipt(allocationId).length <= 40);
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
      business_model: "Ticketed cultural events",
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
  }, "org_test");
  assert.equal(account.email, "organizer@example.com");
  assert.equal(account.phone, "919876543210");
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