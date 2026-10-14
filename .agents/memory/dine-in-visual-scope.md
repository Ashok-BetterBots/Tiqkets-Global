---
name: Dine-In visual scope
description: UI redesign boundaries and the Expo Go gear shown in references.
---

Dine-In Process Queue redesigns must retain existing action handlers and data behavior. Scope presentation overrides to that screen, not other queue modes or shared default styles.

**Why:** The user explicitly requires visual-only changes without changing queue operations or other screens.

**How to apply:** Keep queue actions, form handling, notification/audio behavior and navigation destinations unchanged; optional shared presentation variants must preserve default callers.

Use `#8C1867` for the Process Queue brand accent, replacing the earlier dark plum.

**Why:** The user explicitly requested this updated colour for Process Queue.

**How to apply:** Keep the change local to Dine-In Process Queue; retain blue navigation and green/amber status accents.

The floating blue gear in the supplied phone references belongs to Expo Go, not Tiqkets. Ignore it rather than adding a new app Settings action.

**Why:** The user clarified this after the gear could not be traced to application code.

**How to apply:** Do not treat developer overlay controls visible in screenshots as missing app features.

Bound the viewport when verifying native screen source with React Native Web.

**Why:** A browser fixture with a block-level root let the list expand and pushed its fixed controls out of view, falsely suggesting an application layout defect.

**How to apply:** Give the fixture root and wrapper a bounded flex layout equivalent to the native viewport; label such captures as source previews, not device tests.
