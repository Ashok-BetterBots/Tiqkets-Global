export type PermissionSurface = "web" | "mobile" | "both";

export interface PermissionDef {
  type: "perm";
  key: string;
  label: string;
  surface: PermissionSurface;
}

export interface PermissionGroup {
  type: "group";
  key: string;
  label: string;
  description?: string;
  children: Array<PermissionGroup | PermissionDef>;
}

const perm = (
  key: string,
  label: string,
  surface: PermissionSurface = "both",
): PermissionDef => ({ type: "perm", key, label, surface });

const group = (
  key: string,
  label: string,
  children: Array<PermissionGroup | PermissionDef>,
  description?: string,
): PermissionGroup => ({ type: "group", key, label, children, description });

export const PERMISSION_CATALOG: PermissionGroup[] = [
  group("dashboard", "Dashboard", [
    perm("org.dashboard.view", "View dashboard"),
    perm("org.dashboard.queue_widget", "Use queue control widget"),
    perm("org.dashboard.analytics", "View performance analytics"),
    perm("org.dashboard.quick_actions", "Use quick actions"),
  ]),

  group("queue", "Live Queue", [
    group("queue.modes", "Queue modes", [
      perm("org.queue.fifo", "FIFO mode"),
      perm("org.queue.selective", "Selective mode"),
      perm("org.queue.checkin", "Check-in mode"),
      perm("org.queue.takeaway", "Takeaway mode"),
      perm("org.queue.dinein", "Dine-in mode"),
      perm("org.queue.multistage", "Multi-stage mode"),
    ]),
    group("queue.actions", "Queue actions", [
      perm("org.queue.mode_change", "Open / close booking (queue status)"),
      perm("org.queue.call_next", "Call next"),
      perm("org.queue.call_specific", "Call specific"),
      perm("org.queue.call_again", "Call again"),
      perm("org.queue.skip", "Skip"),
      perm("org.queue.complete", "Mark complete"),
      perm("org.queue.no_show", "Mark no show"),
      perm("org.queue.hold", "Hold / arrive"),
      perm("org.queue.allocate_table", "Allocate table"),
      perm("org.queue.move_stage", "Move to stage"),
    ]),
  ]),

  group("branches", "Branches", [
    group("branches.tabs", "Tabs", [
      perm("org.branches.view", "View branches tab"),
      perm("org.services.view", "View services tab"),
      perm("org.desks.view", "View desks tab"),
    ]),
    group("branches.actions", "Branch actions", [
      perm("org.branches.create", "Create branch"),
      perm("org.branches.edit", "Edit branch"),
      perm("org.branches.delete", "Delete branch"),
    ]),
    group("services.actions", "Service actions", [
      perm("org.services.create", "Create service"),
      perm("org.services.edit", "Edit service"),
      perm("org.services.delete", "Delete service"),
    ]),
    group("desks.actions", "Desk actions", [
      perm("org.desks.create", "Create desk"),
      perm("org.desks.edit", "Edit desk"),
      perm("org.desks.delete", "Delete desk"),
    ]),
  ]),

  group("bookings", "Bookings", [
    perm("org.bookings.view", "View bookings"),
    perm("org.bookings.calendar", "Calendar view"),
    perm("org.bookings.slots", "Manage slots"),
    perm("org.bookings.block_slot", "Block slot"),
    perm("org.bookings.manual", "Create manual booking"),
  ]),

  group("journeys", "Journeys", [
    perm("org.journeys.view", "View journeys"),
    perm("org.journeys.create", "Create journey"),
    perm("org.journeys.edit", "Edit journey"),
    perm("org.journeys.delete", "Delete journey"),
    perm("org.journeys.stages", "Manage stages"),
  ]),

  group("users", "Team / User Management", [
    perm("org.users.view", "View team"),
    perm("org.users.invite", "Invite user"),
    perm("org.users.edit", "Edit user"),
    perm("org.users.deactivate", "Deactivate user"),
    perm("org.users.assign_role", "Assign role"),
    perm("org.users.assign_branches", "Assign branches"),
    perm("org.users.assign_services", "Assign services"),
  ]),

  group("settings", "Settings", [
    perm("org.settings.view", "View settings"),
    group("settings.tabs", "Settings tabs", [
      perm("org.settings.queue", "Queue processing"),
      perm("org.settings.notifications", "Alerts & notifications"),
      perm("org.settings.display", "Customer display"),
      perm("org.settings.hours", "Operating hours"),
      perm("org.settings.staff", "Staff & security"),
      perm("org.settings.api", "API keys"),
    ]),
    group("settings.actions", "Edit actions", [
      perm("org.settings.queue.edit", "Edit queue processing"),
      perm("org.settings.notifications.edit", "Edit notifications"),
      perm("org.settings.display.edit", "Edit display"),
      perm("org.settings.hours.edit", "Edit hours"),
      perm("org.settings.staff.edit", "Edit staff & security"),
      perm("org.settings.api.edit", "Edit API keys"),
    ]),
  ]),

  group("reports", "Reports & Analytics", [
    perm("org.reports.view", "View reports"),
    perm("org.reports.export", "Export CSV"),
    group("reports.tabs", "Report tabs", [
      perm("org.reports.overview", "Overview"),
      perm("org.reports.trends", "Trends"),
      perm("org.reports.services", "Services"),
      perm("org.reports.staff", "Staff & desks"),
      perm("org.reports.customers", "Customers"),
      perm("org.reports.dinein", "Dine-in"),
    ]),
  ]),

  group("billing", "Billing", [
    perm("org.billing.view", "View invoices"),
    perm("org.billing.download", "Download invoice"),
    perm("org.billing.payment_method", "Manage payment method"),
  ]),

  group("crosscut", "Cross-cutting", [
    perm("org.qrscanner", "QR scanner / check-in"),
    perm("org.announcements.toggle", "Speaker announcements toggle"),
  ]),
];

