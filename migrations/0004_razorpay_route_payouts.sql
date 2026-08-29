CREATE TABLE "organizer_payout_profiles" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" varchar(36) NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "razorpay_account_id" text NOT NULL,
  "status" text DEFAULT 'created' NOT NULL,
  "account_type" text,
  "business_name" text,
  "contact_name" text,
  "email" text,
  "phone_last4" varchar(4),
  "last_reconciled_at" timestamp,
  "status_reason" text,
  "provider_stakeholder_id" text,
  "provider_product_id" text,
  "product_status" text,
  "product_status_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "organizer_payout_profile_org_unique" ON "organizer_payout_profiles" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizer_payout_profile_account_unique" ON "organizer_payout_profiles" ("razorpay_account_id");--> statement-breakpoint
CREATE INDEX "organizer_payout_profile_status_idx" ON "organizer_payout_profiles" ("status");--> statement-breakpoint
CREATE TABLE "route_payout_allocations" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "registration_id" varchar(36) NOT NULL REFERENCES "event_registrations"("id") ON DELETE cascade,
  "organization_id" varchar(36) NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "payout_profile_id" varchar(36) NOT NULL REFERENCES "organizer_payout_profiles"("id"),
  "amount" integer NOT NULL,
  "currency" text DEFAULT 'INR' NOT NULL,
  "status" text DEFAULT 'pending_order' NOT NULL,
  "razorpay_order_id" text,
  "razorpay_transfer_id" text,
  "reversal_id" text,
  "refund_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "route_allocation_registration_unique" ON "route_payout_allocations" ("registration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "route_allocation_order_unique" ON "route_payout_allocations" ("razorpay_order_id");--> statement-breakpoint
CREATE INDEX "route_allocation_org_status_idx" ON "route_payout_allocations" ("organization_id", "status");--> statement-breakpoint
CREATE TABLE "razorpay_webhook_receipts" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "payload_hash" varchar(64) NOT NULL,
  "status" text DEFAULT 'received' NOT NULL,
  "processed_at" timestamp,
  "error_code" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "razorpay_webhook_event_unique" ON "razorpay_webhook_receipts" ("event_id");--> statement-breakpoint
CREATE INDEX "razorpay_webhook_recovery_idx" ON "razorpay_webhook_receipts" ("status", "created_at");