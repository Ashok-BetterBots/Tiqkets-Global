---
name: Android safe-area positioning
description: Safe-area and system-bar rules for Android edge-to-edge layouts in the Expo SDK 57 app.
---

Use `react-native-safe-area-context` runtime insets for tab bars, modal footers, bottom sheets, scanners, and other edge-pinned content. Preserve each component's existing spacing and add the corresponding inset.

**Why:** Android navigation-bar height varies across gesture and three-button modes. Expo SDK 57 targets Android SDK 36, where edge-to-edge behavior is enforced. The old `androidStatusBar` and `androidNavigationBar` app.json keys are deprecated and have no effect in this SDK.

**How to apply:** Keep one root `SafeAreaProvider` initialized with native window metrics. A core React Native `Modal` creates a separate native root, so a translucent modal with a pinned footer may need its own nested provider; read `insets.bottom` from a child beneath that provider, not from the activity-level provider. Enable navigation-bar translucency and add the modal-local inset inside the pinned surface. React Navigation headers handle top insets; full-screen custom headers must use `insets.top`.