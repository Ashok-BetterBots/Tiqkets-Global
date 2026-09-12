---
name: Event payment adapter persistence
description: Durable rules for switching event checkout between Razorpay Route and Direct.
---

Razorpay Route remains the backward-compatible default. Direct uses separate Replit Secrets for its API key, API secret, and webhook secret; credential values must never be stored in system settings or returned to clients.

**Why:** The global payment method can change while a customer checkout is in flight. Verification and webhook recovery must not reinterpret an existing payment using the new global selection.

**How to apply:** Persist the adapter, provider order/link ID, amount, and currency for every checkout. Verification, webhook dispatch, callback recovery, and history classify each transaction from that snapshot/allocation—never from which webhook secret matched, because Route and Direct may share a secret. A hosted-checkout callback may start recovery when a webhook is delayed, but it must ignore callback payment claims and independently fetch and validate the persisted provider link and captured payment. Both adapters converge only at the common captured-payment and ticket-issuance boundary.