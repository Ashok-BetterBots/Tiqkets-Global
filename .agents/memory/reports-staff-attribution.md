---
name: Reports staff attribution (servedBy)
description: Why the org dashboard Staff filter / byStaff report can show nothing, and the attribution rule for tickets.servedBy
---

# Reports staff attribution

The org dashboard Reports Staff filter and `byStaff` aggregation key entirely off
`tickets.servedBy`. If a ticket lifecycle endpoint forgets to set it, the staff
filter silently returns zero rows and `byStaff` is empty — looks like a "filter not
working" bug but is really missing data.

**Rule:** ticket lifecycle endpoints (`/serve`, `/call`, `/complete` in
server/routes.ts) record `servedBy` from the session user. `/serve` is
authoritative (always overwrites); `/call` and `/complete` only set it if unset.

**Why:** `servedBy` is an FK to `org_users.id`. `getRequestUserId(req)` can return an
`owner:`-prefixed pseudo-id (org owner, not in org_users) or null (super-admin), so
only write it when the id is a real org_user — otherwise the FK blows up.

**How to apply:** any new ticket-processing endpoint that a staff member triggers
should set `servedBy` the same guarded way, or reports will under-count that staff.
