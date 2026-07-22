ALTER TABLE "tickets" ADD COLUMN "qr_token" varchar(64);--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_qr_token_unique" UNIQUE("qr_token");