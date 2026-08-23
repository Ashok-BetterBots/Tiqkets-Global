---
name: Razorpay Route onboarding contract
description: The provider contract and privacy rules for Event organizer Route setup.
---

For Event ticket payments, use Razorpay's `media_and_entertainment` category and `ticketing` subcategory. Create/update the linked account with only its documented profile fields, create the stakeholder separately, request the Route product with explicit terms acceptance, then submit bank settlement details only in the Route product update. PAN belongs only in stakeholder KYC; never persist bank/PAN/GST data or provider diagnostic text.

**Why:** Human-friendly event category names and sending settlement details during linked-account creation cause Razorpay rejections. Provider error/status text is not a privacy-safe contract and can expose submitted values.

**How to apply:** Normalize the Event form into an explicit allowlisted provider payload, serialize setup by organizer while committing each successful provider ID before the next call, and expose generic activation guidance or fixed API error categories rather than raw provider responses.