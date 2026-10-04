---
name: Organisation Home analytics scope
description: Product scope for the mobile Home performance cards and charts.
---

Organisation mobile Home's Today's Performance, Served Report, Weekly Trend,
Hourly Trend and Monthly Trend must show the selected branch, service and desk, across all
staff—not only activity processed by the logged-in user. All Desks includes
every desk in the selected branch/service.

**Why:** The user explicitly requested complete performance for the selected
branch and desks, including transactions processed by other users, and limited
the work to Home without affecting other features.

**How to apply:** Keep Home analytics independent of personal staff filters.
Do not remove intentional staff filtering from the separate Reports screen or
change other screens to follow Home's scope without a separate request.

Home request boundaries, daily chart keys and hourly buckets must use the same
calendar timezone. Hourly Trend must include the full day.

**Why:** Home queries already included every staff member, but converting local
midnight to a UTC date made positive-offset devices look up yesterday's totals.
Server-time hour grouping and a 9AM–11PM-only chart also hid some transactions.

**How to apply:** Home uses the organisation timezone, not the device timezone.
The user subsequently requested that all reports use that same organisation
calendar; keep explicit staff filters intact. See [organisation timezone](organisation-timezone.md).

Monthly Trend uses calendar-month totals, not rolling 30-day blocks; include
zero-activity months and clearly mark the current month as month-to-date.

**Why:** Month labels and month-to-date reporting must match the organisation
calendar, including different month lengths and year boundaries.

**How to apply:** Keep month grouping aligned with the organisation date keys
and preserve Home's branch/service/desk scope across all staff.