---
name: Expo audio mode is app-wide
description: Why every Expo audio path must preserve the iOS background-playback session used by ticket announcements.
---

Treat Expo audio mode as an app-wide session, not a per-player option. If ticket announcements depend on iOS background playback, every other audio utility must preserve `shouldPlayInBackground` instead of resetting it.

**Why:** A foreground-only scan-tone setup can run after the announcer initializes and silently replace the shared iOS Playback session. The announcer may cache its setup as complete, leaving an already-playing ticket call to fade or stop when the app backgrounds.

**How to apply:** Initialize the background-capable session at native app startup. When adding another audio path, keep background playback enabled on iOS; platform-specific foreground-only behavior can remain on Android. A new event arriving after iOS suspends JavaScript is a separate transport issue.