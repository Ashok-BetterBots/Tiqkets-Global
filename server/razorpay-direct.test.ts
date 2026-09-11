import test from "node:test";
import assert from "node:assert/strict";
import { createDirectOrder } from "./razorpay-direct";
import { getEventPaymentMethod, paymentMethodFromRouteAllocation } from "./event-payment-method";

test("Direct orders use only direct credentials and never include Route transfers", async () => {
  const originalId = process.env.RAZORPAY_DIRECT_KEY_ID;
  const originalSecret = process.env.RAZORPAY_DIRECT_KEY_SECRET;
  process.env.RAZORPAY_DIRECT_KEY_ID = "rzp_direct_test";
  process.env.RAZORPAY_DIRECT_KEY_SECRET = "direct_secret";
  let request: any;
  try {
    const order = await createDirectOrder(
      { registrationId: "reg_123", eventId: "event_123", amount: 49900 },
      process.env,
      async (_url, init) => {
        request = init;
        return new Response(JSON.stringify({ id: "order_123", amount: 49900, currency: "INR" }), { status: 200 });
      },
    );
    const payload = JSON.parse(request.body);
    assert.equal(order.keyId, "rzp_direct_test");
    assert.equal(payload.amount, 49900);
    assert.equal("transfers" in payload, false);
    assert.match(request.headers.Authorization, /^Basic /);
    assert.equal(request.headers["X-Razorpay-Idempotency-Key"], "event-direct-order:reg_123");
  } finally {
    if (originalId === undefined) delete process.env.RAZORPAY_DIRECT_KEY_ID;
    else process.env.RAZORPAY_DIRECT_KEY_ID = originalId;
    if (originalSecret === undefined) delete process.env.RAZORPAY_DIRECT_KEY_SECRET;
    else process.env.RAZORPAY_DIRECT_KEY_SECRET = originalSecret;
  }
});

test("Event payment method defaults to Route", async () => {
  assert.equal(await getEventPaymentMethod({
    getSystemSetting: async () => undefined,
  }, { RAZORPAY_DIRECT_KEY_ID: "", RAZORPAY_DIRECT_KEY_SECRET: "" }), "razorpay_route");
});

test("Verification adapter selection follows persisted allocation despite setting changes", () => {
  assert.equal(paymentMethodFromRouteAllocation({ id: "allocation_123" }), "razorpay_route");
  assert.equal(paymentMethodFromRouteAllocation(undefined), "razorpay_direct");
  assert.equal(paymentMethodFromRouteAllocation(null), "razorpay_direct");
});