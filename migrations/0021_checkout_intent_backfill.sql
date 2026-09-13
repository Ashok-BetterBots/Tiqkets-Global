-- Checkout intents are created before the external Razorpay order request.
-- Existing Route allocations already contain the authoritative order binding;
-- copy only non-null, non-conflicting bindings.
ALTER TABLE "event_payment_checkouts"
  ALTER COLUMN "razorpay_order_id" DROP NOT NULL;

INSERT INTO "event_payment_checkouts"
  ("registration_id", "adapter", "razorpay_order_id", "amount", "currency", "status")
SELECT
  rpa."registration_id",
  'route',
  rpa."razorpay_order_id",
  rpa."amount",
  COALESCE(rpa."currency", 'INR'),
  CASE
    WHEN rpa."status" IN ('captured', 'refunded', 'transfer_processed', 'settled') THEN rpa."status"
    ELSE 'initiated'
  END
FROM "route_payout_allocations" rpa
WHERE rpa."razorpay_order_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "event_payment_checkouts" c
    WHERE c."registration_id" = rpa."registration_id"
       OR c."razorpay_order_id" = rpa."razorpay_order_id"
  );

CREATE UNIQUE INDEX IF NOT EXISTS "event_payment_checkout_registration_unique"
  ON "event_payment_checkouts" ("registration_id");
CREATE UNIQUE INDEX IF NOT EXISTS "event_payment_checkout_order_unique"
  ON "event_payment_checkouts" ("razorpay_order_id")
  WHERE "razorpay_order_id" IS NOT NULL;