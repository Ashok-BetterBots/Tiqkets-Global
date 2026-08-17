-- Migration 0003: Performance indexes for growing data.
--
-- Adds indexes for query patterns not covered by the initial schema:
-- staff-attribution reports, desk-scoped queue views, WhatsApp/push lookups,
-- audit-log filtering, and payment date-range aggregations.
-- All statements are IF NOT EXISTS — safe to re-run.

-- ─── tickets: operational gaps ────────────────────────────────────────────────

-- Desk-scoped queue dashboard (branch → desk → status)
CREATE INDEX IF NOT EXISTS "ticket_branch_desk_status_idx"
  ON "tickets" USING btree ("branch_id", "desk_id", "status");--> statement-breakpoint

-- Single-column desk fallback (join/sort by desk without status filter)
CREATE INDEX IF NOT EXISTS "ticket_desk_idx"
  ON "tickets" USING btree ("desk_id");--> statement-breakpoint

-- Staff attribution: reports group by served_by within branch + date range
CREATE INDEX IF NOT EXISTS "ticket_branch_served_by_date_idx"
  ON "tickets" USING btree ("branch_id", "served_by", "joined_at");--> statement-breakpoint

-- Standalone served_by for simple "tickets this staff member handled" queries
CREATE INDEX IF NOT EXISTS "ticket_served_by_idx"
  ON "tickets" USING btree ("served_by");--> statement-breakpoint

-- called_at: used in wait-time ORDER BY and average-wait aggregations
CREATE INDEX IF NOT EXISTS "ticket_called_at_idx"
  ON "tickets" USING btree ("called_at");--> statement-breakpoint

-- push_token: targeted push notification lookup (one ticket → token)
CREATE INDEX IF NOT EXISTS "ticket_push_token_idx"
  ON "tickets" USING btree ("push_token");--> statement-breakpoint

-- whatsapp_phone: customer-facing lookup by phone for status polling
CREATE INDEX IF NOT EXISTS "ticket_whatsapp_phone_idx"
  ON "tickets" USING btree ("whatsapp_phone");--> statement-breakpoint

-- Partial index: active-only queue (waiting/called/serving) — most dashboard reads
-- filter on these three statuses; the partial index is much smaller than a full one.
CREATE INDEX IF NOT EXISTS "ticket_branch_active_partial_idx"
  ON "tickets" USING btree ("branch_id", "service_id", "joined_at")
  WHERE status IN ('waiting', 'called', 'serving');--> statement-breakpoint

-- ─── audit_logs: actor and target filtering ───────────────────────────────────

-- Filter audit trail by who performed the action
CREATE INDEX IF NOT EXISTS "audit_actor_idx"
  ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint

-- Filter/drill into audit trail for a specific entity (e.g. all changes to ticket X)
CREATE INDEX IF NOT EXISTS "audit_target_type_id_idx"
  ON "audit_logs" USING btree ("target_type", "target_id");--> statement-breakpoint

-- ─── payments: revenue / MRR aggregation date ranges ─────────────────────────

-- Revenue reports filter on created_at date ranges
CREATE INDEX IF NOT EXISTS "payment_created_at_idx"
  ON "payments" USING btree ("created_at");--> statement-breakpoint

-- Paid-at for "captured" payment revenue (Razorpay timestamps)
CREATE INDEX IF NOT EXISTS "payment_paid_at_idx"
  ON "payments" USING btree ("paid_at");--> statement-breakpoint

-- ─── branch_alert_state: scope lookup ─────────────────────────────────────────

-- Look up alert state for a given scope without the full composite
CREATE INDEX IF NOT EXISTS "alert_state_scope_idx"
  ON "branch_alert_state" USING btree ("scope_id");--> statement-breakpoint

-- ─── subscriptions: expiry and period-end scans ───────────────────────────────

-- Billing reminder scans walk upcoming current_period_end dates; avoids full table scans
CREATE INDEX IF NOT EXISTS "sub_period_end_idx"
  ON "subscriptions" USING btree ("current_period_end");--> statement-breakpoint

-- ─── org_users: last-seen / activity ordering ────────────────────────────────

-- Announcer service checks updated_at to prioritise recently-active users
CREATE INDEX IF NOT EXISTS "org_user_updated_at_idx"
  ON "org_users" USING btree ("updated_at");--> statement-breakpoint

-- ─── tickets: report composite with service for per-service date reports ───────

-- Service-level date-range reports (branch + date + service) — more selective than
-- the existing (branch_id, joined_at) two-column index when serviceId is in WHERE.
CREATE INDEX IF NOT EXISTS "ticket_branch_service_date_idx"
  ON "tickets" USING btree ("branch_id", "service_id", "joined_at");--> statement-breakpoint
