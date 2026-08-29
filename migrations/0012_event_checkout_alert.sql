ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "checkout_alert" jsonb NOT NULL DEFAULT '{
    "enabled": false,
    "maxDurationMinutes": 60,
    "title": "",
    "message": "",
    "iconUrl": ""
  }'::jsonb;

ALTER TABLE "event_registrations"
  ADD COLUMN IF NOT EXISTS "checkout_alert_snapshot" jsonb;