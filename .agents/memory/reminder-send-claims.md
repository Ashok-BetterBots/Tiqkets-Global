---
name: Reminder send claims
description: How one-shot notification timestamps preserve duplicate protection without turning failed delivery attempts into permanent skips.
---

One-shot reminder timestamps can be written before an outbound send to prevent concurrent schedulers from duplicating a message, but that claim must remain set only after successful delivery. If message delivery or required media preparation fails, clear the same claim conditionally so a later scheduler tick can retry.

**Why:** Event reminders were marked as sent before WhatsApp accepted them. A wrong template name or temporary API failure therefore prevented every later retry even though the customer received nothing.

**How to apply:** Any scheduler that uses a sent-at timestamp as both an in-flight lock and completion marker must release its own claim on every failure path while retaining conditional claiming for concurrency safety.