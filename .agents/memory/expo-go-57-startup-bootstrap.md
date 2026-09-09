---
name: Expo Go 57 startup bootstrap
description: Why the Expo app defers loading its full provider tree immediately after registering the root component.
---

Keep the small root bootstrap and defer loading the full application provider tree until Expo Go's native runtime has mounted. Do not replace it with a direct entry-point import without rechecking a physical iOS device.

**Why:** On stock Expo Go 57.0.9 for iOS, a direct full-app import completed bundling and then silently returned to Expo Go Home with no Metro exception. A diagnostic root stayed open, every native subsystem loaded successfully, and the complete app worked when loaded afterward. The automatic delayed bootstrap reproduced that successful behavior and was confirmed on a physical iPhone/iPad.

**How to apply:** Preserve the deferred startup boundary during entry-point or splash-screen refactors. Keep React Navigation screen modules as static imports inside the deferred app tree: `getComponent` callbacks using aliased `require(...).default` caused `WeakMap key must be an Object` / undefined-default startup failures in Expo Go on iOS. SDK upgrades may allow simplification, but verify a true cold launch in stock Expo Go on physical iOS first.