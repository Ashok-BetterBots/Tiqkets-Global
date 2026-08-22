-- Preserve the Route onboarding and money-movement state required by the
-- documented linked-account, product, transfer, settlement and reversal APIs.
ALTER TABLE "organizer_payment_profiles"
  ADD COLUMN IF NOT EXISTS "provider_stakeholder_id" text,
  ADD COLUMN IF NOT EXISTS "provider_product_id" text,
  ADD COLUMN IF NOT EXISTS "product_status" text,
  ADD COLUMN IF NOT EXISTS "product_status_reason" text;--> statement-breakpoint

ALTER TABLE "event_payment_allocations"
  ADD COLUMN IF NOT EXISTS "provider_transfer_status" text,
  ADD COLUMN IF NOT EXISTS "settlement_status" text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "amount_reversed" integer NOT NULL DEFAULT 0;--> statement-breakpoint

ALTER TABLE "payment_refunds"
  ADD COLUMN IF NOT EXISTS "provider_refund_status" text,
  ADD COLUMN IF NOT EXISTS "provider_reversal_status" text;