---
name: Dine-in queue field categorization
description: How OrgQueueScreen groups dine-in formData into default chips vs. collapsible extras, and the party-size pitfall.
---

# Dine-in queue field categorization

In `client/screens/org/OrgQueueScreen.tsx`, dine-in queue cards and the
manual-add modal split a customer's `formData` into "default" dine-in
details (party size, gender, shared-table / split-seating) shown by
default, and custom restaurant fields hidden behind a More/expand chevron.
Module-level heuristics (`isPartySizeField`, `isGenderField`,
`isShareTableField`, `isSplitTableField`) drive both surfaces.

**Why:** Restaurants add arbitrary custom fields; staff need to decide
seating in 2-3 seconds, so only the operationally critical fields are
surfaced as chips.

**How to apply / pitfall:** Party-size detection must stay narrow.
A broad `/guests?/` pattern wrongly matches labels like "Share table with
other guests", which then suppresses the share/split chips and corrupts
the party-size value. Keep party detection to explicit phrases
(party size, member count, pax, "number of people/guests", head count)
and exclude share/split labels. When seeding party size for manual add,
write BOTH the canonical `partySize` key and any service-defined party
field id, or a required custom party field fails validation.
