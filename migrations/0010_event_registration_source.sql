ALTER TABLE "event_registrations"
  ADD COLUMN IF NOT EXISTS "registration_source" text DEFAULT 'customer' NOT NULL;

UPDATE "event_registrations" AS registration
SET "registration_source" = 'store'
WHERE EXISTS (
  SELECT 1
  FROM "event_stage_log" AS log
  WHERE log."registration_id" = registration."id"
    AND log."metadata" ->> 'manual' = 'true'
);