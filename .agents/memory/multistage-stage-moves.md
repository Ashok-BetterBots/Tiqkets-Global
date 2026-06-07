---
name: Multi-stage stage moves & desk selector
description: How passing a customer between journey stages must re-queue them, and that the desk selector is annotation, not a list filter.
---

# Multi-stage stage moves re-queue onto the stage's service

When a customer is moved between journey stages (`POST /api/tickets/:id/move-stage`),
updating only the stage pointers (currentStageId/currentStageIndex/stageHistory) is
NOT enough. Each `journey_stages` row can map to a real `serviceId`. To actually
move the customer INTO that stage's queue you must also set the ticket's
`serviceId`/`serviceName`, give it a fresh tail `position` (getNextQueuePosition),
reset `joinedAt`, set `status='waiting'`, clear desk/call/serve markers, and
recalc positions+predictions+notifications for BOTH old and new service. Mirror the
`/change-service` endpoint. **Preserve `formData`** — stage moves must never re-ask
for customer inputs (carry the same info to every stage).

**Why:** the queue list is filtered per service, so without the serviceId change the
moved customer silently stays in the old stage's queue and never appears at the new
stage. Mobile context optimistically changed serviceId locally but the refresh wiped
it because the server didn't persist it.

**How to apply:** any code that advances/jumps stages goes through move-stage; keep
the server as the source of truth for the destination stage's service.

# Desk selector is annotation, not a filter

In the org dashboard the desk dropdown (`queueDeskFilter`) must NOT filter the queue
list. Waiting tickets have no `deskId` until they are called, so filtering by desk
hides everyone. The selected desk is only used to attach `deskId`/`deskName` to the
call/notification payload (via `getSelectedDeskInfo`). Mobile already behaves this
way (it never filtered the list and passes `selectedDesk` to call actions).
