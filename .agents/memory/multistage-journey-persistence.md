---
name: Multi-stage journey persistence
description: Journey CRUD and stage transitions in OrganizationContext must hit the server, not just local state
---

## Journey CRUD (addJourney / updateJourney / deleteJourney)

These three context functions were originally local-state only — they generated a client-side ID and mutated `branches` state but never called the API. Created journeys appeared immediately but vanished on navigation because the server had no record of them.

**Rule:** All three must call the REST API and update local state from the server response:
- create:  `POST   /api/dashboard/journeys`               body: `{ branchId, name, description, isActive, stages }`
- update:  `PUT    /api/dashboard/journeys/:journeyId`     body: `{ name, description, isActive, stages }`
- delete:  `DELETE /api/dashboard/journeys/:journeyId`

After a successful call, replace the local branch journeys array with the server-returned journey object (which carries the real DB id and stages).

## Journey stage transitions (moveToNextStage / moveToStage / completeJourney)

Similarly, stage transitions must POST to existing endpoints:
- intermediate move: `POST /api/tickets/:id/move-stage` `{ stageId, stageIndex, stageName }` (server appends to stageHistory, sets status `waiting`).
- terminal completion: `POST /api/tickets/:id/complete`.

After the call, resync with `refreshQueueForBranch(branchId)` (+ `refreshStats()` on completion) so the canonical server stageHistory shape replaces the local-shaped optimistic copy.

**Why:** The client and server stageHistory entry shapes differ (client uses serviceId/serviceName/stageIndex; server uses stageName/completedAt/skipped), so always re-fetch rather than trust local. On API failure, await the resync and return `success:false` so callers don't show false success.

**How to apply:** `QueueCustomer` type lacks `branchId` (pre-existing type gap, but the field exists at runtime); cast `(customer as any).branchId` falling back to `branches[0]?.id`.
