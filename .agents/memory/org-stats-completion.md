---
name: Org stats depend on completed status
description: Why org dashboard performance numbers can be empty even when queues are active
---

All org-side metrics (Today's Performance "Served", Served report, Weekly/Hourly trends) are computed from tickets with `status = "completed"`. `getQueueStats` (server/storage.ts) sets `todayServed` = completed tickets joined today; `server/reports.ts` buckets only `completed` tickets.

**Rule:** Every queue mode must expose a way to reach `completed` (POST /api/tickets/:id/complete). If a mode's UI dead-ends at an earlier status, stats/reports stay empty.

**Why:** Dine-in mode (OrgQueueScreen) marked customers "Arrived" but had no Complete action on the arrived card, so tickets never reached `completed` and the whole dashboard read zero despite active queues. FIFO already had completion wired; dine-in was the gap.

**How to apply:** When adding/auditing a queue mode, confirm the final tab/state has a Complete action calling handleComplete → markAsComplete (persists + refreshStats). Note `todayWaiting` counts only waiting/called/serving (NOT arrived), so arrived-but-not-completed tickets vanish from stats entirely.
