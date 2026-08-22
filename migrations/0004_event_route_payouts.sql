-- Razorpay Route marketplace payout records. Additive and safe for existing
-- event accounts; no banking or KYC values are stored locally.
CREATE TABLE IF NOT EXISTS "organizer_payment_profiles" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" varchar(36) NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "provider" text NOT NULL, "provider_account_id" text NOT NULL, "display_name" text,
  "status" text NOT NULL DEFAULT 'pending', "status_reason" text,
  "status_updated_at" timestamp NOT NULL DEFAULT now(), "deactivated_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opp_org_idx" ON "organizer_payment_profiles" ("organization_id");
CREATE INDEX IF NOT EXISTS "opp_status_idx" ON "organizer_payment_profiles" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "opp_provider_account_unique" ON "organizer_payment_profiles" ("provider", "provider_account_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_payment_allocations" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "registration_id" varchar(36) NOT NULL REFERENCES "event_registrations"("id") ON DELETE CASCADE,
  "payment_id" varchar(36) REFERENCES "payments"("id") ON DELETE SET NULL,
  "profile_id" varchar(36) NOT NULL REFERENCES "organizer_payment_profiles"("id") ON DELETE RESTRICT,
  "gross_amount" integer NOT NULL, "platform_fee" integer NOT NULL DEFAULT 0, "net_amount" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'INR', "status" text NOT NULL DEFAULT 'pending',
  "provider_transfer_id" text, "provider_order_id" text, "idempotency_key" text, "failure_reason" text,
  "transferred_at" timestamp, "provider_settlement_id" text, "settlement_utr" text, "settled_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "epa_registration_profile_unique" ON "event_payment_allocations" ("registration_id", "profile_id");
CREATE UNIQUE INDEX IF NOT EXISTS "epa_provider_transfer_id_unique" ON "event_payment_allocations" ("provider_transfer_id");
CREATE INDEX IF NOT EXISTS "epa_profile_idx" ON "event_payment_allocations" ("profile_id");
CREATE INDEX IF NOT EXISTS "epa_status_idx" ON "event_payment_allocations" ("status");
CREATE INDEX IF NOT EXISTS "epa_payment_idx" ON "event_payment_allocations" ("payment_id");
CREATE INDEX IF NOT EXISTS "epa_provider_order_idx" ON "event_payment_allocations" ("provider_order_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_webhook_receipts" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(), "provider" text NOT NULL,
  "provider_event_id" text NOT NULL, "event_type" text NOT NULL, "payload" jsonb NOT NULL,
  "processing_status" text NOT NULL DEFAULT 'pending', "processing_note" text, "processed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pwr_provider_event_id_unique" ON "payment_webhook_receipts" ("provider", "provider_event_id");
CREATE INDEX IF NOT EXISTS "pwr_event_type_idx" ON "payment_webhook_receipts" ("event_type");
CREATE INDEX IF NOT EXISTS "pwr_processing_status_idx" ON "payment_webhook_receipts" ("processing_status");
CREATE INDEX IF NOT EXISTS "pwr_created_idx" ON "payment_webhook_receipts" ("created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_refunds" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "allocation_id" varchar(36) NOT NULL REFERENCES "event_payment_allocations"("id") ON DELETE RESTRICT,
  "amount" integer NOT NULL, "currency" text NOT NULL DEFAULT 'INR', "status" text NOT NULL DEFAULT 'pending',
  "idempotency_key" text, "provider_refund_id" text, "provider_reversal_id" text, "reason" text, "failure_reason" text,
  "initiated_by_user_id" varchar(36) REFERENCES "org_users"("id") ON DELETE SET NULL, "refunded_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pr_allocation_idx" ON "payment_refunds" ("allocation_id");
CREATE INDEX IF NOT EXISTS "pr_status_idx" ON "payment_refunds" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "pr_idempotency_key_unique" ON "payment_refunds" ("idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "pr_provider_refund_id_unique" ON "payment_refunds" ("provider_refund_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pr_provider_reversal_id_unique" ON "payment_refunds" ("provider_reversal_id");