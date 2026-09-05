---
name: Expo Go SDK 57 module compatibility
description: Startup-safe imports for notification and media-library APIs absent from Android Expo Go.
---

Do not statically import `expo-notifications` on Android Expo Go SDK 57. Remote push support was removed from Expo Go, and evaluating the package can throw before the app component imports. Detect Expo Go before dynamically requiring notifications; keep the real module enabled in standalone and development builds.

Use the legacy Media Library entry for Expo Go-compatible gallery saving. SDK 57's default Media Library export loads `ExpoMediaLibraryNext`, which may be absent from the Android Expo Go binary even when the package version passes Expo Doctor.

**Why:** Both failures occurred during the deferred app import, leaving only the bootstrap error screen. Device logs—not Metro dependency checks—identified the unavailable native modules.

**How to apply:** Keep unsupported Expo Go modules out of startup-time static imports. When upgrading Expo, verify native module availability in Expo Go separately from package-version compatibility.