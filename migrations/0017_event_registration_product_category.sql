ALTER TABLE event_registrations
  ADD COLUMN IF NOT EXISTS product_category text;

ALTER TABLE event_registrations
  DROP CONSTRAINT IF EXISTS event_registrations_product_category_check;

ALTER TABLE event_registrations
  ADD CONSTRAINT event_registrations_product_category_check
  CHECK (
    product_category IS NULL OR
    product_category IN ('electronics', 'furniture', 'home_appliances', 'vessels')
  );

CREATE INDEX IF NOT EXISTS event_reg_product_category_idx
  ON event_registrations (event_id, product_category);