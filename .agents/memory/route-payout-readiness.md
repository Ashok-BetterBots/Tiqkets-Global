---
name: Route payout readiness
description: Rules for safely enabling paid event registrations on Razorpay Route.
---

Paid-event availability is a provider-readiness decision, not just a payment-widget decision. Keep the public page and the registration endpoint fail-closed whenever the provider reports payout setup as unavailable, including before phone OTP/other side effects.

**Why:** A visible checkout-only block still allowed customers to start WhatsApp verification even though the backend knew paid payout setup was unavailable. Route linked-account activation and Route product activation arrive asynchronously and are separate provider states.

**How to apply:** Enable paid registrations only when persisted linked-account status and Route product status are both active. On a signed product-status webhook, re-fetch the linked account before updating readiness; never infer account activation from product activation alone. Preserve provider settlement/reversal data when later transfer snapshots omit those fields.