---
name: Expo permission blocking order
description: How to ensure unused Android permissions stay removed after Expo auto-linked config plugins run.
---

Expo auto-linked package plugins can add Android permissions after the static `android.blockedPermissions` processing step. A permission may therefore still appear active in the introspected manifest despite being listed as blocked.

**Why:** During store-compliance hardening, camera, image-picker, and audio plugins re-added recording and media permissions after the initial block configuration.

**How to apply:** Keep package-specific opt-outs where supported, then run a final local config plugin using `AndroidConfig.Permissions.withBlockedPermissions`. Verify the resolved manifest contains `tools:node="remove"` directives for every blocked permission.