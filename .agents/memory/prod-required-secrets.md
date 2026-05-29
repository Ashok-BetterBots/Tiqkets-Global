---
name: Production-required secrets
description: Secrets whose absence crash-loops the production server and blocks publish
---

# Production-required secrets

`server/rbac.ts` calls `readEnvSecret(name)` at module load for `ORG_SESSION_SECRET`
and `SUPER_ADMIN_TOKEN`. In production (`NODE_ENV=production`) a missing/short value
throws; in development it auto-generates and persists a dev secret, so the app runs
fine locally but crash-loops in the deployed container.

**Why:** A crash-loop fails the autoscale startup probe (`GET /` must return 200), so
the publish/promote step fails even though the build phase succeeds. The build logs
look healthy (bundles built, server:build done, "Creating Autoscale service"); the
real cause only shows in runtime deployment logs.

**How to apply:** When a publish fails, distinguish build-phase from promote-phase
failure. If build succeeded, check `fetchDeploymentLogs`. The production secret set is
separate from the workspace secret set — verify with
`viewEnvVars({environment:"production"})`. Note prod historically had `SESSION_SECRET`
(unused by current code) but not `ORG_SESSION_SECRET`. Razorpay/WhatsApp env vars are
read lazily and do NOT block startup.

## Workspace-level vs scoped secrets (important)

`ORG_SESSION_SECRET` was added via `requestEnvVar` as a *scoped* secret, so the agent
could override it with `setEnvVars({environment:"production"})` (it became a production
env var). `SUPER_ADMIN_TOKEN` is a *workspace-level* secret (appears in the original
available_secrets) — the agent CANNOT override or delete it: `setEnvVars` returns
"already set up as secrets" and `deleteEnvVars` reports success but the secret persists.
Only the user can change a workspace secret's value (via `requestEnvVar` prompt or the
Secrets pane).

**Why:** Both must be length >= 16 in production or the server throws at startup.
The required minimum is only 16 chars but use 64-char hex to be safe.

**How to apply:** Deployment containers snapshot secrets at publish time. After updating
a secret value, the user MUST re-publish for a fresh build to pick it up — old
crash-looping builds keep failing with the stale value, which looks like the fix didn't
work. Distinguish "stale build crash-loop" from "value still wrong" by checking build
timestamps vs when the secret was updated.