function flatten(nodes: Array<PermissionGroup | PermissionDef>): PermissionDef[] {
  const out: PermissionDef[] = [];
  for (const n of nodes) {
    if (n.type === "perm") out.push(n);
    else out.push(...flatten(n.children));
  }
  return out;
}

export const ALL_PERMISSIONS: PermissionDef[] = flatten(PERMISSION_CATALOG);
export const ALL_PERMISSION_KEYS: string[] = ALL_PERMISSIONS.map((p) => p.key);

/**
 * Permission keys that grant access to the Live Queue page in the org app.
 * A user with ANY of these permissions can navigate to the Queue tab; the
 * page itself further gates individual action buttons (call_next, skip,
 * complete, etc.) by their specific permission. This avoids hard-coding
 * one action permission as the page-level gate.
 */
export const ORG_QUEUE_NAV_PERMISSIONS: string[] = [
  "org.queue.call_next",
  "org.queue.call_specific",
  "org.queue.call_again",
  "org.queue.skip",
  "org.queue.complete",
  "org.queue.no_show",
  "org.queue.hold",
  "org.queue.allocate_table",
  "org.queue.move_stage",
];

// =============================================================================
// ROLE HIERARCHY RANKS
// Higher rank = more privileges. A caller may only manage (create/edit/delete/
// view) roles AND users whose rank is STRICTLY LESS than their own rank.
// Custom roles default to CUSTOM_ROLE_DEFAULT_RANK.
// =============================================================================
export const BUILT_IN_ROLE_RANKS: Record<string, number> = {
  super_admin: 1000,
  admin: 100,
  location_manager: 80,
  floor_manager: 40,
  front_desk: 20,
};
export const CUSTOM_ROLE_DEFAULT_RANK = 30;

/** Resolve the effective rank for a role row or role key. */
export function getRoleRank(
  roleOrKey: string | { key?: string | null; rank?: number | null } | null | undefined,
): number {
  if (!roleOrKey) return 0;
  if (typeof roleOrKey === "string") {
    return BUILT_IN_ROLE_RANKS[roleOrKey] ?? CUSTOM_ROLE_DEFAULT_RANK;
  }
  if (typeof roleOrKey.rank === "number") return roleOrKey.rank;
  if (roleOrKey.key) return BUILT_IN_ROLE_RANKS[roleOrKey.key] ?? CUSTOM_ROLE_DEFAULT_RANK;
  return CUSTOM_ROLE_DEFAULT_RANK;
}

