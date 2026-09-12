---
name: Razorpay test customer validation
description: Provider-side validation that affects safe Payment Link test probes.
---

Razorpay Payment Links reject customer contact numbers made from recurring digits, even in test mode.

**Why:** A real test-mode Payment Link request returned `BAD_REQUEST_ERROR` with “Recurring digits in customer contact are disallowed”; the same request succeeded with a varied synthetic number.

**How to apply:** For automated Payment Link creation probes, use a valid-format, non-recurring synthetic Indian number and cancel the test link immediately after validating it.