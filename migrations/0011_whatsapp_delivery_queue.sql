CREATE TABLE IF NOT EXISTS "wa_queue" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "scheduled_at" timestamp DEFAULT now() NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "sent_at" timestamp,
  "last_error" text,
  "phone" text,
  "org_id" varchar(36),
  "job_type" text NOT NULL,
  "ref_id" varchar(36),
  "metadata" jsonb,
  "dedupe_key" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "wa_queue_dedupe_key_idx"
  ON "wa_queue" USING btree ("dedupe_key");

CREATE INDEX IF NOT EXISTS "wa_queue_pending_scheduled_idx"
  ON "wa_queue" USING btree ("status", "scheduled_at");