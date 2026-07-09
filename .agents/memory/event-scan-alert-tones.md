---
name: Event scan alert tones
description: Custom success/error audio tones for Check-In/Check-Out/Parking/Billing scan flows, and the preview→confirm modal pattern for exit actions.
---

Custom MP3 alert tones (not TTS) are played via `client/utils/alertSounds.ts` (`playSuccessTone()`/`playErrorTone()`, expo-av `Audio.Sound`, no-op on web). Used across Check-In, Check-Out, Parking, and Billing redeem flows instead of `expo-speech`.

**Why:** user supplied branded tone assets and wanted consistent audio feedback instead of spoken "Success"/"Error"; expo-av is the established audio pattern elsewhere in the codebase (NotificationService/AnnouncerListener) even though expo-audio is generally preferred.

**How to apply:** any new scan/action screen needing audio feedback should import from `alertSounds.ts` rather than adding a new expo-speech or expo-av instance. `TicketScanResultModal` takes an `action` prop ("checkin"|"exit") that drives a `suppressValidBanner` flag — valid **exit** scans render nothing (banner/details/footer) and the screen closes the modal immediately; only invalid/duplicate exits show the result modal (with auto-dismiss timeout). Check-Out mirrors Check-In's two-step lookup(preview)→confirm flow instead of recording immediately on scan.
