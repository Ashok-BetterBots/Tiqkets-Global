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

## Automatic booking close is Dine In only

The user explicitly requires automatic closing after **30 consecutive minutes
with no waiting tickets/bookings**, applicable **only to Dine In**. Resolve service
mode overrides before branch mode; Take Away and all other modes must not close
under this rule. Closing bookings must not cancel or change already seated,
called or held customers.

**Why:** the user restricted this rule to restaurant Dine In and required the
normal registered-staff WhatsApp closing alerts.

**How to apply:** persist waiting-transition anchors so short-lived tickets
between scans and server restarts do not lose the empty-queue history. Reopening
or resuming booking starts a fresh window. Do not treat WhatsApp delivery, notes,
recalls or updates to already seated customers as renewed waiting activity.
Legacy queues without an anchor can bootstrap conservatively from prior activity.

Waiting writes and automatic closing must share a service lock; recheck the
effective mode, open status and waiting count before closing. Send the existing
staff close alerts after commit, with the actual prior active status, so stale
notification history cannot suppress a real closure. Respect existing registered
recipient/channel preferences; do not change recipients or provider templates.
