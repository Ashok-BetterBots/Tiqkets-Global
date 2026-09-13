ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "registration_fee_custom_text" text NOT NULL DEFAULT '';