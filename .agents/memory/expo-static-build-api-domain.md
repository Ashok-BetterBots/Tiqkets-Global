---
name: Expo static-build API domain
description: Domain precedence for embedding the backend API URL in static Expo bundles deployed on Replit.
---

Static Expo production builds use the project's explicitly selected canonical API domain rather than whichever Replit domain is injected into the build environment.

**Why:** The user explicitly confirmed that `tiqketsglobal.replit.app` is the intentional primary backend. Build-environment domains must not silently substitute another attached domain into native bundles.

**How to apply:** Keep one canonical host in shared backend configuration and have production bundle generation consume it directly. Development may still inject its proxied development host.