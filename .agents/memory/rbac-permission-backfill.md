---
name: RBAC additive permission backfills
description: How to safely grant a newly-introduced permission key to existing built-in roles.
---

When a new permission key is added to a built-in role's defaults in `shared/permissions.ts`, existing orgs already seeded their `role_permissions` rows and will NOT pick up the new key automatically. A startup backfill in `server/rbac.ts` is required.

Two patterns exist:

1. **Group "anyHasIt" gate** — used when a brand-new key is introduced for several roles at once. It grants the key to all target roles only if *none* of them already have it. **Limitation:** once any target role has the key, the gate is permanently satisfied, so you CANNOT use this same pattern to add the key to one more role later (e.g. adding `front_desk` to a key admin/manager already have) — it will no-op forever.

2. **Persisted one-time marker** — for adding an existing key to an additional role, gate the backfill on a `systemSettings` marker (`storage.getSystemSetting`/`setSystemSetting`, e.g. `backfill:<key>:<role>`). Run once, then set the marker.

**Why the marker matters:** without it, a per-role "if role lacks key, add it" check would re-add the key on every boot, reverting a deliberate Super-Admin matrix removal. The marker guarantees the grant happens exactly once.

**How to apply:** always scope backfill targets to `r.isSystem` built-in roles, append only when missing, and prefer the marker approach for any "add existing key to one more role" correction.
