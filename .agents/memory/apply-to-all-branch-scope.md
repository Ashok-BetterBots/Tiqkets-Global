---
name: Apply-to-all branch scoping (Availability & Settings)
description: How "All Branches" scope must fan out writes given the by-id diff in updateBranchSettings.
---

# "All Branches" scope on Availability + Settings

Both the org Availability (operating hours / breaks / holidays) and Settings
(queue mode, notifications, display) surfaces support an "All Branches" scope on
mobile (client/) and web (dashboard.html), plus per-service scope on Settings.

## The core constraint
`OrganizationContext.updateBranchSettings` persists `operatingHours`, nested
`breaks`, and `holidays` by **diffing against that branch's previous state BY
ROW id**. It does NOT replace arrays wholesale.

**Why:** operating-hour rows are seeded per branch with their own ids; breaks and
holidays get server ids after creation.

**How to apply:** To apply a change to every branch, rebuild EACH target branch's
array from THAT branch's own current data, then call updateBranchSettings per
branch. Reusing one branch's array (with its ids) across other branches matches
no ids and silently no-ops. Toggling open/closed: compute the next value once
from the displayed branch, then SET (not per-branch toggle) on all targets so
branches don't diverge.

## Single-branch operations (must NOT fan out)
Editing/toggling/deleting an EXISTING break or holiday targets one record by id,
which only exists on the displayed branch. Keep these single-branch on both
mobile and web. Only hours edits, add-break, and add-holiday fan out.

## Web Settings dual-state
Web keeps `selectedBranchId` pointing at a real branch (announcement devices,
alerts, service list all depend on it) and uses a separate `settingsAllBranches`
flag for save fan-out + scope breadcrumb. The branch `<select>` uses
`:value` + `@change` (not x-model) so the flag and the concrete id stay
independent. "All Branches" option only shown when accessibleBranches.length > 1.

Web Availability (bookings) already fans out via `getBookingTargetBranches()`.

## Verified working (live, dev)
Branch-scope and service-scope saves on the web dashboard were end-to-end tested
(Playwright, real login): a specific-branch change stays on that branch, "All
Branches" fans out to every branch, and a service-level change stays on the
service without touching the branch. When a user reports "scope still leaks to
all," first suspect a STALE PUBLISHED build — the published bundle can predate
the scope fix — or a cached client, before assuming a code regression.

## Override masking + revert — FIXED (clearing via explicit null)
Per-service `serviceSettings` (queueMode/notificationMode/display) MASK the
branch default in the resolver (resolver uses truthy checks: a service value
only wins if truthy). Two bugs flowed from this:
1. A branch / "All Branches" / "All Services" save only wrote the branch default,
   so any service that already had an override kept masking it — the branch
   change appeared to not apply to that service.
2. A service-level save could never revert to the branch value (web sent a diff
   that omitted equal fields; mobile always wrote the value) so a stale override
   survived.

**Fix (the durable mechanism):** the service-settings PUT
(`/branches/:b/services/:s/settings`) treats an explicit `null` value as a
DELETE signal — it merges then removes any key whose incoming value is null, so
the service re-inherits the branch. `null` is also safe in mobile LOCAL state
because the resolver's truthy check ignores it and the branch value wins; the
server drops the key on next refresh.

**How clients use it:**
- Branch-level / all-branches save: after writing the branch default, PUT
  `{field:null}` to every service that overrides a CHANGED field (web:
  `applyServiceOverrideClears` diffs form vs `settingsFormOriginal` snapshot;
  mobile: `clearServiceOverridesForBranch` uses the keys present in the partial
  save). So the branch change re-applies to all services.
- Service-level save: send the value when it differs from the branch-resolved
  value, or `null` when it equals it (clears the override → re-inherit).

**Deliberate decision — only clear EDITED fields, not all overridable fields.**
Even in all-branches mode we clear overrides only for the fields the user
actually changed (diff vs snapshot on web, partial keys on mobile), NOT every
overridable field. **Why:** clearing all of queueMode/notificationMode/display
on every save would silently wipe intentional per-service customization the user
didn't touch. Trade-off: an unedited field that still changes a *different*
branch via all-branches fan-out won't clear that branch's service overrides for
it — accepted as the safer behavior.
