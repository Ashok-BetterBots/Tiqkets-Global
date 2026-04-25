import type { Request, Response, NextFunction } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { storage } from "./storage";
import { db } from "./db";
import { orgUsers } from "@shared/schema";
import { eq, isNull } from "drizzle-orm";
import {
  ALL_PERMISSION_KEYS,
  BUILT_IN_ROLES,
  BUILT_IN_ROLE_KEYS,
  getBuiltinPermissions,
} from "@shared/permissions";

let bootstrapped = false;
const SUPER_ADMIN_ID = "super_admin";

const ORG_SESSION_COOKIE = "tiqkets_org";
const OWNER_PREFIX = "owner:";
const SUPER_ADMIN_COOKIE = "tiqkets_sa";

const DEV_SECRETS_PATH = "node_modules/.cache/tiqkets-dev-secrets.json";

function loadDevSecretsFile(): Record<string, string> {
  try {
    if (existsSync(DEV_SECRETS_PATH)) {
      return JSON.parse(readFileSync(DEV_SECRETS_PATH, "utf8")) as Record<string, string>;
    }
  } catch {}
  return {};
}

function persistDevSecret(name: string, value: string): void {
  try {
    const data = loadDevSecretsFile();
    data[name] = value;
    mkdirSync(dirname(DEV_SECRETS_PATH), { recursive: true });
    writeFileSync(DEV_SECRETS_PATH, JSON.stringify(data, null, 2));
  } catch {}
}

function readEnvSecret(name: string): string {
  const v = process.env[name];
  if (v && v.length >= 16) return v;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `${name} env var is required in production (must be a stable random string of length >= 16).`,
    );
  }
  const cached = loadDevSecretsFile()[name];
  if (cached && cached.length >= 16) return cached;
  const generated = randomBytes(32).toString("hex");
  persistDevSecret(name, generated);
  console.warn(
    `[rbac] ${name} not set; generated a stable dev secret persisted to ${DEV_SECRETS_PATH}. Set ${name} in env for production.`,
  );
  return generated;
}

const ORG_SESSION_SECRET = Buffer.from(readEnvSecret("ORG_SESSION_SECRET"), "utf8");
export const SUPER_ADMIN_TOKEN = readEnvSecret("SUPER_ADMIN_TOKEN");

