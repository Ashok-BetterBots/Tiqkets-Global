---
name: Global typography roles (heading vs body)
description: How app-wide fonts resolve by text role; headings vs body, native vs web, and the commercial-font fallback chain.
---

Typography is global and role-based, defined by `headingFont(weight)` / `bodyFont(weight)` in `constants/theme.ts`:
- **Heading family** — headings, titles, labels, numbers, buttons. Loaded face = Nunito; web CSS stack leads with commercial `'Sofia Pro'`.
- **Body family** — body text, descriptions, captions. Loaded face = Nunito Sans; web CSS stack leads with commercial `'Proxima Nova'`.

`ThemedText` routes the family by `type`: `body`/`small`/`caption` → `bodyFont`, everything else → `headingFont`, at the type's weight. It no longer reads variant fonts.

**Why:** Sofia Pro / Proxima Nova are commercial (no free files), so Nunito / Nunito Sans are the actually-loaded faces; the web stack future-proofs for a licensed webfont while guaranteeing a loaded fallback. The old per-variant Urbanist mapping was replaced.

**How to apply:** For raw `StyleSheet` text (not `ThemedText`), use `OrgDesign.fonts.<heavy|bold|semibold|medium|regular>` (heavy/bold/semibold/medium = headingFont, regular = bodyFont) or call the helpers directly. All weights must be loaded in `App.tsx` useFonts (Nunito + Nunito Sans 400/500/600/700/800) or the family name silently falls back.
