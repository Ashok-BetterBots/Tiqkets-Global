---
name: Ticket issuance outbox boundary
description: Reliability rule for paid event ticket finalization and WhatsApp delivery.
---

Ticket creation and its durable delivery intent must commit together.

**Why:** Creating the queue job after commit leaves a restart window where payment succeeds and the ticket exists, but its WhatsApp delivery is permanently missed.

**How to apply:** Route every issuance path through one idempotent boundary. After payment succeeds, keep the customer in a non-payable preparation state until the ticket is available.