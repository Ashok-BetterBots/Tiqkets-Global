---
name: Razorpay Route onboarding contract
description: The provider contract and privacy rules for Event organizer Route setup.
---

Treat the exact Razorpay Route API version and approved request example as the source of truth for each onboarding step. Carry legal and banking values only in transit to the provider and never persist them or return raw provider diagnostics.

**Why:** Small request-shape differences, including optional or version-specific fields, can produce a generic provider bad-request response. Provider error/status text is not a privacy-safe contract and can expose submitted values.

**How to apply:** Compare every outbound request to the approved provider example before changing it, encode that shape in focused tests, serialize organizer setup so retries resume safely, and expose only generic activation guidance or fixed API error categories.