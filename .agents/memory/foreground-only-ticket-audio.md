---
name: Foreground-only ticket audio
description: The intentional iOS lifecycle boundary for ticket-call announcement playback.
---

Ticket-call announcement audio is foreground-only on iOS. Do not declare the `audio` background mode or request background playback in audio sessions.

**Why:** The user explicitly decided not to pursue background audio; ticket calls should sound only while the app is active.

**How to apply:** Preserve the existing foreground trigger, sound asset, silent-mode behavior, and volume. Push notifications and badges remain independent and must not be changed as part of audio lifecycle work.