---
name: Expo Go manifest packager host
description: Android Expo Go startup behavior when static manifests use path-suffixed packager identity fields.
---

Expo Go manifest fields `extra.expoClient.hostUri` and `extra.expoGo.debuggerHost` must contain the bare public host, without a protocol or `/android`/`/ios` path suffix.

**Why:** An SDK 57 Android Expo Go client remained indefinitely on its native “Loading project…” screen even though the manifest and Android bundle were publicly reachable. Fresh Metro manifests use the same bare host for both platforms; removing the custom platform suffix restored the canonical contract.

**How to apply:** When generating or dynamically rewriting static Expo manifests, set both fields directly to the request’s public host. Keep platform selection in the launch bundle URL and manifest routing, not in the packager identity.

For Expo Go development on Replit, prefer Expo tunnel mode on Android. If ngrok fails, immediately fall back to local Metro with `EXPO_PACKAGER_PROXY_URL=https://<REPLIT_DEV_DOMAIN>` and `REACT_NATIVE_PACKAGER_HOSTNAME=<REPLIT_DEV_DOMAIN>`; Express already proxies the public host to Metro on port 8081. Verify both manifests and launch bundles return 200 and advertise the bare HTTPS Replit host. Exclude Replit’s transient `.local/state/workflow-logs` tree from Metro watching because workflow restarts can delete a watched directory and crash Metro with `ENOENT`.

Rapid workflow restarts can leave Expo CLI's stable tunnel subdomain reserved; SDK 57 CLI may then crash while reading an incomplete ngrok error body. Use a fresh `EXPO_TUNNEL_SUBDOMAIN` per launcher attempt, but do not repeatedly retry an unhealthy tunnel: fall back to the Replit proxy so Metro stays available instead of returning 504.

Do not add `--clear` to every tunnel start or automatic retry. Clearing Metro's cache forces a full Android bundle rebuild while Expo Go is already requesting it, which can produce HTTP 504 responses. Preserve the cache for normal starts and retries; clear it only during targeted cache troubleshooting.