---
name: Expo browser landing precedence
description: How to distinguish browser QR-page requests from Expo native manifest requests behind Replit's proxy.
---

On the root Expo URL, an explicit `Accept: text/html` request must receive the browser QR landing page before routing based on the `expo-platform` header.

**Why:** Replit's external Expo preview proxy can add `expo-platform: ios` to ordinary Safari requests. Checking only that header causes the browser to display raw Expo manifest JSON instead of the QR page.

**How to apply:** Keep the HTML-acceptance guard before native manifest routing for `/`. Requests from Expo Go that do not request HTML should continue to receive the Expo manifest.