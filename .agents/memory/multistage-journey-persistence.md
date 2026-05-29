---
name: Multi-stage journey persistence
description: Journey stage transitions in OrganizationContext must hit the server, not just local state
---

The multi-stage journey mutators in `client/contexts/OrganizationContext.tsx` (moveToNextStage, moveToStage, skipStage, completeJourney) originally only called `setQueue(...)` — pure local optimistic state. Nothing persisted, so reloads lost stage progress and journey completions never counted toward reports.

**Rule:** Stage transitions must POST to existing endpoints:
- intermediate move: `POST /api/tickets/:id/move-stage` `{ stageId, stageIndex, stageName }` (server appends to stageHistory, sets status `waiting`).
- terminal completion: `POST /api/tickets/:id/complete`.
After the call, resync with `refreshQueueForBranch(branchId)` (+ `refreshStats()` on completion) so the canonical server stageHistory shape replaces the local-shaped optimistic copy.

**Why:** The client and server stageHistory entry shapes differ (client uses serviceId/serviceName/stageIndex; server uses stageName/completedAt/skipped), so always re-fetch rather than trust local. On API failure, await the resync and return `success:false` so callers don't show false success.

**How to apply:** `QueueCustomer` type lacks `branchId` (pre-existing type gap, but the field exists at runtime); cast `(customer as any).branchId` falling back to `branches[0]?.id`.
