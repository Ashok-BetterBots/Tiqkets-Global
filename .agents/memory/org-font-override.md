---
name: Org font override via ThemedText
description: Why org (for-business) screens must set explicit fontFamily to render in Nunito instead of Urbanist.
---

The org/for-business side renders under the `eventhub` ThemeVariant, and `ThemedText` resolves its font family from that variant (Urbanist). So a plain `<ThemedText>` on an org screen shows Urbanist even if the design calls for Nunito.

**Why:** The raspberry-branded org dashboard reference uses Nunito (400/500/600/700/800). `ThemedText` maps fontWeight→theme font, but a `style.fontFamily` override wins.

**How to apply:** On org screens that follow `OrgDesign`, put `fontFamily: OrgDesign.fonts.<heavy|bold|semibold|medium|regular>` on every text StyleSheet entry. The weights must also be loaded in `App.tsx` useFonts (Nunito_400/500/600/700/800) or the family name silently falls back.
