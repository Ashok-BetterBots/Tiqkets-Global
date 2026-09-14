---
name: Expo Go manifest packager host
description: Android Expo Go startup behavior when static manifests use path-suffixed packager identity fields.
---

Expo Go manifest fields `extra.expoClient.hostUri` and `extra.expoGo.debuggerHost` must contain the bare public host, without a protocol or `/android`/`/ios` path suffix.

**Why:** An SDK 57 Android Expo Go client remained indefinitely on its native “Loading project…” screen even though the manifest and Android bundle were publicly reachable. Fresh Metro manifests use the same bare host for both platforms; removing the custom platform suffix restored the canonical contract.

**How to apply:** When generating or dynamically rewriting static Expo manifests, set both fields directly to the request’s public host. Keep platform selection in the launch bundle URL and manifest routing, not in the packager identity.

For Expo Go development on Replit, route Metro through the stable HTTPS Replit preview host by setting `EXPO_PACKAGER_PROXY_URL` and `REACT_NATIVE_PACKAGER_HOSTNAME` to that host and starting Expo with `--localhost`. Express proxies Metro-owned paths to port 8081.

**Why:** An Android device repeatedly failed with `java.io.IOException: Failed to download remote update` while the manifest delegated its launch asset to a temporary ngrok host. Serving the same manifest and bundle through the Replit host returned HTTP 200 with no redirect and removed the extra DNS/tunnel dependency.

**How to apply:** Verify the development manifest's launch asset, `hostUri`, and `debuggerHost` contain the same bare Replit host and no ngrok host. Preserve Metro's cache on routine restarts; clear it only during targeted cache troubleshooting.