---
name: Event registration source metrics
description: Defines the durable source and revenue semantics for event dashboard reporting.
---

Event registrations created through the authenticated manual-registration endpoint are `store`; registrations created through either public event registration route are `customer`. Event dashboard revenue includes only `customer` registration amounts. Rows still in `registration_started` are incomplete attempts: retain them for payment recovery/drop-off analysis, but exclude them from registration lists, cards, source totals, and live/TV metrics. Their short capacity hold remains intentional to prevent payment-time overselling. Event-account reports must aggregate `event_registrations`; the queue-oriented `tickets` table is only the reporting source for standard organization accounts.

**Why:** Payment method cannot identify the source because store registrations may be paid, complimentary, or unpaid. Abandoned paid checkouts previously inflated customer and total registration cards, but dropping their temporary capacity hold would risk overselling. Event registrations do not create queue-ticket rows, so reusing queue reports makes every event report card appear empty despite real registrations.

**How to apply:** Any new registration creation path must set its source explicitly. New event registration/reporting metrics must exclude `registration_started`; payment capacity calculations may keep their bounded pending hold. Preserve the customer-only revenue rule unless the product definition changes. Keep event report date, event, location, and source filters on registration fields while leaving standard organization report queries unchanged.