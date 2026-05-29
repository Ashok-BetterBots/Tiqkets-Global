---
name: Journeys live inside Branches (Services) page, multistage-gated
description: Where customer-journey management lives in the web org dashboard and how its visibility is gated.
---

Customer-journey management is NOT a standalone sidebar page. It is embedded per-branch inside the Branches/Services page via the reusable `client/components/org/JourneyManager.tsx` (single-branch, no branch selector). The old `JourneyManagementScreen` is now a thin wrapper around the same component (branch selector + JourneyManager), still reachable via contextual deep-links from Settings/Queue.

**Effective queue-mode gating rule (reuse everywhere):**
`(branch.settings?.queueMode ?? organization?.settings?.queueMode) === "multistage"`
Journeys UI only renders for branches whose effective mode is multistage. Embedded read access is wrapped in `RequirePermission permission="org.journeys.view"`.

**Why:** Journeys only make sense in multi-stage mode, and they conceptually belong with the services they sequence. Keeping the gate identical on both surfaces (embedded + standalone) prevents non-multistage branches from exposing journey UI.
