---
name: WhatsApp Cloud API silently drops bad numbers
description: Why a WhatsApp template/message send can log success (message id / "sent" status) but the customer never receives it.
---

The WhatsApp Cloud API's `/messages` endpoint does not strictly validate that the `to` field is a complete E.164-style number (country code + subscriber number, digits only, no `+`). If you pass a bare local number (e.g. a 10-digit Indian mobile number with no `91` prefix), the API can still accept the request and return `200` with a `messages[0].id` (wamid) — but the message is never delivered because that digit string doesn't correspond to a real WhatsApp account id.

**Why:** This makes the failure invisible in application logs — everything looks like a successful send (status "sent", wamid present) and the bug only surfaces as a user report of "I never got the message."

**How to apply:** Always build the phone number your app stores/sends with the full country code before it reaches any `sendWhatsApp*` call. Places that collect phone via a country-code picker (e.g. mobile login) already do this; a plain web form with a bare digits-only `<input type="tel">` typically does NOT — normalize there (see `normalizeIndianPhone` in `server/whatsapp.ts`) rather than trusting the Cloud API to reject/complain about a malformed number.
