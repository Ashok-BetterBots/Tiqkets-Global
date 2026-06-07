---
name: Journeys gated on branch queue mode
description: Why the "Customer Journeys / Create Journey" UI stays hidden on the Services page
---

The Customer Journeys section (with "Add Journey" / "Create Journey") on the Services
page — both web dashboard and mobile OrgServicesScreen — is gated on the **branch's**
queue mode being multi-stage (`isMultiStageBranch(branch)` / `isMultiStage`, which read
the branch-level queueMode). It is NOT gated on per-service settings.

**Why this confuses users:** the dashboard settings modal shows the same queue-mode
picker whether "All Services" or a specific service is selected. When a *service* is
selected, `saveSettings()` writes a **per-service override** to
`/services/:id/settings` and never touches the branch's `queue_mode`. So a user who
picks "Multi-Stage" while a service is selected sees no journey option appear — the
branch is still e.g. `selective`, and journeys key off the branch.

**How to apply:** to reveal/create journeys, the *branch* queue mode must be multistage.
In the dashboard, deselect the service ("All Services") before changing queue mode, then
Save. Branch `queue_mode` accepts `multistage` or `multi_stage`; the read path normalizes
both to `"multistage"` (canonicalQueueMode). Journeys are branch-scoped (journeysByBranch,
openJourneyModal(null, branchId)).
