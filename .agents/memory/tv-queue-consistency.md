---
name: TV queue consistency
description: Scope and reconciliation rules for TV calls and desk/table assignments.
---

TV displays must reconcile live announcements against the authoritative active
queue in the device's branch and optional service scope. Announcement history
alone is not the current queue. Active customers must remain visible across
midnight, while seated, completed, cancelled or held customers must not remain
the currently called customer.

**Why:** Unscoped branch polling overwrote service-specific calls and assignments.
Live announcements without the same ticket identity as snapshots also caused
incorrect history and refresh behaviour; retaining the last event left finished
customers displayed as current.

**How to apply:** Use consistent ticket identities across live events and
snapshots. Invalidate older in-flight reads when queue changes arrive, refresh
assignment changes even when no announcement is spoken, and keep polling or
history hydration from replaying audio. Device-scoped display snapshots must
omit private customer fields and reject inactive devices.