-- Migration 0002: Defensive schema backfill for self-hosted deployments.
--
-- Databases created from older versions of this app may be missing columns
-- and tables that were added later. All statements use IF NOT EXISTS so this
-- migration is safe to run on a fully up-to-date database as well.
--
-- ─── tickets: add columns that may be missing in older schemas ───────────────

ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "hold_at" timestamp;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "arrived_at" timestamp;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "acknowledged_at" timestamp;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "journey_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "journey_completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "estimated_wait_time" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "predicted_service_at" timestamp;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "actual_wait_time" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "service_time" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "push_token" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "notifications_sent" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "served_by" varchar(36);--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "desk_id" varchar(36);--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "desk_name" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "whatsapp_ref_code" varchar(10);--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "whatsapp_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "whatsapp_phone" text;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "preferred_language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "journey_id" varchar(36);--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "current_stage_index" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "current_stage_id" varchar(36);--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "stage_history" jsonb;--> statement-breakpoint

-- unique constraint on whatsapp_ref_code (may already exist)
DO $$ BEGIN
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_whatsapp_ref_code_unique" UNIQUE("whatsapp_ref_code");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- ─── unique index on ticket whatsapp_ref ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS "ticket_whatsapp_ref_idx" ON "tickets" USING btree ("whatsapp_ref_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_journey_idx" ON "tickets" USING btree ("journey_id");--> statement-breakpoint

-- ─── desks ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "desks" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "service_id" varchar(36) NOT NULL,
  "branch_id" varchar(36) NOT NULL,
  "name" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "queue_status" text DEFAULT 'active' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- ─── journeys ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "journeys" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "branch_id" varchar(36) NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- ─── journey_stages ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "journey_stages" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "journey_id" varchar(36) NOT NULL,
  "service_id" varchar(36),
  "service_name" text NOT NULL,
  "stage_order" integer NOT NULL,
  "is_optional" boolean DEFAULT false NOT NULL,
  "estimated_duration" integer DEFAULT 15 NOT NULL
);--> statement-breakpoint

-- ─── org_user_push_tokens ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "org_user_push_tokens" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar(36) NOT NULL,
  "push_token" text NOT NULL,
  "device_label" text,
  "last_seen_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- ─── whatsapp_overrides ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "whatsapp_overrides" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "mode" varchar(32) NOT NULL,
  "trigger_key" varchar(64) NOT NULL,
  "language" varchar(8) DEFAULT 'en' NOT NULL,
  "content" text NOT NULL,
  "updated_by" varchar(36),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- ─── swap_requests ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "swap_requests" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "requester_ticket_id" varchar(36) NOT NULL,
  "target_ticket_id" varchar(36),
  "branch_id" varchar(36) NOT NULL,
  "service_id" varchar(36),
  "requester_position" integer NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "is_premium" boolean DEFAULT false NOT NULL,
  "premium_amount" numeric(10, 2),
  "accepted_by_ticket_id" varchar(36),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp
);--> statement-breakpoint

-- ─── events ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "branch_id" varchar(36) NOT NULL,
  "organization_id" varchar(36) NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "venue" text,
  "google_maps_link" text,
  "start_date" timestamp NOT NULL,
  "end_date" timestamp NOT NULL,
  "operating_hours_start" text DEFAULT '09:00' NOT NULL,
  "operating_hours_end" text DEFAULT '21:00' NOT NULL,
  "slot_duration_minutes" integer DEFAULT 30 NOT NULL,
  "max_capacity_per_slot" integer DEFAULT 50 NOT NULL,
  "max_guests_per_registration" integer DEFAULT 10 NOT NULL,
  "registration_fee" integer DEFAULT 0 NOT NULL,
  "terms_and_conditions" text,
  "faqs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "support_contact" text,
  "banner_url" text,
  "logo_url" text,
  "gallery_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "venue_map_url" text,
  "brand_primary_color" text,
  "brand_button_color" text,
  "brand_font_family" text,
  "message_templates" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "parking_total_spaces" integer DEFAULT 0 NOT NULL,
  "parking_occupied" integer DEFAULT 0 NOT NULL,
  "slot_capacity_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- ─── event_registrations ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "event_registrations" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" varchar(36) NOT NULL,
  "location_id" varchar(36),
  "form_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "booking_id" varchar(20),
  "qr_token" varchar(64),
  "customer_name" text NOT NULL,
  "customer_phone" text NOT NULL,
  "customer_email" text,
  "preferred_language" text DEFAULT 'en' NOT NULL,
  "family_members_count" integer DEFAULT 0 NOT NULL,
  "slot_date" text NOT NULL,
  "slot_time" text NOT NULL,
  "status" text DEFAULT 'registration_started' NOT NULL,
  "payment_id" varchar(36),
  "amount_paid" integer DEFAULT 0 NOT NULL,
  "ticket_image_url" text,
  "arrived_at" timestamp,
  "checked_in_at" timestamp,
  "exited_at" timestamp,
  "visit_duration_minutes" integer,
  "invalid_scan_attempts" integer DEFAULT 0 NOT NULL,
  "duplicate_entry_attempts" integer DEFAULT 0 NOT NULL,
  "reminder_day_sent_at" timestamp,
  "reminder_hour_sent_at" timestamp,
  "slot_active_sent_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- ─── event_stage_log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "event_stage_log" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "registration_id" varchar(36) NOT NULL,
  "stage" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- ─── event_billing_otps ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "event_billing_otps" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "registration_id" varchar(36) NOT NULL,
  "code" text NOT NULL,
  "verified" boolean DEFAULT false NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- ─── event_billing_overrides ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "event_billing_overrides" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "registration_id" varchar(36) NOT NULL,
  "overridden_by" varchar(36),
  "reason" varchar(50) NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- ─── event_billing_redemptions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "event_billing_redemptions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "registration_id" varchar(36) NOT NULL,
  "invoice_amount" integer NOT NULL,
  "advance_redeemed" integer NOT NULL,
  "final_amount_due" integer NOT NULL,
  "redeemed_by_user_id" varchar(36),
  "redeemed_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- ─── event_feedback ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "event_feedback" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "registration_id" varchar(36) NOT NULL,
  "overall_rating" integer NOT NULL,
  "crowd_management_rating" integer,
  "staff_behavior_rating" integer,
  "organization_rating" integer,
  "billing_rating" integer,
  "suggestions" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- ─── event_parking_logs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "event_parking_logs" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" varchar(36) NOT NULL,
  "registration_id" varchar(36),
  "customer_name" varchar(255),
  "booking_id" varchar(50),
  "customer_phone" varchar(50),
  "vehicle_reg_number" varchar(50),
  "action" varchar(20) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "created_by_user_id" varchar(36)
);--> statement-breakpoint

