-- Route v2 readiness metadata is safe provider state only; no KYC values.
ALTER TABLE "organizer_payout_profiles"
  ADD COLUMN IF NOT EXISTS "provider_stakeholder_id" text,
  ADD COLUMN IF NOT EXISTS "provider_product_id" text,
  ADD COLUMN IF NOT EXISTS "product_status" text,
  ADD COLUMN IF NOT EXISTS "product_status_reason" text;