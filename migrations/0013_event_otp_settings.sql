ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "otp_settings" jsonb NOT NULL DEFAULT '{
    "registration": true,
    "billing": true
  }'::jsonb;