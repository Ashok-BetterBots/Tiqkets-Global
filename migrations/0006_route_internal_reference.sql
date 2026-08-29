-- Keep the application-only Route organizer reference without sending it to Razorpay.
ALTER TABLE "organizer_payout_profiles"
  ADD COLUMN IF NOT EXISTS "route_reference_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "organizer_payout_profile_reference_unique"
  ON "organizer_payout_profiles" ("route_reference_id")
  WHERE "route_reference_id" IS NOT NULL;