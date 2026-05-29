---
name: Dine-In terminal status parity (web vs mobile)
description: Canonical dine-in terminal status is "arrived"; how web dashboard and mobile must agree on labels/counts
---

# Dine-In terminal status = `arrived` (both platforms)

The canonical terminal status for a dine-in guest is **`arrived`** (seated), set via
`POST /api/tickets/:id/arrive` (requires status `called`, also stamps `arrivedAt`).
Mobile (`markAsArrived` in OrganizationContext) and the web org dashboard both use
this same endpoint. Reports/org-stats count `arrived` as the seated/served outcome
(see org-stats-completion.md).

**Why:** the web dashboard (`server/templates/dashboard.html`, Alpine SPA) originally
modelled dine-in as `serving`→`completed` and didn't recognise `arrived` at all, so
the same guest read "Completed" on web but "Arrived" on mobile, and arrived tickets
weren't counted on web. The Seat button now drives `called`→`arrived`.

**Terminal UI bucket must be identical on both:** the dine-in "Arrived" tab counts and
lists `arrived || completed || no_show` (completed kept for legacy web-created tickets;
no_show kept so no-shows stay visible — web had always surfaced them in that bucket).
If you change this set, change it in BOTH `getDineInFiltered()` + the tab count in
dashboard.html AND `arrivedCustomers` in `client/screens/org/OrgQueueScreen.tsx`.

**How to apply:** any new status rendering on web must add the status to the shared
`getStatusLabel`/`getStatusBadgeClass` maps (they serve every queue mode) and to
`updateTicketStatus`'s `endpointMap` if it needs a backend call. The dine-in `serving`
state is now legacy (only a fallback "Done" button finalises any pre-existing serving
tickets); new dine-in flow skips serving entirely.
