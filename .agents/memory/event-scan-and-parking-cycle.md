---
name: Event scan status checks and parking cycle enforcement
description: Ordering/config-sharing rule for check-in scan validity, and how one-time parking re-entry blocking is enforced.
---

## Scan status must be checked before any write
Both the scan preview (lookup) and scan write endpoints must share one
`validFrom`/`duplicateWhen`/`invalidMsg` config per action, and the preview
endpoint must check status *before* returning success — otherwise a
double-scan can slip through as valid in the UI and only fail (or worse,
silently duplicate) on the write call.

**Why:** staff scan flows show a confirm screen from the lookup response;
if lookup doesn't pre-validate, a "scan again" cycle briefly shows a ticket
as valid before the write rejects it, confusing gate staff.

**How to apply:** keep a single shared transition-rules object referenced by
both the GET (preview/lookup) and POST (commit) scan routes for any event
scan action (check-in, parking, etc.) — never duplicate the validity logic.

## Parking one-time-exit-blocks-re-entry
A customer who has completed one full entry+exit cycle for an event is
permanently blocked from a further entry for that event (registrationId/
bookingId is the identity key, looked up from `eventParkingLogs`).

**Why:** requested to prevent parking pass reuse after a customer has
already left the lot once.

**How to apply:** enforce server-side (count prior entry/exit log rows
before allowing a new entry — reject 409 if `entries>0 && exits>0`), and
mirror the same check client-side for immediate UI feedback before the
staff member even taps "Mark Entry". Manual lot-counter taps (no
registration/booking attached) are NOT subject to this check — only
customer-identified scans are.
