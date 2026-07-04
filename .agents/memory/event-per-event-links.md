---
name: Per-event vs per-branch public event links
description: Event registration links/QR codes must be scoped by eventId, not just branchId, or they silently point at "whichever event is live" on the branch.
---

`loadEventForBranch(branchId)` resolves the most-recently-created published/paused event for a branch — it has no notion of "this specific event". Any public route keyed only on `branchId` (landing page, API, register, QR) will silently start resolving to a *different* event once an older event ends and a newer one is published on the same branch, even though the original link/QR was generated for the older event.

**Why:** Orgs print/share QR codes and links per event (e.g. on posters). If a second event on the same branch goes live later, old codes must keep working for their own event, not redirect to the new one.

**How to apply:** Public event surfaces need two parallel route families:
- Legacy branch-only (`/event/:branchId`, `/api/event/:branchId`, `/api/event/:branchId/register`, `/event-reg-qr/:branchId.png`) — kept forever for back-compat, still resolves via `loadEventForBranch`.
- Canonical per-event (`/event/:branchId/:eventId`, `/api/event/:branchId/:eventId`, `.../register`, `/event-reg-qr/:branchId/:eventId.png`) — resolves via `loadEventById(eventId)` + asserts `ev.branchId === branchId` to prevent cross-branch access with a guessed eventId.
- Share the actual handler body between the two variants (`resolveEvent` callback pattern) rather than duplicating business logic (capacity checks, Razorpay order creation, custom field validation) — that logic is identical, only event resolution differs.
- Any UI that builds a link/QR for a *specific* event object (has `ev.id`) must use the per-event URL, not the branch-only one. Only fall back to branch-only when no event is known yet.
