---
name: org_users display name field
description: The org_users display name lives in the `name` column, not `fullName`.
---

The `org_users` table stores a staff member's display name in the `name` column. There is no `fullName` column.

**Why:** A staff/announcer picker showed each user's email instead of their name because an endpoint mapper read `u.fullName` (undefined) and fell back to `u.email`. The data was fine; the field name was wrong.

**How to apply:** When building any display-name string for org users (pickers, alert recipients, reports), prefer `u.name`. Use email only as a last-resort fallback. If a picker shows emails where you expect names, suspect a `fullName` reference before suspecting missing data.
