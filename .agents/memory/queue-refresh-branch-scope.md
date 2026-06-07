---
name: Queue refresh branch scoping
description: Why the org queue endpoint must return per-ticket branchId, and how RN context refreshes depend on it.
---

# Queue refresh must carry branchId

The RN org dashboard (`client/contexts/OrganizationContext.tsx`) refreshes the queue
after every ticket action (move-stage, complete, call, skip, etc.) using
`(customer as any).branchId || branches[0]?.id`.

**Rule:** any ticket the server returns in `GET /api/branches/:branchId/queue` MUST
include `branchId`. If it doesn't, every one of those ~12 handlers silently falls back
to `branches[0]`, so an org viewing a NON-first branch refreshes the WRONG branch after
an action — the change appears not to happen (e.g. multi-stage "pass to next stage"
looks like the customer never moved, even though the server completed it correctly).

**Why:** the bug is invisible for single-branch orgs and for orgs whose active branch
happens to be `branches[0]`, so it survives casual testing. It only surfaces for
multi-branch orgs on a non-first branch.

**How to apply:** keep `branchId` in the queue response mapping. If adding new
ticket-action handlers in the RN context, prefer the customer's own `branchId`
(now available) over any `branches[0]` fallback.
