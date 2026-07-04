---
name: Event max-guests-per-registration lockstep
description: Adding a per-event guest cap requires touching schema, dashboard form, backend create/update/validate, and the customer stepper together.
---

Event-level numeric limits (e.g. `events.maxGuestsPerRegistration`) must be wired through ALL of these in lockstep, or one layer silently keeps the old hardcoded value:
1. `shared/schema.ts` column (with `db:push`)
2. Dashboard event create/edit form + Alpine `eventForm` state (both the `openEventModal` populate branch and the `saveEvent` payload branch)
3. Backend `POST`/`PUT` event routes (parse + clamp) AND the response shape function that serializes an event back to clients
4. Server-side enforcement in the registration handler (don't just clamp — return a 400 if the request exceeds the cap)
5. Customer-facing page reads the value from the event API response (not a hardcoded constant like `20`) to bound its stepper/input

**Why:** the event-landing page previously hardcoded the guest stepper max at 20; the fix required changing all five layers at once since each has its own independent copy of the "max" logic.
**How to apply:** when adding any new event-level configurable limit, grep for the old hardcoded constant across `event-landing.html`, `dashboard.html`, and `events-routes.ts` and replace every occurrence, not just the first one found.
