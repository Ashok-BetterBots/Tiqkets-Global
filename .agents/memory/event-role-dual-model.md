---
name: Event account dual role model
description: Why event accounts have TWO kinds of staff roles with different scoping, and which one drives the staff-modal event+location assignment UI.
---

Event accounts (accountType "event") split assignable staff into two scoping tiers:

1. **Org-wide roles** — `admin` and `organizer` (the event account's top manager, rank 80). These manage everything across all events; they get NO per-event / per-location assignment UI.

2. **Location-scoped operational roles** — `floor_manager`, `front_desk` (built-in) PLUS the on-site event roles `event_security`, `event_billing`, `event_parking`, `event_support`. In an event account ALL of these are assigned to specific events and their locations/gates: `assignedServiceIds` carries the chosen event-location ids and `branchId` = the event's branch. The staff modal's "Assigned Events / Assigned Locations" block (and the "at least one event" save validation) are gated on this same role set `&& isEventAccount`.

**Why this matters:** an event admin naturally creates staff with the event roles (security/billing/parking/support), NOT floor_manager/front_desk. When the assignment block was gated ONLY on floor_manager/front_desk, the events+locations picker was effectively invisible in event accounts (user report). So the location-scoped set MUST include the on-site event roles. Keep the `eventStaffRoleNeedsAssignment` list, the "at least one event" save validation, and both x-show blocks in lockstep.

**How to apply:** `/api/org/roles` returns all system roles (floor_manager/front_desk AND every event_* role) regardless of account type, so an event admin can pick any. Backend `/api/dashboard/users` POST/PUT (billing-routes.ts) already accepts branchId+assignedServiceIds for any role and requires a single branchId for non-multibranch roles — `onStaffEventsChange` auto-sets branchId from the first selected event, so event roles satisfy that. front_desk (event or not) additionally requires >=1 assignedServiceId server-side; the other event roles treat locations as optional. All gating is `isEventAccount`-scoped so organization accounts are untouched.
