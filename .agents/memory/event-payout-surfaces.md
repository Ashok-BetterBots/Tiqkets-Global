---
name: Event payout surfaces
description: Where organizer payout work must appear across the product's parallel event dashboards.
---

Event-account organizer features must be added to both the Expo navigation and the legacy web event dashboard's role-tab system.

**Why:** The web `/dashboard` experience is still served from the legacy Alpine template, while the native/Expo experience uses `EventTabNavigator`. Updating only the React navigation makes a feature appear implemented in one client yet completely unreachable for the organizer using the production web dashboard.

**How to apply:** For any event organizer capability, check the native event tabs, the Expo/React web shell if relevant, and the legacy event role tabs together. Keep Ticket Payments separate from the operational event **Billing** tab, which is for attendee payment/redemption work, and enforce the financial-access decision consistently across clients and the server.