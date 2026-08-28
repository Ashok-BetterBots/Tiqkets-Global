---
name: Mobile event live refresh
description: Non-obvious lifecycle and event-selection rules for reliable Event Version dashboard and activity refreshes.
---

Treat only explicit `background` and `inactive` AppState values as hidden. Expo can temporarily report null/unknown while the app is visibly usable; blocking refreshes unless the value is exactly `active` silently disables focus and polling updates.

**Why:** Dashboard values loaded initially but later revenue, parking, and recent-activity updates were ignored because the refresh gate rejected Expo’s uninitialized/unknown visible state.

**How to apply:** Focus and polling refreshes may run for any AppState except explicit background/inactive. After billing or scan completion, propagate the registration’s event ID and prioritize it over “first active event” resolution so multi-event activity cannot refresh the wrong list.