export const BUILT_IN_ROLES: Array<{
  key: string;
  name: string;
  description: string;
  scope: "platform" | "organization";
  permissions: string[] | "ALL";
}> = [
  {
    key: "super_admin",
    name: "Super Admin",
    description: "Full platform control across all organizations.",
    scope: "platform",
    permissions: "ALL",
  },
  {
    key: "admin",
    name: "Admin",
    description: "Full control of a single organization.",
    scope: "organization",
    permissions: "ALL",
  },
  {
    key: "location_manager",
    name: "Location Manager",
    description: "Manages branches, services, and team within an organization.",
    scope: "organization",
    permissions: ALL_PERMISSION_KEYS.filter(
      (k) => !k.startsWith("org.billing.payment_method"),
    ),
  },
  {
    key: "floor_manager",
    name: "Floor Manager",
    description: "Manages live queue operations on the floor.",
    scope: "organization",
    permissions: [
      "org.dashboard.view",
      "org.dashboard.queue_widget",
      "org.dashboard.analytics",
      "org.dashboard.quick_actions",
      "org.queue.mode_change",
      "org.queue.fifo",
      "org.queue.selective",
      "org.queue.checkin",
      "org.queue.takeaway",
      "org.queue.dinein",
      "org.queue.multistage",
      "org.queue.call_next",
      "org.queue.call_specific",
      "org.queue.call_again",
      "org.queue.skip",
      "org.queue.complete",
      "org.queue.no_show",
      "org.queue.hold",
      "org.queue.allocate_table",
      "org.queue.move_stage",
      "org.branches.view",
      "org.services.view",
      "org.desks.view",
      "org.services.create",
      "org.services.edit",
      "org.desks.create",
      "org.desks.edit",
      "org.desks.delete",
      "org.bookings.view",
      "org.bookings.calendar",
      "org.bookings.slots",
      "org.bookings.block_slot",
      "org.bookings.manual",
      "org.journeys.view",
      "org.journeys.create",
      "org.journeys.edit",
      "org.journeys.stages",
      "org.users.view",
      "org.users.invite",
      "org.users.edit",
      "org.users.assign_branches",
      "org.users.assign_services",
      "org.settings.view",
      "org.settings.queue",
      "org.settings.notifications",
      "org.settings.display",
      "org.settings.hours",
      "org.settings.staff",
      "org.settings.queue.edit",
      "org.settings.notifications.edit",
      "org.settings.display.edit",
      "org.settings.hours.edit",
      "org.reports.view",
      "org.reports.export",
      "org.reports.overview",
      "org.reports.trends",
      "org.reports.services",
      "org.reports.staff",
      "org.reports.customers",
      "org.reports.dinein",
      "org.qrscanner",
      "org.announcements.toggle",
    ],
  },
  {
    key: "front_desk",
    name: "Front Desk",
    description: "Calls customers from the queue at a service desk.",
    scope: "organization",
    permissions: [
      "org.dashboard.view",
      "org.dashboard.queue_widget",
      "org.queue.mode_change",
      "org.queue.fifo",
      "org.queue.selective",
      "org.queue.checkin",
      "org.queue.takeaway",
      "org.queue.call_next",
      "org.queue.call_specific",
      "org.queue.call_again",
      "org.queue.skip",
      "org.queue.complete",
      "org.queue.no_show",
      "org.queue.hold",
      "org.qrscanner",
    ],
  },
];

export function getBuiltinPermissions(roleKey: string): string[] {
  const r = BUILT_IN_ROLES.find((b) => b.key === roleKey);
  if (!r) return [];
  return r.permissions === "ALL" ? [...ALL_PERMISSION_KEYS] : [...r.permissions];
}

export const BUILT_IN_ROLE_KEYS = new Set(BUILT_IN_ROLES.map((r) => r.key));
