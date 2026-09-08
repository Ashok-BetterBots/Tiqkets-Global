---
name: New event fee payout gate
description: Conditions that must be satisfied before a newly created event may have a registration fee.
---

New events may have a registration fee only when the organizer payout profile has a valid Razorpay Product ID and the Route product status is exactly `completed`. Otherwise, creation must persist a zero fee and creation UIs must disable the fee field.

**Why:** Paid event setup must not begin before the organizer’s Razorpay Route product has been created and completed.

**How to apply:** Use server-side payout-profile state as the authority; UI disabling and messaging are guidance, not the security boundary.