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
