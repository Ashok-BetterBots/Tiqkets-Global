---
name: Native SSE cookie identity gap
description: Why server-side per-user SSE gating that relies on the session cookie silently fails on the mobile app.
---

# Native SSE does not replay the org-session cookie

`react-native-sse` (native EventSource) does not reliably send the org-session
cookie on the SSE connection, so any server endpoint that derives the connected
user via `getRequestUserId(req)` will see `userId === null` on mobile. Browser
`EventSource` (RN web) sends the cookie fine, so the bug is native-only and easy
to miss when testing on web.

**Concrete failure:** queue announcements never fired on the mobile app because
`broadcastAnnouncement` only delivers the dashboard channel to the connection
whose `userId === branch.announcerUserId`, and that userId came purely from the
cookie.

**Why / how to apply:** when a server needs the SSE client's identity for
*delivery scoping* (not authorization), pass it explicitly as a query param and
resolve `getRequestUserId(req) || req.query.userId` (cookie stays authoritative).
This is safe when the client already gates which streams it opens. Do NOT instead
*require* a valid session cookie on such an SSE endpoint as a "fix" — that
re-breaks native for the same reason.
