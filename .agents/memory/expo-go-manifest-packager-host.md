---
name: Expo Go manifest packager host
description: Android Expo Go startup behavior when static manifests use path-suffixed packager identity fields.
---

Expo Go manifest fields `extra.expoClient.hostUri` and `extra.expoGo.debuggerHost` must contain the bare public host, without a protocol or `/android`/`/ios` path suffix.

**Why:** An SDK 57 Android Expo Go client remained indefinitely on its native “Loading project…” screen even though the manifest and Android bundle were publicly reachable. Fresh Metro manifests use the same bare host for both platforms; removing the custom platform suffix restored the canonical contract.

**How to apply:** When generating or dynamically rewriting static Expo manifests, set both fields directly to the request’s public host. Keep platform selection in the launch bundle URL and manifest routing, not in the packager identity.

For Expo Go development on Replit, use Expo tunnel mode on Android. A Replit-host `exps://` workaround can open on iOS but Android may still resolve the packager as HTTP. `EXPO_PACKAGER_PROXY_URL` takes precedence over Expo’s tunnel URL, so remove that override and run `expo start --tunnel`; install `@expo/ngrok` explicitly so a non-interactive workflow does not stall at the install prompt. A healthy Android launch URL uses an `exp.direct` host, with the manifest and bundle served over HTTPS. Exclude Replit’s transient `.local/state/workflow-logs` tree from Metro watching because workflow restarts can delete a watched directory and crash Metro with `ENOENT`.