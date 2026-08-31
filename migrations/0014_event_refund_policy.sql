ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "refundable" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "refund_message" text NOT NULL DEFAULT '';