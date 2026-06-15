---
name: Theme variant scoping (EventHub vs customer)
description: Two design languages share one app via a ThemeVariant context; rules for keeping them separated.
---

# Theme variant scoping

The Expo app runs TWO visual languages from one codebase:
- **eventhub** — business (org) + super-admin surfaces. Indigo #5669FF primary,
  near-black #120D26 text, muted #747688, lavender #F4F4FE surfaces, Urbanist font.
- **customer** — customer-facing surfaces. Keeps the existing light palette; a
  separate customer design is provided later via its own Figma.

**Mechanism:** a `ThemeVariant` React context (`ThemeVariantProvider` /
`useThemeVariant`, default `"customer"`). `useTheme()` resolves its palette from
`VariantPalette[variant]` and fonts from `VariantFonts[variant]` (both in
`theme.ts`). `Colors.eventhub` mirrors every key of `Colors.light`. Org and
SuperAdmin navigators are wrapped in `<ThemeVariantProvider variant="eventhub">`
in `App.tsx`; the customer RootStackNavigator stays default.

**Why:** the EventHub redesign must NOT bleed into customer screens, and vice
versa. Scoping the variant per-navigator restyles all shared components that read
`useTheme()` (Button, Card, ThemedText/View, ActionButton, EmptyState,
OrgTabNavigator, LocationFields) automatically — no per-component color edits.

**How to apply:**
- Shared components used by business/admin MUST read colors from `useTheme()`,
  never hardcode `Colors.light` / `BrandColors` at module scope. A module-scope
  `const colors = Colors.light` silently ignores the variant (this bit
  LocationFields). Use a `makeXStyles(colors)` factory + `useMemo`.
- Customer-only gradient components (StatsCard, PositionBadge, TicketBadge) keep
  `Colors.light` on purpose — they are customer surfaces.
- App is locked to light mode (`isDark` always false); dark palette unused.
- `ThemedText` applies the variant's Urbanist family mapped by font weight;
  customer variant => null => system font (unchanged).