export function makeSuperAdminCookie(maxAgeSeconds = 60 * 60 * 8): string {
  return `${SUPER_ADMIN_COOKIE}=${SUPER_ADMIN_TOKEN}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSuperAdminCookie(): string {
  return `${SUPER_ADMIN_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return undefined;
}

function sign(value: string): string {
  return createHmac("sha256", ORG_SESSION_SECRET).update(value).digest("hex");
}

export function signOrgSession(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function verifyOrgSession(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const dot = cookie.lastIndexOf(".");
  if (dot < 1) return null;
  const userId = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const expected = sign(userId);
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return userId;
}

export function makeOrgSessionCookie(userId: string, maxAgeSeconds = 60 * 60 * 8): string {
  const value = signOrgSession(userId);
  return `${ORG_SESSION_COOKIE}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function makeOwnerSessionCookie(orgId: string, maxAgeSeconds = 60 * 60 * 8): string {
  return makeOrgSessionCookie(`${OWNER_PREFIX}${orgId}`, maxAgeSeconds);
}

export function clearOrgSessionCookie(): string {
  return `${ORG_SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

export function isSuperAdminRequest(req: Request): boolean {
  const v = readCookie(req, SUPER_ADMIN_COOKIE);
  if (!v) return false;
  try {
    const a = Buffer.from(v);
    const b = Buffer.from(SUPER_ADMIN_TOKEN);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function getRequestUserId(req: Request): string | null {
  return verifyOrgSession(readCookie(req, ORG_SESSION_COOKIE));
}

/**
 * Resolve the caller's authoritative organization id from the signed session
 * cookie. Returns "*" for super-admin (cross-org bypass), null when there is
 * no valid session, or the orgId derived from either an owner cookie or the
 * caller's `org_users.organization_id`.
 *
 * IMPORTANT: never trust caller-supplied `orgId` body/query params for
 * authorization — use this helper + `assertOrgOwnership` instead.
 */
export async function getRequestOrganizationId(req: Request): Promise<string | "*" | null> {
  if (isSuperAdminRequest(req)) return "*";
  const userId = getRequestUserId(req);
  if (!userId) return null;
  if (userId.startsWith(OWNER_PREFIX)) return userId.slice(OWNER_PREFIX.length);
  const user = await storage.getOrgUserById(userId);
  return user?.organizationId ?? null;
}

/**
 * Enforce that the caller's session belongs to `targetOrgId` (or is the
 * platform super-admin). Sends a 401/403 response and returns false on
 * failure so handlers can `if (!await assertOrgOwnership(req, res, orgId)) return;`.
 *
 * This closes the IDOR gap where a holder of a permission key (e.g.
 * `org.billing.view`) on org A could otherwise pass a different org's id in
 * the URL and read its data.
 */
export async function assertOrgOwnership(
  req: Request,
  res: Response,
  targetOrgId: string | undefined | null,
): Promise<boolean> {
  if (!targetOrgId) {
    res.status(400).json({ error: "Missing organization id" });
    return false;
  }
  const callerOrg = await getRequestOrganizationId(req);
  if (callerOrg === null) {
    res.status(401).json({ error: "Authentication required" });
    return false;
  }
  if (callerOrg === "*") return true; // super-admin
  if (callerOrg !== targetOrgId) {
    res.status(403).json({ error: "Cross-organization access denied" });
    return false;
  }
  return true;
}

/**
 * Resolve a child resource (branch, service, operating-hour, etc.) to its
 * owning organization id and verify the caller belongs to that org. Returns
 * true on allow, false after sending a 401/403/404 response.
 *
 * Each helper makes a single DB lookup. The chain branch→org, service→branch
 * →org, etc. is implemented inline rather than via JOINs to keep the existing
 * storage method shape and to allow each helper to short-circuit on the first
 * failure with a precise status code.
 */
export async function assertBranchOwnership(req: Request, res: Response, branchId: string | undefined | null): Promise<boolean> {
  if (!branchId) { res.status(400).json({ error: "Missing branchId" }); return false; }
  const branch = await storage.getBranchById(branchId);
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return false; }
  return assertOrgOwnership(req, res, branch.organizationId);
}

export async function assertServiceOwnership(req: Request, res: Response, serviceId: string | undefined | null): Promise<boolean> {
  if (!serviceId) { res.status(400).json({ error: "Missing serviceId" }); return false; }
  const service = await storage.getServiceById(serviceId);
  if (!service) { res.status(404).json({ error: "Service not found" }); return false; }
  return assertBranchOwnership(req, res, service.branchId);
}

export async function assertOrgUserOwnership(req: Request, res: Response, userId: string | undefined | null): Promise<boolean> {
  if (!userId) { res.status(400).json({ error: "Missing userId" }); return false; }
  const user = await storage.getOrgUserById(userId);
  if (!user) { res.status(404).json({ error: "User not found" }); return false; }
  return assertOrgOwnership(req, res, user.organizationId);
}

/**
 * Strip credentials/secret-bearing fields from an org_user row before sending
 * it to any client. The full row is needed internally for auth (passwordHash
 * is read by login flows), but it must NEVER be returned via dashboard APIs.
 * Accepts any shape and returns the same shape minus the sensitive keys.
 */
export function sanitizeOrgUser<T extends Record<string, any>>(user: T | null | undefined): Omit<T, "passwordHash"> | null {
  if (!user) return null;
  const { passwordHash: _ph, ...safe } = user as any;
  return safe;
}

/**
 * Resolve a role by key and verify it is assignable to a member of `callerOrgId`.
 * Closes a tenant-isolation gap: roles.key is globally unique, so an admin who
 * knows another org's custom role key could otherwise assign it via
 * /api/dashboard/users. This helper rejects:
 *   - unknown roles                        → 400
 *   - super_admin / owner                  → 403 (never picker-assignable)
 *   - roles owned by a different org       → 403 (cross-org isolation)
 * On success returns the role row; on failure sends a JSON response and returns null.
 * `callerOrgId === "*"` means super-admin and bypasses the org check.
 */
export async function resolveAssignableRole(
  res: Response,
  roleKey: string | undefined | null,
  callerOrgId: string | "*" | null,
): Promise<{ id: string; key: string; name: string; organizationId: string | null } | null> {
  if (!roleKey || typeof roleKey !== "string") {
    res.status(400).json({ error: "role is required" });
    return null;
  }
  const roleRow = await storage.getRoleByKey(roleKey);
  if (!roleRow) {
    res.status(400).json({ error: `Unknown role: ${roleKey}` });
    return null;
  }
  if (roleRow.key === "super_admin" || roleRow.key === "owner") {
    res.status(403).json({ error: `Role ${roleRow.key} cannot be assigned to org users` });
    return null;
  }
  if (roleRow.organizationId && callerOrgId !== "*" && roleRow.organizationId !== callerOrgId) {
    res.status(403).json({ error: "Role is not available to this organization" });
    return null;
  }
  return roleRow;
}

export async function assertOperatingHourOwnership(req: Request, res: Response, ohId: string | undefined | null): Promise<boolean> {
  if (!ohId) { res.status(400).json({ error: "Missing operatingHourId" }); return false; }
  const oh = await storage.getOperatingHourById(ohId);
  if (!oh) { res.status(404).json({ error: "Operating hour not found" }); return false; }
  return assertBranchOwnership(req, res, oh.branchId);
}

export async function assertBreakOwnership(req: Request, res: Response, breakId: string | undefined | null): Promise<boolean> {
  if (!breakId) { res.status(400).json({ error: "Missing breakId" }); return false; }
  const b = await storage.getBreakTimeById(breakId);
  if (!b) { res.status(404).json({ error: "Break not found" }); return false; }
  return assertOperatingHourOwnership(req, res, b.operatingHourId);
}

export async function assertHolidayOwnership(req: Request, res: Response, holidayId: string | undefined | null): Promise<boolean> {
  if (!holidayId) { res.status(400).json({ error: "Missing holidayId" }); return false; }
  const h = await storage.getHolidayById(holidayId);
  if (!h) { res.status(404).json({ error: "Holiday not found" }); return false; }
  return assertBranchOwnership(req, res, h.branchId);
}

export async function assertJourneyOwnership(req: Request, res: Response, journeyId: string | undefined | null): Promise<boolean> {
  if (!journeyId) { res.status(400).json({ error: "Missing journeyId" }); return false; }
  const j = await storage.getJourneyById(journeyId);
  if (!j) { res.status(404).json({ error: "Journey not found" }); return false; }
  return assertBranchOwnership(req, res, j.branchId);
}

export async function assertTicketOwnership(req: Request, res: Response, ticketId: string | undefined | null): Promise<boolean> {
  if (!ticketId) { res.status(400).json({ error: "Missing ticketId" }); return false; }
  const t = await storage.getTicketById(ticketId);
  if (!t) { res.status(404).json({ error: "Ticket not found" }); return false; }
  return assertBranchOwnership(req, res, t.branchId);
}

export async function assertDeskOwnership(req: Request, res: Response, deskId: string | undefined | null): Promise<boolean> {
  if (!deskId) { res.status(400).json({ error: "Missing deskId" }); return false; }
  const d = await storage.getDeskById(deskId);
  if (!d) { res.status(404).json({ error: "Desk not found" }); return false; }
  return assertBranchOwnership(req, res, d.branchId);
}

export async function assertAppointmentOwnership(req: Request, res: Response, appointmentId: string | undefined | null): Promise<boolean> {
  if (!appointmentId) { res.status(400).json({ error: "Missing bookingId" }); return false; }
  const a = await storage.getAppointmentById(appointmentId);
  if (!a) { res.status(404).json({ error: "Booking not found" }); return false; }
  return assertBranchOwnership(req, res, a.branchId);
}

export async function assertReservationOwnership(req: Request, res: Response, reservationId: string | undefined | null): Promise<boolean> {
  if (!reservationId) { res.status(400).json({ error: "Missing reservationId" }); return false; }
  const r = await storage.getReservationById(reservationId);
  if (!r) { res.status(404).json({ error: "Reservation not found" }); return false; }
  return assertBranchOwnership(req, res, r.branchId);
}

export async function assertBookingSlotOwnership(req: Request, res: Response, slotId: string | undefined | null): Promise<boolean> {
  if (!slotId) { res.status(400).json({ error: "Missing booking slot id" }); return false; }
  const s = await storage.getBookingSlotById(slotId);
  if (!s) { res.status(404).json({ error: "Booking slot not found" }); return false; }
  return assertBranchOwnership(req, res, s.branchId);
}

export async function ensureBuiltinRoles(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;
  try {
    const existing = await storage.listRoles();
    const byKey = new Map(existing.map((r) => [r.key, r]));

    for (const def of BUILT_IN_ROLES) {
      let role = byKey.get(def.key);
      if (!role) {
        role = await storage.createRole({
          key: def.key,
          name: def.name,
          description: def.description,
          isSystem: true,
          scope: def.scope,
        });
        const perms =
          def.permissions === "ALL"
            ? [...ALL_PERMISSION_KEYS]
            : [...def.permissions];
        await storage.setRolePermissions(role.id, perms);
        console.log(`[rbac] Seeded built-in role: ${def.key}`);
      } else if (!role.isSystem) {
        await storage.updateRole(role.id, { isSystem: true });
      }
    }

    const allUsers = await db
      .select({ id: orgUsers.id, role: orgUsers.role, roleId: orgUsers.roleId })
      .from(orgUsers)
      .where(isNull(orgUsers.roleId));
    if (allUsers.length > 0) {
      const updatedRoles = await storage.listRoles();
      const keyMap = new Map(updatedRoles.map((r) => [r.key, r]));
      for (const u of allUsers) {
        const r = keyMap.get(u.role) || keyMap.get("admin");
        if (r) {
          await db
            .update(orgUsers)
            .set({ roleId: r.id })
            .where(eq(orgUsers.id, u.id));
        }
      }
      console.log(`[rbac] Backfilled role_id on ${allUsers.length} org users`);
    }
  } catch (err) {
    console.error("[rbac] Failed to ensure built-in roles:", err);
  }
}

export interface PermissionResult {
  permissions: string[];
  roleKey: string;
  roleName: string;
}

export async function getPermissionsForUser(userId: string): Promise<PermissionResult | null> {
  if (userId === SUPER_ADMIN_ID) {
    return {
      permissions: [...ALL_PERMISSION_KEYS],
      roleKey: "super_admin",
      roleName: "Super Admin",
    };
  }
  if (userId.startsWith(OWNER_PREFIX)) {
    // Owner sessions resolve to the editable "owner" role from the DB so
    // that Super Admin matrix edits take effect at runtime. Fallback to
    // the static built-in template only if the role row hasn't been
    // seeded yet (first boot before ensureBuiltinRoles ran).
    const ownerRole = await storage.getRoleByKey("owner");
    if (ownerRole) {
      const perms = await storage.getRolePermissions(ownerRole.id);
      return { permissions: perms, roleKey: ownerRole.key, roleName: ownerRole.name };
    }
    return {
      permissions: getBuiltinPermissions("owner"),
      roleKey: "owner",
      roleName: "Owner",
    };
  }
  const user = await storage.getOrgUserById(userId);
  if (!user) return null;
  let role = user.roleId ? await storage.getRoleById(user.roleId) : undefined;
  if (!role && user.role) role = await storage.getRoleByKey(user.role);
  if (!role) {
    return { permissions: [], roleKey: user.role || "unknown", roleName: user.role || "Unknown" };
  }
  const perms = await storage.getRolePermissions(role.id);
  return { permissions: perms, roleKey: role.key, roleName: role.name };
}

const KNOWN_PERMISSION_KEYS = new Set<string>(ALL_PERMISSION_KEYS);
const referencedPermissionKeys = new Set<string>();

/**
 * Express middleware tagged with a permission key (or a public-route
 * reason). The marker fields let `assertOrgRouteCoverage()` introspect
 * the router stack at boot time without resorting to `as any` casts.
 */
type GatedMiddleware = ((req: Request, res: Response, next: NextFunction) => unknown) & {
  __permissionKey?: string;
  __publicRouteReason?: string;
};

export function requirePermission(key: string): GatedMiddleware {
  if (!KNOWN_PERMISSION_KEYS.has(key)) {
    // Fail loudly at module/route registration time (server boot) so a typo
    // never silently denies access in production.
    throw new Error(
      `requirePermission: unknown permission key "${key}". Add it to shared/permissions.ts ALL_PERMISSIONS or remap to an existing key.`,
    );
  }
  referencedPermissionKeys.add(key);
  const fn: GatedMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    if (isSuperAdminRequest(req)) return next();
    const userId = getRequestUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const result = await getPermissionsForUser(userId);
    if (!result) return res.status(401).json({ error: "Unknown user" });
    if (result.permissions.includes(key)) return next();
    return res.status(403).json({ error: "Permission denied", required: key });
  };
  fn.__permissionKey = key;
  return fn;
}

/** Returns the set of permission keys actually wired to routes (for diagnostics/tests). */
export function getReferencedPermissionKeys(): string[] {
  return [...referencedPermissionKeys].sort();
}

/**
 * No-op middleware marker for endpoints that are intentionally public
 * (customer-facing, e.g. ticket holder views own ticket, public booking
 * creation, queue display). The marker name is preserved on the function
 * object so `assertOrgRouteCoverage()` can recognize it without applying
 * a runtime gate.
 */
export function publicRoute(reason: string): GatedMiddleware {
  const fn: GatedMiddleware = async (_req: Request, _res: Response, next: NextFunction) => next();
  fn.__publicRouteReason = reason;
  return fn;
}

/**
 * Walk Express's router stack and verify that every route under an
 * org-scoped path prefix is wrapped by either `requirePermission(...)`
 * or `publicRoute(...)`. Throws synchronously on first violation so the
 * server fails to boot if a future route is added without coverage.
 *
 * Org-scoped prefixes considered: /api/dashboard, /api/superadmin,
 * /api/branches/:branchId/{services,stats,reservations,bookings,...},
 * /api/services, /api/desks, /api/journeys, /api/tickets/:id/{lifecycle},
 * /api/organizations/:id/{password,...}, /api/reservations, /api/bookings.
 *
 * Customer-public endpoints (queue display, ticket detail, booking
 * creation, push-token, acknowledge, snooze, swap-request) must be
 * marked with `publicRoute("reason")` to declare intent.
 */
const ORG_PATH_PATTERNS: RegExp[] = [
  /^\/api\/dashboard\//,
  /^\/api\/superadmin\//,
  /^\/api\/services\//,
  /^\/api\/desks\//,
  /^\/api\/journeys\//,
  /^\/api\/reservations\//,
  /^\/api\/bookings\//,
  /^\/api\/billing\//,
  /^\/api\/branches\/[^/]+\/(services|stats|reservations|bookings|queue|candidates-for-swap)/,
  /^\/api\/tickets\/[^/]+\/(hold|resume|cancel|reassign|move-stage|swap-request|push-token|acknowledge|snooze|call|call-next|call-again|skip|complete|no-show|allocate-table|move-stage|serve|arrive)/,
  /^\/api\/tickets\/[^/]+\/swap-requests/,
  /^\/api\/tickets\/[^/]+$/,
  /^\/api\/organizations\/[^/]+\/(password|users|reset)/,
];

function pathMatchesOrgScope(p: string): boolean {
  return ORG_PATH_PATTERNS.some((rx) => rx.test(p));
}

function inferRoutePath(layer: any): string | null {
  // express layers have a `.route?.path` for terminal routes
  if (layer?.route?.path && typeof layer.route.path === "string") return layer.route.path;
  return null;
}

function layerIsGated(layer: any): { gated: boolean; reason?: string } {
  const stack = layer?.route?.stack;
  if (!Array.isArray(stack)) return { gated: false };
  for (const s of stack) {
    const fn = s?.handle as GatedMiddleware | undefined;
    if (!fn) continue;
    // Tagged middleware factories (`requirePermission`, `publicRoute`) attach
    // marker properties on the returned function so we can introspect at
    // boot time without resorting to `as any` casts.
    if (fn.__permissionKey) return { gated: true, reason: `permission:${fn.__permissionKey}` };
    if (fn.__publicRouteReason) return { gated: true, reason: `public:${fn.__publicRouteReason}` };
  }
  return { gated: false };
}

export function assertOrgRouteCoverage(app: any): { covered: number; uncovered: string[] } {
  const router = app?._router ?? app?.router;
  const stack: any[] = router?.stack ?? [];
  const uncovered: string[] = [];
  let covered = 0;
  for (const layer of stack) {
    if (!layer?.route) continue;
    const p = inferRoutePath(layer);
    if (!p) continue;
    if (!pathMatchesOrgScope(p)) continue;
    const { gated } = layerIsGated(layer);
    const methods = Object.keys(layer.route.methods || {})
      .filter((m) => layer.route.methods[m])
      .map((m) => m.toUpperCase());
    if (gated) {
      covered += methods.length;
    } else {
      for (const m of methods) uncovered.push(`${m} ${p}`);
    }
  }
  if (uncovered.length > 0) {
    const msg =
      `assertOrgRouteCoverage: ${uncovered.length} org-scoped route(s) lack ` +
      `requirePermission() or publicRoute() coverage:\n  ` +
      uncovered.map((r) => `- ${r}`).join("\n  ") +
      `\nGate them with requirePermission("...") or mark them with ` +
      `publicRoute("reason") if they are intentionally public (customer-facing).`;
    throw new Error(msg);
  }
  return { covered, uncovered };
}

export interface ActorInfo {
  actorId: string;
  actorEmail: string;
  actorRole: string;
}

export async function getActorInfo(req: Request): Promise<ActorInfo> {
  if (isSuperAdminRequest(req)) {
    return {
      actorId: SUPER_ADMIN_ID,
      actorEmail: "superadmin@tiqkets.com",
      actorRole: "super_admin",
    };
  }
  const userId = getRequestUserId(req);
  if (!userId) {
    return { actorId: "anonymous", actorEmail: "", actorRole: "" };
  }
  if (userId.startsWith(OWNER_PREFIX)) {
    return { actorId: userId, actorEmail: "", actorRole: "owner" };
  }
  try {
    const user = await storage.getOrgUserById(userId);
    if (user) {
      return {
        actorId: user.id,
        actorEmail: user.email || "",
        actorRole: user.role || "",
      };
    }
  } catch {
    /* fall through */
  }
  return { actorId: userId, actorEmail: "", actorRole: "" };
}

export async function writeAudit(req: Request, entry: {
  action: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  diff?: unknown;
}): Promise<void> {
  try {
    const actor = await getActorInfo(req);
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "";
    await storage.createAuditLog({
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      actorRole: actor.actorRole,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      targetLabel: entry.targetLabel ?? null,
      diff: (entry.diff ?? null) as Record<string, unknown> | null,
      ip,
    });
  } catch (err) {
    console.error("[audit] failed to write log:", err);
  }
}

export { BUILT_IN_ROLE_KEYS, getBuiltinPermissions, ORG_SESSION_COOKIE, OWNER_PREFIX };
