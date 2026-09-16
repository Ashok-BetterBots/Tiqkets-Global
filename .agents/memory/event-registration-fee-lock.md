---
name: Event registration fee lock
description: Durable rules for protecting a saved event registration fee from accidental or bypassed updates.
---

An event fee lock protects the exact saved paise amount across both the main event update route and every per-location fee mutation path. Lock and unlock are explicit organizer/admin actions, separate from ordinary event saves.

**Why:** A disabled input alone cannot protect the amount from stale clients, modified requests, apply-to-all location updates, or future UI bugs. Allowing the normal event payload to toggle the lock would also weaken the protection.

**How to apply:** While locked, allow same-fee and unrelated event saves but reject any changed fee with a conflict response. Preserve the locked amount if payout readiness later disappears; payout readiness still independently controls whether an unlocked fee is editable.