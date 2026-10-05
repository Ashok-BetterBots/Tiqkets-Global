---
name: Queue page scope and search
description: Single branch/service scope and current-tab-only search on mobile and web Queue pages.
---

The web org dashboard Queue page (server/templates/dashboard.html) intentionally
NEVER offers an "All Branches" or "All Services" choice. A single branch and a
single service are always selected (first accessible of each); only "All Desks"
remains as an aggregate option.

**Why:** Product owner explicitly requested it — operators should always view/work
one specific branch+service at a time, not an aggregate. Do not re-add an "All
Services"/"All Branches" option to the Queue filter to "restore" branch-level
behavior; that reverses an intentional decision.

**How to apply:**
- A helper forces the first accessible service whenever the current pick is empty
  or not valid for the selected branch (runs on data load and on branch change).
- Consequence: the queue STATUS control (Booking Open/Pause/Closed) is service-
  scoped by default (cascades to that service's desks), NOT branch-scoped. This is
  acceptable/intended.
- The branch-level status path is still reached ONLY when the selected branch has
  zero accessible services (filter falls back to empty) — keep that fallback; it
  is not dead code.
- Applies to BOTH the web dashboard Queue page (server/templates/dashboard.html)
  and the mobile Queue page (client/screens/org/OrgQueueScreen.tsx). On mobile the
  reconcile runs in a useEffect (forces servicesForBranch[0]; clears selection to
  null only when the branch has zero accessible services).
- Mobile gotcha: queue-status mutation must gate on `selectedServiceId &&
  selectedService` (validity), NOT just `selectedServiceId` truthiness, so a stale
  service id can never receive the status update — it must fall back to branch.

Queue search by name, Booking ID or phone number must search **only the currently
selected tab**, within the existing accessible branch/service/stage scope. Staff
must still be able to perform the required transactions on filtered entries.

**Why:** the user explicitly requested current-tab-only search with transactions
remaining available. Search must never turn a filtered entry's action into an
operation on an unseen next customer.

**How to apply:** filter display lists, not underlying queue state or totals.
Preserve original booking IDs and queue positions. Keep normal FIFO behaviour
outside search and retain existing server permission checks.
