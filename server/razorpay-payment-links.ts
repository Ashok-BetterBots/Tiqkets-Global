import crypto from "crypto";

export interface PaymentLinkInput {
  registrationId: string;
  eventId: string;
  amount: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  callbackUrl: string;
}

export interface RazorpayPaymentLink {
  id: string;
  amount: number;
  amount_paid?: number;
  currency: string;
  reference_id: string;
  short_url: string;
  status: string;
}

function paymentLinkCredentials(env: NodeJS.ProcessEnv = process.env) {
  const keyId = env.RAZORPAY_DIRECT_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_DIRECT_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    throw new Error("Direct Razorpay credentials are not configured");
  }
  return { keyId, keySecret };
}

/** Razorpay limits reference_id to 40 characters. A deterministic digest
 * makes the value unique per registration and safe to replay after a timeout. */
export function paymentLinkReferenceId(registrationId: string): string {
  // Deterministic per registration so a timeout before the local bind can
  // safely replay Razorpay's idempotent request with the same payload.
  const safeRegistrationId = String(registrationId).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 36);
  return `tiq_${safeRegistrationId}`.slice(0, 40);
}

function assertHttpsCallbackUrl(callbackUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(callbackUrl);
  } catch {
    throw new Error("Razorpay Payment Link callback URL is invalid");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Razorpay Payment Link callback URL must use HTTPS");
  }
  return parsed.toString();
}

export async function createPaymentLink(
  input: PaymentLinkInput,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): Promise<RazorpayPaymentLink & { keyId: string; referenceId: string }> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new Error("Razorpay Payment Link amount must be a positive INR amount in paise");
  }
  const { keyId, keySecret } = paymentLinkCredentials(env);
  const referenceId = paymentLinkReferenceId(input.registrationId);
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const callbackUrl = assertHttpsCallbackUrl(input.callbackUrl);
  const payload = {
    amount: input.amount,
    currency: "INR",
    accept_partial: false,
    reference_id: referenceId,
    description: `Event registration ${input.registrationId}`,
    customer: {
      name: input.customerName,
      contact: input.customerPhone,
      ...(input.customerEmail ? { email: input.customerEmail } : {}),
    },
    notes: { registrationId: input.registrationId, eventId: input.eventId },
    callback_url: callbackUrl,
    callback_method: "get",
  };
  const response = await fetcher("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      "X-Razorpay-Idempotency-Key": `event-payment-link:${input.registrationId}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Razorpay Payment Link creation failed");
  const link = await response.json() as RazorpayPaymentLink;
  if (!link.id || !link.short_url || !link.reference_id ||
      link.reference_id !== referenceId || Number(link.amount) !== input.amount ||
      String(link.currency).toUpperCase() !== "INR" ||
      new URL(link.short_url).protocol !== "https:") {
    throw new Error("Razorpay Payment Link response was invalid");
  }
  return { ...link, keyId, referenceId };
}

export function paymentLinkWebhookSignature(rawBody: Buffer | string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}