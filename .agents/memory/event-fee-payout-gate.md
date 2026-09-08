---
name: Event fee payout gate
description: Razorpay Product ID condition required before an event may create or update a registration fee.
---

Events may create or update a registration fee as soon as the organizer payout profile has a valid Razorpay Product ID. Route product status does not gate the fee field. Without the Product ID, saves must persist a zero fee and event UIs must disable the fee field.

**Why:** The organizer may configure paid registration immediately after Razorpay creates the Route product; waiting for a later product-status transition incorrectly blocks setup.

**How to apply:** Enforce the gate on both create and update endpoints. Use server-side payout-profile state as the authority; UI disabling and messaging are guidance, not the security boundary.