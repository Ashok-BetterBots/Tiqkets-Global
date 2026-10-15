---
name: Android launcher branding
description: Scope and colour-contrast constraints for Android-only launcher changes.
---

Keep Android launcher overrides separate from shared icon assets when making
Android-only branding changes. The intended Android mark is the user's supplied
white ticket on a raspberry background.

**Why:** The user reported that the Play Store app appeared as a plain raspberry
box: the previous adaptive foreground was itself raspberry. The requested
correction was Android-specific, not a change to iOS, splash, or web branding.

**How to apply:** Preserve the supplied mark and its contrast. Adaptive and
themed foregrounds need transparency and safe-zone padding, not a solid coloured
square that hides or clips the ticket.

Splash branding is separate: use pure white artwork on the existing splash
backgrounds, and preserve the original logos used by login and headers.

**Why:** The user explicitly requested white only on splash/loading screens,
not a change to launcher icons or other branding.

**How to apply:** Keep a separate splash asset; preserve artwork proportions,
transparency, configured size, backgrounds and startup timing.
