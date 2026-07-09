---
name: Event registration first-attempt payment gets stuck
description: Root cause of "first submission never generates a ticket" for paid event registrations, and how it was diagnosed via production DB row pairs.
---

For paid events, `/register` inserts an `event_registrations` row (status
`registration_started`, amountPaid 0) BEFORE the Razorpay order is created;
the ticket is only issued later via `/api/event/verify-payment`. Any failure
between those two steps (slow/failed Razorpay order-create fetch, or the
customer's browser needing to freshly download `checkout.razorpay.com/v1/checkout.js`
right as they tap submit) leaves that row permanently stuck at
`registration_started` with no ticket — the customer sees nothing happen and
resubmits, and the retry succeeds because the checkout script is now cached.

**Why:** confirmed via production DB query — every successful/paid
registration for the affected event was preceded, ~30s–2.5min earlier, by an
orphaned `registration_started` row for the same event (same person's
abandoned first attempt). The outbound `fetch()` calls to Razorpay had no
timeout, and `checkout.js` was loaded lazily inside `startPayment()` instead
of being preloaded on page load — both add exactly the kind of latency that
turns a slow first attempt into a dead one. The request logger in
`server/index.ts` also truncated log lines to 80 chars total, which silently
cut off the HTTP status code for any request with a long path (e.g. two
UUIDs in `/api/event/:branchId/:eventId/register`), making this invisible in
deployment logs — fixed to only truncate the JSON body tail, never the
method/path/status/duration prefix.

**How to apply:** when debugging "works on retry, not on first try" bugs in
production, query the DB directly for the actual row timeline (don't rely
solely on log greps) — paired abandoned-then-successful rows close in time
are a strong signal of exactly this pattern. Any external HTTPS call inside
a critical write path should have an explicit timeout (`AbortSignal.timeout`)
and its own clearly-tagged error log. Any client-side external script needed
for a critical action (payment SDKs etc.) should be preloaded on page load,
not lazily on the triggering click.
