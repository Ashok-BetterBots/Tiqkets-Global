---
name: WhatsApp template dual-source
description: WhatsApp trigger metadata + default bodies are duplicated in two places that must be kept in sync.
---

Adding/renaming a WhatsApp trigger (e.g. a new FIFO trigger) requires editing
BOTH sources, or the org web manager drifts from the rest of the system:
- `shared/wa-templates.ts` — canonical source: `WA_TRIGGERS`, `WA_DEFAULTS_EN`,
  `WA_DEFAULTS_LOCALIZED`. The Super Admin web content manager
  (`super-admin.html`) reads this via `/api/superadmin/whatsapp-defaults`, so it
  auto-updates.
- `server/templates/dashboard.html` — the ORG web WhatsApp manager keeps its OWN
  inline copy (`waTriggersByMode`, `waDefaultsEN`); it does NOT read the shared
  bundle. Must be updated by hand.

**Why:** dashboard.html was never migrated to the shared bundle, unlike
super-admin.html. A trigger added only to shared/ silently won't appear in the
org web manager.

**How to apply:** when touching WhatsApp triggers, grep both `shared/wa-templates.ts`
and `server/templates/dashboard.html` for the trigger key.

Server firing/routing: `server/notifications.ts` `checkAndSendQueueNotifications`
computes position and calls `sendWhatsAppApproachingNotification(...type)`; that
function in `server/whatsapp.ts` maps the internal notif `type` to a template
trigger key (position_3->position, get_ready->get_ready, position_1->almost).
Mobile org settings use `notificationMode` presets, not per-trigger templates.
