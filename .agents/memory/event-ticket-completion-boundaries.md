---
name: Event ticket completion boundaries
description: Reliability rules separating paid-registration finalization, ticket display, and WhatsApp delivery.
---

Never report an event registration as complete unless the booking ID and QR token were committed. Retry transient payment-finalization failures, but keep WhatsApp dispatch outside the ticket-success boundary: an already-issued ticket must still be returned and displayed if dispatch startup or later delivery fails.

**Why:** A provider order was paid while its registration remained at `registration_started`, leaving no ticket or ticket-message job. Separately, silent ticket-transaction failure could return HTTP success with no QR, and synchronous dispatch failure could suppress an already-generated ticket.

**How to apply:** Any event registration or payment-flow change must preserve three ordered boundaries: confirm payment, atomically persist ticket identity, then enqueue/send WhatsApp independently. Test each boundary with delivery stubbed.