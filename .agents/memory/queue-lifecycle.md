---
name: Queue lifecycle (start/end defaults & auto-end)
description: How service queue status defaults on account creation and how idle queues auto-end + fire alerts
---

# Queue status defaults & auto-end

## New-account default = ended
A freshly registered org (`POST /api/organizations/register` in `server/routes.ts`)
seeds its branch, Main Service, and Counter 1 desk with `queueStatus: "ended"` so
nothing accepts tickets until staff explicitly Start it. Join gating
(`/api/join/:branchId`) checks both branch and service `queueStatus`.

**Scope:** only the registration seeding was changed — the schema column defaults
(branches/services/desks) are still `"active"`, so resources created later via the
dashboard still come up active unless that is changed separately.

## Auto-end idle queues (server/queue-auto-end.ts)
Scheduler mirrors `server/billing-reminders.ts` (single-start guard, unref'd timer,
wired in `server/index.ts` right after `startBillingReminders()`). Scans every 5 min;
ends any active service with **zero `waiting` tickets** that has been idle ≥30 min.

**Idle reference** = most recent of: max ticket `updated_at`, the `queue_open` anchor
(`branch_alert_state`), and the service row's own `updatedAt`. `updatedAt` is NOT NULL
so there is always a reference — a started-but-empty service still gets a sensible
idle window. **Why:** `queue_open` is only stamped on a status→active transition, so
many active services have no anchor; without the `updatedAt` fallback those would
never auto-end.

**Atomicity:** before ending, re-count waiting tickets and do a conditional
`UPDATE ... WHERE queue_status='active'` (returning rows). If the recheck finds a
waiter or the row was already changed, skip. **Why:** closes the race between the bulk
snapshot scan and the per-service end.

Auto-end fires the SAME alerts as a manual End: `notifyServiceQueueStatusChange(...,"ended")`
+ `notifyOrgServiceQueueStatusChange(...,"ended")` (org queue-end WhatsApp/email with
day stats). `notifyOrgServiceQueueStatusChange` already de-dupes identical transitions.

`AlertTriggerKind` in `server/branch-alerts.ts` gained a documented `"queue_idle"`
member (reserved; not yet written by any helper).
