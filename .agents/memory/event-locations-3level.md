---
name: Event account 3-level IA (Events / Event / Locations)
description: How event-account (accountType==='event') registration is structured across Dashboard, Events, and Locations, and where per-location config lives.
---

# Event account 3-level information architecture

Event accounts reuse the queue primitives with a distinct information architecture:

- **Dashboard** page (`currentPage === 'events'`) = metrics, filterable by Event + Location.
- **Events** page (`currentPage === 'eventManage'`) = event CRUD, publish/pause/end, WhatsApp templates, event-level defaults.
- **Locations** page (`currentPage === 'eventLocations'`) = each event has multiple locations; a **location IS a services row** (branch-scoped). Each location carries its own time slots, capacity, registration fee, and custom input fields.

**Why:** Customers scan an Event QR → pick a location → fill that location's fields → book that location's slot → pay that location's fee. Locations map onto services so the existing queue/service machinery is reused.

## Where per-location config lives
- Per-location event config: `services.serviceSettings.event` = `{operatingHoursStart, operatingHoursEnd, slotDurationMinutes, maxCapacityPerSlot, slotCapacityOverrides ("YYYY-MM-DD|HH:MM"→int), registrationFee}`. `registrationFee` is **paise**.
- Custom fields: `services.inputFields`.
- Event dates are event-level (on the event row), not per-location.
- Resolution (server `resolveLocationConfig`, mirrored client-side in `locationEventCfg`): per-location override else fall back to the event-level field.

## Contracts (server/events-routes.ts)
- `GET /api/event/:branchId` returns `locations[]` (+ back-compat fallback for old single-location clients).
- `POST` register accepts `locationId` + `formData`; validates per-location capacity and required custom fields.
- Stats `?locationId` filter; per-location counts live under **`totals.byLocation`** (keyed by service/location id), NOT top-level. `slotUsage` IS top-level on the stats response.
- `PUT /api/dashboard/events/location/:serviceId/event-settings` body `{config, inputFields?, applyToAll}` — `applyToAll` rewrites every location on the branch. Requires `org.events.manage`.

## Gotchas
- Saving a location on the web dashboard is a **two-endpoint flow**: first `/api/dashboard/services` (POST create / PUT update — needs `org.services.*`), then the event-settings PUT (needs `org.events.manage`). The account owner (**admin**) has both; the `organizer` role has only events perms and is intentionally excluded from the Locations/Events nav (`roles: ['admin','location_manager']`).
- Non-event (organization) accounts must stay untouched — all new UI is gated on `isEventAccount`.
- dashboard.html is served fresh per-request with no-cache, so template edits are live without a backend restart.
