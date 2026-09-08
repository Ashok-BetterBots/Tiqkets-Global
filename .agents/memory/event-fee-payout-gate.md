---
name: Event fee payout gate
description: Conditions that must be satisfied before an event may create or update a registration fee.
---

Events may create or update a registration fee only when the organizer payout profile has a valid Razorpay Product ID and the Route product status is exactly `completed`. Otherwise, saves must persist a zero fee and event UIs must disable the fee field.

**Why:** Paid event setup must not begin before the organizer’s Razorpay Route product has been created and completed.

**How to apply:** Enforce the gate on both create and update endpoints. Use server-side payout-profile state as the authority; UI disabling and messaging are guidance, not the security boundary.