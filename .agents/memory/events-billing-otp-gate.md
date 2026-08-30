---
name: Events billing OTP gate
description: Pattern for gating an existing staff action behind a WhatsApp OTP verification step
---

Billing advance redemption for events is gated behind a customer-verified OTP whenever the event has a registration fee and its event-level Billing OTP setting is enabled. Manual/store payments and events with Billing OTP disabled proceed directly to the invoice. Public Registration OTP has its own independent event-level switch and defaults enabled.

**Why:** OTP controls are operational policy, not message-trigger preferences. Keeping them independent avoids accidentally changing ticket messages, reminders, or other WhatsApp behavior when an organizer only wants to remove a verification gate.

**How to apply:** keep each OTP control separate from normal WhatsApp trigger settings. Disabling either control means no OTP message, no OTP requirement, and already-open clients must move immediately to the non-OTP flow.
