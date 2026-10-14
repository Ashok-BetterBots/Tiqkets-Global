---
name: Queue toast scope and native validation
description: Approved boundaries for non-blocking mobile Queue feedback and modal-safe presentation.
---

Mobile Queue success/info confirmations should not require an OK press.
Errors, validation warnings and decision/confirmation dialogs must stay as
dialogs. Scanner result screens, their reset/return timing and navigation are
outside this conversion scope. Do not add new messages to actions that did not
already have a success/info confirmation.

**Why:** Staff must not dismiss a blocking confirmation after each queue action;
the user explicitly approved converting success/info messages only.

**How to apply:** Preserve the original title/message and action ordering. Do
not change queue API calls, status transitions, WhatsApp notifications, existing
action haptics or announcement audio. A toast must introduce no app sound or
vibration of its own; accessibility announcements are required.

The user approved newest-message replacement rather than a FIFO toast backlog,
and one root controller with presentation hosts in native Queue modal windows.
This is not permission to convert notifications on other screens.

**Why:** A backlog would show stale action confirmations, and an ordinary root
overlay cannot reliably appear above separate native modal windows on both
platforms.

**How to apply:** Keep one visible toast and one dismissal clock, including
during native-window handoffs. No new toast dependency without approval.

Acceptance testing must use iOS/Android development or TestFlight builds, not
Expo Go. Unit/source checks, successful bundles and web screenshots are not
proof of native touch-through, safe-area positioning or modal layering.

**Why:** The user explicitly requires actual native-build testing and truthful
reporting of which checks ran.

**How to apply:** Report native device checks separately and never mark an
unexecuted native check as passed.
