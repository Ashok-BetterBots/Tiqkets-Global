---
name: Multi-stage stage→service link
description: Why passing a customer between journey stages can fail to move them into the new service
---

Journey stages map to a branch service via `journey_stages.service_id`, but the
journey builder historically submits stages by `service_name` only, leaving
`service_id` NULL. When NULL, the move-stage handler can't find the destination
service and falls back to the ticket's existing `serviceId`, so every stage's
ticket stays pinned to the FIRST service. The customer's `currentStageIndex`
advances (stage-tab view looks fine) but their `serviceId` never changes, so in
any service-scoped view they appear stuck/Waiting at the original service and
never show up under the service they were passed to.

**Why:** stage→service is keyed by id, not name; name-only stages break every
id-based lookup (move-stage destination, join-flow stage detection, client
optimistic `serviceId`).

**How to apply:** keep stage `service_id` populated. `storage.updateJourneyStages`
resolves serviceId by branch-scoped, case-insensitive name match on save; the
move-stage handler does the same name fallback at move time. If diagnosing a
"stuck stage" report, first check `journey_stages.service_id` for NULLs and
whether active tickets' `service_id` matches their `current_stage_id`'s stage.
