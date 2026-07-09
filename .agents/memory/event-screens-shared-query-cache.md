---
name: Event screens need a shared React Query cache
description: Why event-account mobile screens showed "no event available" until visiting another events screen first
---

Multiple event-account screens (Dashboard, Events list, Manage) each independently fetched `/api/dashboard/events*` into their own local component state instead of a shared cache. Whichever screen's own fetch resolved first "warmed up" nothing for the others, so screens visited earlier (e.g. Dashboard right after login) could sit on an empty/stale result while a later-visited screen (Events) fetched successfully — and going back didn't re-fetch since there's no focus-based refetch.

**Why:** local `useState` + manual `fetch` per screen means no cache sharing or dedup; only one screen's copy of the truth exists at a time.

**How to apply:** any new event-data screen should use `useQuery` from `@tanstack/react-query` with the exact same `queryKey` shape already used elsewhere (`["/api/dashboard/events"]` for org-wide, `["/api/dashboard/events/branch", branchId]` for branch-scoped) so screens share one cache. For event accounts, `OrganizationContext` prefetches both queries into `queryClient` right after login/hydration so the cache is warm before any screen mounts.

The web dashboard (`server/templates/dashboard.html`, Alpine.js) had the analogous bug: `loadAllData()` (called on both login and reload-hydration) never loaded events state, even though event accounts default to the Events page as their "Dashboard". Data only populated once the user navigated away and back to Events (`navigateTo` → `loadPageData` → `initEventsPage`/`loadEventsList`). Fixed by having `loadAllData()` also call `initEventsPage()` when `isEventAccount` is true. When adding a new event-account web page, verify it's covered by this initial bootstrap too, not just its own `navigateTo` handler.
