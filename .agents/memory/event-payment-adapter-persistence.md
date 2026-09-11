---
name: Event payment adapter persistence
description: Durable rules for switching event checkout between Razorpay Route and Direct.
---

Razorpay Route remains the backward-compatible default. Direct uses separate Replit Secrets for its API key, API secret, and webhook secret; credential values must never be stored in system settings or returned to clients.

**Why:** The global payment method can change while a customer checkout is in flight. Verification and webhook recovery must not reinterpret an existing payment using the new global selection.

**How to apply:** Persist the adapter, provider order ID, amount, and currency for every checkout. Verification and history classify each transaction from that snapshot/allocation, while both adapters converge only at the common captured-payment and ticket-issuance boundary.