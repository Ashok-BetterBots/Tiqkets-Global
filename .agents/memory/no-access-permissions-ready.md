---
name: No-access screen must gate on permissionsReady
description: Why the org "No accessible sections" screen flashes/sticks on logout and the robust gating rule.
---

# Gate "No accessible sections" on a definitive permissions-loaded flag

An empty permission set is ambiguous: it can mean "this user genuinely has no
accessible sections" OR a *transient* state — logout teardown (session cleared in
one batch before the org subtree unmounts) or perms still loading right after
login. Showing the no-access message on empty perms caused a false / flashing /
persistent "No accessible sections" page on logout.

**Rule:** the no-access message must render only when permissions are *definitively
loaded for the signed-in user*. Track a `permissionsReady` boolean in
`OrganizationContext`: set true at every definitive load point (login owner/staff/
super-admin, hydration optimistic w/ cached perms, hydration validate success,
refreshPermissions/refreshOrganizationData success, and once in the hydration
`finally` so a surviving session after a transient/offline validation failure
still renders instead of spinning forever). Reset it false with a single effect
keyed on `!currentUser?.id` — that one effect covers logout and every 401 clear
without touching each clear site. The no-access screen shows a spinner while
`!permissionsReady`.

**Why:** a debounce timer (e.g. 1.5s) is timing-based and fragile — it still
flashes if teardown outlives the timer. Resetting on the absence of a current
user is robust by construction: during logout `currentUser` goes null in the same
batch, so `permissionsReady` is false and only a spinner can show before the
subtree unmounts.

**How to apply:** when a screen's "empty = bad state" condition is also briefly
true during auth transitions, gate the bad-state UI on an explicit
"loaded-for-this-user" flag driven off `currentUser` presence, not a timer.
