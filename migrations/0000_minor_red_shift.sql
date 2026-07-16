CREATE TABLE "announcement_devices" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" varchar(36) NOT NULL,
	"service_id" varchar(36),
	"device_name" text NOT NULL,
	"device_token" varchar(64) NOT NULL,
	"language" varchar(8) DEFAULT 'en' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" varchar(36) NOT NULL,
	"service_id" varchar(36),
	"customer_id" varchar(36),
	"ticket_number" varchar(20) NOT NULL,
	"confirmation_code" varchar(20) NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"customer_email" text,
	"service_name" text,
	"scheduled_date" timestamp NOT NULL,
	"scheduled_time" text NOT NULL,
	"end_time" text NOT NULL,
	"notes" text,
	"form_data" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"checked_in_at" timestamp,
	"completed_at" timestamp,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_confirmation_code_unique" UNIQUE("confirmation_code")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"actor_email" text,
	"actor_role" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"target_label" text,
	"diff" jsonb,
	"ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_slots" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" varchar(36) NOT NULL,
	"service_id" varchar(36),
	"date" timestamp NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"max_capacity" integer DEFAULT 3 NOT NULL,
	"current_bookings" integer DEFAULT 0 NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branch_alert_recipients" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"branch_id" varchar(36) NOT NULL,
	"user_id" varchar(36),
	"name" text NOT NULL,
	"phone_number" text,
	"send_via_whatsapp" boolean DEFAULT true NOT NULL,
	"send_via_push" boolean DEFAULT false NOT NULL,
	"alert_on_queue_open_close" boolean DEFAULT true NOT NULL,
	"alert_on_waiting_count_max" boolean DEFAULT true NOT NULL,
	"alert_on_avg_wait_time_max" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branch_alert_state" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" varchar(36) NOT NULL,
	"trigger_kind" varchar(32) NOT NULL,
	"scope_id" varchar(36) DEFAULT '' NOT NULL,
	"is_triggered" boolean DEFAULT false NOT NULL,
	"last_value" integer,
	"last_triggered_at" timestamp,
	"last_cleared_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"city" text,
	"state" text,
	"pincode" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"queue_status" text DEFAULT 'active' NOT NULL,
	"queue_mode" text DEFAULT 'fifo' NOT NULL,
	"notification_mode" text DEFAULT 'all_alerts' NOT NULL,
	"auto_call_next" boolean DEFAULT false NOT NULL,
	"max_queue_size" integer DEFAULT 100 NOT NULL,
	"default_slot_duration" integer DEFAULT 30 NOT NULL,
	"default_slot_capacity" integer DEFAULT 3 NOT NULL,
	"display_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"api_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"announcer_user_id" varchar(36),
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"schedule_override" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "break_times" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operating_hour_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text,
	"phone" text,
	"password_hash" text,
	"profile_picture_url" text,
	"push_token" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_stats" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" varchar(36) NOT NULL,
	"date" timestamp NOT NULL,
	"total_served" integer DEFAULT 0 NOT NULL,
	"total_no_show" integer DEFAULT 0 NOT NULL,
	"total_cancelled" integer DEFAULT 0 NOT NULL,
	"avg_wait_time" integer DEFAULT 0 NOT NULL,
	"avg_service_time" integer DEFAULT 0 NOT NULL,
	"peak_hour" text,
	"total_bookings" integer DEFAULT 0 NOT NULL,
	"total_reservations" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "desks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" varchar(36) NOT NULL,
	"branch_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"queue_status" text DEFAULT 'active' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_billing_otps" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" varchar(36) NOT NULL,
	"code" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_billing_overrides" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" varchar(36) NOT NULL,
	"overridden_by" varchar(36),
	"reason" varchar(50) NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_billing_redemptions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" varchar(36) NOT NULL,
	"invoice_amount" integer NOT NULL,
	"advance_redeemed" integer NOT NULL,
	"final_amount_due" integer NOT NULL,
	"redeemed_by_user_id" varchar(36),
	"redeemed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_feedback" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" varchar(36) NOT NULL,
	"overall_rating" integer NOT NULL,
	"crowd_management_rating" integer,
	"staff_behavior_rating" integer,
	"organization_rating" integer,
	"billing_rating" integer,
	"suggestions" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_parking_logs" (
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
);
--> statement-breakpoint
CREATE TABLE "event_phone_verifications" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar(36) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"code" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"verified_at" timestamp,
	"verification_token" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_registrations" (
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
);
--> statement-breakpoint
CREATE TABLE "event_stage_log" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" varchar(36) NOT NULL,
	"stage" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_support_otps" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" varchar(36) NOT NULL,
	"code" varchar(10) NOT NULL,
	"edit_type" varchar(50) NOT NULL,
	"edit_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
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
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" varchar(36) NOT NULL,
	"date" timestamp NOT NULL,
	"name" text NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journey_stages" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_id" varchar(36) NOT NULL,
	"service_id" varchar(36),
	"service_name" text NOT NULL,
	"stage_order" integer NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"estimated_duration" integer DEFAULT 15 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journeys" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"queue_mode" varchar(32) PRIMARY KEY NOT NULL,
	"alert_sound_url" text,
	"template_en" text,
	"template_ar" text,
	"templates" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operating_hours" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" varchar(36) NOT NULL,
	"day_of_week" integer NOT NULL,
	"open_time" text NOT NULL,
	"close_time" text NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_user_branches" (
	"org_user_id" varchar(36) NOT NULL,
	"branch_id" varchar(36) NOT NULL,
	CONSTRAINT "org_user_branches_org_user_id_branch_id_pk" PRIMARY KEY("org_user_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "org_user_push_tokens" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"push_token" text NOT NULL,
	"device_label" text,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_users" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"role_id" varchar(36),
	"branch_id" varchar(36),
	"assigned_service_ids" jsonb DEFAULT '[]'::jsonb,
	"profile_picture_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"address" text,
	"country" text,
	"state" text,
	"city" text,
	"pincode" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"logo_url" text,
	"category" text,
	"description" text,
	"timezone" text,
	"account_type" text DEFAULT 'organization' NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verification_token" varchar(64),
	"verification_token_expires_at" timestamp,
	"verification_otp_attempts" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"password_hash" text NOT NULL,
	"ai_wait_prediction_enabled" boolean DEFAULT true NOT NULL,
	"whatsapp_message_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"code" text NOT NULL,
	"purpose" text DEFAULT 'registration' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"subscription_id" varchar(36),
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"razorpay_payment_id" text,
	"razorpay_order_id" text,
	"razorpay_signature" text,
	"payment_method" text,
	"description" text,
	"invoice_number" text,
	"receipt_url" text,
	"failure_reason" text,
	"paid_at" timestamp,
	"plan_snapshot_name" text,
	"plan_snapshot_id" varchar(36),
	"billing_cycle_snapshot" text,
	"period_start_snapshot" timestamp,
	"period_end_snapshot" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_features" (
	"plan_id" varchar(36) NOT NULL,
	"feature_id" varchar(36) NOT NULL,
	CONSTRAINT "plan_features_plan_id_feature_id_pk" PRIMARY KEY("plan_id","feature_id")
);
--> statement-breakpoint
CREATE TABLE "pricing_features" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" varchar(36) NOT NULL,
	"customer_id" varchar(36),
	"confirmation_code" varchar(20) NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"customer_email" text,
	"reservation_date" timestamp NOT NULL,
	"reservation_time" text NOT NULL,
	"party_size" integer DEFAULT 2 NOT NULL,
	"special_requests" text,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"table_number" text,
	"checked_in_at" timestamp,
	"ticket_id" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_confirmation_code_unique" UNIQUE("confirmation_code")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" varchar(36) NOT NULL,
	"permission_key" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_key_pk" PRIMARY KEY("role_id","permission_key")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"scope" text DEFAULT 'organization' NOT NULL,
	"organization_id" varchar(36),
	"rank" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" varchar(36) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"average_wait_time" integer DEFAULT 15 NOT NULL,
	"estimated_duration" integer DEFAULT 20 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"queue_status" text DEFAULT 'active' NOT NULL,
	"max_daily_capacity" integer,
	"requires_in_person_registration" boolean DEFAULT false NOT NULL,
	"in_person_perimeter_meters" integer DEFAULT 100,
	"input_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"service_settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"monthly_price" integer DEFAULT 0 NOT NULL,
	"yearly_price" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"max_branches" integer DEFAULT 1 NOT NULL,
	"max_services_per_branch" integer DEFAULT 5 NOT NULL,
	"max_staff_users" integer DEFAULT 3 NOT NULL,
	"max_daily_tickets" integer DEFAULT 100 NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"plan_id" varchar(36) NOT NULL,
	"status" text DEFAULT 'trialing' NOT NULL,
	"billing_cycle" text DEFAULT 'monthly' NOT NULL,
	"trial_start_date" timestamp,
	"trial_end_date" timestamp,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancelled_at" timestamp,
	"pending_plan_id" varchar(36),
	"pending_billing_cycle" text,
	"pending_change_at" timestamp,
	"pending_order_id" text,
	"pending_amount" integer,
	"pending_period_start" timestamp,
	"pending_period_end" timestamp,
	"razorpay_subscription_id" text,
	"razorpay_customer_id" text,
	"last_reminder_day_bucket" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket_messages" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" varchar(36) NOT NULL,
	"sender_type" varchar(16) NOT NULL,
	"sender_name" text,
	"sender_email" text,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar(36),
	"ticket_number" text NOT NULL,
	"subject" text NOT NULL,
	"description" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assignee" text,
	"reported_by_email" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	CONSTRAINT "support_tickets_ticket_number_unique" UNIQUE("ticket_number")
);
--> statement-breakpoint
CREATE TABLE "swap_requests" (
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
);
--> statement-breakpoint
CREATE TABLE "system_errors" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" text DEFAULT 'ERROR' NOT NULL,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"context" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_counters" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" varchar(36) NOT NULL,
	"prefix" varchar(5) NOT NULL,
	"date" timestamp NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" varchar(36) NOT NULL,
	"service_id" varchar(36),
	"customer_id" varchar(36),
	"ticket_number" varchar(20) NOT NULL,
	"customer_name" text,
	"customer_phone" text,
	"customer_email" text,
	"service_name" text,
	"position" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"source" text DEFAULT 'app' NOT NULL,
	"form_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"skip_count" integer DEFAULT 0 NOT NULL,
	"call_count" integer DEFAULT 0 NOT NULL,
	"table_number" text,
	"reservation_time" timestamp,
	"journey_id" varchar(36),
	"current_stage_index" integer,
	"current_stage_id" varchar(36),
	"stage_history" jsonb DEFAULT '[]'::jsonb,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"called_at" timestamp,
	"served_at" timestamp,
	"completed_at" timestamp,
	"hold_at" timestamp,
	"arrived_at" timestamp,
	"acknowledged_at" timestamp,
	"journey_started_at" timestamp,
	"journey_completed_at" timestamp,
	"estimated_wait_time" integer DEFAULT 0 NOT NULL,
	"predicted_service_at" timestamp,
	"actual_wait_time" integer,
	"service_time" integer,
	"push_token" text,
	"notifications_sent" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"served_by" varchar(36),
	"desk_id" varchar(36),
	"desk_name" text,
	"whatsapp_ref_code" varchar(10),
	"whatsapp_confirmed" boolean DEFAULT false NOT NULL,
	"whatsapp_phone" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_whatsapp_ref_code_unique" UNIQUE("whatsapp_ref_code")
);
--> statement-breakpoint
CREATE TABLE "wait_time_stats" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" varchar(36) NOT NULL,
	"service_id" varchar(36) NOT NULL,
	"hour_of_week" integer NOT NULL,
	"avg_service_ms" integer NOT NULL,
	"avg_wait_ms" integer,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_overrides" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" varchar(32) NOT NULL,
	"trigger_key" varchar(64) NOT NULL,
	"language" varchar(8) DEFAULT 'en' NOT NULL,
	"content" text NOT NULL,
	"updated_by" varchar(36),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcement_devices" ADD CONSTRAINT "announcement_devices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_devices" ADD CONSTRAINT "announcement_devices_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_slots" ADD CONSTRAINT "booking_slots_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_slots" ADD CONSTRAINT "booking_slots_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_alert_recipients" ADD CONSTRAINT "branch_alert_recipients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_alert_recipients" ADD CONSTRAINT "branch_alert_recipients_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_alert_recipients" ADD CONSTRAINT "branch_alert_recipients_user_id_org_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."org_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_alert_state" ADD CONSTRAINT "branch_alert_state_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_times" ADD CONSTRAINT "break_times_operating_hour_id_operating_hours_id_fk" FOREIGN KEY ("operating_hour_id") REFERENCES "public"."operating_hours"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_stats" ADD CONSTRAINT "daily_stats_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desks" ADD CONSTRAINT "desks_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desks" ADD CONSTRAINT "desks_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_billing_otps" ADD CONSTRAINT "event_billing_otps_registration_id_event_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_billing_overrides" ADD CONSTRAINT "event_billing_overrides_registration_id_event_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_billing_overrides" ADD CONSTRAINT "event_billing_overrides_overridden_by_org_users_id_fk" FOREIGN KEY ("overridden_by") REFERENCES "public"."org_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_billing_redemptions" ADD CONSTRAINT "event_billing_redemptions_registration_id_event_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_billing_redemptions" ADD CONSTRAINT "event_billing_redemptions_redeemed_by_user_id_org_users_id_fk" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "public"."org_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_feedback" ADD CONSTRAINT "event_feedback_registration_id_event_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_parking_logs" ADD CONSTRAINT "event_parking_logs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_parking_logs" ADD CONSTRAINT "event_parking_logs_registration_id_event_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_parking_logs" ADD CONSTRAINT "event_parking_logs_created_by_user_id_org_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."org_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_phone_verifications" ADD CONSTRAINT "event_phone_verifications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_location_id_services_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_stage_log" ADD CONSTRAINT "event_stage_log_registration_id_event_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_support_otps" ADD CONSTRAINT "event_support_otps_registration_id_event_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."event_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_stages" ADD CONSTRAINT "journey_stages_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_stages" ADD CONSTRAINT "journey_stages_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operating_hours" ADD CONSTRAINT "operating_hours_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_user_branches" ADD CONSTRAINT "org_user_branches_org_user_id_org_users_id_fk" FOREIGN KEY ("org_user_id") REFERENCES "public"."org_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_user_branches" ADD CONSTRAINT "org_user_branches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_user_push_tokens" ADD CONSTRAINT "org_user_push_tokens_user_id_org_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."org_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_users" ADD CONSTRAINT "org_users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_users" ADD CONSTRAINT "org_users_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_feature_id_pricing_features_id_fk" FOREIGN KEY ("feature_id") REFERENCES "public"."pricing_features"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_pending_plan_id_subscription_plans_id_fk" FOREIGN KEY ("pending_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_requester_ticket_id_tickets_id_fk" FOREIGN KEY ("requester_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_target_ticket_id_tickets_id_fk" FOREIGN KEY ("target_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_accepted_by_ticket_id_tickets_id_fk" FOREIGN KEY ("accepted_by_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_counters" ADD CONSTRAINT "ticket_counters_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journeys"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_served_by_org_users_id_fk" FOREIGN KEY ("served_by") REFERENCES "public"."org_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_desk_id_desks_id_fk" FOREIGN KEY ("desk_id") REFERENCES "public"."desks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wait_time_stats" ADD CONSTRAINT "wait_time_stats_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wait_time_stats" ADD CONSTRAINT "wait_time_stats_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announce_dev_branch_idx" ON "announcement_devices" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "announce_dev_service_idx" ON "announcement_devices" USING btree ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "announce_dev_token_idx" ON "announcement_devices" USING btree ("device_token");--> statement-breakpoint
