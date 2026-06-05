---
name: Shared branch+service scope invariant
description: How the shared branch+service selection stays consistent across Overview/Queue/Availability/Settings on web + mobile, and the cross-branch mismatch footguns.
---

# Shared branch+service scope must never cross branches

The dashboard (web `server/templates/dashboard.html`) and the org screens in the
mobile app share ONE concrete `selectedBranchId` + `selectedServiceId`. The service
must always belong to the selected branch. There is no "All Branches"/"All Services".

## Rule
Every place that changes the branch must re-anchor the service to that branch's first
active service (or null) in the SAME handler — do not rely only on the context
reconcile effect.

**Why:** the mobile `OrganizationContext` reconcile effect (`useEffect` ~line 2700)
is eventual-consistency only. A branch-change handler that sets the branch but leaves a
stale service produces a transient cross-branch combo that gets persisted and
propagates to the other pages before reconcile runs. This was the root cause of the
"Availability shows a service from a different branch" bug.

**How to apply:**
- Mobile: each screen's branch picker handler (OrgDashboardScreen, OrgQueueScreen,
  OrgBookingsScreen, OrgSettingsScreen) must set the service to the new branch's first
  active service. For front-desk users prefer an assigned service that exists in the
  new branch, else fall back to that branch's first active service.
- Web: the scope validators (`navigateTo`, `onSharedBranchChange`,
  `onSharedServiceChange`, `ensureQueueServiceSelected`) must re-snap
  `selectedBranchId` to the first accessible branch when it is empty OR does not
  resolve to an accessible branch — not just when empty.

## Footgun: accessibleServicesFor(falsy)
Web `accessibleServicesFor(branch)` returns services aggregated across ALL branches
when `branch` is falsy. So if `this.selectedBranch` is falsy at validation time, the
service validation `services.some(...)` passes a cross-branch service and `services[0]`
seeds the first branch's first service onto a different selectedBranchId. Always ensure
selectedBranchId resolves to a concrete branch BEFORE calling accessibleServicesFor in
any code that writes selectedServiceId.

`JourneyManagementScreen` uses its OWN local `useState` branch — it does NOT touch the
shared scope, so it is exempt from this rule.
