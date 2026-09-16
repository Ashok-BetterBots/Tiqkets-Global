ALTER TABLE "event_registrations"
  ADD COLUMN IF NOT EXISTS "collected_at" timestamp;