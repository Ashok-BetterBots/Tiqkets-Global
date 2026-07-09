---
name: Manual event registration payment persistence
description: Why manual/offline event registrations need a real payments row and server-side amount validation
---

`eventRegistrations.paymentId` is a varchar(36) FK into the `payments` table — it cannot hold an ad-hoc string. Manual/offline registrations (cash/card/UPI collected outside Razorpay) must insert a real `payments` row (method "manual", status "captured") inside the same transaction and use its UUID as `paymentId`.

**Why:** an oversized non-UUID string in `paymentId` caused a silent 500 ("Internal Server Error") with no useful client-side signal — the FK/column constraint failure only showed up server-side.

**How to apply:** any new manual-payment flow (events, bookings, etc.) should follow the same pattern: write to `payments` first, then reference its id. Also validate `amountCollected >= amountDue` server-side (not just client-side) and return `amountDue`/`amountCollected` in the 400 body so the UI can react.
