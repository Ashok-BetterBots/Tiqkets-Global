---
name: Org /me refresh 401 must retry before logout
description: Why a single 401 from the background org-session refresh must not immediately tear down the session.
---

# Background org-refresh 401 → retry once, don't auto-logout

`refreshOrganizationData()` in `OrganizationContext` fetches `/api/organizations/me` on every
queue/overview screen focus. On a 401 it used to immediately clear the session (setCurrentUser(null)
+ AsyncStorage.multiRemove) → app drops to login.

**Rule:** a single 401 from this *background focus-refresh* is NOT proof the session is dead. On
401, wait ~700ms and re-fetch once; only tear down the session if the retry is also 401. Re-check
the `isStale()` (epoch + auth-epoch) guard after the delay and after the retry.

**Why:** On some Android models the native cookie jar briefly fails to attach the session cookie
right after returning from another Activity — specifically the camera/QR `CheckInScanner` used in
check-in queue mode. Returning to the queue page refocuses it, fires the refresh, gets a spurious
401, and the user gets logged out. This presented as "in check-in mode, navigating to the queue
page logs me out", only on certain devices.

**How to apply:** keep refresh-driven 401 handling tolerant of one transient miss. Don't make
background polls/refreshes destructive on the first 401. Explicit auth actions (login) can still
treat 401 as definitive.
