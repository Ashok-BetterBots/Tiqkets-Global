ALTER TABLE event_registrations
  ADD COLUMN IF NOT EXISTS product_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS special_categories jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE event_registrations
SET product_categories = jsonb_build_array(product_category)
WHERE product_category IS NOT NULL
  AND product_categories = '[]'::jsonb;

CREATE INDEX IF NOT EXISTS event_reg_product_categories_gin_idx
  ON event_registrations USING gin (product_categories);

CREATE INDEX IF NOT EXISTS event_reg_special_categories_gin_idx
  ON event_registrations USING gin (special_categories);