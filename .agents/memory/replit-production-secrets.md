---
name: Production secrets location
description: Where prod secrets live and how to remediate plaintext leaks in .replit
---

`ORG_SESSION_SECRET` and `SUPER_ADMIN_TOKEN` were stored as **plaintext production env vars** in `.replit` under `[userenv.production]` — i.e. committed to git. They are NOT in the encrypted Secrets store (the store has a separate `SESSION_SECRET`). `server/rbac.ts readEnvSecret()` just reads `process.env[name]` and throws in production if missing/<16 chars.

**Rule:** Secrets must live in the encrypted Secrets store (global), never plaintext in `.replit`. `.replit` cannot be edited directly (tool-owned); production env vars are managed via the environment-secrets tooling (`viewEnvVars`/`deleteEnvVars` with `environment:"production"`). Agent cannot WRITE secrets — must `requestEnvVar` from the user.

**Why:** Plaintext in a tracked file = leaked in git history (compromised). Remediation order matters: first ensure the value exists in the encrypted store, THEN `deleteEnvVars({keys, environment:"production"})` — deleting first would make production throw on boot.

**How to apply:** Rotating these logs out the super admin (SUPER_ADMIN_TOKEN cookie) and all org sessions (ORG_SESSION_SECRET HMAC). Migrating the same value avoids re-login; rotating is more secure. Recommend rotation but let the user choose.
