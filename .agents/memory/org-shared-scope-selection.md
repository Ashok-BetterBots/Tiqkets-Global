---
name: Org shared branch+service scope selection
description: How the one shared, persisted branch+service selection works across org Overview/Queue/Availability/Settings on web + mobile, and its lifecycle gotchas.
---

There is ONE shared, concrete (no "All" option) branch+service selection used across
the org Overview(Dashboard), Queue, Availability(Bookings) and Settings screens — NOT
Billing (Billing has no branch/service selector at all).

Persistence keys (same names on both platforms):
- web: localStorage `tiqkets_selectedBranchId` / `tiqkets_selectedServiceId`
- mobile: AsyncStorage `@tiqkets_selectedBranchId` / `@tiqkets_selectedServiceId`

Defaults: first accessible branch + that branch's first ACTIVE service. When the branch
changes, the service is re-validated and re-defaulted if it no longer belongs to the new
branch. Settings edits a concrete target: service-level when a service is selected,
branch-level fallback only when the branch has zero services.

Mobile shared state lives in `OrganizationContext.tsx` (state + persisting setters +
a single reconcile `useEffect` near `getAccessibleBranches`). The effect is loop-safe
because it only calls the setters when the computed value differs.

**Why / gotcha (lifecycle):** the scope must be torn down on every auth-exit path or a
new org/user inherits a stale selection. Every place that clears the org session
(logout + the 401/session-expiry cleanup blocks) MUST also: clear both AsyncStorage
scope keys, reset in-memory `selectedBranchId`/`selectedServiceId` to null, AND reset
the one-shot `scopeHydratedRef` to `false` so the next authenticated session re-hydrates
from storage instead of staying on the previous session's in-memory values.

**How to apply:** if you add another session-teardown path, replicate the three-part
reset (keys + state + `scopeHydratedRef=false`). The hydration ref is set once per
session; without resetting it, re-login in the same app process won't re-read storage.
