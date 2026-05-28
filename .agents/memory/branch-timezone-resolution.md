---
name: Branch timezone resolution
description: How working hours / breaks / holidays / booking slots pick their IANA tz, and why empty-string sentinels must be normalised before insert.
---

`server/branch-availability.ts` and all wall-clock schedule math read
`branch.timezone` directly; an unset/empty value falls through to the
schema default `Asia/Kolkata`, which is wrong for any non-IN org.

**Rule:** every code path that writes `branches.timezone` must either
store a valid IANA zone or `null` (meaning "inherit org tz"); never the
empty string, and never skip resolution and let the schema default win.

**Why:** the dashboard's branch modal uses `""` as a UI sentinel for
"Use organization default". If that empty string lands in the DB,
availability logic resolves it to the schema default instead of the
org's tz — silently putting the branch in the wrong locale.

**How to apply:**
- On create: if request omits/empties `timezone`, look up the parent
  org's tz (via `storage.getOrganizationById`) and persist that;
  otherwise persist the validated IANA value.
- On update: normalise `""` → `null`; strip the field entirely if it's
  not a valid IANA zone (validate with `isValidIanaTimezone` from
  `shared/timezone.ts`).
- For multi-tz countries (US, CA, RU, BR, AU, MX, ID, AR, CL, KZ, CN,
  CD, GL) the `country-state-city` package's `timezones[0]` is
  arbitrary — use the curated `MULTI_TZ_DEFAULTS` map in
  `shared/timezone.ts` instead.
