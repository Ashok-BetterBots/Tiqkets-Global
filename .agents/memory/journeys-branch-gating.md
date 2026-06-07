---
name: Journeys gated on effective branch multistage
description: When the "Customer Journeys / Create Journey" UI shows on the Services page
---

The Customer Journeys section (with "Add Journey" / "Create Journey") on the Services
page — both web dashboard and mobile OrgServicesScreen — shows when a branch is
**effectively Multi-Stage**:

- If the branch has active services, it counts as Multi-Stage only when **every active
  service** resolves to multistage. A service's effective mode is its per-service
  override (`serviceSettings.queueMode`) falling back to the branch mode.
- If the branch has no active services, fall back to the branch-level queue mode.

**Why:** the dashboard's branch-level "All Services" queue-mode selector was removed;
queue mode is now set per service. Gating journeys purely on the branch's own
`queue_mode` left journeys hidden when users only set multistage per service.

**How to apply:** keep both surfaces in sync —
`isMultiStageBranch()` in `server/templates/dashboard.html` and `isBranchMultiStage()` in
`client/screens/org/OrgServicesScreen.tsx`. Use `||` (not `??`) for the override
fallback so a blank override re-inherits the branch, and prefer `branch.queueMode` then
`branch.settings.queueMode` then org default. Accept both `multistage` and `multi_stage`.
Journeys remain branch-scoped (journeysByBranch, openJourneyModal(null, branchId)).
