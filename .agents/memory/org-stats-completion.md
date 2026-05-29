---
name: Org stats — what counts as "served"
description: How dine-in seating maps to the dashboard's "served" metrics
---

Every org "served" metric (Today's Performance Served, Served Report, Weekly/Hourly/Daily trends, service performance) is derived from a chosen set of terminal ticket statuses. The non-obvious decision: **dine-in's served outcome is `arrived` (guest seated), not `completed`.**

**Rule:** A queue mode's "served" set must include whatever status its real-world flow actually ends on. For dine-in that is `arrived` — hosts seat the guest and move on; they do not reliably perform a later "complete" step. So "served" = `completed` OR `arrived`.

**Why:** An active dine-in branch showed 0 across the entire dashboard because every ticket sat in `arrived` forever while metrics counted only `completed`. The in-progress buckets (waiting/serving/called) also exclude `arrived`, so seated guests were invisible everywhere until counted as served.

**How to apply:** Counting both is safe because a ticket holds one status at a time (no double-count). Time-sample math degrades gracefully: service-time needs `completedAt` (arrived skips it), wait-time needs `calledAt` (arrived includes it). When introducing a new queue mode or metric, decide its terminal "served" status explicitly rather than assuming `completed`.
