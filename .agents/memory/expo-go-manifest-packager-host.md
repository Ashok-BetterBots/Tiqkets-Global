---
name: Expo Go manifest packager host
description: Android Expo Go startup behavior when static manifests use path-suffixed packager identity fields.
---

Expo Go manifest fields `extra.expoClient.hostUri` and `extra.expoGo.debuggerHost` must contain the bare public host, without a protocol or `/android`/`/ios` path suffix.

**Why:** An SDK 57 Android Expo Go client remained indefinitely on its native “Loading project…” screen even though the manifest and Android bundle were publicly reachable. Fresh Metro manifests use the same bare host for both platforms; removing the custom platform suffix restored the canonical contract.

**How to apply:** When generating or dynamically rewriting static Expo manifests, set both fields directly to the request’s public host. Keep platform selection in the launch bundle URL and manifest routing, not in the packager identity.

For Expo Go development on Replit, start Metro in localhost mode and expose it through the existing Express/Replit HTTPS proxy. Do not make app startup depend on Expo’s ngrok tunnel: an ngrok control-plane failure can stop Metro from opening at all and leave Expo Go with HTTP 504.

The development manifest proxy must rewrite launch-asset and asset URLs from Metro’s loopback origin to the public Replit HTTPS origin. Explicitly clear Metro’s internal `:8081` port while rewriting; assigning only the hostname can retain the old port in WHATWG URLs. Keep `hostUri` and `debuggerHost` as the bare public host.

Preserve Metro’s `application/expo+json` content type and Expo protocol headers when proxying a development manifest. Serving the same update-manifest body as generic `application/json` can make iOS choose the wrong decoder and report a misleading invalid-date error even when `createdAt` is valid RFC 3339.

**Why:** Expo’s ngrok launcher failed before Metro opened, then localhost Metro produced a manifest whose bundle URL still pointed to loopback/port 8081. Starting Metro independently and rewriting the proxied manifest made both manifest and bundle reachable through Replit HTTPS.

**How to apply:** Verify the phone-facing manifest through the public domain with an `expo-platform` header, assert the content type is `application/expo+json`, confirm `createdAt` parses, ensure launch/asset URLs use the same host without port 8081, then fetch the returned bundle URL. Preserve Metro’s cache during normal starts; use `--clear` only for targeted cache troubleshooting.