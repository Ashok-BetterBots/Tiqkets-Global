---
name: Event plan caps & Gate rename
description: The hard limits of the event account plan, where they live, and the Desks→Gate terminology rule.
---

Event-account plan limits (all HARD-enforced server-side, and each gated on `organizations.accountType === "event"` so non-event orgs are never affected):
- Max 2 ACTIVE events per org (active = status published|paused), org-wide (NOT per-branch). Enforced on the event status-change route when transitioning INTO published; resuming a paused event and re-publishing an already-published one must NOT be blocked (exclude self, count others >= 2). Publishing a 3rd event does NOT silently auto-end anything — the route returns HTTP 409 `{error:"at_capacity", activeEvents:[...]}` and the caller must resend with `confirmEndEventId` in the body to atomically end that one chosen event and publish the new one. See `danger-zone-confirmation-pattern.md` for the client-side warn-then-confirm UI this pairs with.
- Max 5 locations per event (locations = services rows linked via serviceSettings.event.eventId; empty link ⇒ branch's current event). Enforced on the location event-settings PUT; exclude self so editing the 5th passes but creating the 6th fails. applyToAll only edits existing rows → skip the cap for it. Client pre-checks and rolls back the orphan service if the settings write is rejected.
- Max 100 staff per location: enforced in the WINNING /api/dashboard/users POST+PUT copy (billing-routes.ts, not routes.ts); count others (exclude the user being edited) sharing the location in assignedServiceIds.
- Max 100 "Gates" per location: enforced on the desks POST route.

**Why:** requirement was event-account-only; a global cap would wrongly constrain queue/dine-in orgs that also touch these endpoints.

**How to apply:** any new event-plan limit must load the org's accountType and no-op for non-event orgs; surface the plan limits in the Billing "Event Plan" card and keep them in lockstep.

Terminology: in the org dashboard, "Desk(s)" is shown as "Gate(s)" whenever `isEventAccount` is true (desk mgmt section, desk modal, reports Staff&Gates tab + Gate Utilization). Dine-in still overrides to "Station". Non-event queue orgs keep "Desk".
