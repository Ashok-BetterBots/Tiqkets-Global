---
name: Queue (booking) status endpoints & permission gating
description: Why queue-status toggles must use the dedicated /queue-status routes, not the full edit routes.
---

Changing queue (booking) status (active/paused/ended) for a branch/service/desk
must go through the dedicated endpoints, NOT the full update routes:

- `PUT /api/dashboard/branches/:id/queue-status`
- `PUT /api/dashboard/services/:id/queue-status`
- `PUT /api/dashboard/desks/:id/queue-status`

These are gated by `org.queue.mode_change`. The full update routes
(`PUT /api/dashboard/branches/:id`, `PUT /api/services/:id`,
`PUT /api/dashboard/desks/:id`) require `org.branches.edit` /
`org.services.edit` / `org.desks.edit`.

**Why:** Operational roles (front_desk, floor_manager) have `mode_change` but
NOT the edit perms. If the client toggles status via the edit routes, those
roles get a 403, yet the client's optimistic local-state update still shows the
change — so it looks applied on that device but never reaches the DB and other
clients (e.g. the web dashboard) never see it. The web dashboard already uses
the dedicated routes; the mobile app was using the edit routes (via context
updateBranch/updateService/updateDesk), which was the bug.

**How to apply:** In the Expo client, use the context's `setQueueStatusFor`
(OrganizationContext) for any queue-status change. Do not reuse the generic
update* fns for queueStatus. All roles that can toggle (super_admin, admin,
location_manager, floor_manager, front_desk) have `org.queue.mode_change`.
Cascade (branch → its services → their desks) is done client-side and is
non-transactional, mirroring the web dashboard.
