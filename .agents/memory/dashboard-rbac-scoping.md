---
name: Dashboard RBAC + apply-to-all scoping
description: How the org dashboard (Alpine SPA) scopes ticket visibility for front_desk and fans out "All Branches" edits.
---

# Front-desk service scoping
- Scope `queueTickets` at the SOURCE in `loadQueueData` (filter by `isServiceAccessible(t.serviceId)`), not per-list. Every downstream count/list/mode (FIFO, selective, check-in, takeaway, dine-in) reads from `queueTickets`, so filtering once there is the only place that covers all of them.
- **Why:** per-list filtering kept leaking (dine-in/takeaway templates render `queueTickets.filter(...)` inline in many spots; easy to miss one).
- Model: `front_desk` = single `branchId` + required `assignedServiceIds`; `floor_manager` = single branch, all services; `location_manager`/`admin` = `branchIds`, all services. Helpers: `accessibleServicesFor(branch)`, `isServiceAccessible(id)`.

# "All Branches" / "All Services" apply-to-all
- On Availability/Queue/Settings, when no specific branch/service filter is chosen, edits must fan out to ALL accessible items, not silently fall back to one branch.
- `getBookingTargetBranches()` returns `[chosen]` or `accessibleBranches`; **always resolve the chosen filter id against `accessibleBranches`** (never raw `this.branches`) so a stale/tampered filter can't widen writes.
- Operating-hour/break fan-out: resolve EACH branch's own operating-hour row by `dayOfWeek` (`operatingHourForBranchDay`) and send that branch's own values with only the changed field — don't reuse the displayed branch's row id/values across branches.
- **How to apply:** any new bulk write on these pages should loop over `getBookingTargetBranches()` and call `loadBranches()` once after.
