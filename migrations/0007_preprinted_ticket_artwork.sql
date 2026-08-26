ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "preprinted_front_image_url" text;
--> statement-breakpoint
ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "preprinted_back_image_url" text;
--> statement-breakpoint
ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "preprinted_back_layout" jsonb
  DEFAULT '{"bookingId":{"x":50,"y":25,"fontSize":3.2},"qr":{"x":50,"y":56,"size":19},"serialNumber":{"x":50,"y":92,"fontSize":2.2}}'::jsonb
  NOT NULL;