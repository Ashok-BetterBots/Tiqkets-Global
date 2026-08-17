ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "qr_token" varchar(64);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_qr_token_unique" UNIQUE("qr_token");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
