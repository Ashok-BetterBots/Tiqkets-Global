---
name: Branch audio master scope
description: Shared branch announcement authority versus service settings and local browser audio permission.
---

The Audio announcement master is one value per branch, shared by mobile and web. It must never inherit or save a service override, even when the Settings screen has a service selected.

**Why:** The user explicitly requires branch scope. The generic service-aware Settings save path previously made mobile disagree with the web branch master.

**How to apply:** Read and save the branch value directly for this toggle only. Keep the existing OFF default when no branch value exists; do not promote legacy service overrides or change other display settings.

Browser permission to play sound remains local and requires user interaction; syncing the branch master does not enable browser audio automatically.

**Why:** Browser sound permission and the shared organisational setting are different controls, and the user prohibited changes to playback behaviour.

**How to apply:** Preserve local Enable/Test controls and device selection. A shared OFF must prevent playback without rewriting tone, speech, languages, FIFO timing or notification triggers.
