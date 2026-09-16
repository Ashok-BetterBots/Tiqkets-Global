ALTER TABLE "events"
ADD COLUMN IF NOT EXISTS "registration_fee_locked" boolean DEFAULT false NOT NULL;