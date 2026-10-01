---
name: Expo Go manifest packager host
description: Android Expo Go startup behavior when static manifests use path-suffixed packager identity fields.
---

Expo Go manifest fields `extra.expoClient.hostUri` and `extra.expoGo.debuggerHost` must contain the bare public host, without a protocol or `/android`/`/ios` path suffix.

**Why:** An SDK 57 Android Expo Go client remained indefinitely on its native “Loading project…” screen even though the manifest and Android bundle were publicly reachable. Fresh Metro manifests use the same bare host for both platforms; removing the custom platform suffix restored the canonical contract.

**How to apply:** When generating or dynamically rewriting static Expo manifests, set both fields directly to the request’s public host. Keep platform selection in the launch bundle URL and manifest routing, not in the packager identity.

For Expo Go development on Replit, use Expo tunnel mode on Android. A Replit-host `exps://` workaround can open on iOS but Android may still resolve the packager as HTTP. `EXPO_PACKAGER_PROXY_URL` takes precedence over Expo’s tunnel URL, so remove that override and run `expo start --tunnel`; install `@expo/ngrok` explicitly so a non-interactive workflow does not stall at the install prompt. A healthy Android launch URL uses an `exp.direct` host, with the manifest and bundle served over HTTPS. Exclude Replit’s transient `.local/state/workflow-logs` tree from Metro watching because workflow restarts can delete a watched directory and crash Metro with `ENOENT`.

Rapid workflow restarts can leave Expo CLI's stable tunnel subdomain reserved; SDK 57 CLI may then crash while reading an incomplete ngrok error body. Use a fresh `EXPO_TUNNEL_SUBDOMAIN` per launcher attempt and bounded retry/backoff so the managed workflow recovers without reusing a stale tunnel.

Do not add `--clear` to every tunnel start or automatic retry. Clearing Metro's cache forces a full Android bundle rebuild while Expo Go is already requesting it, which can produce HTTP 504 responses. Preserve the cache for normal starts and retries; clear it only during targeted cache troubleshooting.

## Nested workflow startup

Ensure each entry-point workflow reaches the Expo server only once. Nested
workflow calls are not deduplicated.

**Why:** A parent started Expo directly and through a child workflow, creating
competing Metro/tunnel processes. The resulting port conflicts and interrupted
startup produced Expo Go HTTP 504 errors even though the backend was healthy.
The user confirmed that the mobile app opened after correcting the duplicate
startup path.

**How to apply:** Inspect both the nested workflow graph and actual process
tree when diagnosing startup timeouts; the configured-workflow list alone can
hide duplicate processes. Keep development watch mode enabled rather than
setting CI globally merely to suppress a port-selection prompt.