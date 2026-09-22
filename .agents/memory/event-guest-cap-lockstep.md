---
name: Event max-guests-per-registration scope
description: The configured per-registration guest cap applies to customer registration, while staff-created tickets preserve the entered count.
---

The event-level `maxGuestsPerRegistration` limit is intentionally scoped to customer registration. Customer-facing registration must enforce it consistently across:
1. `shared/schema.ts` column (with `db:push`)
2. Dashboard event create/edit form + Alpine `eventForm` state (both the `openEventModal` populate branch and the `saveEvent` payload branch)
3. Backend `POST`/`PUT` event routes (parse + clamp) AND the response shape function that serializes an event back to clients
4. Server-side enforcement in the registration handler (don't just clamp — return a 400 if the request exceeds the cap)
5. Customer-facing page reads the value from the event API response (not a hardcoded constant like `20`) to bound its stepper/input

Staff manual registrations from both the web dashboard and native event app use the shared manual-registration endpoint and must preserve the actual entered family count, even above `maxGuestsPerRegistration`. Ticket display, capacity usage, reports, and scans derive totals from the stored count.

**Why:** Customer self-registration needs the organizer’s configured limit, but staff may register larger groups at the counter. Capping the shared manual API silently corrupted the stored count and every downstream total.
**How to apply:** keep customer and manual registration normalization separate. Never reintroduce `maxGuestsPerRegistration` capping in the manual handler; downstream calculations should continue using stored `familyMembersCount`.
