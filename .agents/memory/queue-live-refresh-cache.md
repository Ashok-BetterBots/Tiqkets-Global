---
name: Live-polling endpoints need cache-busting
description: Why the mobile queue didn't reflect web-side changes on pull/poll, and the fix
---

Live-polling GET endpoints consumed by the Expo app (e.g. the branch queue) must
defeat HTTP caching, or the screen shows stale data even on pull-to-refresh.

**Why:** Express adds an ETag and answers repeat GETs with `304 Not Modified`.
The app's `fetch` (in `apiRequest`/`getQueryFn`) sets no `cache` option, so the
native/web HTTP cache keeps serving the previously cached body until it decides
to revalidate. Symptom seen: queue changes made on the web dashboard only
appeared on mobile after navigating away long enough for the cache to expire —
the 8s poll and pull-to-refresh both returned the stale cached body.

**How to apply:** Append a unique query param (`?t=${Date.now()}`) to the fetch
for any live/polled resource (done in `refreshQueueForBranch`). The queue route
reads only `req.params.branchId` and ignores extra query params, so this is safe.
Also do an immediate refresh on screen focus (not just the interval) so the first
paint is fresh. If similar staleness shows up on other polled endpoints
(stats, reservations), apply the same cache-bust there.

## Booking status is not the ticket list

Keep operational live metadata separate from the full branch/configuration
snapshot, and make Home booking controls read that live metadata at their
selected branch, service, or desk scope.

**Why:** Home could refresh queue tickets while continuing to display booking
status from an older configuration snapshot. Visiting Queue happened to refresh
that snapshot, disguising the missing connection. Patching the full branch tree
on every poll previously caused focus-effect cascades and queue-mode reversions.

**How to apply:** manual refresh must fetch live status, not just analytics.
Use the selected branch rather than the first accessible branch. Confirmed
local changes must update the live view too, and older in-flight polls must not
undo them. Verify branch, service, and desk status independently.
