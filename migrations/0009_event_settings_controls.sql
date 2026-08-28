ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "whatsapp_triggers" jsonb NOT NULL DEFAULT '{
    "reminder_day": true,
    "reminder_hour": true,
    "checked_in": true,
    "billing": true,
    "thank_you_feedback": true
  }'::jsonb;

ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "parking_enabled" boolean NOT NULL DEFAULT true;