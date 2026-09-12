ALTER TABLE "event_payment_checkouts"
  ADD COLUMN IF NOT EXISTS "payment_link_reference_id" text,
  ADD COLUMN IF NOT EXISTS "razorpay_payment_link_id" text,
  ADD COLUMN IF NOT EXISTS "razorpay_short_url" text,
  ADD COLUMN IF NOT EXISTS "payment_link_payment_id" text;

CREATE UNIQUE INDEX IF NOT EXISTS "event_payment_checkout_link_unique"
  ON "event_payment_checkouts" ("razorpay_payment_link_id")
  WHERE "razorpay_payment_link_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "event_payment_checkout_reference_unique"
  ON "event_payment_checkouts" ("payment_link_reference_id")
  WHERE "payment_link_reference_id" IS NOT NULL;