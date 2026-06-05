---
name: Dashboard Queue Control shared scope state
description: OrgDashboardScreen and WebOrgDashboard share selectedService/Desk/Branch state — effects run on both platforms.
---

The Home "Queue Control" scope state (selectedBranchId / selectedServiceId /
selectedDeskId) lives in OrgDashboardScreen and is passed down to
WebOrgDashboard (rendered when Platform.OS === "web"). Any reconcile useEffect
must sit BEFORE the `if (Platform.OS === "web") return <WebOrgDashboard/>`
early return (hook-order), which means it ALSO runs for the web dashboard.

**Why:** A reconcile effect that forces a single real service (removing the
"All Services" aggregate) will override an "all" selection on web too. If web
still exposes an "All Services" option it silently reverts → broken UX. So both
native and WebOrgDashboard must be changed in lockstep.

**How to apply:** When changing Queue Control scope semantics, update both files
together. Keep mutation guards aligned with display guards: handleQueueStatusChange
must use the same `selectedServiceId !== "all" && selectedService` check as
getCurrentQueueStatus, since selectedServiceId is transiently "" on mount and on
branch change before the effect repicks. "all" is the branch-level sentinel used
only when a branch has zero services.
