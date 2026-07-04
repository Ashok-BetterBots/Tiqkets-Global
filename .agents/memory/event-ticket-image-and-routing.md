---
name: Event ticket image generation & Express route shadowing
description: How the WhatsApp ticket image is rendered, and a route-ordering pitfall under /api/event/*
---

## Ticket image via headless screenshot
The WhatsApp "ticket" image sent on event registration is a real screenshot of the boarding-pass page (`server/templates/event-ticket.html`), not a bare QR code. It's rendered server-side with `playwright-core` using the pre-installed Chromium at `process.env.REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` (no new deps needed — no sharp/canvas required). The template supports an `?embed=1` query mode that hides chrome (feedback/support/toast) and exposes a `body[data-ready="1"]` flag once images load, which the renderer waits on before screenshotting the `.pass` element.

**Why:** Sending only a QR code image lost all the event/booking context; a full designed ticket needed a render pipeline without adding heavy native image libs.

**How to apply:** Any future "render a styled page as an image" need (tickets, receipts, badges) can reuse this same Playwright-screenshot pattern rather than reaching for canvas/sharp.

## Express route shadowing under shared prefixes
Routes are matched by **registration order**, not specificity. `/api/event/:branchId/:eventId` and `/api/event/ticket/:qrToken` are both 2-segment GETs under `/api/event/`, so whichever is `app.get()`-registered first wins for ALL matching requests — including ones clearly intended for the other route ("ticket" gets treated as `:branchId`, the token as `:eventId`).

**Why:** This silently broke the entire ticket-viewing page (returned 404 "No active event for this branch") for every user, undetected because the failure looked like a generic "not found" rather than a routing conflict.

**How to apply:** When adding a new route under a prefix that already has dynamic-segment routes, check for other `app.get/post` calls sharing the same segment count under that prefix, and place the new/more-specific route registration *before* the generic one (or grep `app\.get\("/api/<prefix>` to audit ordering) — do not rely on Express to prefer the "more specific" one automatically.
