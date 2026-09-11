DROP INDEX IF EXISTS "payment_razorpay_payment_id_unique";
CREATE UNIQUE INDEX "payment_razorpay_payment_id_unique"
  ON "payments" ("razorpay_payment_id");