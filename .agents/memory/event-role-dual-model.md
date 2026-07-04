---
name: Event account dual role model
description: Why event accounts have TWO kinds of staff roles with different scoping, and which one drives the staff-modal event+location assignment UI.
---

Event accounts (accountType "event") expose two distinct kinds of assignable staff roles, and they are scoped differently:

1. **Event-specific roles** — `organizer`, `event_security`, `event_billing`, `event_parking`, `event_support` (see `shared/permissions.ts` `EVENT_ROLE_KEYS`). These are `scope: "organization"` — org-wide event permissions. They do NOT use per-location `assignedServiceIds` and are NOT tied to a single branch/location.

2. **Built-in operational roles** — `floor_manager` / `front_desk`. In an event account these get the per-event + per-location assignment (`assignedServiceIds` carries event location ids). The staff modal's "Assigned Events / Assigned Locations" block is gated on `(role === 'floor_manager' || role === 'front_desk') && isEventAccount`.

**Why this matters:** The staff **role filter** dropdown (`staffRoleFilterOptions`) shows the event-specific roles for event accounts, while the staff **modal event+location assignment** block is gated on floor_manager/front_desk. These are intentionally different sets — a code reviewer may flag it as a "mismatch" and suggest extending the assignment block to `organizer`/`event_*`. Do NOT do that blindly: event-specific roles are org-scoped and have no location concept, so they don't need `assignedServiceIds`/branchId assignment.

**How to apply:** `/api/org/roles` returns all system roles (incl. floor_manager/front_desk AND the event roles) regardless of account type, so an event admin can create either kind. The multi-event staff assignment (`_eventIds` checkbox array → union of event location ids into `assignedServiceIds`) applies only to floor_manager/front_desk. Keep the role-filter list and the assignment-block gating as separate concerns.
