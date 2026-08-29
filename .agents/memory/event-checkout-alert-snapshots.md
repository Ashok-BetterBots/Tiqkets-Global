---
name: Event checkout alert snapshots
description: Historical checkout messages must remain immutable across later event-setting changes and support status corrections.
---

Store the checkout alert as a write-once registration snapshot derived by the server during the successful exit transition. If a snapshot already exists, preserve and return it rather than recomputing it.

**Why:** Support can legitimately move an exited registration back to checked-in. Without write-once behavior, a second exit would replace the original title, message, icon, duration, and timestamp with current event settings, corrupting the booking history.

**How to apply:** Any exit or status-correction flow that touches checkout data must keep an existing snapshot unchanged. Use live event settings only when the registration has never captured a checkout alert.