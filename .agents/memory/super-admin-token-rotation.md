---
name: Super-admin cookie = the admin token (rotation logs everyone out)
description: Why super-admin portal calls suddenly start returning 403 after a deploy/secret change.
---

The super-admin session cookie (`tiqkets_sa`) stores the **literal** super-admin token
value, and `hasSuperAdminCookie` constant-time-compares the cookie against the
server's current token. So rotating the token (changing SUPER_ADMIN_PORTAL_TOKEN /
SUPER_ADMIN_TOKEN and republishing) **instantly invalidates every existing
super-admin browser session** — all `/api/superadmin/*` calls return 403 Forbidden
for anyone who logged in before the rotation.

**Symptom seen by user:** "can't edit/save WhatsApp templates" (and stats/visitors
blank). Logs show earlier PUTs at 200, then a wall of 403s after the redeploy.
A *fresh* login mints a new cookie from the new token and everything works again.

**Why:** the cookie is the credential itself, not a session id mapping to it.

**How to apply:** any time you rotate an admin secret and republish, tell the user
to log out and log back in to the super-admin portal. Don't chase it as a code bug
in the feature that "broke" — check for 403s in deployment logs first. The portal now
treats a 403 on super-admin API calls as an expired session and routes to re-login
(see handleSessionExpired in super-admin.html) instead of a generic "save failed".
