---
name: Events billing OTP gate
description: Pattern for gating an existing staff action behind a WhatsApp OTP verification step
---

Billing advance redemption for events is gated behind a customer-verified OTP whenever `events.registrationFee > 0`. A dedicated `eventBillingOtps` table (per-registration code, verified bool, attempts, expiresAt) is checked by the `redeem` route before allowing redemption; `lookup` exposes `otpRequired`/`otpVerified` so the UI can decide whether to show the invoice step or the OTP step.

**Why:** this is a generic "gate an existing action behind a fresh customer-verified code sent over WhatsApp" pattern likely to recur for other high-value actions (e.g. future amount-adjustment confirmations). Reusing `sendEventTrigger(ev, reg, trigger, undefined, extraVars)` for the OTP message keeps it inside the existing approved-template/fallback infra instead of calling the WhatsApp API directly.

**How to apply:** when adding a similar gate, (1) add a dedicated OTP table scoped to the entity being protected rather than reusing the generic `otpCodes` table (keeps expiry/attempts logic and cleanup independent), (2) add a `send-<action>-otp` and `verify-<action>-otp` route pair, (3) check for a `verified=true` row in the protected action's route, (4) surface `otpRequired`/`otpVerified` in the lookup/status response so both web and mobile UIs can branch identically.
