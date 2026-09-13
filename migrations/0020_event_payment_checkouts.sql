CREATE TABLE IF NOT EXISTS "event_payment_checkouts" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "registration_id" varchar(36) NOT NULL REFERENCES "event_registrations"("id") ON DELETE CASCADE,
  "adapter" text NOT NULL,
  "razorpay_order_id" text NOT NULL,
  "amount" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'INR',
  "status" text NOT NULL DEFAULT 'initiated',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "event_payment_checkout_registration_unique" ON "event_payment_checkouts" ("registration_id");
CREATE UNIQUE INDEX IF NOT EXISTS "event_payment_checkout_order_unique" ON "event_payment_checkouts" ("razorpay_order_id");
CREATE INDEX IF NOT EXISTS "event_payment_checkout_status_idx" ON "event_payment_checkouts" ("status");