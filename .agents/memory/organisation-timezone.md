---
name: Organisation timezone is authoritative
description: Product rule for organisation reports, charts and notification timestamps.
---

Use the organisation's configured timezone for reports, charts, queue statistics,
CSV timestamp displays and WhatsApp queue-opening/closing dates and times.
The user's organisation timezone is IST (Asia/Kolkata); use IST when an
organisation has no explicit timezone. Do not let phone/server timezone or a
report query parameter override the organisation calendar.

**Why:** The user requested: "Use the organisation timezone for all reports (IST)
the WhatsApp messages which queue open / close time, charts, reports etc..
everything should be as per that."

**How to apply:** Resolve timezone from organisation data, not branch-specific
display settings or device locale. Align date boundaries and daily/hourly/weekday
grouping with that calendar, including midnight and half-hour offsets. Keep UTC
storage, real session anchors, elapsed durations and explicit staff/scope filters
unchanged; this rule concerns reporting and display, not rewriting saved instants
or date-only scheduling fields.