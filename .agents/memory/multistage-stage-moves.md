---
name: Multi-stage stage moves & desk selector
description: How passing a customer between journey stages completes the old ticket and creates a fresh one on the next stage, plus that the desk selector is annotation not a list filter.
---

# Passing a stage = complete old ticket + create a fresh next-stage ticket

`POST /api/tickets/:id/move-stage` does NOT mutate one ticket row across stages.
It treats each stage as the customer finishing one service and joining the next:
the source ticket is set `status='completed'` (so it lands in the current
service's served/terminal list and counts toward throughput) AND a brand-new
`waiting` ticket is created on the destination stage's `serviceId` (fresh
ticketNumber/position; carries customerId/name/phone/email, `formData`,
journeyId, currentStage*, the cumulative `stageHistory`, and contact channels
whatsappPhone/whatsappConfirmed/pushToken — but NOT the unique `whatsappRefCode`).
Both writes go through `storage.passTicketToNextStage` in ONE db transaction so a
customer can never be left completed-with-no-next-ticket.

Guard the endpoint: reject terminal source tickets (409) and same-stage no-ops
(400) to stop double-complete / duplicate next-stage tickets on retries.
After the move, recalc positions+predictions for both services and run
`checkAndSendQueueNotifications` on the destination so the FIFO position triggers
(Almost Your Turn / Get Ready) fire; also `sendStageMovedNotification` to tell the
customer they were passed. The endpoint returns `{ ticket: newTicket, previousTicketId }`
— dashboard handlers must re-select `res.ticket.id` after reload (old id is gone).

**Why:** business wants the pass to read as "served here, now waiting there", and
the served metric/queue list must reflect that. Mutating one row left it active in
two places at once and never counted as served. Customer app continuity is handled
by `/api/customers/:id/active-ticket` (returns the single non-terminal ticket), so
it auto-follows to the new ticket — but only if the two writes are atomic, else a
poll in the gap shows the customer as finished.

**How to apply:** any code that advances/jumps stages goes through move-stage; keep
the server as the source of truth and never re-ask for customer inputs.

# Call Customer button in multi-stage is per-service

`canCallTicket` in dashboard.html decides "first in line + nobody called" for FIFO
and multi-stage. In multi-stage each stage is its OWN service queue, so the
waiting/called pool MUST be scoped to `ticket.serviceId` (else only the single
branch-wide front ticket is ever callable and the button vanishes for every other
stage). Selective/dine-in always allow calling.

# Desk selector is annotation, not a filter

In the org dashboard the desk dropdown (`queueDeskFilter`) must NOT filter the queue
list. Waiting tickets have no `deskId` until they are called, so filtering by desk
hides everyone. The selected desk is only used to attach `deskId`/`deskName` to the
call/notification payload (via `getSelectedDeskInfo`). Mobile already behaves this
way (it never filtered the list and passes `selectedDesk` to call actions).
