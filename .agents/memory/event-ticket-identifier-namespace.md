---
name: Event ticket identifier namespace
description: Global booking-ID safety and entry behavior for generated and pre-printed event tickets.
---

All human-readable event booking IDs belong to one global namespace. Generated tickets use the `TIQ-` family. New pre-printed tickets use an event-selected uppercase alphanumeric prefix (default `EVT`); previously issued IDs remain immutable. The database registry is the authoritative collision guard, while source-table constraints remain secondary safeguards.

**Why:** Separate uniqueness indexes on registration and inventory tables cannot by themselves prevent a cross-table collision. Prefixes make a collision unlikely, but the database must make it impossible—particularly when legacy ticket data exists.

**How to apply:** Any future ticket issuance or inventory import must reserve its complete booking ID transactionally in the shared registry; never rely on prefixes for uniqueness. Prefix changes affect only future pre-printed inventory. Preserve QR tokens as opaque credentials; inventory is not an attendee ticket until assigned.