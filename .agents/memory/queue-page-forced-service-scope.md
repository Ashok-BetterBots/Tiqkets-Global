---
name: Queue page forced single-service scope (web dashboard)
description: Why the web dashboard Queue page always keeps one service selected and never offers "All Services"/"All Branches".
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
- This applies to the WEB dashboard Queue page. Mobile OrgQueueScreen is separate
  and was not part of this request.
