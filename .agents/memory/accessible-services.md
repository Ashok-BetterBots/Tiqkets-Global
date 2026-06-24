---
name: Accessible services per user
description: getAccessibleServices(branchId) in OrgContext — how service-level access control works for staff users
---

## Rule
Always use `getAccessibleServices(branchId)` from `OrganizationContext` when building service dropdowns or lists in org screens — never use `branch.services.filter(s => s.isActive)` directly.

## Why
The server returns ALL services for every accessible branch, regardless of the current user's `assignedServiceIds`. Client-side filtering via `getAccessibleServices` is the authoritative access gate for non-admin users.

## How to apply
- **Roles that see all services**: `admin`, `location_manager` → full list (filtered to `isActive` only)
- **Roles that see assigned services**: `floor_manager`, `front_desk` → `assignedServiceIds` on `currentUser` restricts the list
- **Scope hydration** in OrganizationContext uses `getAccessibleServices` so `selectedServiceId` is always within the user's permitted services
- **Screens that must use it**: OrgDashboardScreen, OrgSettingsScreen, OrgBookingsScreen, OrgQueueScreen (OrgQueueScreen has its own inline filter but is functionally equivalent)
- **Do NOT use**: `selectedBranch?.services?.filter(s => s.isActive)` — bypasses the assignedServiceIds restriction
