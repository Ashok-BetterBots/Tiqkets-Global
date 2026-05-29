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
