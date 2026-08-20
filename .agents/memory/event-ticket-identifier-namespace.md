---
name: Event ticket identifier namespace
description: Global booking-ID safety and entry behavior for generated and pre-printed event tickets.
---

All human-readable event booking IDs belong to one global namespace. Generated tickets use the `EVT-` family; pre-printed tickets use the traceable `PTK-<batch>-<serial>` family. The database registry is the authoritative collision guard, while the source-table constraints remain secondary safeguards.

**Why:** Separate uniqueness indexes on registration and inventory tables cannot by themselves prevent a cross-table collision. Prefixes make a collision unlikely, but the database must make it impossible—particularly when legacy ticket data exists.

**How to apply:** Any future ticket issuance or inventory import must reserve its booking ID transactionally in the shared registry. Preserve pre-printed QR tokens as opaque credentials; an inventory ticket is not an attendee ticket until it is assigned. Scan and entry paths must explicitly reject available or voided pre-printed inventory and never create an entry transition from it.