-- Add QR token and language columns to tickets table
-- qr_token: unique scannable token for the boarding-pass page (/queue-ticket/:token)
-- language: staff-chosen language for WhatsApp notifications (e.g. 'en', 'ta')
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS qr_token VARCHAR(64) UNIQUE;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS language VARCHAR(8) NOT NULL DEFAULT 'en';
CREATE INDEX IF NOT EXISTS ticket_qr_token_idx ON tickets(qr_token);
