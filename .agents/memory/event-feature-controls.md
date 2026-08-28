---
name: Event feature controls
description: Durable rules for per-event parking visibility and WhatsApp trigger switches.
---

Parking visibility and the five configurable WhatsApp triggers (24-hour reminder, 30-minute reminder, check-in success, billing redeemed, and feedback) default to enabled for old and new events. The separate slot-active message is not controlled by these switches. Trigger suppression belongs in the central send path, while reminder scheduling must skip disabled reminders before claiming their one-shot timestamps.

**Why:** Existing events must retain their previous behavior, direct call sites must not bypass organizer choices, and disabled reminders must not create repeated claim/release work.

**How to apply:** When adding event message call sites or organizer surfaces, read the persisted per-event map, preserve enabled defaults for missing keys, and keep slot-active outside this setting unless product scope explicitly changes.