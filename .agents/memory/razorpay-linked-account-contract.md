---
name: Razorpay linked-account request contract
description: Provider constraints that prevent opaque Route linked-account onboarding failures.
---

Generate linked-account references as deterministic, alphanumeric values no longer than 20 characters, even though the create-endpoint documentation also lists a larger limit. Send the linked-account phone as an integer, while the stakeholder primary phone remains a string.

**Why:** Razorpay’s linked-account entity documentation enforces the tighter 20-character reference limit. A longer identifier is rejected before any local payout profile can be created, and replacing the provider’s response with a generic banner makes the actual rejection impossible to diagnose.

**How to apply:** Keep provider request construction covered by payload contract tests. Bank/KYC inputs and raw provider diagnostics must stay request-only: persist and surface fixed local status/error messages, and retain only allowlisted resource IDs in webhook receipts.