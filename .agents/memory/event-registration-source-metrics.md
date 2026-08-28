---
name: Event registration source metrics
description: Defines the durable source and revenue semantics for event dashboard reporting.
---

Event registrations created through the authenticated manual-registration endpoint are `store`; registrations created through either public event registration route are `customer`. Event dashboard revenue includes only `customer` registration amounts. Event-account reports must aggregate `event_registrations`; the queue-oriented `tickets` table is only the reporting source for standard organization accounts.

**Why:** Payment method cannot identify the source because store registrations may be paid, complimentary, or unpaid. Historical store rows are recoverable from stage-log entries whose metadata marks the action as manual. Event registrations do not create queue-ticket rows, so reusing queue reports makes every event report card appear empty despite real registrations.

**How to apply:** Any new registration creation path must set its source explicitly. New event revenue/reporting metrics must preserve the customer-only revenue rule unless the product definition changes. Keep event report date, event, location, and source filters on registration fields while leaving standard organization report queries unchanged.