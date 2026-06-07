---
name: Check-in mode "checked in" status
description: What status a checked-in customer gets in checkin queue mode, and how the count is derived, across web + mobile.
---

# Check-in mode: the "checked in" terminal status

In `checkin` queue mode, checking a customer in sets ticket status to **`serving`** (via `POST /api/tickets/:id/serve`), on BOTH web and mobile. The "Checked In" metric counts **`serving || completed`** on both platforms.

**Why:** the server `/serve` path is the only one that both persists the status and fires `sendCheckinConfirmationNotification` for checkin mode. Web already used `serving`; mobile must match it so cross-platform counts agree. Counting only `completed` reads 0 because nothing reaches `completed` from a check-in.

**How to apply:** any new check-in surface must persist through the server (never local-state-only — the queue poll replaces local state every ~8s and silently wipes optimistic mutations), and any "checked in" count must use `serving || completed`, not `completed` alone.
