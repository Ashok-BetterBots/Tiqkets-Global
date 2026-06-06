---
name: WhatsApp template sources & flow
description: Where WhatsApp trigger metadata + message bodies live, and how Super Admin edits reach the org dashboard.
---

Single source of truth: `shared/wa-templates.ts` (`WA_TRIGGERS`, `WA_DEFAULTS_EN`,
`WA_DEFAULTS_LOCALIZED`, `getWaTemplateBundle()`). Adding/renaming a trigger only
needs to land here for the live behavior on every surface below.

Super Admin edits = platform-wide rows in the `whatsapp_overrides` table
(mode|triggerKey|language -> content), edited via `/api/superadmin/whatsapp-overrides`.

Resolution precedence (keep all three callers in lockstep):
- Server sender — `server/wa-templates.ts` `getWaTemplateBody`:
  override[mode|key|lang] -> override[mode|key|en] -> localized shared default ->
  English shared default.
- Super Admin web manager (`super-admin.html`) — reads
  `/api/superadmin/whatsapp-defaults` (the shared bundle).
- Org web dashboard Settings -> Messages tab (`dashboard.html`) — reads
  `/api/dashboard/whatsapp-templates` (returns shared bundle + the super admin
  overrides map). `waLoadSuperDefaults()` hydrates trigger/variable/sample/default
  state from the bundle; `waDefaultTemplate()` mirrors the server precedence so the
  org's "default" === what the Super Admin set / what customers receive. Org-level
  tweaks still layer on top via `waOverrides` (localStorage, client-only).

**Why:** the org Messages tab previously used its own hardcoded inline
`waDefaultsEN` copy, so Super Admin edits never reached the org view. It now
fetches the platform templates instead.

**Stale-copy caveat:** `dashboard.html` still keeps inline `waTriggersByMode` /
`waDefaultsEN` etc. as a *fallback* when the fetch fails. They are no longer the
live source but can still drift — if you touch triggers, update both
`shared/wa-templates.ts` and the inline fallback in `dashboard.html`.

Mobile org settings (`OrgSettingsScreen.tsx`) use `notificationMode` presets, not
per-trigger templates — no Messages tab there.
