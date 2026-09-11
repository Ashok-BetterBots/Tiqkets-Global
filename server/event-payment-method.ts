import { storage } from "./storage";

export const EVENT_PAYMENT_METHOD_SETTING_KEY = "event_payment_method";
export const DEFAULT_EVENT_PAYMENT_METHOD = "razorpay_route" as const;
export const EVENT_PAYMENT_METHODS = ["razorpay_route", "razorpay_direct"] as const;

export type EventPaymentMethod = (typeof EVENT_PAYMENT_METHODS)[number];

/** Checkout adapter persisted by the registration, not the current global setting. */
export function paymentMethodFromRouteAllocation(allocation: unknown): EventPaymentMethod {
  return allocation ? "razorpay_route" : "razorpay_direct";
}

export interface SystemSettingReader {
  getSystemSetting<T = unknown>(key: string): Promise<T | undefined>;
}

export interface SystemSettingWriter extends SystemSettingReader {
  setSystemSetting<T = unknown>(key: string, value: T): Promise<unknown>;
}

/** Normalize persisted or request values, failing safely to the existing Route path. */
export function normalizeEventPaymentMethod(value: unknown): EventPaymentMethod {
  return value === "razorpay_direct" || value === "razorpay_route"
    ? value
    : DEFAULT_EVENT_PAYMENT_METHOD;
}

export function directCredentialStatus(env: NodeJS.ProcessEnv = process.env) {
  const keyIdConfigured = Boolean(env.RAZORPAY_DIRECT_KEY_ID?.trim());
  const secretConfigured = Boolean(env.RAZORPAY_DIRECT_KEY_SECRET?.trim());
  const webhookSecretConfigured = Boolean(env.RAZORPAY_DIRECT_WEBHOOK_SECRET?.trim());
  return {
    configured: keyIdConfigured && secretConfigured && webhookSecretConfigured,
    keyIdConfigured,
    secretConfigured,
    webhookSecretConfigured,
  };
}

export async function getEventPaymentMethod(
  settings: SystemSettingReader = storage,
  env: NodeJS.ProcessEnv = process.env,
): Promise<EventPaymentMethod> {
  const stored = await settings.getSystemSetting<unknown>(EVENT_PAYMENT_METHOD_SETTING_KEY);
  const method = normalizeEventPaymentMethod(stored);
  return method === "razorpay_direct" && !directCredentialStatus(env).configured
    ? DEFAULT_EVENT_PAYMENT_METHOD
    : method;
}

export async function setEventPaymentMethod(
  value: unknown,
  settings: SystemSettingWriter = storage,
  env: NodeJS.ProcessEnv = process.env,
): Promise<EventPaymentMethod> {
  const method = normalizeEventPaymentMethod(value);
  if (value !== method) throw new Error("Invalid event payment method");
  if (method === "razorpay_direct" && !directCredentialStatus(env).configured) {
    throw new Error("Direct Razorpay credentials are not configured: key, secret, and webhook secret are required");
  }
  await settings.setSystemSetting(EVENT_PAYMENT_METHOD_SETTING_KEY, method);
  return method;
}