---
name: Foreground-only ticket audio
description: The intentional iOS lifecycle boundary for ticket-call announcement playback.
---

Ticket-call announcement audio is foreground-only on iOS. Do not declare the `audio` background mode or request background playback in audio sessions.

**Why:** The user explicitly decided not to pursue background audio; ticket calls should sound only while the app is active.

**How to apply:** Preserve the existing foreground trigger, sound asset/play count, silent-mode behavior, volume, wording, voices, languages, and repeat/fallback choices. Push notifications and badges remain independent and must not be changed as part of audio lifecycle or sequencing work.

Sequencing repairs may affect the shared native/web announcer, but not the
independent web dashboard, announcement-player page, or TV display.

**Why:** The user explicitly approved the shared-announcer fix after disclosure
that it contains a web playback path; the approved scope was ordering and
completion tracking, not changes to the audible announcement or device selection.

**How to apply:** Keep the stream, selection, and deduplication contracts intact.
Report simulated callback tests separately from physical-device-build tests;
the user specifically requires the latter rather than Expo Go for audible validation.