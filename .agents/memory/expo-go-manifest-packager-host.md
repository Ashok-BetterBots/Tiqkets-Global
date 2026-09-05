---
name: Expo Go manifest packager host
description: Android Expo Go startup behavior when static manifests use path-suffixed packager identity fields.
---

Expo Go manifest fields `extra.expoClient.hostUri` and `extra.expoGo.debuggerHost` must contain the bare public host, without a protocol or `/android`/`/ios` path suffix.

**Why:** An SDK 57 Android Expo Go client remained indefinitely on its native “Loading project…” screen even though the manifest and Android bundle were publicly reachable. Fresh Metro manifests use the same bare host for both platforms; removing the custom platform suffix restored the canonical contract.

**How to apply:** When generating or dynamically rewriting static Expo manifests, set both fields directly to the request’s public host. Keep platform selection in the launch bundle URL and manifest routing, not in the packager identity.