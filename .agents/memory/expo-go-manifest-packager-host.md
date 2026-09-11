---
name: Expo Go manifest packager host
description: Android Expo Go startup behavior when static manifests use path-suffixed packager identity fields.
---

Expo Go manifest fields `extra.expoClient.hostUri` and `extra.expoGo.debuggerHost` must contain the bare public host, without a protocol or `/android`/`/ios` path suffix.

**Why:** An SDK 57 Android Expo Go client remained indefinitely on its native “Loading project…” screen even though the manifest and Android bundle were publicly reachable. Fresh Metro manifests use the same bare host for both platforms; removing the custom platform suffix restored the canonical contract.

**How to apply:** When generating or dynamically rewriting static Expo manifests, set both fields directly to the request’s public host. Keep platform selection in the launch bundle URL and manifest routing, not in the packager identity.

For Expo Go development on this Replit project, run Metro with `expo start --localhost` and expose it through the backend’s public HTTPS route. The backend must fetch the live Metro manifest, rewrite `launchAsset.url`, asset URLs, `hostUri`, and `debuggerHost` to the bare public Replit host, and proxy bundle/assets/HMR paths to port 8081.

**Why:** Expo’s ngrok tunnel can fail repeatedly and fall back to a LAN manifest containing `127.0.0.1:8081`; iOS then tries to load Metro from the phone itself. The Replit HTTPS proxy avoids this external tunnel dependency.

**How to apply:** Verify the public iOS and Android manifests directly after a workflow restart. No manifest URL or packager identity may contain localhost/127.0.0.1, and the rewritten public bundle URL must return HTTP 200.