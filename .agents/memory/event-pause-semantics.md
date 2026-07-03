---
name: Event pause semantics & per-slot capacity
description: How paused events behave across registration/scanning, and slot capacity override conventions
---

# Event pause semantics

Rule: pausing an event blocks only NEW registrations (public register → 403 `{paused:true}`, landing shows paused banner instead of the form). Already-issued tickets stay valid — the staff scan route keeps admitting guests and adds `eventPaused: true` to its responses so consoles (web dashboard + mobile scanner) show a clear paused notice.

**Why:** Attendees who already paid/registered must not be turned away at the gate just because the organizer paused new sales. Spec wording "scanning respects the paused state with clear messaging" was resolved as messaging, not blocking.

**How to apply:** Any new scan/entry surface must pass through `eventPaused` messaging rather than rejecting the ticket. Status transitions: paused only from published; publishing auto-ends other published|paused events on the branch; public loaders treat published|paused as visible.

# Per-slot capacity overrides

`events.slot_capacity_overrides` JSONB map keyed `"YYYY-MM-DD|HH:MM"` → int ≥ 0 (0 closes the slot). Effective capacity = override ?? maxCapacityPerSlot. Server rejects overrides below already-booked guests for that slot.

Gotchas that bit once:
- The dashboard stats endpoint's `slotUsage` is a MAP keyed the same way (`"YYYY-MM-DD|HH:MM"` → guests), not an array — client code must index it, not `.find()`.
- Client-side date-range generation for slot keys must use UTC date arithmetic (`setUTCDate`/`toISOString`), or positive-offset timezones (IST) shift keys a day earlier and overrides land on the wrong slot.
