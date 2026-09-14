---
name: Expo static-build API domain
description: Domain precedence for embedding the backend API URL in static Expo bundles deployed on Replit.
---

Static Expo production builds and production manifest URL rewriting use the project's explicitly selected canonical API domain rather than whichever Replit domain is injected into the runtime or build environment.

**Why:** The user explicitly confirmed that `tiqketsglobal.replit.app` is the intentional primary backend. A stale runtime `APP_DOMAIN` redirected Expo Go's launch asset to a retired host and Android failed to download the remote update.

**How to apply:** Keep one canonical host in shared backend configuration. Production bundle generation, manifest rewriting, and native API fallback must consume it directly. Development may still inject its current proxied development host.