CREATE INDEX "appointment_branch_date_idx" ON "appointments" USING btree ("branch_id","scheduled_date");--> statement-breakpoint
CREATE INDEX "appointment_customer_idx" ON "appointments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "appointment_service_idx" ON "appointments" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "appointment_status_idx" ON "appointments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "appointment_code_idx" ON "appointments" USING btree ("confirmation_code");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "slot_branch_date_idx" ON "booking_slots" USING btree ("branch_id","date");--> statement-breakpoint
CREATE INDEX "slot_service_idx" ON "booking_slots" USING btree ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "slot_unique_idx" ON "booking_slots" USING btree ("branch_id","service_id","date","start_time");--> statement-breakpoint
CREATE INDEX "alert_rcpt_branch_idx" ON "branch_alert_recipients" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "alert_rcpt_org_idx" ON "branch_alert_recipients" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "alert_rcpt_user_idx" ON "branch_alert_recipients" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_state_unique_idx" ON "branch_alert_state" USING btree ("branch_id","trigger_kind","scope_id");--> statement-breakpoint
CREATE INDEX "alert_state_branch_idx" ON "branch_alert_state" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "branch_org_idx" ON "branches" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "branch_active_idx" ON "branches" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "branch_location_idx" ON "branches" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "branch_announcer_idx" ON "branches" USING btree ("announcer_user_id");--> statement-breakpoint
CREATE INDEX "break_hour_idx" ON "break_times" USING btree ("operating_hour_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_email_idx" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "customer_phone_idx" ON "customers" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "stats_branch_date_idx" ON "daily_stats" USING btree ("branch_id","date");--> statement-breakpoint
CREATE INDEX "stats_date_idx" ON "daily_stats" USING btree ("date");--> statement-breakpoint
CREATE INDEX "desk_service_idx" ON "desks" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "desk_branch_idx" ON "desks" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "desk_active_idx" ON "desks" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "event_billing_redemption_reg_unique" ON "event_billing_redemptions" USING btree ("registration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_feedback_reg_unique" ON "event_feedback" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "event_reg_event_idx" ON "event_registrations" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_reg_booking_id_unique" ON "event_registrations" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_reg_qr_token_unique" ON "event_registrations" USING btree ("qr_token");--> statement-breakpoint
CREATE INDEX "event_reg_status_idx" ON "event_registrations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "event_reg_slot_idx" ON "event_registrations" USING btree ("event_id","slot_date","slot_time");--> statement-breakpoint
CREATE INDEX "event_reg_phone_idx" ON "event_registrations" USING btree ("customer_phone");--> statement-breakpoint
CREATE INDEX "event_stage_log_reg_idx" ON "event_stage_log" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "event_stage_log_stage_idx" ON "event_stage_log" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "event_stage_log_created_idx" ON "event_stage_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "event_branch_idx" ON "events" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "event_org_idx" ON "events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "event_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "holiday_branch_idx" ON "holidays" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "holiday_date_idx" ON "holidays" USING btree ("date");--> statement-breakpoint
CREATE INDEX "stage_journey_idx" ON "journey_stages" USING btree ("journey_id");--> statement-breakpoint
CREATE INDEX "stage_order_idx" ON "journey_stages" USING btree ("journey_id","stage_order");--> statement-breakpoint
CREATE INDEX "journey_branch_idx" ON "journeys" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "journey_active_idx" ON "journeys" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "hours_branch_idx" ON "operating_hours" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hours_branch_day_idx" ON "operating_hours" USING btree ("branch_id","day_of_week");--> statement-breakpoint
CREATE INDEX "oub_user_idx" ON "org_user_branches" USING btree ("org_user_id");--> statement-breakpoint
CREATE INDEX "oub_branch_idx" ON "org_user_branches" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_user_push_token_unique_idx" ON "org_user_push_tokens" USING btree ("push_token");--> statement-breakpoint
CREATE INDEX "org_user_push_token_user_idx" ON "org_user_push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_user_email_org_idx" ON "org_users" USING btree ("email","organization_id");--> statement-breakpoint
CREATE INDEX "org_user_org_idx" ON "org_users" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_user_branch_idx" ON "org_users" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "org_user_role_idx" ON "org_users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "org_email_idx" ON "organizations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "org_city_idx" ON "organizations" USING btree ("city");--> statement-breakpoint
CREATE INDEX "org_active_idx" ON "organizations" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "org_verification_token_idx" ON "organizations" USING btree ("verification_token");--> statement-breakpoint
CREATE INDEX "otp_phone_idx" ON "otp_codes" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "payment_org_idx" ON "payments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payment_sub_idx" ON "payments" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "payment_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_razorpay_payment_id_unique" ON "payments" USING btree ("razorpay_payment_id");--> statement-breakpoint
CREATE INDEX "plan_features_feature_idx" ON "plan_features" USING btree ("feature_id");--> statement-breakpoint
CREATE INDEX "reservation_branch_date_idx" ON "reservations" USING btree ("branch_id","reservation_date");--> statement-breakpoint
CREATE INDEX "reservation_customer_idx" ON "reservations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "reservation_status_idx" ON "reservations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reservation_code_idx" ON "reservations" USING btree ("confirmation_code");--> statement-breakpoint
CREATE INDEX "role_perms_role_idx" ON "role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_key_idx" ON "roles" USING btree ("key");--> statement-breakpoint
CREATE INDEX "role_org_idx" ON "roles" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "service_branch_idx" ON "services" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "service_active_idx" ON "services" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "plan_slug_idx" ON "subscription_plans" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "plan_active_idx" ON "subscription_plans" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "sub_org_idx" ON "subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sub_plan_idx" ON "subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "sub_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sub_razorpay_idx" ON "subscriptions" USING btree ("razorpay_subscription_id");--> statement-breakpoint
CREATE INDEX "sub_pending_change_idx" ON "subscriptions" USING btree ("pending_change_at");--> statement-breakpoint
CREATE INDEX "support_ticket_messages_ticket_idx" ON "support_ticket_messages" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "support_ticket_messages_created_idx" ON "support_ticket_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_org_idx" ON "support_tickets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "support_tickets_priority_idx" ON "support_tickets" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "swap_requester_idx" ON "swap_requests" USING btree ("requester_ticket_id");--> statement-breakpoint
CREATE INDEX "swap_branch_idx" ON "swap_requests" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "swap_status_idx" ON "swap_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "system_errors_created_idx" ON "system_errors" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "counter_branch_date_idx" ON "ticket_counters" USING btree ("branch_id","prefix","date");--> statement-breakpoint
CREATE INDEX "ticket_branch_status_idx" ON "tickets" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "ticket_branch_date_idx" ON "tickets" USING btree ("branch_id","joined_at");--> statement-breakpoint
CREATE INDEX "ticket_service_idx" ON "tickets" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "ticket_customer_idx" ON "tickets" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "ticket_status_idx" ON "tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ticket_journey_idx" ON "tickets" USING btree ("journey_id");--> statement-breakpoint
CREATE INDEX "ticket_number_idx" ON "tickets" USING btree ("ticket_number");--> statement-breakpoint
CREATE INDEX "ticket_joined_at_idx" ON "tickets" USING btree ("joined_at");--> statement-breakpoint
CREATE INDEX "ticket_branch_service_status_idx" ON "tickets" USING btree ("branch_id","service_id","status");--> statement-breakpoint
CREATE INDEX "ticket_whatsapp_ref_idx" ON "tickets" USING btree ("whatsapp_ref_code");--> statement-breakpoint
CREATE UNIQUE INDEX "wait_stats_cell_idx" ON "wait_time_stats" USING btree ("branch_id","service_id","hour_of_week");--> statement-breakpoint
CREATE INDEX "wait_stats_branch_service_idx" ON "wait_time_stats" USING btree ("branch_id","service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_overrides_unique" ON "whatsapp_overrides" USING btree ("mode","trigger_key","language");