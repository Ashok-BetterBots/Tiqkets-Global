---
name: Mobile event selection scope
description: Rules for sharing an Event Dashboard selection safely across mobile event tabs.
---

The mobile Event tab navigator owns one session-scoped event selection. Dashboard changes it; Check In, Billing, Parking, Support, and Check Out consume it for labels, selected-event data, and recent activity. Ticket scans and identifier searches remain globally ticket-authoritative and must not reject a valid ticket solely because another event is selected.

**Why:** Independent tab choices made Parking and activity panels show a different event from Dashboard. Naive shared state also allowed late requests, debounces, and modal timers from the previous event to overwrite the newly selected event’s UI.

**How to apply:** Keep the selection provider scoped to the Event navigator and do not persist it through logout. On selection changes, clear event-scoped data and increment a generation/request sequence; every async response and delayed callback must verify that generation before changing UI. Parking-tab visibility is based on whether any accessible event supports parking, while the selected event can show a disabled state.