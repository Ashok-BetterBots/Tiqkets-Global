---
name: Onboarding destination follows customer-app setting
description: Defines the shared onboarding flow and its enabled-versus-disabled login destination.
---

Use the same onboarding slides after startup whether the customer-facing app is enabled or disabled. The final action opens customer Sign In when enabled and Organization login when disabled; do not restore a separate disabled-message screen.

**Why:** The onboarding sequence is the common entry experience. The super-admin setting changes only the destination after onboarding, not the onboarding content or whether it appears.

**How to apply:** Keep slide content, design, and slide navigation shared. Wait for the setting to hydrate behind the native splash, then route the onboarding final action from the resolved setting.