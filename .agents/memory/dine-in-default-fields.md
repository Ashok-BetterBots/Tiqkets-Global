---
name: Dine-In default custom fields
description: How Dine-In services auto-seed Guests/Gender/Split/Share fields and the mobile/web parity constraints.
---

Dine-In mode services auto-seed four well-known `inputFields` (stable ids):
`partySize` (Guests, number 1-20, required, always-on), `gender` (select, required
when enabled, toggleable), `splitGroup` + `shareTable` (checkbox, required:false,
toggleable). Plus up to `MAX_DINE_IN_CUSTOM_FIELDS` (=3) admin-defined extras.

**Source of truth:** `shared/dineInFields.ts` (builders, `seedDineInFields`,
`isDineInMode`, `isDineInDefaultFieldId`). The web dashboard (`server/templates/dashboard.html`)
is a static Alpine page that CANNOT import TS, so it inlines an equivalent copy of
these constants/builders. **Any change to the shared builders must be mirrored in
dashboard.html in lockstep** — a drift here caused a mobile/web parity bug where
Gender was `required:true` on mobile but `required:false` on web.
**Why:** same feature behaving differently per editor surface = inconsistent
customer validation.

**seedDineInFields is intentionally conservative:** it no-ops if ANY default field
is already present, so it never re-adds a field an admin disabled. It does NOT
backfill partially-seeded data — that is by design (preserving admin toggles wins
over completeness).

**Effective-mode resolution must use the full fallback chain** everywhere it is
computed (server seeding + both editors): service override → branch.queueMode →
branch.settings.queueMode → org.settings.queueMode. Truncating it (e.g. only
service||branch) means services that inherit Dine-In via branch/org settings never
get seeded. `isDineInMode` handles `dinein`/`dine_in`/`dine-in` variants.
