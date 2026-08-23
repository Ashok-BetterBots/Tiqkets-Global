import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { canReclaimWebhookReceipt, isFullRouteRefundAmount, paymentRecoveryDisposition, redactPayoutValue, routeMoneyMovementKey, routeOrderIdempotencyKey, safePayoutProfile, validateOnboardingInput, validatePaise, verifyRazorpaySignature } from "./razorpay-route-contract";
import { razorpayApiUrl } from "./route-payouts";

test("onboarding validation accepts transit-only business request", () => {
  const parsed = validateOnboardingInput({ legal_business_name: "Venue Pvt Ltd", customer_facing_business_name: "Venue", business_type: "private_limited", email: "o@example.com", phone: "9876543210", profile: { category: "events", address: "1 Road" }, bank_account: { account_number: "123", ifsc_code: "ABCD0123456" } });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.type, "route");
  assert.equal(validateOnboardingInput({ businessName: "Venue" }).ok, false);
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
test("webhook HMAC and paise contract fail closed", () => {
  const raw = Buffer.from('{"event":"payment.captured"}');
  const signature = crypto.createHmac("sha256", "secret").update(raw).digest("hex");
  assert.equal(verifyRazorpaySignature(raw, signature, "secret"), true);
  assert.equal(verifyRazorpaySignature(raw, "00", "secret"), false);
  assert.equal(validatePaise(100), true);
  assert.equal(validatePaise(1.5), false);
  assert.equal(validatePaise(0), false);
});