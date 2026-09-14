---
name: Expo static-build API domain
description: Domain precedence for embedding the backend API URL in static Expo bundles deployed on Replit.
---

Static Expo builds must prefer `REPLIT_INTERNAL_APP_DOMAIN` over a manually configured `APP_DOMAIN`.

**Why:** A legacy custom `APP_DOMAIN` can remain configured after its DNS name is retired. Giving it priority embeds an unreachable API host into the mobile bundle, causing every native request to fail even though the current Replit deployment is healthy.

**How to apply:** Keep the current Replit deployment domain first in production build-time resolution. Treat manually configured domains as a fallback, while development continues to use `REPLIT_DEV_DOMAIN`.