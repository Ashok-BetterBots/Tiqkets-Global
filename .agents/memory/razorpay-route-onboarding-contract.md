---
name: Razorpay Route onboarding contract
description: The provider contract and privacy rules for Event organizer Route setup.
---

Treat the exact Razorpay Route API version and approved request example as the source of truth for each onboarding step. Carry legal and banking values only in transit to the provider and never persist them or return raw provider diagnostics.

**Why:** Small request-shape differences, including optional or version-specific fields, can produce a generic provider bad-request response. Provider error/status text is not a privacy-safe contract and can expose submitted values.

**How to apply:** Compare every outbound request to the approved provider example before changing it, encode that shape in focused tests, serialize organizer setup so retries resume safely, and expose only generic activation guidance or fixed API error categories. Diagnostics may include endpoint, HTTP status, allowlisted provider code/request ID, and a redacted payload shape—never raw values or descriptions.

## Test-mode Route validation findings

For this Route account configuration, linked-account creation requires a non-empty `street2` and rejects the provider `reference_id` as an overlong internal `code`. Keep the deterministic organizer reference only in the local payout profile. The current Route stakeholder endpoint accepts an Indian 8–11 digit national phone and does not document a stakeholder KYC/PAN field; the linked-account `legal_info.pan` remains the PAN submission point.

**Why:** A controlled test-mode run progressed only after making those changes: it created a linked account, stakeholder, and Route product. Temporary unredacted server logs were removed again after identifying each issue. A public bank-validation example IFSC was still rejected by the Route settlement update, so a Route-approved test settlement identifier is still needed to finish that test.

**How to apply:** Keep the test-mode PAN warning, preserve redacted diagnostics in normal operation, resume stored provider IDs on retries, and obtain a Route-specific test bank/IFSC value from Razorpay before treating the product settlement step as verified.

## Existing linked-account retries

After a linked account exists, do not send the generic organizer form as a linked-account PATCH. Resume from the saved provider account ID and continue only the missing stakeholder, Route product, or settlement stage.

**Why:** Razorpay rejects broad account updates once its account/product is in `needs clarification`, allowing only the explicitly requested clarification fields. A generic retry then fails before it can reach the actual pending settlement step.

**How to apply:** Keep provider field diagnostics allowlisted and redacted. Build a dedicated, provider-requested clarification flow only if Razorpay exposes those requested fields; never treat the ordinary setup form as a universal account-update payload.

## Credential mode and linked-account diagnostics

Treat actual Razorpay credential mode (the `rzp_test_` versus `rzp_live_` key prefix) separately from the app's non-production checkout fallback. Only actual test credentials should show the dummy-KYC notice and require the tested dummy PAN/GST. Normalize an Indian `91`-prefixed 12-digit business phone to the national 10-digit number at the `/v2/accounts` boundary.

**Why:** A production deployment can still use test credentials. Razorpay then rejects real KYC data, while its linked-account 400 response may set `field` to null. Razorpay's documented sample sends the Indian national phone without the country code.

**How to apply:** Derive both the UI Test Mode notice and dummy-data enforcement from credential mode. Classify provider `description`/`reason` transiently into allowlisted field/issue enums, but never log, persist, or return raw provider text or submitted KYC values.