---
name: Events routes security pattern
description: Tenant scoping + token rules + race handling for events queue-mode endpoints
---

# Events route security pattern

**Rule:** Every `/api/dashboard/events/*` route must enforce tenant ownership; public ticket routes resolve by qrToken ONLY; state transitions and counters must be race-safe.

**Why:** An architect security review found cross-tenant IDOR (any org staffer could read/mutate another org's events), a public existence oracle (short guessable `EVT-XXXXXX` booking IDs resolved tickets on unauthenticated routes), and lost-update/oversell races (capacity check-then-insert, parking read-modify-write, double scan transitions).

**How to apply:**
- Event-id routes: `assertEventOwnership(req,res,eventId)` (event → org → `assertOrgOwnership`). Branch routes: `assertBranchOwnership`.
- Registration-based staff routes (scan/billing/support): `findOrgRegistration(req, code)` — cross-org tickets return null and read as 404, never 403 (no oracle). Fuzzy support search inner-joins events filtered by caller org; super-admin `"*"` sees all.
- Public routes (`/event-qr/*.png`, `/api/event/ticket/*`, `/api/event/feedback/*`): `findRegistrationByToken` with `^[a-f0-9]{16,64}$` — bookingId/UUID remain valid ONLY on permission-gated staff routes.
- Capacity: transaction + `SELECT ... FOR UPDATE` on the event row + in-tx recount before insert.
- Counters: single atomic SQL `UPDATE ... GREATEST(0, LEAST(total, expr))`.
- Status transitions: conditional `UPDATE ... WHERE status IN (validFrom)` + `.returning()`; on 0 rows re-fetch and classify duplicate vs invalid.
