---
name: Per-service availability overrides
description: How Availability (hours/breaks/holidays/slots) resolves per service vs branch, and where the shared resolver lives.
---

Availability (working hours, breaks, holidays, slot duration/capacity) is scoped to the
SELECTED branch AND SELECTED service, with branch values as the fallback.

**Storage model:** per-service overrides live as FULL arrays/values inside
`services.serviceSettings` jsonb (`operatingHours`, `holidays`, `defaultSlotDuration`,
`defaultSlotCapacity`). Setting a key to `null` in the per-service settings PUT clears
the override so the service re-inherits the branch value. Breaks are embedded inside each
operating-hour row in the service-override path (branch path fetches them per row).

**Resolver:** `server/branch-availability.ts` `resolveAvailabilityData(branchId, serviceId?)`
returns effective operating hours (breaks embedded) + holidays. `getBranchAvailability(branchId, now, serviceId?)`
takes an optional serviceId and is the single source of truth used by both admin and consumers.

**Why:** before this, availability was branch-scoped only; a service could not have its own
hours. One shared resolver keeps the admin editors (mobile `OrgBookingsScreen`, web
`dashboard.html`) and the consumer gating (`POST /api/join`) consistent.

**How to apply:**
- Queue join (`POST /api/join`) passes `serviceId` → per-service gating.
- Reservations (`/api/reserve`) have NO service → branch-level only. The reserve slot grid
  derives from the branch's effective operating-hours window + branch slot duration/capacity.
- Reserve weekday must use `getUTCDay()` on the date-only string (parsed as UTC midnight),
  not `getDay()` (server-local drift). Handle overnight windows (openTime > closeTime) by
  splitting into [start, midnight) + [midnight, end).
- Admin first edit seeds the override from the EFFECTIVE (branch) values and sends the full
  array, so a never-customized service shows branch defaults (no blank screens).
