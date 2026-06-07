---
name: Join must set journey/stage fields
description: Multi-stage tickets created via POST /api/join must persist journey columns or dashboard stage navigation stays hidden.
---

The dashboard "Stage Navigation" UI is gated on `selectedTicket.journeyId`. A ticket only shows the pass-to-stage controls when its `journeyId` / `currentStageId` / `currentStageIndex` / `stageHistory` columns are set.

**Rule:** Any code path that creates a multi-stage ticket (`POST /api/join/:branchId`, manual add, etc.) must resolve the entry stage and set those journey columns on `createTicket`, not just stash `formData.journeyId`.

**Why:** The join handler historically only stored `formData.journeyId`, leaving the real columns null, so stage navigation never appeared for any joined/manually-added multi-stage ticket.

**How to apply:**
- `storage.getJourneyWithStages(id)` returns `{ journey, stages }` — branch check is `jw.journey.branchId`, stages are `jw.stages` (easy to get wrong).
- Entry stage: match `stage.serviceId === serviceId`, fallback to index 0 (journey stages may have null `serviceId`).
- `stageHistory` entry shape must match the move-stage endpoint: `{stageId, stageName, startedAt, completedAt:null, skipped:false}` (`stageName` comes from the stage's `serviceName`).