-- ─── event_phone_verifications ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "event_phone_verifications" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" varchar(36) NOT NULL,
  "phone" varchar(20) NOT NULL,
  "code" text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp NOT NULL,
  "verified_at" timestamp,
  "verification_token" varchar(64),
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- ─── event_support_otps ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "event_support_otps" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "registration_id" varchar(36) NOT NULL,
  "code" varchar(10) NOT NULL,
  "edit_type" varchar(50) NOT NULL,
  "edit_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL,
  "verified" boolean DEFAULT false NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint

-- ─── foreign keys (all wrapped in DO blocks to skip if already present) ──────

DO $$ BEGIN
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_served_by_org_users_id_fk"
    FOREIGN KEY ("served_by") REFERENCES "public"."org_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_desk_id_desks_id_fk"
    FOREIGN KEY ("desk_id") REFERENCES "public"."desks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tickets" ADD CONSTRAINT "tickets_journey_id_journeys_id_fk"
    FOREIGN KEY ("journey_id") REFERENCES "public"."journeys"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "journey_stages" ADD CONSTRAINT "journey_stages_journey_id_journeys_id_fk"
    FOREIGN KEY ("journey_id") REFERENCES "public"."journeys"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "journey_stages" ADD CONSTRAINT "journey_stages_service_id_services_id_fk"
    FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "org_user_push_tokens" ADD CONSTRAINT "org_user_push_tokens_user_id_org_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."org_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_requester_ticket_id_tickets_id_fk"
    FOREIGN KEY ("requester_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_branch_id_branches_id_fk"
    FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_events_id_fk"
    FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_billing_otps" ADD CONSTRAINT "event_billing_otps_registration_id_event_registrations_id_fk"
    FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_stage_log" ADD CONSTRAINT "event_stage_log_registration_id_event_registrations_id_fk"
    FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_support_otps" ADD CONSTRAINT "event_support_otps_registration_id_event_registrations_id_fk"
    FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_feedback" ADD CONSTRAINT "event_feedback_registration_id_event_registrations_id_fk"
    FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_parking_logs" ADD CONSTRAINT "event_parking_logs_event_id_events_id_fk"
    FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "event_phone_verifications" ADD CONSTRAINT "event_phone_verifications_event_id_events_id_fk"
    FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

-- ─── indexes for new tables ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "journey_branch_idx" ON "journeys" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journey_active_idx" ON "journeys" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stage_journey_idx" ON "journey_stages" USING btree ("journey_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stage_order_idx" ON "journey_stages" USING btree ("journey_id","stage_order");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_user_push_token_unique_idx" ON "org_user_push_tokens" USING btree ("push_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_user_push_token_user_idx" ON "org_user_push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_branch_idx" ON "events" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_org_idx" ON "events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_reg_event_idx" ON "event_registrations" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_reg_qr_token_unique" ON "event_registrations" USING btree ("qr_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_reg_status_idx" ON "event_registrations" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_reg_slot_idx" ON "event_registrations" USING btree ("event_id","slot_date","slot_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_reg_phone_idx" ON "event_registrations" USING btree ("customer_phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_stage_log_reg_idx" ON "event_stage_log" USING btree ("registration_id");--> statement-breakpoint
