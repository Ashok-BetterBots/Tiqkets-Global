ALTER TABLE events
  ADD COLUMN IF NOT EXISTS preprinted_ticket_prefix varchar(8) NOT NULL DEFAULT 'EVT';