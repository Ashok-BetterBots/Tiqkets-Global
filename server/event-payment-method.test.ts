import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_EVENT_PAYMENT_METHOD,
  directCredentialStatus,
  getEventPaymentMethod,
  normalizeEventPaymentMethod,
  setEventPaymentMethod,
} from "./event-payment-method";

test("missing and invalid event payment settings safely select Route", async () => {
  const settings = {
    async getSystemSetting() { return undefined; },
  };
  assert.equal(await getEventPaymentMethod(settings), DEFAULT_EVENT_PAYMENT_METHOD);
  assert.equal(normalizeEventPaymentMethod(undefined), DEFAULT_EVENT_PAYMENT_METHOD);
  assert.equal(normalizeEventPaymentMethod("not-a-provider"), DEFAULT_EVENT_PAYMENT_METHOD);
});

test("event payment selection is read from persisted settings at runtime", async () => {
  let persisted: unknown = "razorpay_route";
  const settings = {
    async getSystemSetting() { return persisted; },
    async setSystemSetting(_key: string, value: unknown) { persisted = value; return {}; },
  };
  assert.equal(await getEventPaymentMethod(settings), "razorpay_route");
  await setEventPaymentMethod("razorpay_direct", settings, {
    RAZORPAY_DIRECT_KEY_ID: "rzp_direct",
    RAZORPAY_DIRECT_KEY_SECRET: "secret",
    RAZORPAY_DIRECT_WEBHOOK_SECRET: "webhook-secret",
  });
  assert.equal(await getEventPaymentMethod(settings, {
    RAZORPAY_DIRECT_KEY_ID: "rzp_direct",
    RAZORPAY_DIRECT_KEY_SECRET: "secret",
    RAZORPAY_DIRECT_WEBHOOK_SECRET: "webhook-secret",
  }), "razorpay_direct");
});

test("Direct cannot be selected unless both credentials exist", async () => {
  const settings = {
    async getSystemSetting() { return undefined; },
    async setSystemSetting() { throw new Error("must not persist"); },
  };
  assert.deepEqual(directCredentialStatus({ RAZORPAY_DIRECT_KEY_ID: "id" }), {
    configured: false, keyIdConfigured: true, secretConfigured: false, webhookSecretConfigured: false,
  });
  await assert.rejects(
    setEventPaymentMethod("razorpay_direct", settings, { RAZORPAY_DIRECT_KEY_ID: "id" }),
    /credentials are not configured/,
  );
  const persistedDirect = {
    async getSystemSetting() { return "razorpay_direct"; },
  };
  assert.equal(await getEventPaymentMethod(persistedDirect, { RAZORPAY_DIRECT_KEY_ID: "id" }), "razorpay_route");
  assert.deepEqual(directCredentialStatus({
    RAZORPAY_DIRECT_KEY_ID: "id",
    RAZORPAY_DIRECT_KEY_SECRET: "secret",
    RAZORPAY_DIRECT_WEBHOOK_SECRET: "webhook-secret",
  }), { configured: true, keyIdConfigured: true, secretConfigured: true, webhookSecretConfigured: true });
});