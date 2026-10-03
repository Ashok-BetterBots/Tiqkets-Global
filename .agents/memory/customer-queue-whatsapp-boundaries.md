---
name: Customer queue WhatsApp delivery boundaries
description: Media readiness, independent notification channels, and logical-action deduplication for dine-in customer messages.
---

Meta accepting a template request does not prove delivery. For image-header
templates, require successful ticket-image preparation before submitting the
message, and preserve failure so the existing creation worker can retry.

**Why:** Customer booking/table requests were accepted while their image
preparation timed out; the previous fallback could turn a failed approved
template into an apparently successful free-form send outside the conversation
window.

**How to apply:** Keep optional remote fonts and decorative effects out of the
critical image-delivery path. Verify the image endpoint separately from mocked
sender success. Do not claim handset delivery without a controlled test.

Deduplicate concurrent sends by logical action, not merely by template trigger
and a short elapsed-time window. Preserve persistent successful-send markers;
failed attempts must not poison later attempts.

**Why:** Rapid recalls use the same template with different call counts, and
hold/resume/hold can legitimately recur quickly. A trigger-wide time gate
suppresses valid actions as well as duplicate requests.

**How to apply:** Distinct recalls must remain distinct; concurrent duplicates
of one notification share work. Preserve real customer conversation guards for
free-form messages; approved templates do not require that guard.

Notification channels must remain independent, and notification history must
merge against the current database row after asynchronous work.

**Why:** A failed or slow push attempt must not block WhatsApp. Long image
preparation allows other actions to notify meanwhile, so writing an earlier
history snapshot can erase their successful-send markers.

**How to apply:** Dispatch channels independently and append markers atomically.
Do not change Meta templates, credentials, customer phone records, or production
data to work around these pipeline failures.

For Dine-In web QR registrations, Booking Confirmed must show the generated
ticket image used by WhatsApp, without a WhatsApp redirect button. Keep the
server's cached image for no more than 24 hours and remove it automatically,
not only when a later request notices that it has expired.

**Why:** The user explicitly requested this web confirmation behavior and
one-day image retention, with no other changes.

**How to apply:** Scope this behavior to Dine-In. Image-cache cleanup must not
delete booking records or change other modes or already-delivered WhatsApp
messages.

Do not show expected wait time on the Dine-In customer ticket or web Booking
Confirmed page. Keep underlying wait calculations and other queue modes intact.

**Why:** The user requested removal of these customer-facing fields after
confirming the inline ticket/no-redirect confirmation behavior worked.

**How to apply:** Include the WhatsApp ticket image, which renders the same web
ticket. Respect service-level Dine-In overrides as well as branch mode.