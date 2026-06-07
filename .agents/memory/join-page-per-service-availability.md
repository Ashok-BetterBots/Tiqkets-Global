---
name: Customer join page — per-service availability
description: How the QR/link queue-join page decides open/closed, and why it is per-service not branch-wide.
---

The customer queue-join page (GET `/api/join/:branchId` → `server/templates/join-queue.html`) must evaluate availability **per service**, not branch-wide.

**Rule:** each active service gets its own `availability` from `getBranchAvailability(branchId, now, service.id)` (honors the service's own operating hours / holidays / breaks with branch fallback, plus the branch `scheduleOverride`). The service's manual `queueStatus` (Booking Open/Paused/Closed) is layered on the client. Only two conditions block the WHOLE branch on this page: branch deactivated (`closed_inactive`) and staff manual branch pause/end (use `manualQueueStatus`, the raw `branch.queueStatus` — NOT the hours-derived `branchQueueStatus`/`effectiveQueueStatus`, which is `ended` whenever branch default hours are closed and would falsely hide everything).

**Why:** branch default schedule is just a fallback; a service can set its own hours. Previously the page computed one branch-level availability with no `serviceId`, so a service open today via its own override was hidden whenever the branch's default day was closed. It only "worked" when `scheduleOverride` was ON (override makes `getBranchAvailability` ignore hours and return open).

**How to apply:** client `enabledEntries` (drives auto-skip-to-form when exactly one) must contain only truly joinable services — a service is joinable iff its schedule state is `open`/`on_break` AND its `queueStatus` is active. The branch queue-status PUT does NOT cascade to services, so branch-wide manual pause/end must stay as its own block. POST `/api/join` already gates per-service via `getBranchAvailability(..., serviceId)` + service `queueStatus`; keep GET and POST consistent.
