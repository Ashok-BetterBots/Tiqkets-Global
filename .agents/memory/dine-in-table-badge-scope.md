---
name: Dine-In table badge data scope
description: Approved current-value-only display for On Hold and Seated table badges.
---

On Hold and Seated table badges must use only the currently stored table number
already received by the app. Do not recover prior assignments from local caches
or history when that value is empty. Resumed and re-held customers without a
new assignment should have no badge.

**Why:** The user explicitly chose the display-only option instead of adding
historical table retention or changing the server.

**How to apply:** Keep assignment/storage and Resume clearing behavior unchanged.
Reuse the Assigned badge appearance only on the Dine-In On Hold and Seated
cards; do not modify Assigned or Waiting cards, or infer a table from other
customer fields.
