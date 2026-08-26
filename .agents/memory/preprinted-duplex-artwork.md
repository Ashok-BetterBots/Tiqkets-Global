---
name: Pre-printed duplex artwork
description: Product decisions for uploaded physical-ticket artwork and duplex sheet ordering.
---

Store uploaded front and back artwork per event and reuse it for every pre-printed batch. Keep the front and back as separate printable pages, but alternate each front sheet immediately with its matching back sheet.

**Why:** The organizer explicitly chose event-level reuse and duplex printing. Grouping every front sheet before every back sheet pairs the wrong pages when a batch spans multiple sheets.

**How to apply:** Preserve event-level artwork when extending batch creation or printing. Generate matching front/back sheet pairs in ticket order, and treat the supplied 2550×825 structure as a full-width ticket strip rather than a small card.

Designer geometry must remain physically faithful to the 2550×825 print strip. In particular, QR overlays use a square aspect ratio; percentage height is not interchangeable with percentage width on this wide canvas.

**Why:** CSS percentage heights resolve against canvas height while percentage widths resolve against canvas width, so matching numeric percentages distort a QR into a rectangle.

**How to apply:** Size square overlays from width plus `aspect-ratio: 1`. Clamp X by half the width percentage, but clamp Y by half of `width × (2550/825)` because the canvas is wide. Keep client preview and server normalization aligned.