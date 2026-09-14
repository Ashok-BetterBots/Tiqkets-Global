---
name: Primary backend domain
description: The intentional canonical backend origin for TIQKETS clients and generated public links.
---

Use `https://tiqketsglobal.replit.app` as the primary/default backend origin. Do not substitute `queue.tiqkets.in`.

**Why:** The user explicitly overrode the previous domain preference and confirmed this is intentional.

**How to apply:** Keep client API traffic and generated first-party public URLs routed through the centralized API URL helper. Development may still inject its current reachable host, but production defaults and deployment configuration must use the canonical origin above.