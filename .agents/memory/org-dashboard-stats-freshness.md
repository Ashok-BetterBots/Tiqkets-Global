---
name: Org home dashboard stats freshness
description: Why the mobile org dashboard's performance numbers can look stale, and the two separate data sources behind them.
---

# Org home dashboard stats freshness

The mobile org Home screen (`client/screens/org/OrgDashboardScreen.tsx`)
shows performance numbers from TWO independent sources:

1. **"Today's Performance"** = `organization.stats` from
   `OrganizationContext`, refreshed via `refreshStats()` (hits
   `/api/branches/<branches[0].id>/stats`). Note it only reflects
   `branches[0]`, not an org-wide aggregate.
2. **Served report / Weekly Trend / Hourly Trend** = two TanStack
   queries against `/api/reports/:orgId/summary` (live-aggregated from
   the `tickets` table server-side; no separate stats table).

**Why this matters:** processing a ticket happens on the Queue tab, but
the Home tab caches its data. If the report queries have a long
staleTime and no focus refetch / polling, the charts show stale numbers
even though the data is persisted. Fix pattern: short staleTime +
refetchInterval + a `useFocusEffect` that refetches on tab focus
(refetch() bypasses staleTime). Include `hourlyTrendPeriod` in the focus
callback deps so the selected hourly period refetches correctly.

**Related landmine:** multi-stage journey completion
(`completeJourney` / `moveToNextStage` in `OrganizationContext`) only
mutates local React state — it never calls the API. Multi-stage dine-in
completions therefore never reach the server and never show in reports.
