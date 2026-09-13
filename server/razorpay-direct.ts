import crypto from "crypto";

export interface DirectOrderInput {
  registrationId: string;
  eventId: string;
  amount: number;
}

export interface DirectOrder {
  id: string;
  amount: number;
  currency: string;
  notes?: Record<string, string>;
}

function directCredentials(env: NodeJS.ProcessEnv = process.env) {
  const keyId = env.RAZORPAY_DIRECT_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_DIRECT_KEY_SECRET?.trim();
  if (!keyId || !keySecret) throw new Error("Direct Razorpay credentials are not configured");
  return { keyId, keySecret };
}

export async function createDirectOrder(
  input: DirectOrderInput,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): Promise<DirectOrder & { keyId: string }> {
  const { keyId, keySecret } = directCredentials(env);
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const response = await fetcher("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      "X-Razorpay-Idempotency-Key": `event-direct-order:${input.registrationId}`,
    },
    body: JSON.stringify({
      amount: input.amount,
      currency: "INR",
      receipt: `event-${input.registrationId}`.slice(0, 40),
      notes: { registrationId: input.registrationId, eventId: input.eventId },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Razorpay direct order creation failed");
  const order = await response.json() as DirectOrder;
  if (!order.id || Number(order.amount) !== input.amount || String(order.currency).toUpperCase() !== "INR") {
    throw new Error("Razorpay direct order response was invalid");
  }
  return { ...order, keyId };
}

export function directSignature(orderId: string, paymentId: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}