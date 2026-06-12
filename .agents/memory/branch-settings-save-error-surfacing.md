---
name: Branch settings save error surfacing
description: Branch-settings optimistic saves must surface failures, not swallow them; and "no announcement" is usually empty config, not a pipeline bug.
---

# Branch settings saves must surface failures

When a branch-settings save (announcer, announcementsEnabled, queueMode, etc.)
appears to succeed in the UI but nothing persists, suspect the **optimistic-save
error path**, not the server.

**Rule:** A failed `PUT /api/dashboard/branches/:id/settings` must (1) roll back the
optimistic `setBranches` patch to the pre-save snapshot, and (2) propagate the error
to the caller so a user-facing Alert fires. The per-branch serialization queue must
stay alive on failure by storing a *separate* swallowed copy of the promise — never
swallow the copy the caller awaits.

**Why:** Both `updateBranchSettings` (queue `.catch(() => undefined)`) and
`doUpdateBranchSettings` (scalar-PUT catch only logged) used to swallow errors, so a
failed save looked successful, the optimistic UI lied, and the announcer picker's
Alert was dead code. A dine-in branch ended up with `announcer_user_id=NULL` and
`display_settings={}` while the operator believed they'd configured it.

**How to apply:** Keep the queue's chained promise swallowed (so the next caller's
`prior.then` still runs) but `await` the raw run in the current caller. Wrap
`saveSetting` call sites in try/catch so toggle handlers don't throw unhandled
rejections.

# "No announcement" diagnosis order

The announcement pipeline (save -> broadcast -> SSE to announcer user's device) is
sound. When announcements "stop working," check the branch config FIRST:
`announcer_user_id` set AND `display_settings.announcementsEnabled = true`. Empty
config is the common cause, not a server bug.

**Reproducing the real HTTP path:** the org session cookie is
`tiqkets_org=<userId>.HMAC_SHA256(ORG_SESSION_SECRET, userId)`. In dev when
ORG_SESSION_SECRET isn't in the shell env, the server falls back to a cached secret
at `node_modules/.cache/tiqkets-dev-secrets.json`; mint a cookie from it (verify with
`GET /api/organizations/me` => 200) to reproduce saves and open an SSE stream as the
announcer for decisive end-to-end evidence. Never print the secret value.
