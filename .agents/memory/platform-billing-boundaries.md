---
name: BetterBots platform billing boundaries
description: User-required separation, additive scope, and approval gates for BetterBots subscription and usage billing.
---

BetterBots' own subscription and WhatsApp-usage billing must remain separate from both the legacy subscription module and organizations' customer ticket-payment adapters. Do not modify or remove existing subscription/payment records or rewrite existing tables.

**Why:** The user explicitly requires additive billing changes without disrupting customer payment collection or existing queues, ticketing, registration, messaging, announcements, or mobile screens and logic.

**How to apply:** Use separate billing data, routes, and pages. Any observational hooks or entitlement integration needed in existing entry points must be disclosed and approved rather than treated as permission to alter existing flows.

Deliver billing in approval-gated phases. Rehearse schema changes against a copy of production data before production rollout. Suspension must start in dry-run mode and must not be enforced in production without explicit approval.

**Why:** The user requires review after every phase and specifically forbids enabling production suspension without approval.

**How to apply:** Keep billing activation and subscriber conversion separate from schema creation. Preserve legacy behavior until a conversion is explicitly approved; do not silently assign new prices to existing subscribers.
