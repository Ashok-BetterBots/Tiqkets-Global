---
name: Razorpay Route API versions
description: Correct endpoint versioning and idempotency rules for organizer-linked Razorpay Route payouts.
---

Use explicit Razorpay API versions: linked accounts, stakeholders, and Route products use `/v2`, while orders, payments, transfers, refunds, and reversals use `/v1`. Payment recovery must keep the provider's stable idempotency key when retrying an order, refund, or reversal.

**Why:** A generic `/v1` URL prefix turns a v2 path into an invalid `/v1/v2/...` endpoint; recreating a request after a timeout without its original idempotency key risks a duplicate charge or transfer.

**How to apply:** Keep provider URL normalization version-aware. Derive idempotency keys from the durable payout allocation—not customer data—and only mark payment recovery complete after ticket issuance reaches its durable terminal state.