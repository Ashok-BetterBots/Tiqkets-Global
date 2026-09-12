import test from "node:test";
import assert from "node:assert/strict";
import { createPaymentLink, paymentLinkReferenceId, paymentLinkWebhookSignature } from "./razorpay-payment-links";

test("Payment Link adapter sends an exact, non-partial INR checkout", async () => {
  let request: RequestInit | undefined;
  const link = await createPaymentLink({
    registrationId: "reg_123",
    eventId: "event_123",
    amount: 49900,
    customerName: "A Customer",
    customerPhone: "919876543210",
    customerEmail: "customer@example.com",
    callbackUrl: "https://tickets.example.test/api/event/payment-link-callback?registrationId=reg_123",
  }, {
    RAZORPAY_DIRECT_KEY_ID: "rzp_direct_test",
    RAZORPAY_DIRECT_KEY_SECRET: "direct_secret",
  }, async (_url, init) => {
    request = init;
    const body = JSON.parse(String(init.body));
    return new Response(JSON.stringify({
      id: "plink_123",
      amount: body.amount,
      currency: "INR",
      reference_id: body.reference_id,
      short_url: "https://rzp.io/i/example",
      status: "created",
    }), { status: 200 });
  });
  const body = JSON.parse(String(request?.body));
  assert.equal(body.amount, 49900);
  assert.equal(body.currency, "INR");
  assert.equal(body.accept_partial, false);
  assert.equal(body.callback_method, "get");
  assert.match(body.callback_url, /^https:\/\//);
  assert.equal(body.notes.registrationId, "reg_123");
  assert.equal(body.customer.email, "customer@example.com");
  assert.equal(body.reference_id, link.referenceId);
  assert.ok(body.reference_id.length <= 40);
  assert.equal(link.keyId, "rzp_direct_test");
});

test("Payment Link references are stable and webhook signatures are HMAC SHA-256", () => {
  assert.equal(paymentLinkReferenceId("reg_123"), paymentLinkReferenceId("reg_123"));
  assert.notEqual(paymentLinkReferenceId("reg_123"), paymentLinkReferenceId("reg_456"));
  assert.equal(
    paymentLinkWebhookSignature("{}", "secret"),
    "77325902caca812dc259733aacd046b73817372c777b8d95b402647474516e13",
  );
});

test("Payment Link adapter rejects non-HTTPS callbacks", async () => {
  await assert.rejects(
    createPaymentLink({
      registrationId: "reg_123",
      eventId: "event_123",
      amount: 100,
      customerName: "A Customer",
      customerPhone: "919876543210",
      callbackUrl: "http://localhost/callback",
    }, {
      RAZORPAY_DIRECT_KEY_ID: "id",
      RAZORPAY_DIRECT_KEY_SECRET: "secret",
    }, async () => new Response("unreachable", { status: 500 })),
    /must use HTTPS/,
  );
});