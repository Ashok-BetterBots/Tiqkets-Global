---
name: Dashboard duplicate route registration
description: Many /api/dashboard/* routes are defined twice; billing-routes.ts wins — edit that copy for runtime behavior.
---

Several `/api/dashboard/*` endpoints (e.g. `POST /api/dashboard/services`, `PUT /api/dashboard/branches/:branchId/settings`) are defined in BOTH `server/routes.ts` and `server/billing-routes.ts`.

**Rule:** `registerRoutes()` calls `registerBillingRoutes(app)` first, so for any duplicated method+path the **billing-routes.ts** handler is the one Express actually serves. The routes.ts copy is dead/shadowed.

**Why:** Editing only the routes.ts copy silently has no effect (cost a round-trip when changing the new-service default queueStatus — the routes.ts edit looked right but the billing-routes.ts handler was the live one).

**How to apply:** Before changing any `/api/dashboard/*` handler, grep BOTH files for the path. If it exists in both, edit the billing-routes.ts version (and keep routes.ts consistent to avoid future confusion).

**Related:** `PUT /api/dashboard/branches/:branchId/settings` (billing-routes.ts) reads individual named fields from req.body; omitted fields become undefined and `storage.updateBranch` → Drizzle `.set()` skips undefined keys. So partial payloads only touch the columns you send — safe for field-scoped saves (e.g. slot-only saves).
