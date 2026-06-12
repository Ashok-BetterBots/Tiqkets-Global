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
