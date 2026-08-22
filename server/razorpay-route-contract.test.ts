import test from "node:test";
import assert from "node:assert/strict";
import {
  extractRouteOrderTransfers,
  localAllocationStatusForTransfer,
  routeOrderReceipt,
  routeSettlementStatus,
  selectRouteTransfer,
  shouldUseAutomaticRouteReversal,
} from "./razorpay-route-contract";

test("uses a stable, Razorpay-length-safe receipt per allocation", () => {
  const allocationId = "12345678-1234-1234-1234-123456789012";
  assert.equal(routeOrderReceipt(allocationId), routeOrderReceipt(allocationId));
  assert.ok(routeOrderReceipt(allocationId).length <= 40);
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