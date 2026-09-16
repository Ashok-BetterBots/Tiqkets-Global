// ============================================
// EVENTS QUEUE MODE — backend routes.
//
// Customer-facing (public):
//   GET  /event/:branchId                → landing page (event-landing.html)
//   GET  /api/event/:branchId            → published event + slot availability
//   POST /api/event/:branchId/register   → create registration (+ Razorpay order)
//   POST /api/event/verify-payment       → verify signature → generate ticket + WA
//   GET  /event-qr/:qrToken.png          → QR PNG (also fetched by WhatsApp)
//   GET  /event-ticket/:qrToken          → boarding-pass web page
//   GET  /api/event/ticket/:qrToken      → ticket JSON for the pass page
//   POST /api/event/feedback/:qrToken    → post-visit feedback
//
// Staff (permission-gated, mirrors dashboard route conventions):
//   org.events.manage   → event CRUD, publish/end, stats, registrations, feedback
//   org.events.security → scan (arrive / checkin / exit)
//   org.events.billing  → advance redemption
//   org.events.parking  → parking counter
//   org.events.support  → attendee lookup + resend ticket
// ============================================

import type { Express, Request, Response } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import QRCode from "qrcode";
import { db, pool } from "./db";
import { and, desc, eq, gte, ilike, inArray, isNull, isNotNull, lt, ne, or, sql as dsql } from "drizzle-orm";
import {
  DEFAULT_EVENT_OTP_SETTINGS,
  DEFAULT_EVENT_REFUND_POLICY,
  DEFAULT_EVENT_WHATSAPP_TRIGGERS,
  EVENT_WHATSAPP_TRIGGER_KEYS,
  type EventOtpSettings,
  type EventWhatsAppTriggers,
  events,
  eventRegistrations,
  eventPreprintedTickets,
  eventTicketIdentifiers,
  eventStageLog,
  eventFeedback,
  eventBillingRedemptions,
  eventBillingOtps,
  eventParkingLogs,
  eventSupportOtps,
  eventPhoneVerifications,
  eventBillingOverrides,
  organizations,
  branches,
  services,
  payments,
  organizerPayoutProfiles,
  routePayoutAllocations,
  eventPaymentCheckouts,
  type Event,
  type EventRegistration,
  type EventRefundPolicy,
  type PreprintedBackElement,
  type PreprintedBackElementType,
  type PreprintedBackFontFamily,
  type PreprintedBackLayout,
} from "@shared/schema";
import { createRouteOrder, isRazorpayTestMode, isRouteProfileActive, mapWithConcurrency, recoverPaymentLinkPaid } from "./route-payouts";
import { createDirectOrder } from "./razorpay-direct";
import { createPaymentLink } from "./razorpay-payment-links";
import { directCredentialStatus, getEventPaymentMethod } from "./event-payment-method";
import { isValidRazorpayProviderId } from "./razorpay-route-contract";
import { formatEventSlotRange, formatEventTime } from "@shared/eventSlots";
import {
  getExactTicketIdCandidates,
  getPartialTicketIdPatterns,
  normalizeTicketIdSearchInput,
} from "./event-ticket-id-search";
import {
  requirePermission,
  publicRoute,
  getRequestUserId,
  getPermissionsForUser,
  isSuperAdminRequest,
  assertOrgOwnership,
  assertBranchOwnership,
  assertServiceOwnership,
  getRequestOrganizationId,
} from "./rbac";
import type { NextFunction } from "express";

// Some events endpoints (event list, live stats) must be readable by ANY
// events-role holder — security, billing, parking and support staff all need
// the event list + occupancy to operate their consoles, not just organizers.
const EVENTS_PERMS = [
  "org.events.manage",
  "org.events.security",
  "org.events.billing",
  "org.events.parking",
  "org.events.support",
];
function requireAnyEventsPerm() {
  const fn = async (req: Request, res: Response, next: NextFunction) => {
    if (isSuperAdminRequest(req)) return next();
    const userId = getRequestUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    const result = await getPermissionsForUser(userId);
    if (!result) return res.status(401).json({ error: "Unknown user" });
    if (EVENTS_PERMS.some((p) => result.permissions.includes(p))) return next();
    return res.status(403).json({ error: "Permission denied", required: "org.events.*" });
  };
  // Tag for assertOrgRouteCoverage — this route IS permission-gated (any-of
  // the events permissions rather than a single key).
  (fn as any).__permissionKey = "org.events.* (any)";
  return fn;
}

export function canConfigureEventRegistrationFee(profile: {
  providerProductId?: string | null;
  productStatus?: string | null;
} | null | undefined): boolean {
  return !!profile &&
    isValidRazorpayProviderId(profile.providerProductId, "acc_prd_");
}

/** Paid-event configuration follows the adapter currently selected by the platform. */
export function canConfigureEventRegistrationFeeForMethod(
  method: "razorpay_route" | "razorpay_direct" | "razorpay_payment_links",
  profile: { providerProductId?: string | null; productStatus?: string | null } | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return method === "razorpay_direct" || method === "razorpay_payment_links"
    ? directCredentialStatus(env).configured
    : canConfigureEventRegistrationFee(profile);
}
// Admin (org.events.manage) or Billing (org.events.billing) only — used for
// the desk/counter manual registration flow.
function requireEventsManageOrBilling() {
  const fn = async (req: Request, res: Response, next: NextFunction) => {
    if (isSuperAdminRequest(req)) return next();
    const userId = getRequestUserId(req);
    if (!userId) return res.status(401).json({ error: "Authentication required" });
    const result = await getPermissionsForUser(userId);
    if (!result) return res.status(401).json({ error: "Unknown user" });
    if (["org.events.manage", "org.events.billing"].some((p) => result.permissions.includes(p))) return next();
    return res.status(403).json({ error: "Permission denied", required: "org.events.manage or org.events.billing" });
  };
  (fn as any).__permissionKey = "org.events.manage or org.events.billing";
  return fn;
}
import { renderWaMessage, type WaVars } from "./wa-templates";
import { sendWhatsAppMessage, sendWhatsAppImage, sendWhatsAppTemplateMessage, sendWhatsAppOTP, normalizeIndianPhone } from "./whatsapp";
import { getPublicBaseUrl, sendEventTicketEmail } from "./mailer";
import { isSupportedLanguage } from "@shared/languages";
import { getApprovedWaTemplate } from "@shared/wa-approved-templates";
import { ObjectStorageService } from "./objectStorage";

const templatesDir = path.resolve(process.cwd(), "server", "templates");

// Registration rows stuck in `registration_started` (payment never
// completed) stop holding slot capacity after this many minutes.
const PENDING_HOLD_MINUTES = 30;
const allowedProductCategories = new Set([
  "electronics",
  "furniture",
  "home_appliances",
  "vessels",
]);
const allowedSpecialCategories = new Set([
  "senior_citizen",
  "pregnant_women",
  "infants",
  "specially_abled",
]);

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function makeBookingId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  let s = "";
  for (const byte of bytes) s += chars[byte % chars.length];
  return `TIQ-${s}`;
}

function makeQrToken(): string {
  return crypto.randomBytes(20).toString("hex");
}

const DEFAULT_PREPRINTED_TICKET_PREFIX = "EVT";

export function normalizePreprintedTicketPrefix(
  value: unknown,
  fallback = DEFAULT_PREPRINTED_TICKET_PREFIX,
): string {
  const normalized = String(value ?? fallback).trim().toUpperCase().replace(/-+$/, "");
  if (!/^[A-Z0-9]{2,8}$/.test(normalized)) {
    throw new Error("Ticket prefix must be 2–8 letters or numbers");
  }
  return normalized;
}

function makePreprintedTicketId(prefix: string): string {
  // PREFIX-XXXXXXXXXX: organizer prefix + 10 random unambiguous characters.
  // Maximum length is 19 chars, within the varchar(20) booking_id column.
  // Each ticket is independently random — uniqueness is enforced by the DB.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(10);
  let s = "";
  for (const byte of bytes) s += chars[byte % chars.length];
  return `${normalizePreprintedTicketPrefix(prefix)}-${s}`;
}

function makePreprintedBatchCode(): string {
  return `BATCH-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function reserveGeneratedTicketId(
  tx: any,
  eventId: string,
  staffTicketPrefix?: string,
): Promise<string> {
  // Existing tickets created before the registry migration are checked in both
  // source tables. New tickets are protected atomically by the registry PK.
  for (let attempt = 0; attempt < 20; attempt++) {
    // Public customer registrations keep the TIQ namespace. Registrations
    // created by event staff use the organizer's configured event prefix.
    const ticketId = staffTicketPrefix
      ? makePreprintedTicketId(staffTicketPrefix)
      : makeBookingId();
    const [existingRegistration] = await tx.select({ id: eventRegistrations.id })
      .from(eventRegistrations)
      .where(eq(eventRegistrations.bookingId, ticketId))
      .limit(1);
    const [existingPreprinted] = await tx.select({ id: eventPreprintedTickets.id })
      .from(eventPreprintedTickets)
      .where(eq(eventPreprintedTickets.bookingId, ticketId))
      .limit(1);
    if (existingRegistration || existingPreprinted) continue;

    const [reserved] = await tx.insert(eventTicketIdentifiers)
      .values({ ticketId, eventId, ticketKind: "generated" })
      .onConflictDoNothing()
      .returning({ ticketId: eventTicketIdentifiers.ticketId });
    if (reserved) return ticketId;
  }
  throw new Error("Unable to reserve a unique ticket ID. Please retry.");
}

async function ensurePreprintedTicketIdReserved(tx: any, eventId: string, ticketId: string): Promise<void> {
  const [existing] = await tx.select()
    .from(eventTicketIdentifiers)
    .where(eq(eventTicketIdentifiers.ticketId, ticketId))
    .limit(1);
  if (existing) {
    if (existing.eventId !== eventId || existing.ticketKind !== "preprinted") {
      throw new Error("This pre-printed ticket ID conflicts with another ticket");
    }
    return;
  }
  const [reserved] = await tx.insert(eventTicketIdentifiers)
    .values({ ticketId, eventId, ticketKind: "preprinted" })
    .onConflictDoNothing()
    .returning({ ticketId: eventTicketIdentifiers.ticketId });
  if (!reserved) throw new Error("This pre-printed ticket ID conflicts with another ticket");
}

async function backfillTicketIdentifierRegistry(): Promise<void> {
  // The normal publish flow applies the schema before starting the server. This
  // is intentionally idempotent so deployments also register tickets created
  // before the shared namespace was added.
  try {
    const [generated, preprinted] = await Promise.all([
      db.select({ ticketId: eventRegistrations.bookingId, eventId: eventRegistrations.eventId })
        .from(eventRegistrations)
        .where(isNotNull(eventRegistrations.bookingId)),
      db.select({ ticketId: eventPreprintedTickets.bookingId, eventId: eventPreprintedTickets.eventId })
        .from(eventPreprintedTickets),
    ]);
    const records = [
      ...generated.map((row) => ({ ticketId: row.ticketId!, eventId: row.eventId, ticketKind: "generated" })),
      ...preprinted.map((row) => ({ ticketId: row.ticketId, eventId: row.eventId, ticketKind: "preprinted" })),
    ];
    for (let i = 0; i < records.length; i += 500) {
      await db.insert(eventTicketIdentifiers)
        .values(records.slice(i, i + 500))
        .onConflictDoNothing();
    }
  } catch (e) {
    // Runtime issue/assignment checks still protect each new ticket if a
    // deployment reaches this code before its schema synchronization finishes.
    console.warn("[events] ticket identifier registry backfill deferred:", e);
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] || c));
}

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizeCategorySelections(value: unknown, fallback: unknown, allowed: Set<string>): string[] | null {
  const raw = Array.isArray(value) ? value : fallback == null ? [] : [fallback];
  const normalized = [...new Set(raw.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];
  return normalized.length > 0 && normalized.every((item) => allowed.has(item)) ? normalized : null;
}

function normalizeOptionalCategorySelections(value: unknown, allowed: Set<string>): string[] | null {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  const normalized = [...new Set(value.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean))];
  return normalized.every((item) => allowed.has(item)) ? normalized : null;
}

function formatSlotDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
      weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    });
  } catch {
    return dateStr;
  }
}

function formatSlotTime(timeStr: string): string {
  return formatEventTime(timeStr);
}

// Convert a wall-clock date+time in an IANA timezone to a UTC Date.
// Two-pass offset estimation via Intl — accurate for real-world zones.
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  const naiveUtc = Date.UTC(y, (mo || 1) - 1, d || 1, h || 0, mi || 0);
  const tzOffset = (at: number): number => {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts = dtf.formatToParts(new Date(at));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return asUtc - at;
  };
  let offset = tzOffset(naiveUtc);
  offset = tzOffset(naiveUtc - offset);
  return new Date(naiveUtc - offset);
}

export function slotStartUtc(reg: { slotDate: string; slotTime: string }, timeZone: string): Date {
  return zonedTimeToUtc(reg.slotDate, reg.slotTime, timeZone || "Asia/Kolkata");
}

// Build the list of slot times ("HH:MM") from explicit operating hours +
// slot duration. Used for both event-level defaults and per-location configs.
export function buildSlotTimesFrom(startStr: string, endStr: string, durMin: number): string[] {
  const [sh, sm] = String(startStr || "09:00").split(":").map(Number);
  const [eh, em] = String(endStr || "21:00").split(":").map(Number);
  const startMin = (sh || 0) * 60 + (sm || 0);
  const endMin = (eh || 0) * 60 + (em || 0);
  const dur = Math.max(5, durMin || 30);
  const out: string[] = [];
  for (let t = startMin; t + dur <= endMin; t += dur) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return out;
}

// Build the list of slot times ("HH:MM") for an event day (event-level).
export function buildSlotTimes(ev: Event): string[] {
  return buildSlotTimesFrom(ev.operatingHoursStart, ev.operatingHoursEnd, ev.slotDurationMinutes);
}

// A "Location" is a services row scoped to the event's branch. Its
// event-specific config (time slots, capacity, registration fee) lives in
// services.serviceSettings.event; custom form fields live in
// services.inputFields. Each key falls back to the event-level default when
// the location has not overridden it.
export type LocationEventConfig = {
  operatingHoursStart: string;
  operatingHoursEnd: string;
  slotDurationMinutes: number;
  maxCapacityPerSlot: number;
  slotCapacityOverrides: Record<string, number>;
  registrationFee: number;
  registrationFeeCustomText: string;
  refundable: boolean;
  refundMessage: string;
  // Optional link tying this location to a specific event on the branch.
  // Empty string / undefined means the location is not linked to any event.
  eventId?: string;
};

export type RegistrationSourceMetricRow = {
  registrationSource?: string | null;
  amountPaid?: number | null;
};

export function aggregateRegistrationSourceMetrics(rows: RegistrationSourceMetricRow[]) {
  let storeRegistrations = 0;
  let customerRegistrations = 0;
  let customerRevenue = 0;

  for (const row of rows) {
    if (row.registrationSource === "store") {
      storeRegistrations += 1;
    } else {
      customerRegistrations += 1;
      customerRevenue += row.amountPaid || 0;
    }
  }

  return { storeRegistrations, customerRegistrations, customerRevenue };
}

function num(v: unknown, fallback: number): number {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function resolveLocationConfig(ev: Event, svc: any | null | undefined): LocationEventConfig {
  const s = (svc?.serviceSettings && (svc.serviceSettings as any).event) || {};
  const overrides = (s.slotCapacityOverrides && typeof s.slotCapacityOverrides === "object" && !Array.isArray(s.slotCapacityOverrides))
    ? (s.slotCapacityOverrides as Record<string, number>)
    : {};
  const locationRefundable = typeof s.refundable === "boolean" ? s.refundable : ev.refundable;
  const hasLocationRefundMessage = typeof s.refundMessage === "string";
  const locationRefundMessage = hasLocationRefundMessage ? s.refundMessage.trim() : "";
  const hasLocationFeeText = typeof s.registrationFeeCustomText === "string";
  return {
    operatingHoursStart: s.operatingHoursStart || ev.operatingHoursStart,
    operatingHoursEnd: s.operatingHoursEnd || ev.operatingHoursEnd,
    slotDurationMinutes: Math.max(5, num(s.slotDurationMinutes, ev.slotDurationMinutes)),
    maxCapacityPerSlot: Math.max(0, num(s.maxCapacityPerSlot, ev.maxCapacityPerSlot)),
    slotCapacityOverrides: overrides,
    registrationFee: Math.max(0, num(s.registrationFee, ev.registrationFee)),
    registrationFeeCustomText: hasLocationFeeText
      ? s.registrationFeeCustomText.trim()
      : ev.registrationFeeCustomText || "",
    refundable: locationRefundable,
    refundMessage: hasLocationRefundMessage ? locationRefundMessage : ev.refundMessage || "",
    eventId: typeof s.eventId === "string" ? s.eventId : "",
  };
}

// Active "Locations" (services) for the event's branch, in display order.
async function loadEventLocations(branchId: string) {
  return db
    .select()
    .from(services)
    .where(and(eq(services.branchId, branchId), eq(services.isActive, true)))
    .orderBy(services.sortOrder);
}

// List of "YYYY-MM-DD" dates within the event window (inclusive).
export function buildEventDates(ev: Event): string[] {
  const out: string[] = [];
  const start = new Date(ev.startDate);
  const end = new Date(ev.endDate);
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  while (cur.getTime() <= last && out.length < 60) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// Matches the landing page's definition of a bookable date: it has at least
// one remaining-capacity slot that has not started in the location's timezone.
export function buildBookableEventDates(
  ev: Event,
  cfg: LocationEventConfig,
  usage: Record<string, number>,
  timeZone: string,
  now = Date.now(),
): string[] {
  const dates = buildEventDates(ev);
  const times = buildSlotTimesFrom(cfg.operatingHoursStart, cfg.operatingHoursEnd, cfg.slotDurationMinutes);
  return dates.filter((date) => times.some((time) => {
    const capacity = cfg.slotCapacityOverrides[`${date}|${time}`] ?? cfg.maxCapacityPerSlot;
    const available = capacity - (usage[`${date}|${time}`] || 0);
    return available > 0 && zonedTimeToUtc(date, time, timeZone).getTime() >= now;
  }));
}

// The customer UI lets both registration types use a sole bookable date. When
// there are multiple dates, its last one is reserved for priority access.
export function validateEventPriorityAccessDate(
  bookableDates: string[],
  slotDate: string,
  priorityAccess: boolean,
): string | null {
  if (!bookableDates.length) {
    return "No bookable dates are available for this location.";
  }
  const finalBookableDate = bookableDates[bookableDates.length - 1];
  if (priorityAccess && slotDate !== finalBookableDate) {
    return "Priority access registrations must use the final bookable event date.";
  }
  if (!priorityAccess && bookableDates.length > 1 && slotDate === finalBookableDate) {
    return "The final bookable event date is reserved for priority access registrations.";
  }
  return null;
}

const CAPACITY_STATUSES_SQL = dsql`(${eventRegistrations.status} <> 'registration_started' OR ${eventRegistrations.createdAt} > NOW() - INTERVAL '${dsql.raw(String(PENDING_HOLD_MINUTES))} minutes')`;

// guests per registration = 1 + familyMembersCount. When locationId is given,
// only that location's registrations count toward the slot (each location has
// its own capacity); passing null counts legacy rows with no location.
async function slotUsage(eventId: string, locationId?: string | null): Promise<Record<string, number>> {
  const conds = [eq(eventRegistrations.eventId, eventId), CAPACITY_STATUSES_SQL];
  if (locationId !== undefined) {
    conds.push(locationId === null ? isNull(eventRegistrations.locationId) : eq(eventRegistrations.locationId, locationId));
  }
  const rows = await db
    .select({
      slotDate: eventRegistrations.slotDate,
      slotTime: eventRegistrations.slotTime,
      guests: dsql<number>`SUM(1 + ${eventRegistrations.familyMembersCount})`,
    })
    .from(eventRegistrations)
    .where(and(...conds))
    .groupBy(eventRegistrations.slotDate, eventRegistrations.slotTime);
  const map: Record<string, number> = {};
  for (const r of rows) map[`${r.slotDate}|${r.slotTime}`] = Number(r.guests) || 0;
  return map;
}

async function logStage(registrationId: string, stage: string, metadata: Record<string, unknown> = {}) {
  try {
    await db.insert(eventStageLog).values({ registrationId, stage, metadata });
  } catch (e) {
    console.error("[events] stage log failed:", e);
  }
}

// Send an events-mode trigger via WhatsApp, preferring a pre-approved
// Meta template (see shared/wa-approved-templates.ts) when one is
// registered for (trigger, language) so delivery isn't limited to the
// 24-hour customer-service window. When the approved template has an
// image header, `headerImageUrl` (e.g. the generated Tiqket) is attached
// automatically. Falls back to the existing free-form image/text pipeline
// when no approved template is registered yet, or if the template send
// fails for any reason.
export async function sendEventTrigger(
  ev: Event,
  reg: EventRegistration,
  trigger: string,
  headerImageUrl?: string,
  extraVars?: Partial<WaVars>,
): Promise<boolean> {
  if (
    (EVENT_WHATSAPP_TRIGGER_KEYS as readonly string[]).includes(trigger) &&
    !normalizeEventWhatsappTriggers(ev.whatsappTriggers)[trigger as keyof EventWhatsAppTriggers]
  ) {
    console.log(`[events] WhatsApp trigger disabled for event: ${trigger}`);
    return false;
  }
  const lang = reg.preferredLanguage || "en";
  const vars = { ...eventVars(ev, reg), ...extraVars };
  const approved = getApprovedWaTemplate("events", trigger, lang);
  if (approved) {
    const bodyParams = approved.bodyVariables.map((k) => {
      const v = (vars as WaVars)[k];
      // Meta's Cloud API rejects empty string body params (error 131008:
      // "Parameter of type text is missing text value"). Fall back to "-"
      // so the approved template always sends even when optional event fields
      // (venue, support_contact, maps_link) are not filled in.
      const s = v === undefined || v === null ? "" : String(v);
      return s || "-";
    });
    const sent = await sendWhatsAppTemplateMessage(
      reg.customerPhone,
      approved.templateName,
      approved.languageCode,
      bodyParams,
      {
        headerImageUrl: approved.hasImageHeader ? headerImageUrl : undefined,
        organizationId: ev.organizationId,
        flowToken: approved.flowToken,
        // Templates use named variables ({{customer_name}} etc.) — pass names
        // so sendWhatsAppTemplateMessage includes parameter_name on each param.
        bodyParamNames: approved.bodyVariables,
      },
    );
    if (sent) return true;
    console.warn(`[events] approved template send failed for trigger="${trigger}" phone="${reg.customerPhone}" — falling back to image/text`);
  }
  const caption = await renderEventMessage(ev, trigger, vars, lang);
  if (headerImageUrl) {
    console.log(`[events] trying free-form image send for trigger="${trigger}" to ${reg.customerPhone}`);
    const sent = await sendWhatsAppImage(reg.customerPhone, headerImageUrl, caption, ev.organizationId);
    if (sent) return true;
    console.warn(`[events] image send also failed — falling back to plain text`);
  }
  console.log(`[events] trying plain text send for trigger="${trigger}" to ${reg.customerPhone}`);
  return sendWhatsAppMessage(reg.customerPhone, caption, ev.organizationId);
}

export function normalizeEventWhatsappTriggers(raw: unknown): EventWhatsAppTriggers {
  const normalized = { ...DEFAULT_EVENT_WHATSAPP_TRIGGERS };
  if (raw === undefined || raw === null) return normalized;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("whatsappTriggers must be an object map");
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(EVENT_WHATSAPP_TRIGGER_KEYS as readonly string[]).includes(key)) {
      throw new Error(`Unknown WhatsApp trigger "${key}"`);
    }
    if (typeof value !== "boolean") {
      throw new Error(`WhatsApp trigger "${key}" must be a boolean`);
    }
    normalized[key as keyof EventWhatsAppTriggers] = value;
  }
  return normalized;
}

export function normalizeEventOtpSettings(raw: unknown, fallback?: unknown): EventOtpSettings {
  const base = fallback && typeof fallback === "object" && !Array.isArray(fallback)
    ? { ...DEFAULT_EVENT_OTP_SETTINGS, ...(fallback as Partial<EventOtpSettings>) }
    : { ...DEFAULT_EVENT_OTP_SETTINGS };
  if (raw === undefined || raw === null) return base;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("otpSettings must be an object map");
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key !== "registration" && key !== "billing") {
      throw new Error(`Unknown OTP setting "${key}"`);
    }
    if (typeof value !== "boolean") {
      throw new Error(`OTP setting "${key}" must be a boolean`);
    }
    base[key] = value;
  }
  return base;
}

export function normalizeEventRefundPolicy(raw: unknown, fallback?: unknown): EventRefundPolicy {
  const fallbackSource = fallback && typeof fallback === "object" && !Array.isArray(fallback)
    ? fallback as Record<string, unknown>
    : {};
  const source = raw === undefined || raw === null
    ? fallbackSource
    : raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw as Record<string, unknown>
      : (() => { throw new Error("refund policy must be an object map"); })();

  for (const key of Object.keys(source)) {
    if (key !== "refundable" && key !== "refundMessage") {
      throw new Error(`Unknown refund policy setting "${key}"`);
    }
  }
  if (source.refundable !== undefined && typeof source.refundable !== "boolean") {
    throw new Error("Refundable must be a boolean");
  }
  if (source.refundMessage !== undefined && typeof source.refundMessage !== "string") {
    throw new Error("Refund message must be text");
  }
  const refundMessage = String(source.refundMessage ?? fallbackSource.refundMessage ?? "").trim();
  if (refundMessage.length > 1000) {
    throw new Error("Refund message must be 1,000 characters or fewer");
  }
  return {
    refundable: typeof source.refundable === "boolean"
      ? source.refundable
      : typeof fallbackSource.refundable === "boolean"
        ? fallbackSource.refundable
        : DEFAULT_EVENT_REFUND_POLICY.refundable,
    refundMessage,
  };
}

function normalizeRegistrationFeeCustomText(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) return String(fallback || "").trim();
  if (typeof value !== "string") throw new Error("Registration fee custom text must be text");
  const text = value.trim();
  if (text.length > 1000) {
    throw new Error("Registration fee custom text must be 1,000 characters or fewer");
  }
  return text;
}

export function isEventRegistrationOtpEnabled(
  ev: Pick<Event, "otpSettings">,
): boolean {
  return normalizeEventOtpSettings(ev.otpSettings).registration;
}

export function isEventBillingOtpRequired(
  ev: Pick<Event, "otpSettings">,
  feeExists: boolean,
  cashPaidAtCounter: boolean,
): boolean {
  return feeExists &&
    normalizeEventOtpSettings(ev.otpSettings).billing &&
    !cashPaidAtCounter;
}

export function normalizeEventParkingEnabled(raw: unknown, fallback = true): boolean {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw !== "boolean") throw new Error("parkingEnabled must be a boolean");
  return raw;
}

// Resolve the WhatsApp body for an events trigger: organizer per-event
// template override → super-admin override / shared default.
export async function renderEventMessage(ev: Event, trigger: string, vars: WaVars, language: string = "en"): Promise<string> {
  const custom = (ev.messageTemplates || {})[trigger];
  if (custom && custom.trim()) {
    return custom.replace(/\{\{\s*([a-z_0-9]+)\s*\}\}/gi, (_m, k) => {
      const v = vars[k];
      return v === undefined || v === null ? "" : String(v);
    });
  }
  return renderWaMessage("events", trigger, language, vars);
}

export function eventVars(ev: Event, reg: EventRegistration): WaVars {
  const base = getPublicBaseUrl();
  return {
    customer_name: reg.customerName,
    event_name: ev.name,
    booking_id: reg.bookingId,
    slot_date: formatSlotDate(reg.slotDate),
    slot_time: formatSlotTime(reg.slotTime),
    venue: ev.venue || "-",
    family_count: 1 + (reg.familyMembersCount || 0),
    amount_paid: formatPaise(reg.amountPaid || 0),
    support_contact: ev.supportContact || "-",
    feedback_link: `${base}/event-ticket/${reg.qrToken}#feedback`,
    maps_link: ev.googleMapsLink || "-",
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Delivery lease — prevents duplicate WhatsApp sends when the dispatcher
// and reconciler overlap (e.g. a slow Chromium render on cold start races
// with the startup reconciliation scan).
//
// Uses PostgreSQL session-level advisory locks:
//   pg_try_advisory_lock(key)  — acquires lock; returns false if already held
//   pg_advisory_unlock(key)    — releases lock explicitly before returning the
//                                connection to the pool (prevents leak)
//
// The lock key is hashtext(registrationId) — a stable 32-bit integer derived
// from the UUID string, unique per registration within a PostgreSQL cluster.
//
// WHY session-level (not transaction-level): the WhatsApp API call can span
// several seconds.  Transaction-level locks would be released as soon as the
// claim SELECT commits, allowing a second worker to acquire the lock before
// the send completes.  Session-level locks are held until pg_advisory_unlock
// is called or the connection is closed.
// ──────────────────────────────────────────────────────────────────────────

// Exported for test injection — tests replace this with a no-op or a
// controlled stub that skips real DB advisory lock calls.
export type DeliveryLeaseFn = <T>(regId: string, fn: () => Promise<T>) => Promise<T | null>;

export async function withTicketWaLease<T>(regId: string, fn: () => Promise<T>): Promise<T | null> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1::text)) AS acquired",
      [regId],
    );
    if (!rows[0]?.acquired) {
      // Another process or code path already holds the lock for this registration.
      console.log(`[events] delivery lease: skipping reg ${regId} — already claimed by another worker`);
      return null;
    }
    try {
      return await fn();
    } finally {
      // Release the session-level lock before returning the connection to the
      // pool — if we don't, the lock stays held for the lifetime of the
      // connection and the next pool checkout may block indefinitely.
      await client.query("SELECT pg_advisory_unlock(hashtext($1::text))", [regId]).catch((unlockErr: unknown) => {
        console.error(`[events] delivery lease: pg_advisory_unlock failed for reg ${regId}:`, unlockErr);
      });
    }
  } finally {
    client.release();
  }
}

// The fire-and-forget dispatcher: renders the image, uploads to Object
// Storage, and sends the WhatsApp template.  Injectable so tests can
// substitute a no-op and avoid Chromium launches and real API calls.
export type TicketDispatchFn = (ev: Event, reg: EventRegistration, base: string) => void;

// Default production dispatcher — writes a job to the persistent wa_queue
// table and returns immediately without blocking the HTTP response.  The
// wa-queue-worker background process handles rendering, Object Storage upload,
// and WhatsApp delivery with automatic retry on failure.
//
// This replaces the old inline fire-and-forget async closure that could lose
// the send on a server restart (the closure lived only in process memory).
// The wa_queue row is the durable outbox entry; the existing ticket_wa_pending
// log (written in the issueTicket transaction) serves as the fallback for the
// legacy reconciler, which remains active as a safety net.
function defaultTicketDispatch(ev: Event, reg: EventRegistration, _base: string): void {
  if (!reg.qrToken) {
    console.error(`[events] defaultTicketDispatch: qrToken is null for reg ${reg.id} — skipping`);
    return;
  }
  import("./wa-queue-worker")
    .then(({ enqueueWaJob }) =>
      enqueueWaJob({
        phone: reg.customerPhone,
        orgId: ev.organizationId,
        jobType: "event_ticket",
        refId: reg.id,
        dedupeKey: `event_ticket:${reg.id}:ticket`,
      }),
    )
    .catch((err) =>
      console.error(`[events] wa-queue enqueue failed for reg ${reg.id}:`, err),
    );
}

// Ticket images are a cache-like delivery artifact, so a storage cleanup
// failure must never prevent a registration state change or ticket issue.
export async function cleanupEventTicketImage(
  ticketImageUrl: string | null | undefined,
  context: string,
): Promise<void> {
  if (!ticketImageUrl?.includes("/public-objects/")) return;
  try {
    await new ObjectStorageService().deletePublicObject(ticketImageUrl);
    console.log(`[events] deleted ticket image for ${context}`);
  } catch (error) {
    console.error(`[events] ticket image cleanup failed for ${context}:`, error);
  }
}

// Generate the ticket (bookingId + qrToken + QR image URL), persist it,
// send the WhatsApp boarding pass. Idempotent per registration.
//
// The `dispatch` parameter is injectable for testing: tests pass a no-op so
// the test process never touches Chromium or the WhatsApp API, while still
// exercising the atomic DB transaction and outbox receipt.
export async function issueTicket(
  ev: Event,
  reg: EventRegistration,
  dispatch: TicketDispatchFn = defaultTicketDispatch,
): Promise<EventRegistration> {
  if (reg.status === "registration_started" || reg.status === "payment_completed") {
    const previousTicketImageUrl = reg.ticketImageUrl;
    const isReissue = !reg.qrToken && !!previousTicketImageUrl;
    const qrToken = reg.qrToken || makeQrToken();
    const base = getPublicBaseUrl();
    const ticketImageUrl = `${base}/event-ticket-image/${qrToken}.png`;

    // Atomically update registration state, log ticket_generated, and insert
    // the ticket_wa_pending outbox receipt in a single transaction.
    //
    // WHY a single transaction: if the server restarts between any two of
    // these three writes, the row ends up in an inconsistent state that the
    // reconciler cannot recover from.  With a single transaction either all
    // three commit together or none do, leaving the row in the previous
    // `registration_started`/`payment_completed` state so `issueTicket` can
    // be safely retried by the caller.
    //
    // The `ticket_wa_pending` receipt is what the startup reconciler looks
    // for; registrations created before this feature have no pending receipt
    // and are never touched by the reconciler.  The fire-and-forget is only
    // launched AFTER this transaction commits — no crash window between
    // the state change and the outbox entry.
    try {
      reg = await db.transaction(async (tx) => {
        const staffTicketPrefix = reg.registrationSource === "store"
          ? ev.preprintedTicketPrefix
          : undefined;
        const bookingId = reg.bookingId
          ? (await ensurePreprintedTicketIdReserved(tx, ev.id, reg.bookingId), reg.bookingId)
          : await reserveGeneratedTicketId(tx, ev.id, staffTicketPrefix);
        const [updated] = await tx
          .update(eventRegistrations)
          .set({ bookingId, qrToken, ticketImageUrl, status: "ticket_generated", updatedAt: new Date() })
          .where(and(
            eq(eventRegistrations.id, reg.id),
            inArray(eventRegistrations.status, ["registration_started", "payment_completed"]),
          ))
          .returning();
        if (!updated) {
          const [current] = await tx.select().from(eventRegistrations).where(eq(eventRegistrations.id, reg.id)).limit(1);
          if (current?.bookingId && current.qrToken) return current;
          throw new Error("Ticket issuance lost its registration-state race");
        }
        await tx.insert(eventStageLog).values({ registrationId: updated.id, stage: "ticket_generated", metadata: { bookingId } });
        await tx.insert(eventStageLog).values({ registrationId: updated.id, stage: "ticket_wa_pending", metadata: {} });
        return updated;
      });
    } catch (txErr) {
      console.error("[events] issueTicket transaction failed — registration state unchanged:", txErr);
      throw txErr;
    }

    if (isReissue) {
      await cleanupEventTicketImage(previousTicketImageUrl, `reissued registration ${reg.id}`);
    }

    // Only launch the dispatcher AFTER the transaction commits successfully.
    // WHY the order matters: WhatsApp Cloud API performs a HEAD/GET on the
    // image URL synchronously when the template API call is made. If the URL
    // returns a non-2xx (Playwright still launching or rendering), Meta returns
    // error 130472 "Image not available" and the entire template send fails.
    // Rendering first and caching the PNG ensures the endpoint serves the image
    // instantly when Meta checks it.
    try {
      dispatch(ev, reg, base);
    } catch (dispatchErr) {
      // Ticket issuance is already committed. Delivery is an independent
      // best-effort side effect and must never suppress the customer ticket.
      console.error(`[events] ticket dispatch failed for reg ${reg.id}:`, dispatchErr);
    }
  }
  return reg;
}

async function loadEventById(eventId: string, opts: { publishedOnly?: boolean } = {}): Promise<Event | null> {
  const conds = [eq(events.id, eventId)];
  if (opts.publishedOnly) conds.push(inArray(events.status, ["published", "paused"]));
  const rows = await db.select().from(events).where(and(...conds)).limit(1);
  return rows[0] || null;
}

async function loadEventForBranch(branchId: string, opts: { publishedOnly?: boolean } = {}): Promise<Event | null> {
  const conds = [eq(events.branchId, branchId)];
  // "Live" = published or paused. A paused event must still resolve on the
  // public landing (to show the paused banner) and for ticket scanning;
  // only NEW registrations are blocked (checked at the register route).
  if (opts.publishedOnly) conds.push(inArray(events.status, ["published", "paused"]));
  const rows = await db
    .select()
    .from(events)
    .where(and(...conds))
    .orderBy(desc(events.createdAt))
    .limit(1);
  return rows[0] || null;
}

function publicEventShape(ev: Event) {
  return {
    id: ev.id,
    branchId: ev.branchId,
    name: ev.name,
    description: ev.description,
    venue: ev.venue,
    googleMapsLink: ev.googleMapsLink,
    startDate: ev.startDate,
    endDate: ev.endDate,
    operatingHoursStart: ev.operatingHoursStart,
    operatingHoursEnd: ev.operatingHoursEnd,
    slotDurationMinutes: ev.slotDurationMinutes,
    maxCapacityPerSlot: ev.maxCapacityPerSlot,
    maxGuestsPerRegistration: ev.maxGuestsPerRegistration,
    registrationFee: ev.registrationFee,
    registrationFeeCustomText: ev.registrationFeeCustomText || "",
    refundable: ev.refundable === true,
    refundMessage: typeof ev.refundMessage === "string" ? ev.refundMessage : "",
    termsAndConditions: ev.termsAndConditions,
    faqs: ev.faqs,
    supportContact: ev.supportContact,
    bannerUrl: ev.bannerUrl,
    logoUrl: ev.logoUrl,
    galleryUrls: ev.galleryUrls,
    venueMapUrl: ev.venueMapUrl,
    brandPrimaryColor: ev.brandPrimaryColor,
    brandButtonColor: ev.brandButtonColor,
    brandFontFamily: ev.brandFontFamily,
    otpSettings: normalizeEventOtpSettings(ev.otpSettings),
    status: ev.status,
  };
}

const DEFAULT_PREPRINTED_BACK_LAYOUT: PreprintedBackLayout = {
  version: 2,
  elements: [
    { id: "booking-default", type: "bookingId", x: 50, y: 25, width: 26, fontSize: 3.2, fontFamily: "monospace", color: "#1a1a2e", fontWeight: "bold", textAlign: "center", background: true, visible: true },
    { id: "qr-default", type: "qr", x: 50, y: 56, width: 19, fontSize: 3, fontFamily: "monospace", color: "#1a1a2e", fontWeight: "normal", textAlign: "center", background: true, visible: true },
    { id: "serial-default", type: "serialNumber", x: 50, y: 92, width: 20, fontSize: 2.2, fontFamily: "monospace", color: "#1a1a2e", fontWeight: "bold", textAlign: "center", background: true, visible: true },
  ],
};

const PREPRINTED_ELEMENT_TYPES = new Set<PreprintedBackElementType>([
  "qr", "bookingId", "amountPaid", "serialNumber", "eventName",
]);

const PREPRINTED_ELEMENT_DEFAULTS: Record<PreprintedBackElementType, Omit<PreprintedBackElement, "id" | "type">> = {
  qr: { x: 50, y: 55, width: 19, fontSize: 3, fontFamily: "monospace", color: "#1a1a2e", fontWeight: "normal", textAlign: "center", background: true, visible: true },
  bookingId: { x: 50, y: 25, width: 26, fontSize: 3.2, fontFamily: "monospace", color: "#1a1a2e", fontWeight: "bold", textAlign: "center", background: true, visible: true },
  amountPaid: { x: 50, y: 75, width: 28, fontSize: 2.6, fontFamily: "monospace", color: "#1a1a2e", fontWeight: "bold", textAlign: "center", background: true, visible: true },
  serialNumber: { x: 50, y: 92, width: 20, fontSize: 2.2, fontFamily: "monospace", color: "#1a1a2e", fontWeight: "bold", textAlign: "center", background: true, visible: true },
  eventName: { x: 50, y: 12, width: 42, fontSize: 3.4, fontFamily: "monospace", color: "#1a1a2e", fontWeight: "bold", textAlign: "center", background: false, visible: true },
};
const PREPRINTED_FONT_FAMILY_CSS: Record<PreprintedBackFontFamily, string> = {
  monospace: "monospace",
  Arial: "Arial, sans-serif",
  Georgia: "Georgia, serif",
  "Times New Roman": "'Times New Roman', serif",
  "Trebuchet MS": "'Trebuchet MS', sans-serif",
  Verdana: "Verdana, sans-serif",
};
const PREPRINTED_FONT_FAMILIES = new Set(Object.keys(PREPRINTED_FONT_FAMILY_CSS));
const PREPRINTED_CANVAS_ASPECT_RATIO = 203 / 82;
const PREPRINTED_MAX_QR_WIDTH = 100 / PREPRINTED_CANVAS_ASPECT_RATIO;
const PREPRINTED_PRINT_TICKET_WIDTH_MM = 202;
const PREPRINTED_PRINT_TICKET_HEIGHT_MM = 82;
const PREPRINTED_PRINT_GUTTER_MM = 4;
const PREPRINTED_PRINT_CORNER_RADIUS_MM = 6;
const PREPRINTED_PRINT_BACK_CUT_LINE_OFFSET_MM = 57;
const PREPRINTED_PRINT_COLUMNS = 3;
const PREPRINTED_PRINT_ROWS = 2;
const PREPRINTED_PRINT_TICKETS_PER_SHEET = PREPRINTED_PRINT_COLUMNS * PREPRINTED_PRINT_ROWS;
const PREPRINTED_PRINT_MARGIN_X_MM =
  (297 - (PREPRINTED_PRINT_COLUMNS * PREPRINTED_PRINT_TICKET_HEIGHT_MM)
    - ((PREPRINTED_PRINT_COLUMNS - 1) * PREPRINTED_PRINT_GUTTER_MM)) / 2;
const PREPRINTED_PRINT_MARGIN_Y_MM =
  (420 - (PREPRINTED_PRINT_ROWS * PREPRINTED_PRINT_TICKET_WIDTH_MM)
    - ((PREPRINTED_PRINT_ROWS - 1) * PREPRINTED_PRINT_GUTTER_MM)) / 2;

export function normalizePreprintedBackLayout(raw: unknown): PreprintedBackLayout {
  const source = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const clamp = (value: unknown, fallback: number, min: number, max: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  };

  if (source.version === 2 && Array.isArray(source.elements)) {
    const usedIds = new Set<string>();
    const elements: PreprintedBackElement[] = [];
    for (const [index, rawElement] of source.elements.slice(0, 40).entries()) {
      if (!rawElement || typeof rawElement !== "object" || Array.isArray(rawElement)) continue;
      const item = rawElement as Record<string, unknown>;
      const type = typeof item.type === "string" && PREPRINTED_ELEMENT_TYPES.has(item.type as PreprintedBackElementType)
        ? item.type as PreprintedBackElementType
        : null;
      if (!type) continue;
      const defaults = PREPRINTED_ELEMENT_DEFAULTS[type];
      let id = typeof item.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(item.id)
        ? item.id
        : `${type}-${index + 1}`;
      while (usedIds.has(id)) id = `${type}-${index + 1}-${usedIds.size + 1}`;
      usedIds.add(id);
      const width = clamp(item.width, defaults.width, 5, type === "qr" ? PREPRINTED_MAX_QR_WIDTH : 90);
      const yEdge = type === "qr" ? (width * PREPRINTED_CANVAS_ASPECT_RATIO) / 2 : 3;
      elements.push({
        id,
        type,
        x: clamp(item.x, defaults.x, width / 2, 100 - width / 2),
        y: clamp(item.y, defaults.y, yEdge, 100 - yEdge),
        width,
        fontSize: clamp(item.fontSize, defaults.fontSize, 1, 12),
        fontFamily: typeof item.fontFamily === "string" && PREPRINTED_FONT_FAMILIES.has(item.fontFamily)
          ? item.fontFamily as PreprintedBackFontFamily
          : defaults.fontFamily,
        color: typeof item.color === "string" && /^#[0-9A-Fa-f]{6}$/.test(item.color) ? item.color : defaults.color,
        fontWeight: item.fontWeight === "normal" || item.fontWeight === "bold" ? item.fontWeight : defaults.fontWeight,
        textAlign: item.textAlign === "left" || item.textAlign === "center" || item.textAlign === "right" ? item.textAlign : defaults.textAlign,
        background: typeof item.background === "boolean" ? item.background : defaults.background,
        visible: typeof item.visible === "boolean" ? item.visible : defaults.visible,
      });
    }
    return { version: 2, elements };
  }

  // Legacy fixed-object layouts are converted in memory and saved as v2 on the
  // next edit. This preserves existing organizer placements without a data rewrite.
  const legacy = (key: "bookingId" | "qr" | "serialNumber") =>
    source[key] && typeof source[key] === "object" && !Array.isArray(source[key])
      ? source[key] as Record<string, unknown>
      : {};
  const booking = legacy("bookingId");
  const qr = legacy("qr");
  const serial = legacy("serialNumber");
  if (Object.keys(source).length === 0) {
    return structuredClone(DEFAULT_PREPRINTED_BACK_LAYOUT);
  }
  const bookingWidth = PREPRINTED_ELEMENT_DEFAULTS.bookingId.width;
  const qrWidth = clamp(qr.size, PREPRINTED_ELEMENT_DEFAULTS.qr.width, 5, PREPRINTED_MAX_QR_WIDTH);
  const qrYEdge = (qrWidth * PREPRINTED_CANVAS_ASPECT_RATIO) / 2;
  const serialWidth = PREPRINTED_ELEMENT_DEFAULTS.serialNumber.width;
  return {
    version: 2,
    elements: [
      { ...PREPRINTED_ELEMENT_DEFAULTS.bookingId, id: "booking-default", type: "bookingId", x: clamp(booking.x, 50, bookingWidth / 2, 100 - bookingWidth / 2), y: clamp(booking.y, 25, 3, 97), fontSize: clamp(booking.fontSize, 3.2, 1, 12) },
      { ...PREPRINTED_ELEMENT_DEFAULTS.qr, id: "qr-default", type: "qr", x: clamp(qr.x, 50, qrWidth / 2, 100 - qrWidth / 2), y: clamp(qr.y, 56, qrYEdge, 100 - qrYEdge), width: qrWidth },
      { ...PREPRINTED_ELEMENT_DEFAULTS.serialNumber, id: "serial-default", type: "serialNumber", x: clamp(serial.x, 50, serialWidth / 2, 100 - serialWidth / 2), y: clamp(serial.y, 92, 3, 97), fontSize: clamp(serial.fontSize, 2.2, 1, 8) },
    ],
  };
}

export function renderPreprintedBackOverlays(
  layout: PreprintedBackLayout,
  data: {
    bookingId: string;
    qrDataUrl: string;
    serialNumber: string;
    amountPaid: number;
    eventName: string;
  },
): string {
  return layout.elements
    .filter((element) => element.visible)
    .map((element) => {
      const positionStyle = `left:${element.x}%;top:${element.y}%;width:${element.width}%;`;
      if (element.type === "qr") {
        return `<img class="overlay qr-overlay${element.background ? " has-background" : ""}" style="${positionStyle}" src="${data.qrDataUrl}" alt="QR code for ${escapeHtml(data.bookingId)}">`;
      }
      const value = element.type === "bookingId"
        ? data.bookingId
        : element.type === "serialNumber"
          ? `S/N ${data.serialNumber}`
          : element.type === "amountPaid"
            ? `Amount Paid: ${formatPaise(data.amountPaid)}`
            : data.eventName;
      const textStyle = `${positionStyle}font-size:${element.fontSize}cqw;font-family:${PREPRINTED_FONT_FAMILY_CSS[element.fontFamily]};color:${element.color};font-weight:${element.fontWeight === "bold" ? "800" : "400"};text-align:${element.textAlign};`;
      return `<span class="overlay text-overlay${element.background ? " has-background" : ""}" style="${textStyle}">${escapeHtml(value)}</span>`;
    })
    .join("");
}

function validPreprintedArtworkUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\/public-objects\/[A-Za-z0-9._~:/-]+$/.test(value)) {
    throw new Error("Artwork must be an uploaded public object");
  }
  return value;
}

function regShape(r: EventRegistration) {
  return {
    id: r.id,
    eventId: r.eventId,
    locationId: r.locationId,
    formData: r.formData,
    bookingId: r.bookingId,
    qrToken: r.qrToken,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    customerEmail: r.customerEmail,
    preferredLanguage: r.preferredLanguage,
    familyMembersCount: r.familyMembersCount,
    priorityAccess: r.priorityAccess,
    slotDate: r.slotDate,
    slotTime: r.slotTime,
    status: r.status,
    amountPaid: r.amountPaid,
    ticketImageUrl: r.ticketImageUrl,
    arrivedAt: r.arrivedAt,
    checkedInAt: r.checkedInAt,
    exitedAt: r.exitedAt,
    visitDurationMinutes: r.visitDurationMinutes,
    checkoutAlertSnapshot: r.checkoutAlertSnapshot,
    invalidScanAttempts: r.invalidScanAttempts,
    duplicateEntryAttempts: r.duplicateEntryAttempts,
    createdAt: r.createdAt,
  };
}

async function registrationJourney(registrationId: string) {
  return db
    .select({
      id: eventStageLog.id,
      stage: eventStageLog.stage,
      createdAt: eventStageLog.createdAt,
      metadata: eventStageLog.metadata,
    })
    .from(eventStageLog)
    .where(eq(eventStageLog.registrationId, registrationId))
    .orderBy(desc(eventStageLog.createdAt))
    .limit(30);
}

type CheckoutAlert = {
  enabled: boolean;
  maxDurationMinutes: number;
  title: string;
  message: string;
  iconUrl: string;
};

export function normalizeCheckoutAlert(raw: unknown, fallback?: unknown): CheckoutAlert {
  const source = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : fallback && typeof fallback === "object" && !Array.isArray(fallback)
      ? fallback as Record<string, unknown>
      : {};
  const enabled = source.enabled === true;
  const rawDuration = source.maxDurationMinutes ?? 60;
  if (
    (typeof rawDuration !== "number" && typeof rawDuration !== "string") ||
    !/^\d+$/.test(String(rawDuration).trim())
  ) {
    throw new Error("Checkout alert duration must be a whole number of minutes");
  }
  const maxDurationMinutes = Number(rawDuration);
  const title = String(source.title ?? "").trim();
  const message = String(source.message ?? "").trim();
  const iconUrl = String(source.iconUrl ?? "").trim();
  if (!Number.isFinite(maxDurationMinutes) || maxDurationMinutes < 1 || maxDurationMinutes > 10080) {
    throw new Error("Checkout alert duration must be between 1 and 10,080 minutes");
  }
  if (title.length > 120) throw new Error("Checkout alert title must be 120 characters or fewer");
  if (message.length > 1000) throw new Error("Checkout alert message must be 1,000 characters or fewer");
  if (iconUrl && !/^\/public-objects\/[A-Za-z0-9._~:/-]+$/.test(iconUrl)) {
    throw new Error("Checkout alert icon must be an uploaded image");
  }
  if (enabled && (!title || !message || !iconUrl)) {
    throw new Error("Checkout alert title, message, and uploaded icon are required when enabled");
  }
  return { enabled, maxDurationMinutes, title, message, iconUrl };
}

export function checkoutAlertFor(
  ev: Pick<Event, "checkoutAlert">,
  reg: {
    checkedInAt: EventRegistration["checkedInAt"];
    checkoutAlertSnapshot?: EventRegistration["checkoutAlertSnapshot"];
  },
  at: Date,
) {
  if (reg.checkoutAlertSnapshot) return reg.checkoutAlertSnapshot;
  if (!reg.checkedInAt) return null;
  let config: CheckoutAlert;
  try {
    config = normalizeCheckoutAlert(ev.checkoutAlert);
  } catch {
    return null;
  }
  if (!config.enabled) return null;
  const elapsedMs = Math.max(0, at.getTime() - new Date(reg.checkedInAt).getTime());
  if (elapsedMs > config.maxDurationMinutes * 60000) return null;
  const elapsedMinutes = Math.round(elapsedMs / 60000);
  return {
    title: config.title,
    message: config.message,
    iconUrl: config.iconUrl,
    maxDurationMinutes: config.maxDurationMinutes,
    elapsedMinutes,
    capturedAt: at.toISOString(),
  };
}

/** Build a map of { fieldId → humanLabel } from a service's inputFields. */
async function buildFormLabels(locationId: string | null): Promise<Record<string, string>> {
  if (!locationId) return {};
  try {
    const [svc] = await db.select({ inputFields: services.inputFields }).from(services).where(eq(services.id, locationId)).limit(1);
    const fields = Array.isArray(svc?.inputFields) ? svc.inputFields as any[] : [];
    const map: Record<string, string> = {};
    for (const f of fields) {
      const fid = String(f.id || f.label || "");
      const label = String(f.label || fid);
      if (fid) map[fid] = label;
    }
    return map;
  } catch { return {}; }
}

async function findRegistrationByAny(idOrCode: string): Promise<EventRegistration | null> {
  const v = (idOrCode || "").trim();
  if (!v) return null;
  const bookingIdCandidates = getExactTicketIdCandidates(v);
  const rows = await db
    .select()
    .from(eventRegistrations)
    .where(or(
      eq(eventRegistrations.qrToken, v.toLowerCase()),
      inArray(eventRegistrations.bookingId, bookingIdCandidates),
      eq(eventRegistrations.id, v),
    ))
    .limit(1);
  return rows[0] || null;
}

// Public-route lookup: qrToken ONLY. Human-readable booking IDs are short and
// guessable, so they must never resolve tickets on unauthenticated paths —
// only the 40-hex-char unguessable token may.
async function findRegistrationByToken(token: string): Promise<EventRegistration | null> {
  const v = (token || "").trim().toLowerCase();
  if (!/^[a-f0-9]{16,64}$/.test(v)) return null;
  const rows = await db
    .select()
    .from(eventRegistrations)
    .where(eq(eventRegistrations.qrToken, v))
    .limit(1);
  return rows[0] || null;
}

// Load an event and enforce that it belongs to the caller's org (super-admin
// passes). Sends the error response and returns null on failure.
async function assertEventOwnership(req: Request, res: Response, eventId: string | undefined): Promise<Event | null> {
  const [ev] = await db.select().from(events).where(eq(events.id, String(eventId || ""))).limit(1);
  if (!ev) {
    res.status(404).json({ error: "Event not found" });
    return null;
  }
  if (!(await assertOrgOwnership(req, res, ev.organizationId))) return null;
  return ev;
}

// Org-scoped registration lookup for staff consoles (scan / billing /
// support). A ticket from another organization must read as "not found" —
// never as a 403 oracle that confirms the code exists.
async function findOrgRegistration(
  req: Request,
  idOrCode: string,
): Promise<{ reg: EventRegistration; ev: Event } | null> {
  const reg = await findRegistrationByAny(idOrCode);
  if (!reg) return null;
  const [ev] = await db.select().from(events).where(eq(events.id, reg.eventId)).limit(1);
  if (!ev) return null;
  const callerOrg = await getRequestOrganizationId(req);
  if (callerOrg === null) return null;
  if (callerOrg !== "*" && callerOrg !== ev.organizationId) return null;
  return { reg, ev };
}

// Inventory QR codes are intentionally not registrations until a desk user
// assigns them. Scanner flows need a distinct error here: "not found" could
// tempt staff to admit a guest manually, while this states that entry is not
// authorized yet. Cross-organization inventory remains invisible.
async function findUnassignedPreprintedTicketForOrg(
  req: Request,
  idOrCode: string,
): Promise<{ ticket: typeof eventPreprintedTickets.$inferSelect; ev: Event } | null> {
  const v = (idOrCode || "").trim();
  if (!v) return null;
  const bookingIdCandidates = getExactTicketIdCandidates(v);
  const rows = await db.select({ ticket: eventPreprintedTickets, ev: events })
    .from(eventPreprintedTickets)
    .innerJoin(events, eq(eventPreprintedTickets.eventId, events.id))
    .where(and(
      or(
        eq(eventPreprintedTickets.qrToken, v.toLowerCase()),
        inArray(eventPreprintedTickets.bookingId, bookingIdCandidates),
      ),
      ne(eventPreprintedTickets.status, "assigned"),
    ))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const callerOrg = await getRequestOrganizationId(req);
  if (callerOrg === null || (callerOrg !== "*" && callerOrg !== row.ev.organizationId)) return null;
  return row;
}

async function findUnassignedPreprintedTicketForEvent(
  eventId: string,
  idOrCode: string,
): Promise<typeof eventPreprintedTickets.$inferSelect | null> {
  const v = (idOrCode || "").trim();
  if (!v) return null;
  const bookingIdCandidates = getExactTicketIdCandidates(v);
  const rows = await db.select()
    .from(eventPreprintedTickets)
    .where(and(
      eq(eventPreprintedTickets.eventId, eventId),
      or(
        eq(eventPreprintedTickets.qrToken, v.toLowerCase()),
        inArray(eventPreprintedTickets.bookingId, bookingIdCandidates),
      ),
      ne(eventPreprintedTickets.status, "assigned"),
    ))
    .limit(1);
  return rows[0] || null;
}

// Extract a qr token from raw scanner text — accepts the bare token, the
// full /event-ticket/<token> URL, or a booking id.
function parseScanValue(raw: string): string {
  const v = (raw || "").trim();
  const m = v.match(/event-ticket\/([a-f0-9]{16,64})/i);
  if (m) return m[1].toLowerCase();
  return v;
}

// ---------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------

export async function eventTicketImageRoute(
  req: Request,
  res: Response,
): Promise<unknown> {
  try {
    const token = String(req.params.token || "").toLowerCase();

    // 1. Serve from the in-memory cache whenever possible. issueTicket
    //    pre-renders the image before calling sendEventTrigger so the first
    //    Meta HEAD/GET check hits the cached PNG instantly.
    const {
      getEventTicketImageCache,
      renderTicketImage,
      setEventTicketImageCache,
    } = await import("./ticket-image");
    const cached = getEventTicketImageCache(token);
    if (cached) {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.send(cached);
    }

    const reg = await findRegistrationByToken(token);
    if (!reg || !reg.qrToken) return res.status(404).send("Not found");

    // 2. After a restart, redirect to the durable Object Storage copy instead
    //    of launching Chromium to re-render the image.
    if (reg.ticketImageUrl && reg.ticketImageUrl.includes("/public-objects/")) {
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.redirect(302, reg.ticketImageUrl);
    }

    // 3. Fall back to a fresh Playwright render (cold start / upload failed).
    const png = await renderTicketImage(reg.qrToken);
    setEventTicketImageCache(reg.qrToken, png);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    return res.send(png);
  } catch (e) {
    console.error("[events] ticket image render failed:", e);
    return res.status(500).send("Ticket image failed");
  }
}

export function registerEventsRoutes(app: Express) {
  void backfillTicketIdentifierRegistry();
  // ============ CUSTOMER (PUBLIC) ============

  // Canonical per-event link: /event/:branchId/:eventId. Kept branch-scoped
  // too (/event/:branchId) for back-compat with QR codes/links printed
  // before per-event linking existed — that legacy form still resolves to
  // whichever event is currently live on the branch.
  app.get("/event/:branchId/:eventId", (_req: Request, res: Response) => {
    const p = path.join(templatesDir, "event-landing.html");
    if (fs.existsSync(p)) res.sendFile(p);
    else res.status(404).send("Event page not found");
  });

  app.get("/event/:branchId", (_req: Request, res: Response) => {
    const p = path.join(templatesDir, "event-landing.html");
    if (fs.existsSync(p)) res.sendFile(p);
    else res.status(404).send("Event page not found");
  });

  app.get("/event-ticket/:qrToken", (_req: Request, res: Response) => {
    const p = path.join(templatesDir, "event-ticket.html");
    if (fs.existsSync(p)) res.sendFile(p);
    else res.status(404).send("Ticket page not found");
  });

  // TV Dashboard — public, no-auth display page for casting to a screen.
  // The event UUID is unguessable enough to serve as implicit access control.
  app.get("/event-tv/:eventId", (_req: Request, res: Response) => {
    const p = path.join(templatesDir, "event-tv.html");
    res.setHeader("Cache-Control", "no-store, must-revalidate");
    if (fs.existsSync(p)) res.sendFile(p);
    else res.status(404).send("TV dashboard not found");
  });

  // TV Dashboard data API — returns live event metrics and 30-min footfall
  // buckets (arrivals + exits) that the TV page polls every 5 seconds.
  // Public: the event UUID acts as the access token.
  app.get("/api/event-tv/:eventId/data", async (req: Request, res: Response) => {
    try {
      const eventId = String(req.params.eventId || "").trim();
      if (!eventId) return res.status(400).json({ error: "Missing eventId" });

      const evRows = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
      if (!evRows.length) return res.status(404).json({ error: "Event not found" });
      const ev = evRows[0];

      const locFilter = String((req.query.locationId as string) || "").trim();
      let slotCapacity = Math.max(0, Number(ev.maxCapacityPerSlot) || 0);

      const allRegs = await db.select().from(eventRegistrations).where(eq(eventRegistrations.eventId, ev.id));
      const regs = locFilter ? allRegs.filter((r) => r.locationId === locFilter) : allRegs;

      // Unique location IDs across ALL registrations (not filtered) so the
      // TV page can render the location badge regardless of ?locationId.
      const locIds = [...new Set(allRegs.map((r) => r.locationId).filter((id): id is string => Boolean(id)))];
      const locRows = locIds.length
        ? await db.select().from(services).where(inArray(services.id, locIds))
        : [];
      if (locFilter) {
        const [selectedLocation] = await db
          .select()
          .from(services)
          .where(and(eq(services.id, locFilter), eq(services.branchId, ev.branchId)))
          .limit(1);
        if (selectedLocation) slotCapacity = resolveLocationConfig(ev, selectedLocation).maxCapacityPerSlot;
      }

      // Aggregate metrics over the (possibly filtered) set of registrations.
      let insideGuests = 0, checkedInTickets = 0, arrivedGuests = 0, exitedGuests = 0, exitedTickets = 0, expectedGuests = 0, totalGuests = 0, revenue = 0;
      const durations: number[] = [];

      for (const r of regs) {
        const g = 1 + (r.familyMembersCount || 0);
        totalGuests += g;
        if (r.status === "checked_in") {
          insideGuests += g;
          checkedInTickets++;
        }
        if (r.status === "arrived") arrivedGuests += g;
        if (["exited", "feedback_submitted"].includes(r.status)) {
          exitedGuests += g;
          exitedTickets++;
        }
        if (["ticket_generated", "payment_completed"].includes(r.status)) expectedGuests += g;
        revenue += r.amountPaid || 0;
        if (r.visitDurationMinutes) durations.push(r.visitDurationMinutes);
      }

      // Footfall: bucket arrivedAt and exitedAt timestamps into 30-min
      // epoch-ms boundaries so the browser can localise them without any
      // server-side timezone knowledge.
      const BUCKET = 30 * 60 * 1000;
      type FootfallBucket = { tickets: number; guests: number };
      const arrivalMap: Record<number, FootfallBucket> = {};
      const exitMap:    Record<number, FootfallBucket> = {};

      for (const r of regs) {
        const g = 1 + (r.familyMembersCount || 0);
        if (r.arrivedAt) {
          const k = Math.floor(new Date(r.arrivedAt).getTime() / BUCKET) * BUCKET;
          if (!arrivalMap[k]) arrivalMap[k] = { tickets: 0, guests: 0 };
          arrivalMap[k].tickets++;
          arrivalMap[k].guests += g;
        }
        if (r.exitedAt) {
          const k = Math.floor(new Date(r.exitedAt).getTime() / BUCKET) * BUCKET;
          if (!exitMap[k]) exitMap[k] = { tickets: 0, guests: 0 };
          exitMap[k].tickets++;
          exitMap[k].guests += g;
        }
      }

      const toSortedArray = (map: Record<number, FootfallBucket>) =>
        Object.entries(map)
          .map(([ts, b]) => ({ time: Number(ts), tickets: b.tickets, guests: b.guests }))
          .sort((a, b) => a.time - b.time);

      res.setHeader("Cache-Control", "no-store");
      res.json({
        event: {
          id: ev.id,
          name: ev.name,
          status: ev.status,
          startDate: ev.startDate,
          endDate: ev.endDate,
        },
        locations: locRows.map((location) => ({ id: location.id, name: location.name })),
        metrics: {
          totalRegistrations: regs.length,
          insideGuests,
          checkedInTickets,
          arrivedGuests,
          exitedGuests,
          exitedTickets,
          expectedGuests,
          totalGuests,
          slotCapacity,
          advanceRevenue: revenue,
          avgVisitMinutes: durations.length
            ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
            : null,
        },
        footfall: {
          arrivals: toSortedArray(arrivalMap),
          exits:    toSortedArray(exitMap),
        },
      });
    } catch (e) {
      console.error("[event-tv] data error:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // QR PNG — generated on demand. WhatsApp's servers fetch this link when
  // delivering the image message, so it must stay public.
  app.get("/event-qr/:token.png", publicRoute("QR ticket image fetched by WhatsApp and the pass page"), async (req: Request, res: Response) => {
    try {
      const token = String(req.params.token || "").toLowerCase();
      const reg = await findRegistrationByToken(token);
      if (!reg || !reg.qrToken) return res.status(404).send("Not found");
      const base = getPublicBaseUrl();
      const png = await QRCode.toBuffer(`${base}/event-ticket/${reg.qrToken}`, {
        type: "png", width: 640, margin: 2, errorCorrectionLevel: "M",
        color: { dark: "#1a1a2e", light: "#ffffff" },
      });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(png);
    } catch (e) {
      console.error("[events] QR render failed:", e);
      res.status(500).send("QR failed");
    }
  });

  // Full designed ticket image (boarding-pass card, screenshotted from the
  // /event-ticket page) — this is what's actually sent as the WhatsApp
  // image message, so recipients get event + customer details baked into
  // the picture itself, not just a bare QR square.
  //
  // Resolution order:
  //   1. In-memory cache (warm after issueTicket pre-render — fastest path,
  //      avoids Playwright entirely while the server is still running).
  //   2. Object Storage URL stored in reg.ticketImageUrl (persistent across
  //      restarts — redirect to it so Meta/WhatsApp CDN can cache it directly).
  //   3. Fresh Playwright render (cold start or cache miss fallback).
  app.get(
    "/event-ticket-image/:token.png",
    publicRoute("designed ticket image fetched by WhatsApp and staff tools"),
    eventTicketImageRoute,
  );

  // Public registration-link QR codes (PNG + SVG). The registration link
  // is per-event (/event/:branchId/:eventId) so each event's QR points at
  // that event specifically, not "whatever is currently live on the
  // branch". Served in two formats so organizers can drop it into print
  // (SVG = crisp at any size) or web/social (PNG).
  const eventRegQrTarget = async (branchId: string, eventId?: string): Promise<string | null> => {
    const base = getPublicBaseUrl();
    if (eventId) {
      const ev = await loadEventById(eventId, { publishedOnly: true });
      if (!ev || ev.branchId !== branchId) return null;
      return `${base}/event/${branchId}/${eventId}`;
    }
    // Legacy fallback for QR codes generated before per-event linking.
    const ev = await loadEventForBranch(branchId, { publishedOnly: true });
    if (!ev) return null;
    return `${base}/event/${branchId}`;
  };

  app.get("/event-reg-qr/:branchId/:eventId.png", publicRoute("public event registration-link QR (PNG, per event)"), async (req: Request, res: Response) => {
    try {
      const target = await eventRegQrTarget(String(req.params.branchId || ""), String(req.params.eventId || ""));
      if (!target) return res.status(404).send("Event not found for this branch");
      const png = await QRCode.toBuffer(target, {
        type: "png", width: 1024, margin: 2, errorCorrectionLevel: "M",
        color: { dark: "#1a1a2e", light: "#ffffff" },
      });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Disposition", `attachment; filename="event-registration-qr.png"`);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(png);
    } catch (e) {
      console.error("[events] reg QR PNG failed:", e);
      res.status(500).send("QR failed");
    }
  });

  app.get("/event-reg-qr/:branchId/:eventId.svg", publicRoute("public event registration-link QR (SVG, per event)"), async (req: Request, res: Response) => {
    try {
      const target = await eventRegQrTarget(String(req.params.branchId || ""), String(req.params.eventId || ""));
      if (!target) return res.status(404).send("Event not found for this branch");
      const svg = await QRCode.toString(target, {
        type: "svg", margin: 2, errorCorrectionLevel: "M",
        color: { dark: "#1a1a2e", light: "#ffffff" },
      });
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Content-Disposition", `attachment; filename="event-registration-qr.svg"`);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(svg);
    } catch (e) {
      console.error("[events] reg QR SVG failed:", e);
      res.status(500).send("QR failed");
    }
  });

  app.get("/event-reg-qr/:branchId.png", publicRoute("public event registration-link QR (PNG, legacy branch-scoped)"), async (req: Request, res: Response) => {
    try {
      const target = await eventRegQrTarget(String(req.params.branchId || ""));
      if (!target) return res.status(404).send("No published event for this branch");
      const png = await QRCode.toBuffer(target, {
        type: "png", width: 1024, margin: 2, errorCorrectionLevel: "M",
        color: { dark: "#1a1a2e", light: "#ffffff" },
      });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Content-Disposition", `attachment; filename="event-registration-qr.png"`);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(png);
    } catch (e) {
      console.error("[events] reg QR PNG failed:", e);
      res.status(500).send("QR failed");
    }
  });

  app.get("/event-reg-qr/:branchId.svg", publicRoute("public event registration-link QR (SVG, legacy branch-scoped)"), async (req: Request, res: Response) => {
    try {
      const target = await eventRegQrTarget(String(req.params.branchId || ""));
      if (!target) return res.status(404).send("No published event for this branch");
      const svg = await QRCode.toString(target, {
        type: "svg", margin: 2, errorCorrectionLevel: "M",
        color: { dark: "#1a1a2e", light: "#ffffff" },
      });
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Content-Disposition", `attachment; filename="event-registration-qr.svg"`);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(svg);
    } catch (e) {
      console.error("[events] reg QR SVG failed:", e);
      res.status(500).send("QR failed");
    }
  });

  // NOTE: must be registered before the generic `/api/event/:branchId/:eventId`
  // route below — Express matches by registration order and that route would
  // otherwise swallow `/api/event/ticket/:qrToken` (both are 2-segment GETs).
  app.get("/api/event/ticket/:qrToken", publicRoute("public boarding-pass data (unguessable token)"), async (req: Request, res: Response) => {
    try {
      const reg = await findRegistrationByToken(String(req.params.qrToken || ""));
      if (!reg) return res.status(404).json({ error: "Ticket not found" });
      const [ev] = await db.select().from(events).where(eq(events.id, reg.eventId)).limit(1);
      if (!ev) return res.status(404).json({ error: "Event not found" });
      const [fb] = await db.select().from(eventFeedback).where(eq(eventFeedback.registrationId, reg.id)).limit(1);
      const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, ev.organizationId)).limit(1);
      res.json({
        registration: regShape(reg),
        event: publicEventShape(ev),
        orgName: org?.name || null,
        slotDateLabel: formatSlotDate(reg.slotDate),
        slotTimeLabel: formatSlotTime(reg.slotTime),
        amountPaidLabel: formatPaise(reg.amountPaid || 0),
        qrImageUrl: reg.qrToken ? `/event-qr/${reg.qrToken}.png` : null,
        feedbackSubmitted: !!fb,
      });
    } catch (e) {
      console.error("[events] ticket fetch failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Shared handler for both the legacy branch-scoped landing-data route and
  // the canonical per-event route.
  const handleEventLanding = (resolveEvent: (req: Request) => Promise<Event | null>) => async (req: Request, res: Response) => {
    try {
      const ev = await resolveEvent(req);
      if (!ev) return res.status(404).json({ error: "No active event for this branch" });
      const [branch] = await db.select().from(branches).where(eq(branches.id, ev.branchId)).limit(1);
      const dates = buildEventDates(ev);
      const tz = branch?.timezone || "Asia/Kolkata";
      const now = Date.now();

      // Build the per-slot availability grid for a given config + usage map.
      const buildSlots = (cfg: LocationEventConfig, usage: Record<string, number>) => {
        const times = buildSlotTimesFrom(cfg.operatingHoursStart, cfg.operatingHoursEnd, cfg.slotDurationMinutes);
        return dates.map((date) => ({
          date,
          label: formatSlotDate(date),
          times: times.map((time) => {
            const used = usage[`${date}|${time}`] || 0;
            const capacity = cfg.slotCapacityOverrides[`${date}|${time}`] ?? cfg.maxCapacityPerSlot;
            const startUtc = zonedTimeToUtc(date, time, tz).getTime();
            return {
              time,
              label: formatSlotTime(time),
              rangeLabel: formatEventSlotRange(time, cfg.slotDurationMinutes),
              capacity,
              used,
              available: Math.max(0, capacity - used),
              past: startUtc < now,
            };
          }),
        }));
      };

      // Each "Location" (service) carries its own slots, capacity, fee and
      // custom input fields. The customer picks a location, then a slot.
      const allSvcRows = await loadEventLocations(ev.branchId);
      // Only show locations that are unlinked or linked to THIS event, so each
      // event's public link surfaces its own locations. If none are linked to
      // this event, fall back to all (back-compat for pre-linking data).
      const linkedRows = allSvcRows.filter((svc) => {
        const eid = (svc as any)?.serviceSettings?.event?.eventId;
        return !eid || eid === ev.id;
      });
      const eventLinkedRows = allSvcRows.filter((svc) => (svc as any)?.serviceSettings?.event?.eventId === ev.id);
      const svcRows = eventLinkedRows.length > 0 ? eventLinkedRows : linkedRows;
      const locations = await Promise.all(svcRows.map(async (svc) => {
        const cfg = resolveLocationConfig(ev, svc);
        const usage = await slotUsage(ev.id, svc.id);
        return {
          id: svc.id,
          name: svc.name,
          description: svc.description || "",
          registrationFee: cfg.registrationFee,
           registrationFeeCustomText: cfg.registrationFeeCustomText,
          refundable: cfg.refundable,
          refundMessage: cfg.refundMessage,
          slotDurationMinutes: cfg.slotDurationMinutes,
          inputFields: Array.isArray(svc.inputFields) ? svc.inputFields : [],
          slots: buildSlots(cfg, usage),
        };
      }));

      // Back-compat: events with no locations still expose event-level slots.
      const eventUsage = await slotUsage(ev.id, null);
      const slots = buildSlots(resolveLocationConfig(ev, null), eventUsage);

      // Diagnostic: log inputFields per location so production logs reveal
      // whether the DB rows have fields configured (helps track issue 1).
      if (locations.length > 0) {
        console.log(
          "[events] landing locations inputFields:",
          locations.map((l) => ({ id: l.id, name: l.name, fieldCount: l.inputFields.length })),
        );
      }

      res.json({
        event: publicEventShape(ev),
        branchName: branch?.name || "",
        organizationId: ev.organizationId,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID || null,
        locations,
        slots,
      });
    } catch (e) {
      console.error("[events] public event fetch failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  // Canonical per-event landing-data route.
  app.get("/api/event/:branchId/:eventId", publicRoute("public event landing data (per event)"), handleEventLanding(async (req) => {
    const ev = await loadEventById(String(req.params.eventId), { publishedOnly: true });
    return (ev && ev.branchId === String(req.params.branchId)) ? ev : null;
  }));

  // Legacy branch-scoped landing-data route (pre-dates per-event linking).
  // Register this fixed path before /api/event/:branchId so Express does not
  // interpret "payment-link-callback" as a branch ID.
  app.get("/api/event/payment-link-callback", publicRoute("payment link callback"), handlePaymentLinkCallback);

  app.get("/api/event/:branchId", publicRoute("public event landing data (legacy branch-scoped)"), handleEventLanding(async (req) => {
    return loadEventForBranch(String(req.params.branchId), { publishedOnly: true });
  }));

  // Returns the customer's most recently used language for this branch (by
  // phone number), so a returning registrant sees the right language
  // pre-selected instead of defaulting back to English every visit.
  const handleLanguageHint = async (req: Request, res: Response) => {
    try {
      const phone = String(req.query.phone || "").replace(/[^0-9+]/g, "");
      if (!phone || phone.replace(/\D/g, "").length < 10) return res.json({ language: null });
      const [row] = await db
        .select({ preferredLanguage: eventRegistrations.preferredLanguage })
        .from(eventRegistrations)
        .innerJoin(events, eq(eventRegistrations.eventId, events.id))
        .where(and(eq(events.branchId, String(req.params.branchId)), eq(eventRegistrations.customerPhone, phone)))
        .orderBy(desc(eventRegistrations.createdAt))
        .limit(1);
      res.json({ language: row?.preferredLanguage || null });
    } catch (e) {
      console.error("[events] language hint lookup failed:", e);
      res.json({ language: null });
    }
  };
  app.get("/api/event/:branchId/:eventId/language-hint", publicRoute("public event language hint"), handleLanguageHint);
  app.get("/api/event/:branchId/language-hint", publicRoute("public event language hint (legacy)"), handleLanguageHint);

  // ── Phone verification for online registration ──────────────────────────────
  // Customers must prove their WhatsApp number is active before they can
  // complete registration. Two public endpoints: one to send the OTP, one to
  // verify it and receive a short-lived token that handleEventRegister checks.

  const handleSendPhoneOtp = async (req: Request, res: Response, eventId: string) => {
    try {
      const ev = await loadEventById(eventId, { publishedOnly: true });
      if (!ev) return res.status(404).json({ error: "No active event" });
      const rawPhone = String(req.body?.phone || "");
      const phone = normalizeIndianPhone(rawPhone);
      if (!phone || phone.replace(/\D/g, "").length < 10) {
        return res.status(400).json({ error: "A valid WhatsApp number is required" });
      }
      // Rate-limit: one send per phone per event per 60 seconds
      const [recent] = await db.select()
        .from(eventPhoneVerifications)
        .where(and(
          eq(eventPhoneVerifications.eventId, eventId),
          eq(eventPhoneVerifications.phone, phone),
          gte(eventPhoneVerifications.createdAt, new Date(Date.now() - 60_000))
        ))
        .orderBy(desc(eventPhoneVerifications.createdAt))
        .limit(1);
      if (recent) {
        return res.status(429).json({ error: "Please wait 60 seconds before requesting another code" });
      }
      const code = generateOtpCode();
      await db.insert(eventPhoneVerifications).values({
        eventId,
        phone,
        code,
        expiresAt: new Date(Date.now() + 10 * 60_000), // 10 min
      });
      await sendWhatsAppOTP(phone, code, "registration verification");
      return res.json({ sent: true });
    } catch (e) {
      console.error("[events] send-phone-otp error:", e);
      return res.status(500).json({ error: "Failed to send verification code. Please try again." });
    }
  };

  app.post("/api/event/:branchId/:eventId/send-phone-otp", publicRoute("WhatsApp phone OTP for registration"), async (req: Request, res: Response) => {
    return handleSendPhoneOtp(req, res, req.params.eventId);
  });
  app.post("/api/event/:branchId/send-phone-otp", publicRoute("WhatsApp phone OTP for registration (legacy)"), async (req: Request, res: Response) => {
    // Legacy branch-scoped: resolve the live event to get its id
    try {
      const ev = await (async () => {
        const [row] = await db.select().from(events)
          .where(and(eq(events.branchId, req.params.branchId), ne(events.status, "draft")))
          .orderBy(desc(events.createdAt)).limit(1);
        return row || null;
      })();
      if (!ev) return res.status(404).json({ error: "No active event" });
      return handleSendPhoneOtp(req, res, ev.id);
    } catch (e) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  const handleVerifyPhoneOtp = async (req: Request, res: Response, eventId: string) => {
    try {
      const ev = await loadEventById(eventId, { publishedOnly: true });
      if (!ev) return res.status(404).json({ error: "No active event" });
      const rawPhone = String(req.body?.phone || "");
      const code = String(req.body?.otp || "").trim();
      const phone = normalizeIndianPhone(rawPhone);
      if (!phone || !code) {
        return res.status(400).json({ error: "Phone and OTP code are required" });
      }
      // Most-recent unexpired, unverified OTP for this event+phone
      const [otpRow] = await db.select()
        .from(eventPhoneVerifications)
        .where(and(
          eq(eventPhoneVerifications.eventId, eventId),
          eq(eventPhoneVerifications.phone, phone),
          isNull(eventPhoneVerifications.verifiedAt),
          gte(eventPhoneVerifications.expiresAt, new Date())
        ))
        .orderBy(desc(eventPhoneVerifications.createdAt))
        .limit(1);
      if (!otpRow) {
        return res.status(400).json({ error: "OTP expired or not found. Please request a new code." });
      }
      if (otpRow.attempts >= 5) {
        return res.status(429).json({ error: "Too many incorrect attempts. Please request a new code." });
      }
      if (code !== otpRow.code) {
        await db.update(eventPhoneVerifications)
          .set({ attempts: otpRow.attempts + 1 })
          .where(eq(eventPhoneVerifications.id, otpRow.id));
        return res.status(400).json({ error: "Incorrect code. Please try again." });
      }
      // Issue a 32-byte hex verification token valid for 30 minutes
      const verificationToken = crypto.randomBytes(32).toString("hex");
      await db.update(eventPhoneVerifications)
        .set({ verifiedAt: new Date(), verificationToken })
        .where(eq(eventPhoneVerifications.id, otpRow.id));
      return res.json({ verified: true, verificationToken });
    } catch (e) {
      console.error("[events] verify-phone-otp error:", e);
      return res.status(500).json({ error: "Verification failed. Please try again." });
    }
  };

  app.post("/api/event/:branchId/:eventId/verify-phone-otp", publicRoute("WhatsApp phone OTP verify for registration"), async (req: Request, res: Response) => {
    return handleVerifyPhoneOtp(req, res, req.params.eventId);
  });
  app.post("/api/event/:branchId/verify-phone-otp", publicRoute("WhatsApp phone OTP verify for registration (legacy)"), async (req: Request, res: Response) => {
    try {
      const ev = await (async () => {
        const [row] = await db.select().from(events)
          .where(and(eq(events.branchId, req.params.branchId), ne(events.status, "draft")))
          .orderBy(desc(events.createdAt)).limit(1);
        return row || null;
      })();
      if (!ev) return res.status(404).json({ error: "No active event" });
      return handleVerifyPhoneOtp(req, res, ev.id);
    } catch (e) {
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Shared handler for both the legacy branch-scoped register route and the
  // canonical per-event route — `resolveEvent` is the only thing that
  // differs between them.
  const handleEventRegister = (resolveEvent: (req: Request) => Promise<Event | null>) => async (req: Request, res: Response) => {
    try {
      const ev = await resolveEvent(req);
      if (!ev) return res.status(404).json({ error: "No active event for this branch" });
      if (ev.status === "paused") {
        return res.status(403).json({ error: "Registrations are temporarily paused for this event. Please check back soon.", paused: true });
      }
      const { customerName, customerPhone, customerEmail, productCategory, productCategories, specialCategories, preferredLanguage, familyMembersCount, priorityAccess, slotDate, slotTime, locationId, formData } = req.body || {};
      const name = String(customerName || "").trim();
      // Normalize to full international digits (country code + number) —
      // the public web registration form only collects a bare 10-digit
      // number, but WhatsApp Cloud API silently "succeeds" (returns a
      // message id) and then never delivers to a number missing its
      // country code. See normalizeIndianPhone for details.
      const phone = normalizeIndianPhone(customerPhone);
      const language = isSupportedLanguage(preferredLanguage) ? String(preferredLanguage).toLowerCase() : "en";
      const maxGuests = Math.max(1, ev.maxGuestsPerRegistration || 10);
      const fam = Math.max(0, Math.min(maxGuests - 1, parseInt(String(familyMembersCount ?? 0), 10) || 0));
      const normalizedProductCategories = normalizeCategorySelections(productCategories, productCategory, allowedProductCategories);
      const normalizedSpecialCategories = normalizeOptionalCategorySelections(specialCategories, allowedSpecialCategories);
      const needsPriorityAccess = normalizedSpecialCategories?.length
        ? true
        : priorityAccess === true;
      const normalizedProductCategory = normalizedProductCategories?.[0] || "";
      if (!name || name.length < 2) return res.status(400).json({ error: "Name is required" });
      if (!phone || phone.replace(/\D/g, "").length < 10) return res.status(400).json({ error: "A valid WhatsApp number is required" });
      if (!normalizedProductCategories) {
        return res.status(400).json({ error: "Select at least one valid product category" });
      }
      if (!normalizedSpecialCategories) {
        return res.status(400).json({ error: "One or more special categories are invalid" });
      }
      if (parseInt(String(familyMembersCount ?? 0), 10) > maxGuests - 1) {
        return res.status(400).json({ error: `This event allows a maximum of ${maxGuests} guests per registration` });
      }

      // ── WhatsApp phone verification gate ────────────────────────────────────
      // Customers must verify their WhatsApp number before completing online
      // registration. The verification token is issued by /verify-phone-otp and
      // is valid for 30 minutes from the moment they completed the OTP check.
      const verificationToken = String(req.body?.verificationToken || "").trim();
      if (!verificationToken) {
        return res.status(400).json({
          error: "WhatsApp verification required. Please verify your number before registering.",
          requiresVerification: true,
        });
      }
      const verificationCutoff = new Date(Date.now() - 30 * 60_000);
      const [phoneVerif] = await db.select()
        .from(eventPhoneVerifications)
        .where(and(
          eq(eventPhoneVerifications.eventId, ev.id),
          eq(eventPhoneVerifications.phone, phone),
          eq(eventPhoneVerifications.verificationToken, verificationToken),
          gte(eventPhoneVerifications.verifiedAt, verificationCutoff)
        ))
        .limit(1);
      if (!phoneVerif) {
        return res.status(400).json({
          error: "WhatsApp verification expired or invalid. Please verify your number again.",
          requiresVerification: true,
        });
      }

      // Resolve the chosen Location (service). When the event has locations the
      // customer must pick one; slots, capacity, fee and custom fields all come
      // from it. Legacy events without locations fall back to event-level.
      const allLocationRows = await loadEventLocations(ev.branchId);
      // Restrict registration to locations linked to THIS event (or unlinked,
      // for back-compat). Prevents a crafted locationId from registering
      // against a location that belongs to a different event on the branch.
      const eventLinked = allLocationRows.filter((s) => (s as any)?.serviceSettings?.event?.eventId === ev.id);
      const locationRows = eventLinked.length > 0
        ? eventLinked
        : allLocationRows.filter((s) => !((s as any)?.serviceSettings?.event?.eventId));
      let location: any = null;
      if (locationRows.length > 0) {
        const lid = String(locationId || "");
        location = locationRows.find((s) => s.id === lid) || null;
        if (!location) return res.status(400).json({ error: "Please choose a location" });
      } else if (locationId) {
        // A location id was passed but the branch has none active.
        return res.status(400).json({ error: "Invalid location" });
      }
      const cfg = resolveLocationConfig(ev, location);
      const chosenLocationId: string | null = location ? location.id : null;

      const dates = buildEventDates(ev);
      const times = buildSlotTimesFrom(cfg.operatingHoursStart, cfg.operatingHoursEnd, cfg.slotDurationMinutes);
      if (!dates.includes(slotDate) || !times.includes(slotTime)) {
        return res.status(400).json({ error: "Invalid slot selection" });
      }
      const [branch] = await db.select({ timezone: branches.timezone })
        .from(branches)
        .where(eq(branches.id, ev.branchId))
        .limit(1);
      const bookableDates = buildBookableEventDates(
        ev,
        cfg,
        await slotUsage(ev.id, chosenLocationId),
        branch?.timezone || "Asia/Kolkata",
      );
      const priorityDateError = validateEventPriorityAccessDate(bookableDates, slotDate, needsPriorityAccess);
      if (priorityDateError) return res.status(400).json({ error: priorityDateError });

      // Validate the location's custom input fields (required + basic typing)
      // and collect a clean formData object keyed by field id.
      const cleanForm: Record<string, unknown> = {};
      const fields = Array.isArray(location?.inputFields) ? location.inputFields : [];
      const raw = (formData && typeof formData === "object" && !Array.isArray(formData)) ? formData as Record<string, unknown> : {};
      for (const f of fields) {
        const fid = String((f as any).id || (f as any).label || "");
        if (!fid) continue;
        // Checkbox-type fields are informational toggles, not gating
        // requirements — their checked state should never block registration,
        // mirroring the client-side validation in event-landing.html.
        if ((f as any).type === "checkbox") {
          if (raw[fid]) cleanForm[fid] = raw[fid];
          continue;
        }
        let val = raw[fid];
        if (typeof val === "string") val = val.trim();
        const empty = val === undefined || val === null || val === "";
        if ((f as any).required && empty) {
          return res.status(400).json({ error: `"${(f as any).label || fid}" is required` });
        }
        if (!empty) cleanForm[fid] = val;
      }

      // Paid events fail closed unless their organizer has a valid linked
      // account. Test mode may proceed before the provider reports the
      // account fully active, but the transfer remains mandatory.
      const fee = cfg.registrationFee || 0;
      const paymentMethod = await getEventPaymentMethod();
      let payoutProfile: typeof organizerPayoutProfiles.$inferSelect | undefined;
      if (fee > 0 && paymentMethod === "razorpay_direct" && !directCredentialStatus().configured) {
        return res.status(503).json({ error: "Paid registration requires configured Direct Razorpay credentials" });
      }
      if (fee > 0 && paymentMethod === "razorpay_payment_links" && !directCredentialStatus().configured) {
        return res.status(503).json({ error: "Paid registration requires configured Direct Razorpay credentials" });
      }
      if (fee > 0 && paymentMethod === "razorpay_route") {
        [payoutProfile] = await db.select().from(organizerPayoutProfiles)
          .where(eq(organizerPayoutProfiles.organizationId, ev.organizationId)).limit(1);
        const linkedAccountReady = !!payoutProfile &&
          isValidRazorpayProviderId(payoutProfile.razorpayAccountId, "acc_") &&
          (isRouteProfileActive(payoutProfile) || isRazorpayTestMode());
        if (!linkedAccountReady) {
          return res.status(503).json({ error: "Paid registration requires a valid Razorpay linked account" });
        }
      }

      // Capacity check + insert inside one transaction, serialized per event
      // via a row lock on the event, so two concurrent registrations can't
      // both pass the check and oversell the slot. Capacity is per-location.
      const guests = 1 + fam;
      const result = await db.transaction(async (tx) => {
        await tx.execute(dsql`SELECT id FROM events WHERE id = ${ev.id} FOR UPDATE`);
        const usageConds = [
          eq(eventRegistrations.eventId, ev.id),
          eq(eventRegistrations.slotDate, slotDate),
          eq(eventRegistrations.slotTime, slotTime),
          chosenLocationId === null ? isNull(eventRegistrations.locationId) : eq(eventRegistrations.locationId, chosenLocationId),
          CAPACITY_STATUSES_SQL,
        ];
        const [row] = await tx
          .select({ used: dsql<number>`COALESCE(SUM(1 + ${eventRegistrations.familyMembersCount}), 0)` })
          .from(eventRegistrations)
          .where(and(...usageConds));
        const used = Number(row?.used) || 0;
        const slotCap = cfg.slotCapacityOverrides[`${slotDate}|${slotTime}`] ?? cfg.maxCapacityPerSlot;
        if (used + guests > slotCap) {
          return { full: true as const, available: Math.max(0, slotCap - used) };
        }
        const [inserted] = await tx.insert(eventRegistrations).values({
          eventId: ev.id,
          locationId: chosenLocationId,
          formData: cleanForm,
          registrationSource: "customer",
          customerName: name,
          customerPhone: phone,
          customerEmail: customerEmail ? String(customerEmail).trim() : null,
          productCategory: normalizedProductCategory,
          productCategories: normalizedProductCategories,
          preferredLanguage: language,
          familyMembersCount: fam,
          priorityAccess: needsPriorityAccess,
          specialCategories: normalizedSpecialCategories,
          slotDate,
          slotTime,
          status: "registration_started",
          amountPaid: 0,
        }).returning();
        let allocation: typeof routePayoutAllocations.$inferSelect | undefined;
        let checkout: typeof eventPaymentCheckouts.$inferSelect | undefined;
        if (fee > 0 && paymentMethod === "razorpay_route" && payoutProfile) {
          [allocation] = await tx.insert(routePayoutAllocations).values({
            registrationId: inserted.id, organizationId: ev.organizationId,
            payoutProfileId: payoutProfile.id, amount: fee, currency: "INR",
          }).returning();
        }
        if (fee > 0) {
          [checkout] = await tx.insert(eventPaymentCheckouts).values({
            registrationId: inserted.id,
            adapter: paymentMethod === "razorpay_direct"
              ? "direct"
              : paymentMethod === "razorpay_payment_links" ? "payment_links" : "route",
            razorpayOrderId: null, amount: fee, currency: "INR", status: "creating",
          }).onConflictDoNothing({ target: eventPaymentCheckouts.registrationId }).returning();
          if (!checkout) {
            [checkout] = await tx.select().from(eventPaymentCheckouts)
              .where(eq(eventPaymentCheckouts.registrationId, inserted.id)).limit(1);
          }
        }
        return { full: false as const, reg: inserted, allocation, checkout };
      });
      if (result.full) {
        return res.status(409).json({ error: "This slot is full. Please pick another slot.", available: result.available });
      }
      const reg = result.reg;
      await logStage(reg.id, "registration_started", { slotDate, slotTime, guests, locationId: chosenLocationId });

      if (fee <= 0) {
        // Free event — issue the ticket immediately.
        const done = await issueTicket(ev, { ...reg, amountPaid: 0 });
        return res.json({ registration: regShape(done), payment: null });
      }

      if (paymentMethod === "razorpay_direct") {
        try {
          if (result.checkout?.razorpayOrderId) {
            const keyId = process.env.RAZORPAY_DIRECT_KEY_ID;
            return res.json({ registration: regShape(reg), payment: { orderId: result.checkout.razorpayOrderId, amount: fee, currency: "INR", keyId } });
          }
          const order = await createDirectOrder({ registrationId: reg.id, eventId: ev.id, amount: fee });
          await db.update(eventPaymentCheckouts).set({
            razorpayOrderId: order.id, status: "initiated", updatedAt: new Date(),
          }).where(and(eq(eventPaymentCheckouts.registrationId, reg.id), isNull(eventPaymentCheckouts.razorpayOrderId)));
          return res.json({
            registration: regShape(reg),
            payment: { orderId: order.id, amount: fee, currency: "INR", keyId: order.keyId },
          });
        } catch (e) {
          console.error("[events] Razorpay direct order request failed:", e);
          return res.status(504).json({ error: "Payment gateway timed out. Please try again in a moment." });
        }
      }

      if (paymentMethod === "razorpay_payment_links") {
        try {
          if (result.checkout?.razorpayPaymentLinkId && result.checkout.razorpayShortUrl) {
            return res.json({
              registration: regShape(reg),
              payment: {
                paymentLinkId: result.checkout.razorpayPaymentLinkId,
                shortUrl: result.checkout.razorpayShortUrl,
                paymentLinkUrl: result.checkout.razorpayShortUrl,
                amount: fee,
                currency: "INR",
              },
            });
          }
          const link = await createPaymentLink({
            registrationId: reg.id,
            eventId: ev.id,
            amount: fee,
            customerName: reg.customerName,
            customerPhone: reg.customerPhone,
            customerEmail: reg.customerEmail,
            callbackUrl: `${getPublicBaseUrl().replace(/^http:\/\//i, "https://")}/api/event/payment-link-callback?registrationId=${encodeURIComponent(reg.id)}`,
          });
          // The registration checkout intent exists before the provider call.
          // Bind every provider identifier before exposing the hosted URL.
          await db.update(eventPaymentCheckouts).set({
            paymentLinkReferenceId: link.referenceId,
            razorpayPaymentLinkId: link.id,
            razorpayShortUrl: link.short_url,
            status: "initiated",
            updatedAt: new Date(),
          }).where(and(eq(eventPaymentCheckouts.registrationId, reg.id), isNull(eventPaymentCheckouts.razorpayPaymentLinkId)));
          return res.json({
            registration: regShape(reg),
            payment: {
              paymentLinkId: link.id,
              shortUrl: link.short_url,
              paymentLinkUrl: link.short_url,
              amount: fee,
              currency: "INR",
            },
          });
        } catch (e) {
          console.error("[events] Razorpay Payment Link request failed:", e);
          return res.status(504).json({ error: "Payment gateway timed out. Please try again in a moment." });
        }
      }

      const keyId = process.env.RAZORPAY_KEY_ID;
      if (!keyId) {
        return res.status(500).json({ error: "Payments are not configured for this event" });
      }
      // A bare `fetch` here has no timeout — Node's default is effectively
      // unbounded. If this specific call happens to be the first outbound
      // HTTPS request in a while (fresh TLS handshake to Razorpay) and it
      // runs long, the client (or an intermediate proxy) can give up and
      // show a network error to the customer well before this resolves —
      // but the registration row is already committed, so the customer sees
      // "nothing happened" and resubmits, leaving an orphaned
      // "registration_started" row behind and, if the first order is paid
      // later via the abandoned checkout, a live risk of a duplicate charge.
      // Failing fast with a clear log line makes that failure mode visible
      // and distinguishable from a genuine Razorpay-side rejection.
      const orderStart = Date.now();
      try {
        if (!result.allocation || !payoutProfile) {
          return res.status(503).json({ error: "Paid registration requires a valid Razorpay linked account" });
        }
        if (result.checkout?.razorpayOrderId) {
          return res.json({ registration: regShape(reg), payment: { orderId: result.checkout.razorpayOrderId, amount: fee, currency: "INR", keyId } });
        }
        const order = await createRouteOrder({
          allocationId: result.allocation.id, registrationId: reg.id, eventId: ev.id,
          accountId: payoutProfile.razorpayAccountId, amount: fee,
        });
        await db.update(routePayoutAllocations).set({
          razorpayOrderId: order.id, razorpayTransferId: order.transfers?.[0]?.id || null,
          status: "order_created", updatedAt: new Date(),
        }).where(and(eq(routePayoutAllocations.id, result.allocation.id), eq(routePayoutAllocations.status, "pending_order")));
        await db.update(eventPaymentCheckouts).set({
          razorpayOrderId: order.id, status: "initiated", updatedAt: new Date(),
        }).where(and(eq(eventPaymentCheckouts.registrationId, reg.id), isNull(eventPaymentCheckouts.razorpayOrderId)));
        return res.json({
          registration: regShape(reg),
          payment: { orderId: order.id, amount: fee, currency: "INR", keyId },
        });
      } catch (e) {
        console.error(`[events] Razorpay order request failed after ${Date.now() - orderStart}ms (registrationId=${reg.id}):`, e);
        return res.status(504).json({ error: "Payment gateway timed out. Please try again in a moment." });
      }
    } catch (e) {
      console.error("[events] register failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  // Canonical per-event registration route.
  app.post("/api/event/:branchId/:eventId/register", publicRoute("customer event registration (per event)"), handleEventRegister(async (req) => {
    const ev = await loadEventById(String(req.params.eventId), { publishedOnly: true });
    return (ev && ev.branchId === String(req.params.branchId)) ? ev : null;
  }));

  // Legacy branch-scoped registration route (pre-dates per-event linking).
  app.post("/api/event/:branchId/register", publicRoute("customer event registration (legacy branch-scoped)"), handleEventRegister(async (req) => {
    return loadEventForBranch(String(req.params.branchId), { publishedOnly: true });
  }));

  // ── Manual (counter/desk) registration — admin + billing only ────────────
  // Staff take payment outside the app (cash, card machine, UPI QR at the
  // desk, etc.) and simply confirm "payment made" before the register button
  // unlocks. No Razorpay order is created; the registration is inserted
  // already paid so it flows into every existing revenue/status aggregation
  // exactly like a normal paid registration, then the ticket is issued and
  // (optionally) sent over WhatsApp immediately.
  app.post("/api/dashboard/events/registrations/manual", requireEventsManageOrBilling(), async (req: Request, res: Response) => {
    try {
      const {
        eventId, locationId, slotDate, slotTime, customerName, customerPhone,
        customerEmail, productCategory, productCategories, specialCategories, preferredLanguage, familyMembersCount, priorityAccess, formData,
        paymentMade, amountCollected, paymentMode, paymentReason,
        ticketMethod, preprintedTicketCode,
      } = req.body || {};
      const ev = await assertEventOwnership(req, res, String(eventId || ""));
      if (!ev) return;
      if (ev.status === "ended") {
        return res.status(409).json({ error: "This event has ended. New registrations are no longer accepted." });
      }
      if (ev.status === "paused") {
        return res.status(403).json({ error: "Registrations are temporarily paused for this event. Please resume the event before adding customers.", paused: true });
      }

      const name = String(customerName || "").trim();
      const phone = normalizeIndianPhone(customerPhone);
      const language = isSupportedLanguage(preferredLanguage) ? String(preferredLanguage).toLowerCase() : "en";
      const maxGuests = Math.max(1, ev.maxGuestsPerRegistration || 10);
      const fam = Math.max(0, Math.min(maxGuests - 1, parseInt(String(familyMembersCount ?? 0), 10) || 0));
      const normalizedProductCategories = normalizeCategorySelections(productCategories, productCategory, allowedProductCategories);
      const normalizedSpecialCategories = normalizeOptionalCategorySelections(specialCategories, allowedSpecialCategories);
      const needsPriorityAccess = specialCategories === undefined
        ? priorityAccess === true
        : Boolean(normalizedSpecialCategories?.length);
      const normalizedProductCategory = normalizedProductCategories?.[0] || "";
      if (!name || name.length < 2) return res.status(400).json({ error: "Name is required" });
      if (!phone || phone.replace(/\D/g, "").length < 10) return res.status(400).json({ error: "A valid WhatsApp number is required" });
      if (!normalizedProductCategories) {
        return res.status(400).json({ error: "Select at least one valid product category" });
      }
      if (!normalizedSpecialCategories) {
        return res.status(400).json({ error: "One or more special categories are invalid" });
      }

      const allLocationRows = await loadEventLocations(ev.branchId);
      const eventLinked = allLocationRows.filter((s) => (s as any)?.serviceSettings?.event?.eventId === ev.id);
      const locationRows = eventLinked.length > 0
        ? eventLinked
        : allLocationRows.filter((s) => !((s as any)?.serviceSettings?.event?.eventId));
      let location: any = null;
      if (locationRows.length > 0) {
        const lid = String(locationId || "");
        location = locationRows.find((s) => s.id === lid) || null;
        if (!location) return res.status(400).json({ error: "Please choose a location" });
      }
      const cfg = resolveLocationConfig(ev, location);
      const chosenLocationId: string | null = location ? location.id : null;

      const dates = buildEventDates(ev);
      const times = buildSlotTimesFrom(cfg.operatingHoursStart, cfg.operatingHoursEnd, cfg.slotDurationMinutes);
      if (!dates.includes(slotDate) || !times.includes(slotTime)) {
        return res.status(400).json({ error: "Invalid slot selection" });
      }
      const [branch] = await db.select({ timezone: branches.timezone })
        .from(branches)
        .where(eq(branches.id, ev.branchId))
        .limit(1);
      const bookableDates = buildBookableEventDates(
        ev,
        cfg,
        await slotUsage(ev.id, chosenLocationId),
        branch?.timezone || "Asia/Kolkata",
      );
      const priorityDateError = validateEventPriorityAccessDate(bookableDates, slotDate, needsPriorityAccess);
      if (priorityDateError) return res.status(400).json({ error: priorityDateError });

      const cleanForm: Record<string, unknown> = {};
      const fields = Array.isArray(location?.inputFields) ? location.inputFields : [];
      const raw = (formData && typeof formData === "object" && !Array.isArray(formData)) ? formData as Record<string, unknown> : {};
      for (const f of fields) {
        const fid = String((f as any).id || (f as any).label || "");
        if (!fid) continue;
        if ((f as any).type === "checkbox") {
          if (raw[fid]) cleanForm[fid] = raw[fid];
          continue;
        }
        let val = raw[fid];
        if (typeof val === "string") val = val.trim();
        const empty = val === undefined || val === null || val === "";
        if ((f as any).required && empty) {
          return res.status(400).json({ error: `"${(f as any).label || fid}" is required` });
        }
        if (!empty) cleanForm[fid] = val;
      }

      const guests = 1 + fam;
      const fee = cfg.registrationFee || 0;
      const collected = Math.max(0, parseInt(String(amountCollected ?? fee), 10) || 0);
      // Keep the prior desk payload working while allowing the new explicit
      // payment treatments. Complimentary/unpaid registrations intentionally
      // have amountPaid=0 so they never inflate advance revenue.
      const resolvedPaymentMode = String(
        paymentMode || (paymentMade === true ? "offline_paid" : fee <= 0 ? "complimentary" : ""),
      );
      if (!["offline_paid", "complimentary", "unpaid"].includes(resolvedPaymentMode)) {
        return res.status(400).json({ error: "Choose how this registration is being paid" });
      }
      const reason = String(paymentReason || "").trim();
      if (resolvedPaymentMode !== "offline_paid" && !reason) {
        return res.status(400).json({ error: "A reason is required for complimentary or unpaid registration" });
      }
      if (resolvedPaymentMode === "offline_paid" && collected < fee) {
        return res.status(400).json({ error: "Amount collected is less than the amount due", amountDue: fee, amountCollected: collected });
      }
      const resolvedTicketMethod = String(ticketMethod || "generate");
      if (!["generate", "preprinted"].includes(resolvedTicketMethod)) {
        return res.status(400).json({ error: "Choose a ticket method" });
      }
      const scannedTicket = parseScanValue(String(preprintedTicketCode || ""));
      if (resolvedTicketMethod === "preprinted" && !scannedTicket) {
        return res.status(400).json({ error: "Scan or enter a pre-printed ticket ID" });
      }
      const ticketLookupBookingIds = getExactTicketIdCandidates(scannedTicket);
      const ticketLookupToken = scannedTicket.toLowerCase();
      const staffUserId = getRequestUserId(req);
      const result = await db.transaction(async (tx) => {
        await tx.execute(dsql`SELECT id FROM events WHERE id = ${ev.id} FOR UPDATE`);
        const usageConds = [
          eq(eventRegistrations.eventId, ev.id),
          eq(eventRegistrations.slotDate, slotDate),
          eq(eventRegistrations.slotTime, slotTime),
          chosenLocationId === null ? isNull(eventRegistrations.locationId) : eq(eventRegistrations.locationId, chosenLocationId),
          CAPACITY_STATUSES_SQL,
        ];
        const [row] = await tx
          .select({ used: dsql<number>`COALESCE(SUM(1 + ${eventRegistrations.familyMembersCount}), 0)` })
          .from(eventRegistrations)
          .where(and(...usageConds));
        const used = Number(row?.used) || 0;
        const slotCap = cfg.slotCapacityOverrides[`${slotDate}|${slotTime}`] ?? cfg.maxCapacityPerSlot;
        if (used + guests > slotCap) {
          return { full: true as const, available: Math.max(0, slotCap - used) };
        }
        let preprinted: typeof eventPreprintedTickets.$inferSelect | null = null;
        if (resolvedTicketMethod === "preprinted") {
          const rows = await tx.select()
            .from(eventPreprintedTickets)
            .where(and(
              eq(eventPreprintedTickets.eventId, ev.id),
              or(
                inArray(eventPreprintedTickets.bookingId, ticketLookupBookingIds),
                eq(eventPreprintedTickets.qrToken, ticketLookupToken),
              ),
            ))
            .limit(1);
          preprinted = rows[0] || null;
          if (!preprinted) {
            const err: any = new Error("This pre-printed ticket is not available for the selected event");
            err.statusCode = 404;
            throw err;
          }
          if (preprinted.status !== "available") {
            const err: any = new Error(
              preprinted.status === "assigned"
                ? "This pre-printed ticket has already been assigned"
                : "This pre-printed ticket has been voided",
            );
            err.statusCode = 409;
            throw err;
          }
          // Batches created before the shared registry was introduced are
          // registered here before this code is ever copied to a registration.
          await ensurePreprintedTicketIdReserved(tx, ev.id, preprinted.bookingId);
        }
        // Persist a payments row so manual/offline collections show up in
        // the same org-scoped ledger as Razorpay captures (matches the
        // convention used by /api/event/verify-payment above).
        let paymentRowId: string | null = null;
        if (resolvedPaymentMode === "offline_paid" && collected > 0) try {
          const [p] = await tx.insert(payments).values({
            organizationId: ev.organizationId,
            amount: collected,
            currency: "INR",
            status: "captured",
            paymentMethod: "manual",
            description: `Manual event registration — ${ev.name}`,
            paidAt: new Date(),
          }).returning();
          paymentRowId = p?.id || null;
        } catch (e) {
          // paymentId is a foreign key and paid registrations must be auditable;
          // never issue a paid ticket if its ledger row could not be created.
          console.error("[events] manual payment row insert failed:", e);
          throw e;
        }
        const [inserted] = await tx.insert(eventRegistrations).values({
          eventId: ev.id,
          locationId: chosenLocationId,
          formData: cleanForm,
          registrationSource: "store",
          customerName: name,
          customerPhone: phone,
          customerEmail: customerEmail ? String(customerEmail).trim() : null,
          productCategory: normalizedProductCategory,
          productCategories: normalizedProductCategories,
          preferredLanguage: language,
          familyMembersCount: fam,
          priorityAccess: needsPriorityAccess,
          specialCategories: normalizedSpecialCategories,
          slotDate,
          slotTime,
          status: "payment_completed",
          amountPaid: resolvedPaymentMode === "offline_paid" ? collected : 0,
          paymentId: paymentRowId,
          ...(preprinted ? { bookingId: preprinted.bookingId, qrToken: preprinted.qrToken } : {}),
        }).returning();
        if (preprinted) {
          // staffUserId may be "owner:<orgId>" (42 chars) which overflows
          // the assigned_by_user_id varchar(36) column — treat as null.
          const safeStaffId = staffUserId && !staffUserId.startsWith("owner:") ? staffUserId : null;
          const [claimed] = await tx.update(eventPreprintedTickets)
            .set({
              status: "assigned",
              assignedRegistrationId: inserted.id,
              assignedByUserId: safeStaffId,
              assignedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(and(
              eq(eventPreprintedTickets.id, preprinted.id),
              eq(eventPreprintedTickets.status, "available"),
            ))
            .returning({ id: eventPreprintedTickets.id });
          if (!claimed) {
            const err: any = new Error("This pre-printed ticket was assigned by another staff member");
            err.statusCode = 409;
            throw err;
          }
        }
        return { full: false as const, reg: inserted, preprinted };
      });
      if (result.full) {
        return res.status(409).json({ error: "This slot is full. Please pick another slot.", available: result.available });
      }
      const reg = result.reg;
      await logStage(reg.id, "registration_started", {
        slotDate, slotTime, guests, locationId: chosenLocationId, manual: true, by: staffUserId,
        ticketMethod: resolvedTicketMethod,
      });
      await logStage(reg.id, "payment_completed", {
        amountPaid: resolvedPaymentMode === "offline_paid" ? collected : 0,
        amountDue: fee,
        manual: true,
        paymentMode: resolvedPaymentMode,
        ...(reason ? { reason } : {}),
        by: staffUserId,
      });
      if (result.preprinted) {
        await logStage(reg.id, "preprinted_ticket_assigned", {
          ticketId: result.preprinted.bookingId,
          batchCode: result.preprinted.batchCode,
          by: staffUserId,
        });
      }

      // issueTicket generates the ticket AND sends it over WhatsApp to
      // reg.customerPhone (the number entered on this form) by default —
      // the dashboard also exposes an explicit "Send via WhatsApp" action
      // (resend-ticket) for staff to re-trigger it on demand.
      const done = await issueTicket(ev, reg);
      if (done.customerEmail && done.bookingId && done.qrToken) {
        void sendEventTicketEmail({
          to: done.customerEmail,
          customerName: done.customerName,
          eventName: ev.name,
          bookingId: done.bookingId,
          qrToken: done.qrToken,
          slotDate: done.slotDate,
          slotTime: done.slotTime,
          locationName: location?.name || null,
          guestCount: 1 + done.familyMembersCount,
        }).then((sent) => {
          if (!sent) console.warn(`[events] ticket email was not sent for registration ${done.id}`);
        });
      }
      res.json({ registration: regShape(done), eventName: ev.name });
    } catch (e) {
      console.error("[events] manual registration failed:", e);
      const statusCode = Number((e as any)?.statusCode);
      if (statusCode >= 400 && statusCode < 500) {
        return res.status(statusCode).json({ error: (e as Error).message });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Pre-printed ticket batches — organizer only ──────────────────────────
  // Unassigned tickets live in their own inventory table. They become public
  // boarding-pass links only after the staff registration transaction assigns
  // their token to a real registration.
  app.post("/api/dashboard/events/:eventId/preprinted-batches", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    try {
      const ev = await assertEventOwnership(req, res, String(req.params.eventId));
      if (!ev) return;
      if (ev.status === "ended") return res.status(409).json({ error: "Cannot create tickets for an ended event" });
      const count = Math.max(1, Math.min(100000, parseInt(String(req.body?.count || 0), 10) || 0));
      if (!Number.isFinite(count) || count < 1) return res.status(400).json({ error: "Choose between 1 and 100,000 tickets" });

      // getRequestUserId returns "owner:<orgId>" (42 chars) for org owners, which
      // overflows the created_by_user_id varchar(36) column. Treat those as null.
      const rawUserId = getRequestUserId(req);
      const createdByUserId = rawUserId && !rawUserId.startsWith("owner:") ? rawUserId : null;
      const ticketPrefix = normalizePreprintedTicketPrefix(ev.preprintedTicketPrefix);

      let batchCode = "";
      let totalCreated = 0;
      // Chunk size: keeps each INSERT well under Postgres's 65535-param limit.
      // eventTicketIdentifiers: 3 cols × 1000 = 3000 params per chunk.
      // eventPreprintedTickets:  6 cols × 1000 = 6000 params per chunk.
      const CHUNK = 1000;

      for (let attempt = 0; attempt < 5 && !totalCreated; attempt++) {
        batchCode = makePreprintedBatchCode();
        const stock = Array.from({ length: count }, (_, index) => ({
          eventId: ev.id,
          batchCode,
          bookingId: makePreprintedTicketId(ticketPrefix),
          qrToken: makeQrToken(),
          status: "available" as const,
          createdByUserId,
        }));
        try {
          await db.transaction(async (tx) => {
            // Reserve all ticket IDs in the shared namespace first.
            for (let i = 0; i < stock.length; i += CHUNK) {
              const chunk = stock.slice(i, i + CHUNK);
              const reservations = await tx.insert(eventTicketIdentifiers)
                .values(chunk.map((ticket) => ({
                  ticketId: ticket.bookingId,
                  eventId: ev.id,
                  ticketKind: "preprinted" as const,
                })))
                .onConflictDoNothing()
                .returning({ ticketId: eventTicketIdentifiers.ticketId });
              if (reservations.length !== chunk.length) {
                const collision: any = new Error("Ticket ID reservation collision");
                collision.retryableTicketIdCollision = true;
                throw collision;
              }
            }
            // Insert preprinted ticket inventory in chunks.
            for (let i = 0; i < stock.length; i += CHUNK) {
              await tx.insert(eventPreprintedTickets).values(stock.slice(i, i + CHUNK));
            }
          });
          totalCreated = stock.length;
        } catch (e: any) {
          if (!e?.retryableTicketIdCollision || attempt === 4) throw e;
        }
      }
      if (!totalCreated) throw new Error("Unable to create a unique ticket batch");
      res.status(201).json({
        batch: {
          code: batchCode,
          count: totalCreated,
        },
      });
    } catch (e: any) {
      console.error("[events] pre-printed batch create failed:", e);
      res.status(500).json({ error: "Unable to create the ticket batch. Please try again." });
    }
  });

  app.get("/api/dashboard/events/:eventId/preprinted-tickets", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    try {
      const ev = await assertEventOwnership(req, res, String(req.params.eventId));
      if (!ev) return;

      const page  = Math.max(1, parseInt(String(req.query.page  || "1"),  10) || 1);
      const limit = Math.min(200, Math.max(10, parseInt(String(req.query.limit || "50"), 10) || 50));
      const search      = normalizeTicketIdSearchInput(req.query.search);
      const statusFilter = String(req.query.status || "").trim().toLowerCase();
      const batchFilter  = String(req.query.batch  || "").trim().toUpperCase();

      // Build WHERE conditions for the ticket detail query
      const conditions: any[] = [eq(eventPreprintedTickets.eventId, ev.id)];
      if (search) {
        const bookingIdConditions = getPartialTicketIdPatterns(search)
          .map((pattern) => ilike(eventPreprintedTickets.bookingId, pattern));
        conditions.push(or(
          or(...bookingIdConditions),
          ilike(eventPreprintedTickets.batchCode, `%${search}%`),
        ));
      }
      if (statusFilter && ["available", "assigned", "voided"].includes(statusFilter)) {
        conditions.push(eq(eventPreprintedTickets.status, statusFilter));
      }
      if (batchFilter) {
        conditions.push(eq(eventPreprintedTickets.batchCode, batchFilter));
      }
      const whereClause = and(...conditions);

      // Batch summary via SQL aggregate (efficient even for 100k tickets)
      const batchSummary = await db.select({
        code:      eventPreprintedTickets.batchCode,
        count:     dsql<number>`count(*)::int`,
        available: dsql<number>`sum(case when ${eventPreprintedTickets.status} = 'available' then 1 else 0 end)::int`,
        assigned:  dsql<number>`sum(case when ${eventPreprintedTickets.status} = 'assigned'  then 1 else 0 end)::int`,
        voided:    dsql<number>`sum(case when ${eventPreprintedTickets.status} = 'voided'    then 1 else 0 end)::int`,
        createdAt: dsql<Date>`min(${eventPreprintedTickets.createdAt})`,
      })
        .from(eventPreprintedTickets)
        .where(eq(eventPreprintedTickets.eventId, ev.id))
        .groupBy(eventPreprintedTickets.batchCode)
        .orderBy(dsql`min(${eventPreprintedTickets.createdAt}) desc`);

      // Total count (for pagination display)
      const [countRow] = await db.select({ total: dsql<number>`count(*)::int` })
        .from(eventPreprintedTickets)
        .where(whereClause);
      const total = countRow?.total ?? 0;

      // Paginated ticket rows
      const rows = await db.select({
        id:                   eventPreprintedTickets.id,
        batchCode:            eventPreprintedTickets.batchCode,
        bookingId:            eventPreprintedTickets.bookingId,
        status:               eventPreprintedTickets.status,
        assignedRegistrationId: eventPreprintedTickets.assignedRegistrationId,
        printedAt:            eventPreprintedTickets.printedAt,
        assignedAt:           eventPreprintedTickets.assignedAt,
        voidedAt:             eventPreprintedTickets.voidedAt,
        voidReason:           eventPreprintedTickets.voidReason,
        createdAt:            eventPreprintedTickets.createdAt,
      })
        .from(eventPreprintedTickets)
        .where(whereClause)
        .orderBy(eventPreprintedTickets.bookingId)
        .limit(limit)
        .offset((page - 1) * limit);

      res.json({
        batches: batchSummary,
        tickets: rows,
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit)),
      });
    } catch (e) {
      console.error("[events] pre-printed ticket list failed:", e);
      res.status(500).json({ error: "Unable to load pre-printed tickets" });
    }
  });

  // Resolve any scan value (PTK booking ID, qrToken, or full event-ticket URL)
  // to the canonical PTK booking ID. Used by the client assignment field to
  // convert scanned QR URLs from older batches into the human-readable ID.
  app.get("/api/dashboard/events/:eventId/preprinted-tickets/resolve", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    try {
      const ev = await assertEventOwnership(req, res, String(req.params.eventId));
      if (!ev) return;
      const raw = String(req.query.code || "").trim();
      if (!raw) return res.status(400).json({ error: "code is required" });
      const parsed = parseScanValue(raw);
      const bookingIdCandidates = getExactTicketIdCandidates(parsed);
      const [row] = await db.select({
        bookingId: eventPreprintedTickets.bookingId,
        status:    eventPreprintedTickets.status,
      })
        .from(eventPreprintedTickets)
        .where(and(
          eq(eventPreprintedTickets.eventId, ev.id),
          or(
            inArray(eventPreprintedTickets.bookingId, bookingIdCandidates),
            eq(eventPreprintedTickets.qrToken,   parsed.toLowerCase()),
          ),
        ))
        .limit(1);
      if (!row) return res.status(404).json({ error: "Ticket not found in this event's inventory" });
      res.json({ bookingId: row.bookingId, status: row.status });
    } catch (e) {
      console.error("[events] preprinted ticket resolve failed:", e);
      res.status(500).json({ error: "Unable to resolve ticket" });
    }
  });

  // CSV export of all pre-printed ticket inventory for an event.
  // Includes bookingId, qrToken, full QR URL, status, and timestamps so
  // the file can be used to generate QR codes in external tools.
  app.get("/api/dashboard/events/:eventId/preprinted-tickets/export.csv", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    try {
      const ev = await assertEventOwnership(req, res, String(req.params.eventId));
      if (!ev) return;
      const rows = await db.select({
        batchCode: eventPreprintedTickets.batchCode,
        bookingId:  eventPreprintedTickets.bookingId,
        qrToken:    eventPreprintedTickets.qrToken,
        status:     eventPreprintedTickets.status,
        printedAt:  eventPreprintedTickets.printedAt,
        assignedAt: eventPreprintedTickets.assignedAt,
        voidedAt:   eventPreprintedTickets.voidedAt,
        createdAt:  eventPreprintedTickets.createdAt,
      })
        .from(eventPreprintedTickets)
        .where(eq(eventPreprintedTickets.eventId, ev.id))
        .orderBy(eventPreprintedTickets.batchCode, eventPreprintedTickets.bookingId);

      const base = getPublicBaseUrl();
      const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const header = ["Batch Code", "Booking ID", "QR Code URL", "Status", "Printed At", "Assigned At", "Voided At", "Created At"].map(esc).join(",");
      const lines = rows.map((r) => [
        r.batchCode,
        r.bookingId,
        `${base}/event-ticket/${r.qrToken}`,
        r.status,
        r.printedAt  ? new Date(r.printedAt).toISOString()  : "",
        r.assignedAt ? new Date(r.assignedAt).toISOString() : "",
        r.voidedAt   ? new Date(r.voidedAt).toISOString()   : "",
        new Date(r.createdAt).toISOString(),
      ].map(esc).join(","));

      const safe = ev.name.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${safe}-tickets.csv"`);
      res.send([header, ...lines].join("\n"));
    } catch (e) {
      console.error("[events] preprinted ticket export failed:", e);
      res.status(500).json({ error: "Unable to export tickets" });
    }
  });

  // Same-origin, permission-gated print sheet. The QR itself points at the
  // normal public ticket URL, which returns no ticket data until a registration
  // has claimed the opaque token.
  app.get("/api/dashboard/events/:eventId/preprinted-batches/:batchCode/print", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    try {
      const ev = await assertEventOwnership(req, res, String(req.params.eventId));
      if (!ev) return;
      const batchCode = String(req.params.batchCode || "").trim();
      const inventoryRows = await db.select({
        ticket: eventPreprintedTickets,
        amountPaid: eventRegistrations.amountPaid,
      })
        .from(eventPreprintedTickets)
        .leftJoin(eventRegistrations, eq(eventRegistrations.id, eventPreprintedTickets.assignedRegistrationId))
        .where(and(eq(eventPreprintedTickets.eventId, ev.id), eq(eventPreprintedTickets.batchCode, batchCode)))
        .orderBy(eventPreprintedTickets.bookingId)
        .limit(200);
      const rows = inventoryRows.map(({ ticket, amountPaid }) => ({
        ...ticket,
        amountPaid: amountPaid ?? 0,
      }));
      if (!rows.length) return res.status(404).send("Ticket batch not found");
      const layout = normalizePreprintedBackLayout(ev.preprintedBackLayout);
      const renderedTickets = await mapWithConcurrency(rows, 8, async (ticket, index) => {
        // QR encodes the PTK booking ID directly so the staff desk scanner
        // receives the ID immediately — no URL parsing needed at the counter.
        const qr = await QRCode.toDataURL(ticket.bookingId, {
          width: 280, margin: 1, errorCorrectionLevel: "M",
          color: { dark: "#1a1a2e", light: "#ffffff" },
        });
        return { ticket, qr, serialNumber: String(index + 1).padStart(6, "0") };
      });
      const renderFrontCard = () => {
        if (ev.preprintedFrontImageUrl) {
          return `<article class="ticket-face artwork-face">
            <img class="artwork" src="${escapeHtml(ev.preprintedFrontImageUrl)}" alt="Front artwork for ${escapeHtml(ev.name)}">
          </article>`;
        }
        return `<article class="ticket-face fallback-face">
          <div class="brand">TIQKETS · PRE-PRINTED</div>
          <h2>${escapeHtml(ev.name)}</h2>
          <p class="hint">Assign this ticket to an attendee at the staff desk before entry.</p>
        </article>`;
      };
      const backCards = renderedTickets.map(({ ticket, qr, serialNumber }) => {
        if (ev.preprintedBackImageUrl) {
          const overlays = renderPreprintedBackOverlays(layout, {
            bookingId: ticket.bookingId,
            qrDataUrl: qr,
            serialNumber,
            amountPaid: ticket.amountPaid,
            eventName: ev.name,
          });
          return `<article class="ticket-face artwork-face back-artwork-face">
            <img class="artwork" src="${escapeHtml(ev.preprintedBackImageUrl)}" alt="Back artwork for ${escapeHtml(ev.name)}">
            ${overlays}
          </article>`;
        }
        return `<article class="ticket-face fallback-face back-fallback">
          <div class="brand">TICKET BACK · ${escapeHtml(ev.name)}</div>
          <img class="fallback-qr" src="${qr}" alt="Ticket QR code">
          <p class="code">${escapeHtml(ticket.bookingId)}</p>
          <p class="serial">S/N ${serialNumber}</p>
          <p class="hint">Assign this ticket to an attendee at the staff desk before entry.</p>
        </article>`;
      });
      const frontSheet = Array.from(
        { length: PREPRINTED_PRINT_TICKETS_PER_SHEET },
        () => `<div class="ticket-slot">${renderFrontCard()}</div>`,
      );
      const printSheets: string[] = [
        `<section class="sheet front-sheet"><h1 class="sheet-title">Front master — ${escapeHtml(ev.name)}</h1><main class="ticket-grid">${frontSheet.join("")}</main></section>`,
      ];
      for (let offset = 0; offset < rows.length; offset += PREPRINTED_PRINT_TICKETS_PER_SHEET) {
        const sheetNumber = Math.floor(offset / PREPRINTED_PRINT_TICKETS_PER_SHEET) + 1;
        const backSheet = backCards
          .slice(offset, offset + PREPRINTED_PRINT_TICKETS_PER_SHEET)
          .map((card) => `<div class="ticket-slot">${card}</div>`);
        printSheets.push(
          `<section class="sheet back-sheet"><h1 class="sheet-title">Back sheet ${sheetNumber} — ${escapeHtml(ev.name)}</h1><main class="ticket-grid">${backSheet.join("")}</main></section>`,
        );
      }
      await db.update(eventPreprintedTickets)
        .set({ printedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(eventPreprintedTickets.eventId, ev.id), eq(eventPreprintedTickets.batchCode, batchCode)));
      res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(ev.name)} tickets</title>
        <style>
           @page { size: A3 portrait; margin:${PREPRINTED_PRINT_MARGIN_Y_MM}mm ${PREPRINTED_PRINT_MARGIN_X_MM}mm; } * { box-sizing: border-box; } body { font-family: Arial,sans-serif; color:#1a1a2e; margin:0; }
           .print-controls { margin:0 0 10px; padding:10px 12px; border-radius:8px; background:#f5f3f7; color:#514755; font-size:12px; }
           .print { margin-right:8px; padding:8px 12px; border:0; border-radius:6px; background:#8c1867; color:white; font-weight:700; cursor:pointer; }
           .sheet { page-break-after:always; } .sheet:last-of-type { page-break-after:auto; } .sheet-title { color:#8c1867; font-size:12px; font-weight:800; margin:0 0 8px; }
           .ticket-grid { display:grid; grid-template-columns:repeat(${PREPRINTED_PRINT_COLUMNS},${PREPRINTED_PRINT_TICKET_HEIGHT_MM}mm); grid-template-rows:repeat(${PREPRINTED_PRINT_ROWS},${PREPRINTED_PRINT_TICKET_WIDTH_MM}mm); column-gap:${PREPRINTED_PRINT_GUTTER_MM}mm; row-gap:${PREPRINTED_PRINT_GUTTER_MM}mm; }
           .ticket-slot { position:relative; width:${PREPRINTED_PRINT_TICKET_HEIGHT_MM}mm; height:${PREPRINTED_PRINT_TICKET_WIDTH_MM}mm; }
           .ticket-face { position:absolute; left:50%; top:50%; width:${PREPRINTED_PRINT_TICKET_WIDTH_MM}mm; height:${PREPRINTED_PRINT_TICKET_HEIGHT_MM}mm; overflow:hidden; break-inside:avoid; container-type:inline-size; border-radius:${PREPRINTED_PRINT_CORNER_RADIUS_MM}mm; transform:translate(-50%,-50%) rotate(90deg); transform-origin:center; }
           .back-sheet .ticket-face::after { content:""; position:absolute; z-index:4; top:0; bottom:0; left:${PREPRINTED_PRINT_BACK_CUT_LINE_OFFSET_MM}mm; border-left:.3mm dashed rgba(26,26,46,.72); pointer-events:none; }
           .artwork-face { background:#fff; } .artwork { position:absolute; inset:0; width:100%; height:100%; object-fit:fill; display:block; }
           .fallback-face { border:2px solid #8c1867; padding:10px; text-align:center; }
           .brand { color:#8c1867; font-size:9px; font-weight:800; letter-spacing:.08em; } h2 { font-size:14px; margin:7px 0 4px; } .code { font-family:monospace; font-weight:800; font-size:14px; margin:0 0 5px; }
           .fallback-qr { width:42mm; height:42mm; display:block; margin:5px auto; } .hint { color:#555; font-size:9px; line-height:1.35; margin:5px 0 0; } .back-fallback .serial { font-family:monospace; font-weight:700; margin:3px 0; }
            .overlay { position:absolute; transform:translate(-50%,-50%); z-index:2; } .text-overlay { padding:.12em .3em; border-radius:.15em; font-family:monospace; line-height:1.1; white-space:normal; overflow-wrap:anywhere; }
            .overlay.has-background { background:rgba(255,255,255,.96); } .qr-overlay { height:auto; aspect-ratio:1; object-fit:contain; padding:.15%; }
           @media print { .print-controls { display:none; } .sheet-title { display:none; } }
         </style></head><body>
          <div class="print-controls"><button class="print" onclick="window.print()">Print front master and ticket backs</button>
            One static front master is followed by ${Math.ceil(rows.length / PREPRINTED_PRINT_TICKETS_PER_SHEET)} ticket-specific back page(s), six tickets per A3 sheet.
         </div>
          ${printSheets.join("")}
         </body></html>`);
    } catch (e) {
      console.error("[events] pre-printed ticket print failed:", e);
      res.status(500).send("Unable to prepare ticket sheet");
    }
  });

  app.post("/api/dashboard/events/:eventId/preprinted-tickets/:ticketId/void", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    try {
      const ev = await assertEventOwnership(req, res, String(req.params.eventId));
      if (!ev) return;
      const ticketId = String(req.params.ticketId || "");
      const reason = String(req.body?.reason || "").trim();
      const rawVoidUserId = getRequestUserId(req);
      const safeVoidUserId = rawVoidUserId && !rawVoidUserId.startsWith("owner:") ? rawVoidUserId : null;
      const [updated] = await db.update(eventPreprintedTickets)
        .set({
          status: "voided",
          voidedAt: new Date(),
          voidedByUserId: safeVoidUserId,
          voidReason: reason || null,
          updatedAt: new Date(),
        })
        .where(and(
          eq(eventPreprintedTickets.id, ticketId),
          eq(eventPreprintedTickets.eventId, ev.id),
          eq(eventPreprintedTickets.status, "available"),
        ))
        .returning();
      if (!updated) return res.status(409).json({ error: "Only available, unassigned tickets can be voided" });
      res.json({ ticket: { id: updated.id, bookingId: updated.bookingId, status: updated.status } });
    } catch (e) {
      console.error("[events] pre-printed ticket void failed:", e);
      res.status(500).json({ error: "Unable to void this ticket" });
    }
  });

  // Razorpay redirects here after hosted Payment Link checkout. This is only
  // a customer-experience redirect. It never trusts Razorpay's callback query
  // parameters as proof of payment: recovery fetches and validates the
  // persisted Payment Link and captured payment directly from Razorpay.
  async function handlePaymentLinkCallback(req: Request, res: Response) {
    const registrationId = String(req.query.registrationId || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(registrationId)) {
      return res.status(404).send("Registration not found");
    }
    // Strip provider-supplied payment fields and signatures from the address
    // bar before rendering or retrying the callback. Use the canonical base
    // URL so callbacks received on a secondary deployment domain move to the
    // preferred custom domain.
    const canonicalCallbackUrl = `${getPublicBaseUrl()}/api/event/payment-link-callback?registrationId=${encodeURIComponent(registrationId)}`;
    let canonicalHost = "";
    try {
      canonicalHost = new URL(canonicalCallbackUrl).host;
    } catch {
      canonicalHost = "";
    }
    if (Object.keys(req.query).some(key => key !== "registrationId") ||
        (canonicalHost && req.get("host") !== canonicalHost)) {
      return res.redirect(303, canonicalCallbackUrl);
    }
    let [row] = await db.select({
      status: eventRegistrations.status,
      qrToken: eventRegistrations.qrToken,
      checkoutStatus: eventPaymentCheckouts.status,
      adapter: eventPaymentCheckouts.adapter,
      paymentLinkId: eventPaymentCheckouts.razorpayPaymentLinkId,
    }).from(eventRegistrations)
      .leftJoin(eventPaymentCheckouts, eq(eventPaymentCheckouts.registrationId, eventRegistrations.id))
      .where(eq(eventRegistrations.id, registrationId)).limit(1);
    if (!row) return res.status(404).send("Registration not found");
    if (row.qrToken) {
      return res.redirect(303, `/event-ticket/${encodeURIComponent(row.qrToken)}`);
    }
    if (row.adapter === "payment_links" && row.paymentLinkId && row.status === "registration_started") {
      await recoverPaymentLinkPaid(row.paymentLinkId).catch(error => {
        console.error("[events] Payment Link callback recovery failed:", error);
      });
      [row] = await db.select({
        status: eventRegistrations.status,
        qrToken: eventRegistrations.qrToken,
        checkoutStatus: eventPaymentCheckouts.status,
        adapter: eventPaymentCheckouts.adapter,
        paymentLinkId: eventPaymentCheckouts.razorpayPaymentLinkId,
      }).from(eventRegistrations)
        .leftJoin(eventPaymentCheckouts, eq(eventPaymentCheckouts.registrationId, eventRegistrations.id))
        .where(eq(eventRegistrations.id, registrationId)).limit(1);
      if (row?.qrToken) {
        return res.redirect(303, `/event-ticket/${encodeURIComponent(row.qrToken)}`);
      }
    }
    const terminal = row?.checkoutStatus === "expired" || row?.checkoutStatus === "cancelled";
    res.status(terminal ? 409 : 202)
      .set({
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
      })
      .send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${terminal ? "Payment not completed" : "Preparing your ticket"}</title>
<style>body{margin:0;background:#f8f6f8;color:#241f23;font-family:system-ui,-apple-system,sans-serif;display:grid;min-height:100vh;place-items:center}.card{width:min(88vw,420px);background:#fff;border:1px solid #eadfe7;border-radius:20px;padding:32px;text-align:center;box-shadow:0 14px 36px rgba(82,26,66,.1)}h1{font-size:24px;margin:0 0 12px}p{color:#675d65;line-height:1.5;margin:0 0 22px}.spinner{width:34px;height:34px;border:4px solid #eadfe7;border-top-color:#8c1867;border-radius:50%;margin:0 auto 22px;animation:spin .9s linear infinite}button{border:0;border-radius:12px;background:#8c1867;color:#fff;padding:12px 20px;font-weight:700}@keyframes spin{to{transform:rotate(360deg)}}</style></head>
<body><main class="card">${terminal ? "" : '<div class="spinner" aria-hidden="true"></div>'}
<h1>${terminal ? "Payment not completed" : "Payment received"}</h1>
<p>${terminal ? "This payment link is no longer active. Please return to the event page and try again." : "We are securely confirming your payment and preparing your ticket. This page will update automatically."}</p>
<button type="button" onclick="location.reload()">Check again</button></main>
${terminal ? "" : "<script>setTimeout(function(){location.reload()},2500)</script>"}</body></html>`);
  }

  app.post("/api/event/verify-payment", publicRoute("customer payment verification (signature-checked)"), async (req: Request, res: Response) => {
    try {
      const { registrationId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
      if (!registrationId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ error: "Missing payment fields" });
      }
      const [reg] = await db.select().from(eventRegistrations).where(eq(eventRegistrations.id, registrationId)).limit(1);
      if (!reg) return res.status(404).json({ error: "Registration not found" });
      const [ev] = await db.select().from(events).where(eq(events.id, reg.eventId)).limit(1);
      if (!ev) return res.status(404).json({ error: "Event not found" });
      const [checkout] = await db.select().from(eventPaymentCheckouts)
        .where(eq(eventPaymentCheckouts.registrationId, reg.id)).limit(1);
      if (!checkout) return res.status(400).json({ error: "Payment checkout snapshot not found" });
      if (checkout.adapter === "payment_links") {
        return res.status(400).json({ error: "Payment Links are confirmed by Razorpay webhook" });
      }
      const [allocation] = await db.select().from(routePayoutAllocations)
        .where(eq(routePayoutAllocations.registrationId, reg.id)).limit(1);
      const paymentMethod = checkout.adapter === "direct" ? "razorpay_direct" : "razorpay_route";
      const keySecret = paymentMethod === "razorpay_direct"
        ? process.env.RAZORPAY_DIRECT_KEY_SECRET
        : process.env.RAZORPAY_KEY_SECRET;
      if (!keySecret) return res.status(500).json({ error: "Payments not configured" });
      const expected = crypto
        .createHmac("sha256", keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");
      const expectedBuf = Buffer.from(expected, "hex");
      const suppliedBuf = Buffer.from(String(razorpay_signature), "hex");
      if (expectedBuf.length !== suppliedBuf.length || !crypto.timingSafeEqual(expectedBuf, suppliedBuf)) {
        return res.status(400).json({ error: "Payment signature verification failed" });
      }
      if (checkout.razorpayOrderId !== String(razorpay_order_id)) {
        return res.status(400).json({ error: "Payment order does not belong to this registration" });
      }
      const expectedAmount = checkout.amount;
      const expectedCurrency = checkout.currency.toUpperCase();
      if (paymentMethod === "razorpay_route") {
        if (!allocation || allocation.razorpayOrderId !== razorpay_order_id || allocation.amount !== expectedAmount || allocation.amount <= 0) {
          return res.status(400).json({ error: "Payment order does not belong to this registration" });
        }
      }

      const finishTicketIssuance = async (current: EventRegistration) => {
        const done = await issueTicket(ev, current);
        if (!done.bookingId || !done.qrToken) {
          return res.status(503).json({
            error: "Payment is confirmed, but your ticket is still being prepared. Please try again.",
            pending: true,
            retryable: true,
          });
        }
        return res.json({ registration: regShape(done) });
      };

      if (reg.status === "payment_completed") {
        return finishTicketIssuance(reg);
      }
      if (reg.status !== "registration_started") {
        if (reg.bookingId && reg.qrToken) return res.json({ registration: regShape(reg) });
        return res.status(409).json({
          error: "Payment was processed, but the ticket is not ready yet. Please try again.",
          pending: true,
          retryable: true,
        });
      }

      // Confirm provider order and payment data; never trust callback fields alone.
      const keyId = paymentMethod === "razorpay_direct"
        ? process.env.RAZORPAY_DIRECT_KEY_ID!
        : process.env.RAZORPAY_KEY_ID!;
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
      let orderRes: globalThis.Response;
      try {
        orderRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpay_order_id}`, {
          headers: { Authorization: `Basic ${auth}` },
          signal: AbortSignal.timeout(10_000),
        });
      } catch (e) {
        console.error("[events] Razorpay order confirmation request failed:", e);
        return res.status(504).json({ error: "Could not confirm payment with Razorpay. Please try again." });
      }
      if (!orderRes.ok) return res.status(500).json({ error: "Could not confirm payment with Razorpay" });
      const order = await orderRes.json();
      if (order.status !== "paid") return res.status(400).json({ error: "Payment not completed" });
      if (String(order.notes?.registrationId || "") !== reg.id) {
        return res.status(400).json({ error: "Payment does not belong to this registration" });
      }
      if ((paymentMethod === "razorpay_route" && String(order.notes?.allocationId || "") !== allocation!.id) ||
          (paymentMethod === "razorpay_direct" && String(order.notes?.registrationId || "") !== reg.id) ||
           Number(order.amount) !== expectedAmount ||
           String(order.currency || "").toUpperCase() !== expectedCurrency) {
        return res.status(400).json({ error: "Payment amount mismatch" });
      }
      let paymentRes: globalThis.Response;
      try {
        paymentRes = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id)}`, {
          headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(10_000),
        });
      } catch {
        return res.status(504).json({ error: "Could not confirm payment with Razorpay. Please try again." });
      }
      if (!paymentRes.ok) return res.status(502).json({ error: "Could not confirm payment with Razorpay" });
      const providerPayment: any = await paymentRes.json();
      if (providerPayment.status !== "captured" || providerPayment.order_id !== razorpay_order_id || Number(providerPayment.amount) !== expectedAmount || String(providerPayment.currency || "").toUpperCase() !== expectedCurrency) {
        return res.status(400).json({ error: "Payment is not captured for this order" });
      }

      if (paymentMethod === "razorpay_direct") {
        // Direct capture is committed atomically with the common payment row.
        let paymentRowId: string | null = null;
        const paid = await db.transaction(async (tx) => {
           const [p] = await tx.insert(payments).values({
             organizationId: ev.organizationId, amount: expectedAmount, currency: "INR",
             status: "captured", razorpayPaymentId: razorpay_payment_id,
             razorpayOrderId: razorpay_order_id, razorpaySignature: razorpay_signature,
             paymentMethod: providerPayment.method || null,
             description: `Event registration — ${ev.name}`, paidAt: new Date(),
           }).onConflictDoNothing({ target: payments.razorpayPaymentId }).returning();
           if (p) paymentRowId = p.id;
           else {
             const [existing] = await tx.select().from(payments)
               .where(eq(payments.razorpayPaymentId, razorpay_payment_id)).limit(1);
             paymentRowId = existing?.id || null;
           }
           const [updated] = await tx.update(eventRegistrations)
             .set({ status: "payment_completed", amountPaid: expectedAmount, paymentId: paymentRowId, updatedAt: new Date() })
             .where(and(eq(eventRegistrations.id, reg.id), eq(eventRegistrations.status, "registration_started")))
             .returning();
           if (updated) return updated;
           const [current] = await tx.select().from(eventRegistrations).where(eq(eventRegistrations.id, reg.id)).limit(1);
           return current;
        });
        if (!paid) return res.status(404).json({ error: "Registration not found" });
        if (paid.status !== "payment_completed") {
          return res.status(409).json({ error: "Payment is being finalized. Please try again.", pending: true, retryable: true });
        }
        await db.update(eventPaymentCheckouts)
          .set({ status: "captured", updatedAt: new Date() })
          .where(eq(eventPaymentCheckouts.id, checkout.id));
        await logStage(reg.id, "payment_completed", { razorpay_payment_id, amount: expectedAmount });
        return finishTicketIssuance(paid);
      }

      // Persist a payments row (org-scoped, matches existing conventions:
      // captured = paid).
      let paymentRowId: string | null = null;
      try {
        const [p] = await db.insert(payments).values({
          organizationId: ev.organizationId,
          amount: expectedAmount,
          currency: "INR",
          status: "captured",
          razorpayPaymentId: razorpay_payment_id,
          razorpayOrderId: razorpay_order_id,
          razorpaySignature: razorpay_signature,
          paymentMethod: providerPayment.method || null,
          description: `Event registration — ${ev.name}`,
          paidAt: new Date(),
        }).returning();
        paymentRowId = p?.id || null;
      } catch {
        const [existing] = await db.select().from(payments).where(eq(payments.razorpayPaymentId, razorpay_payment_id)).limit(1);
        paymentRowId = existing?.id || null;
      }

      const [paid] = await db
        .update(eventRegistrations)
        .set({ status: "payment_completed", amountPaid: expectedAmount, paymentId: paymentRowId, updatedAt: new Date() })
        .where(and(eq(eventRegistrations.id, reg.id), eq(eventRegistrations.status, "registration_started")))
        .returning();
      if (!paid) {
        const [current] = await db.select().from(eventRegistrations).where(eq(eventRegistrations.id, reg.id)).limit(1);
        if (!current) return res.status(404).json({ error: "Registration not found" });
        if (current.status === "payment_completed") return finishTicketIssuance(current);
        if (current.bookingId && current.qrToken) return res.json({ registration: regShape(current) });
        return res.status(409).json({ error: "Payment is being finalized. Please try again.", pending: true, retryable: true });
      }
      if (allocation) {
        await db.update(routePayoutAllocations).set({ status: "captured", updatedAt: new Date() })
          .where(eq(routePayoutAllocations.id, allocation.id));
      }
      await db.update(eventPaymentCheckouts)
        .set({ status: "captured", updatedAt: new Date() })
        .where(eq(eventPaymentCheckouts.id, checkout.id));
      await logStage(reg.id, "payment_completed", {
        razorpay_payment_id, amount: expectedAmount,
        ...(allocation ? { allocationId: allocation.id } : { testMode: true }),
      });
      return finishTicketIssuance(paid);
    } catch (e) {
      console.error("[events] verify payment failed:", e);
      res.status(503).json({
        error: "Payment is confirmed, but your ticket is still being prepared. Please try again.",
        pending: true,
        retryable: true,
      });
    }
  });

  app.post("/api/event/feedback/:qrToken", publicRoute("post-visit feedback (unguessable token)"), async (req: Request, res: Response) => {
    try {
      const reg = await findRegistrationByToken(String(req.params.qrToken || ""));
      if (!reg) return res.status(404).json({ error: "Ticket not found" });
      const b = req.body || {};
      const rate = (v: unknown): number | null => {
        const n = parseInt(String(v), 10);
        return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
      };
      const overall = rate(b.overallRating);
      if (!overall) return res.status(400).json({ error: "Overall rating (1–5) is required" });
      try {
        await db.insert(eventFeedback).values({
          registrationId: reg.id,
          overallRating: overall,
          crowdManagementRating: rate(b.crowdManagementRating),
          staffBehaviorRating: rate(b.staffBehaviorRating),
          organizationRating: rate(b.organizationRating),
          billingRating: rate(b.billingRating),
          suggestions: b.suggestions ? String(b.suggestions).slice(0, 2000) : null,
        });
      } catch {
        return res.status(409).json({ error: "Feedback already submitted for this ticket" });
      }
      await db
        .update(eventRegistrations)
        .set({ status: "feedback_submitted", updatedAt: new Date() })
        .where(and(eq(eventRegistrations.id, reg.id), inArray(eventRegistrations.status, ["exited", "checked_in", "arrived"])));
      await logStage(reg.id, "feedback_submitted", { overallRating: overall });
      res.json({ success: true });
    } catch (e) {
      console.error("[events] feedback failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============ ORGANIZER (org.events.manage) ============

  // Base64 image upload for event branding (banner / logo / gallery / venue map).
  app.post("/api/dashboard/events/upload-image", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    try {
      const { image } = req.body || {};
      if (!image || typeof image !== "string") {
        return res.status(400).json({ error: "No image data provided" });
      }
      const matches = image.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
      if (!matches) return res.status(400).json({ error: "Invalid image data format" });
      const data = matches[2];
      if (data.length > 8 * 1024 * 1024) return res.status(413).json({ error: "Image too large (max ~6MB)" });
      const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
      const contentType = `image/${matches[1] === "jpg" ? "jpeg" : matches[1]}`;
      const fileName = `event_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const buffer = Buffer.from(data, "base64");
      // Persisted in Replit Object Storage (survives redeploy/restart), not local disk.
      const url = await new ObjectStorageService().uploadPublicObject(buffer, fileName, contentType, "events");
      res.json({ url });
    } catch (e) {
      console.error("[events] image upload failed:", e);
      res.status(500).json({ error: "Failed to upload image" });
    }
  });

  // Pre-printed artwork is event-level configuration, so every future batch
  // uses the same front/back design without copying URLs onto inventory rows.
  // Only public objects created by the upload endpoint are accepted.
  app.put("/api/dashboard/events/:eventId/preprinted-artwork", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    try {
      const ev = await assertEventOwnership(req, res, String(req.params.eventId));
      if (!ev) return;
      const body = req.body || {};
      let frontImageUrl: string | null;
      let backImageUrl: string | null;
      try {
        frontImageUrl = validPreprintedArtworkUrl(body.frontImageUrl);
        backImageUrl = validPreprintedArtworkUrl(body.backImageUrl);
      } catch (error) {
        return res.status(400).json({ error: error instanceof Error ? error.message : "Invalid artwork" });
      }
      const backLayout = normalizePreprintedBackLayout(body.backLayout);
      const [updated] = await db.update(events).set({
        preprintedFrontImageUrl: frontImageUrl,
        preprintedBackImageUrl: backImageUrl,
        preprintedBackLayout: backLayout,
        updatedAt: new Date(),
      }).where(eq(events.id, ev.id)).returning();

      // Remove superseded files only after the database update succeeds. A
      // failed save therefore leaves the previously printable design intact.
      const storage = new ObjectStorageService();
      for (const previous of [ev.preprintedFrontImageUrl, ev.preprintedBackImageUrl]) {
        if (previous && previous !== frontImageUrl && previous !== backImageUrl) {
          await storage.deletePublicObject(previous).catch((error) => {
            console.warn("[events] old pre-printed artwork cleanup failed:", error);
          });
        }
      }
      res.json({ event: updated });
    } catch (e) {
      console.error("[events] pre-printed artwork save failed:", e);
      res.status(500).json({ error: "Unable to save pre-printed artwork" });
    }
  });

  // List all events for the authenticated org — used by the mobile event-staff app.
  app.get("/api/dashboard/events", requireAnyEventsPerm(), async (req: Request, res: Response) => {
    try {
      const orgId = await getRequestOrganizationId(req);
      if (!orgId) return res.status(401).json({ error: "Unauthorized" });
      const rows = await db
        .select()
        .from(events)
        .where(eq(events.organizationId, orgId))
        .orderBy(desc(events.createdAt));
      res.json({ events: rows });
    } catch (e) {
      console.error("[events] list failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/dashboard/events/branch/:branchId", requireAnyEventsPerm(), async (req: Request, res: Response) => {
    try {
      if (!(await assertBranchOwnership(req, res, String(req.params.branchId)))) return;
      const rows = await db
        .select()
        .from(events)
        .where(eq(events.branchId, String(req.params.branchId)))
        .orderBy(desc(events.createdAt));
      res.json({ events: rows });
    } catch (e) {
      console.error("[events] list failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/events", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    try {
      const b = req.body || {};
      if (!b.branchId || !b.organizationId || !b.name || !b.startDate || !b.endDate) {
        return res.status(400).json({ error: "branchId, organizationId, name, startDate, endDate are required" });
      }
      if (!(await assertOrgOwnership(req, res, String(b.organizationId)))) return;
      const [branch] = await db.select().from(branches).where(eq(branches.id, b.branchId)).limit(1);
      if (!branch || branch.organizationId !== b.organizationId) {
        return res.status(400).json({ error: "Branch does not belong to this organization" });
      }
      let whatsappTriggers: EventWhatsAppTriggers;
      let otpSettings: EventOtpSettings;
      let refundPolicy: EventRefundPolicy;
      let parkingEnabled: boolean;
      let checkoutAlert: CheckoutAlert;
      let preprintedTicketPrefix: string;
      try {
        whatsappTriggers = normalizeEventWhatsappTriggers(b.whatsappTriggers);
        otpSettings = normalizeEventOtpSettings(b.otpSettings);
        refundPolicy = normalizeEventRefundPolicy({
          refundable: b.refundable,
          refundMessage: b.refundMessage,
        });
        parkingEnabled = normalizeEventParkingEnabled(b.parkingEnabled);
        checkoutAlert = normalizeCheckoutAlert(b.checkoutAlert);
        preprintedTicketPrefix = normalizePreprintedTicketPrefix(b.preprintedTicketPrefix);
      } catch (e) {
        return res.status(400).json({ error: (e as Error).message });
      }
      const requestedRegistrationFee = Math.max(0, parseInt(String(b.registrationFee || 0), 10) || 0);
      const [payoutProfile] = await db.select({
        providerProductId: organizerPayoutProfiles.providerProductId,
        productStatus: organizerPayoutProfiles.productStatus,
      }).from(organizerPayoutProfiles)
        .where(eq(organizerPayoutProfiles.organizationId, String(b.organizationId)))
        .limit(1);
      const paymentMethod = await getEventPaymentMethod();
      const registrationFeesReady = canConfigureEventRegistrationFeeForMethod(paymentMethod, payoutProfile);
      const [ev] = await db.insert(events).values({
        branchId: b.branchId,
        organizationId: b.organizationId,
        name: String(b.name).trim(),
        description: b.description || null,
        venue: b.venue || null,
        googleMapsLink: b.googleMapsLink || null,
        startDate: new Date(b.startDate),
        endDate: new Date(b.endDate),
        operatingHoursStart: b.operatingHoursStart || "09:00",
        operatingHoursEnd: b.operatingHoursEnd || "21:00",
        slotDurationMinutes: Math.max(5, parseInt(String(b.slotDurationMinutes || 30), 10) || 30),
        maxCapacityPerSlot: Math.max(1, parseInt(String(b.maxCapacityPerSlot || 50), 10) || 50),
        maxGuestsPerRegistration: Math.max(1, parseInt(String(b.maxGuestsPerRegistration || 10), 10) || 10),
        registrationFee: registrationFeesReady ? requestedRegistrationFee : 0,
        registrationFeeCustomText: normalizeRegistrationFeeCustomText(b.registrationFeeCustomText),
        refundable: refundPolicy.refundable,
        refundMessage: refundPolicy.refundMessage,
        termsAndConditions: b.termsAndConditions || null,
        faqs: Array.isArray(b.faqs) ? b.faqs : [],
        supportContact: b.supportContact || null,
        bannerUrl: b.bannerUrl || null,
        logoUrl: b.logoUrl || null,
        galleryUrls: Array.isArray(b.galleryUrls) ? b.galleryUrls : [],
        venueMapUrl: b.venueMapUrl || null,
        brandPrimaryColor: b.brandPrimaryColor || null,
        brandButtonColor: b.brandButtonColor || null,
        brandFontFamily: b.brandFontFamily || null,
        preprintedTicketPrefix,
        messageTemplates: b.messageTemplates && typeof b.messageTemplates === "object" ? b.messageTemplates : {},
        whatsappTriggers,
        otpSettings,
        parkingEnabled,
        checkoutAlert,
        parkingTotalSpaces: Math.max(0, parseInt(String(b.parkingTotalSpaces || 0), 10) || 0),
        status: "draft",
      }).returning();
      res.json({ event: ev });
    } catch (e) {
      console.error("[events] create failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/dashboard/events/:eventId", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    try {
      const ev = await assertEventOwnership(req, res, String(req.params.eventId));
      if (!ev) return;
      const b = req.body || {};
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      const strFields = ["name", "description", "venue", "googleMapsLink", "operatingHoursStart", "operatingHoursEnd", "termsAndConditions", "supportContact", "bannerUrl", "logoUrl", "venueMapUrl", "brandPrimaryColor", "brandButtonColor", "brandFontFamily"] as const;
      for (const f of strFields) if (f in b) patch[f] = b[f] === "" ? null : b[f];
      if ("name" in patch && !patch.name) delete patch.name;
      if ("operatingHoursStart" in patch && !patch.operatingHoursStart) patch.operatingHoursStart = "09:00";
      if ("operatingHoursEnd" in patch && !patch.operatingHoursEnd) patch.operatingHoursEnd = "21:00";
      if (b.startDate) patch.startDate = new Date(b.startDate);
      if (b.endDate) patch.endDate = new Date(b.endDate);
      if (b.slotDurationMinutes !== undefined) patch.slotDurationMinutes = Math.max(5, parseInt(String(b.slotDurationMinutes), 10) || 30);
      if (b.maxCapacityPerSlot !== undefined) patch.maxCapacityPerSlot = Math.max(1, parseInt(String(b.maxCapacityPerSlot), 10) || 50);
      if (b.maxGuestsPerRegistration !== undefined) patch.maxGuestsPerRegistration = Math.max(1, parseInt(String(b.maxGuestsPerRegistration), 10) || 10);
      if (b.registrationFee !== undefined) {
        const [payoutProfile] = await db.select({
          providerProductId: organizerPayoutProfiles.providerProductId,
          productStatus: organizerPayoutProfiles.productStatus,
        }).from(organizerPayoutProfiles)
          .where(eq(organizerPayoutProfiles.organizationId, ev.organizationId))
          .limit(1);
        const paymentMethod = await getEventPaymentMethod();
        patch.registrationFee = canConfigureEventRegistrationFeeForMethod(paymentMethod, payoutProfile)
          ? Math.max(0, parseInt(String(b.registrationFee), 10) || 0)
          : 0;
      }
      if ("registrationFeeCustomText" in b) {
        try {
          patch.registrationFeeCustomText = normalizeRegistrationFeeCustomText(b.registrationFeeCustomText, ev.registrationFeeCustomText);
        } catch (e) {
          return res.status(400).json({ error: (e as Error).message });
        }
      }
      if ("preprintedTicketPrefix" in b) {
        try {
          patch.preprintedTicketPrefix = normalizePreprintedTicketPrefix(b.preprintedTicketPrefix);
        } catch (e) {
          return res.status(400).json({ error: (e as Error).message });
        }
      }
      if ("refundable" in b || "refundMessage" in b) {
        try {
          const refundPolicy = normalizeEventRefundPolicy({
            refundable: b.refundable,
            refundMessage: b.refundMessage,
          }, { refundable: ev.refundable, refundMessage: ev.refundMessage });
          patch.refundable = refundPolicy.refundable;
          patch.refundMessage = refundPolicy.refundMessage;
        } catch (e) {
          return res.status(400).json({ error: (e as Error).message });
        }
      }
      if (Array.isArray(b.faqs)) patch.faqs = b.faqs;
      if (Array.isArray(b.galleryUrls)) patch.galleryUrls = b.galleryUrls;
      if (b.messageTemplates && typeof b.messageTemplates === "object") patch.messageTemplates = b.messageTemplates;
      if (b.whatsappTriggers !== undefined) {
        try {
          patch.whatsappTriggers = normalizeEventWhatsappTriggers(b.whatsappTriggers);
        } catch (e) {
          return res.status(400).json({ error: (e as Error).message });
        }
      }
      if (b.otpSettings !== undefined) {
        try {
          patch.otpSettings = normalizeEventOtpSettings(b.otpSettings, ev.otpSettings);
        } catch (e) {
          return res.status(400).json({ error: (e as Error).message });
        }
      }
      if (b.parkingEnabled !== undefined) {
        try {
          patch.parkingEnabled = normalizeEventParkingEnabled(b.parkingEnabled, ev.parkingEnabled);
        } catch (e) {
          return res.status(400).json({ error: (e as Error).message });
        }
      }
      if (b.checkoutAlert !== undefined) {
        try {
          patch.checkoutAlert = normalizeCheckoutAlert(b.checkoutAlert, ev.checkoutAlert);
        } catch (e) {
          return res.status(400).json({ error: (e as Error).message });
        }
      }
      if (b.parkingTotalSpaces !== undefined) patch.parkingTotalSpaces = Math.max(0, parseInt(String(b.parkingTotalSpaces), 10) || 0);
      if (b.slotCapacityOverrides !== undefined) {
        // Per-slot capacity overrides keyed "YYYY-MM-DD|HH:MM". Values are
        // clamped to >= 0 (0 closes the slot); a missing key falls back to
        // maxCapacityPerSlot. Reject overrides below already-booked guests
        // so an edit can never strand confirmed registrations.
        if (!b.slotCapacityOverrides || typeof b.slotCapacityOverrides !== "object" || Array.isArray(b.slotCapacityOverrides)) {
          return res.status(400).json({ error: "slotCapacityOverrides must be an object map" });
        }
        const clean: Record<string, number> = {};
        for (const [key, raw] of Object.entries(b.slotCapacityOverrides as Record<string, unknown>)) {
          if (!/^\d{4}-\d{2}-\d{2}\|\d{2}:\d{2}$/.test(key)) {
            return res.status(400).json({ error: `Invalid slot key "${key}" — expected "YYYY-MM-DD|HH:MM"` });
          }
          const n = parseInt(String(raw), 10);
          if (!Number.isFinite(n) || n < 0) {
            return res.status(400).json({ error: `Invalid capacity for slot "${key}" — must be a number ≥ 0` });
          }
          clean[key] = n;
        }
        const usage = await slotUsage(ev.id);
        for (const [key, cap] of Object.entries(clean)) {
          const used = usage[key] || 0;
          if (cap < used) {
            return res.status(400).json({ error: `Slot ${key.replace("|", " ")} already has ${used} confirmed guests — capacity cannot go below that` });
          }
        }
        patch.slotCapacityOverrides = clean;
      }
      const [updated] = await db.update(events).set(patch as any).where(eq(events.id, ev.id)).returning();
      res.json({ event: updated });
    } catch (e) {
      console.error("[events] update failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Per-"Location" event config: time slots, capacity (+ per-slot overrides),
  // registration fee, and custom input fields. Locations are `services` rows;
  // the event-specific config lives in serviceSettings.event. `applyToAll`
  // copies the same config (and fields, when provided) to every active
  // location on the same branch. Slot-capacity overrides are validated against
  // each target location's already-booked usage so an edit can never strand
  // confirmed registrations.
  app.put("/api/dashboard/events/location/:serviceId/event-settings", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    try {
      const serviceId = String(req.params.serviceId || "");
      if (!(await assertServiceOwnership(req, res, serviceId))) return;
      const [svc] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
      if (!svc) return res.status(404).json({ error: "Location not found" });
      const ev = await loadEventForBranch(svc.branchId);
      if (!ev) return res.status(400).json({ error: "This branch has no event yet" });
      const activePaymentMethod = await getEventPaymentMethod();
      const [activePayoutProfile] = await db.select({
        providerProductId: organizerPayoutProfiles.providerProductId,
        productStatus: organizerPayoutProfiles.productStatus,
      }).from(organizerPayoutProfiles)
        .where(eq(organizerPayoutProfiles.organizationId, ev.organizationId)).limit(1);
      const feeReady = canConfigureEventRegistrationFeeForMethod(activePaymentMethod, activePayoutProfile);

      const b = req.body || {};
      const c = (b.config && typeof b.config === "object") ? b.config : {};
      const timeRe = /^([01]?\d|2[0-3]):[0-5]\d$/;
      let refundPolicy: EventRefundPolicy;
      try {
        refundPolicy = normalizeEventRefundPolicy({
          refundable: c.refundable,
          refundMessage: c.refundMessage,
        }, {
          refundable: ev.refundable,
          refundMessage: ev.refundMessage,
        });
      } catch (e) {
        return res.status(400).json({ error: (e as Error).message });
      }
      const cfg: LocationEventConfig = {
        operatingHoursStart: timeRe.test(String(c.operatingHoursStart)) ? String(c.operatingHoursStart) : ev.operatingHoursStart,
        operatingHoursEnd: timeRe.test(String(c.operatingHoursEnd)) ? String(c.operatingHoursEnd) : ev.operatingHoursEnd,
        slotDurationMinutes: Math.max(5, num(c.slotDurationMinutes, ev.slotDurationMinutes)),
        maxCapacityPerSlot: Math.max(0, num(c.maxCapacityPerSlot, ev.maxCapacityPerSlot)),
        // Fail closed if adapter readiness changes while editing.
        registrationFee: feeReady ? Math.max(0, num(c.registrationFee, ev.registrationFee)) : 0,
         registrationFeeCustomText: normalizeRegistrationFeeCustomText(
           c.registrationFeeCustomText,
           ev.registrationFeeCustomText,
         ),
        refundable: refundPolicy.refundable,
        refundMessage: refundPolicy.refundMessage,
        slotCapacityOverrides: {},
        eventId: typeof c.eventId === "string" ? c.eventId : "",
      };
      // Validate + clean per-slot overrides.
      if (c.slotCapacityOverrides !== undefined) {
        if (!c.slotCapacityOverrides || typeof c.slotCapacityOverrides !== "object" || Array.isArray(c.slotCapacityOverrides)) {
          return res.status(400).json({ error: "slotCapacityOverrides must be an object map" });
        }
        for (const [key, rawVal] of Object.entries(c.slotCapacityOverrides as Record<string, unknown>)) {
          if (!/^\d{4}-\d{2}-\d{2}\|\d{2}:\d{2}$/.test(key)) {
            return res.status(400).json({ error: `Invalid slot key "${key}" — expected "YYYY-MM-DD|HH:MM"` });
          }
          const n = parseInt(String(rawVal), 10);
          if (!Number.isFinite(n) || n < 0) {
            return res.status(400).json({ error: `Invalid capacity for slot "${key}" — must be a number ≥ 0` });
          }
          cfg.slotCapacityOverrides[key] = n;
        }
      }

      const inputFields = Array.isArray(b.inputFields) ? b.inputFields : undefined;
      const applyToAll = b.applyToAll === true;

      // Cap: at most 5 locations per event (event accounts only). Only guard the
      // single origin location (applyToAll only edits existing rows, never adds).
      // A location's event is its serviceSettings.event.eventId; an empty link
      // belongs to the branch's current event (ev.id). Excluding svc.id means
      // editing an existing 5th location passes, but creating a 6th is rejected.
      const [locOrg] = await db.select({ accountType: organizations.accountType }).from(organizations).where(eq(organizations.id, ev.organizationId)).limit(1);
      if (locOrg?.accountType === "event" && !applyToAll) {
        const targetEventId = (cfg.eventId && cfg.eventId.trim()) ? cfg.eventId.trim() : ev.id;
        const allLocs = await loadEventLocations(svc.branchId);
        const others = allLocs.filter(s =>
          s.id !== svc.id &&
          (((s.serviceSettings as any)?.event?.eventId || "") || ev.id) === targetEventId,
        ).length;
        if (others >= 5) {
          return res.status(400).json({ error: "Each event can have at most 5 locations. Remove a location before adding another." });
        }
      }

      const targets = applyToAll
        ? await loadEventLocations(svc.branchId)
        : [svc];

      // Validate slot overrides against each target's current usage first, so a
      // conflict on any target aborts the whole operation atomically.
      for (const t of targets) {
        const usage = await slotUsage(ev.id, t.id);
        for (const [key, cap] of Object.entries(cfg.slotCapacityOverrides)) {
          const used = usage[key] || 0;
          if (cap < used) {
            return res.status(400).json({
              error: `Location "${t.name}" — slot ${key.replace("|", " ")} already has ${used} confirmed guests; capacity cannot go below that`,
            });
          }
        }
      }

      for (const t of targets) {
        // On "apply to all", every target keeps its OWN event link — only the
        // originating location adopts the eventId from this request. Otherwise
        // an operator editing one location's schedule would silently relink
        // every other location to the same event.
        const existingEventId = (t.serviceSettings as any)?.event?.eventId;
        const targetCfg: LocationEventConfig = {
          ...cfg,
          eventId: t.id === svc.id ? cfg.eventId : (typeof existingEventId === "string" ? existingEventId : ""),
        };
        const nextSettings = { ...((t.serviceSettings as any) || {}), event: targetCfg };
        const patch: Record<string, unknown> = { serviceSettings: nextSettings, updatedAt: new Date() };
        if (inputFields !== undefined) patch.inputFields = inputFields;
        await db.update(services).set(patch as any).where(eq(services.id, t.id));
      }

      const [saved] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
      res.json({ location: saved, appliedTo: targets.length });
    } catch (e) {
      console.error("[events] location event-settings save failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/events/:eventId/status", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    try {
      const status = String((req.body || {}).status || "");
      if (!["draft", "published", "paused", "ended"].includes(status)) {
        return res.status(400).json({ error: "status must be draft, published, paused, or ended" });
      }
      const ev = await assertEventOwnership(req, res, String(req.params.eventId));
      if (!ev) return;
      // Pausing only makes sense for a live event: it blocks NEW public
      // registrations while staff scanning of issued tickets keeps working.
      if (status === "paused" && ev.status !== "published") {
        return res.status(400).json({ error: "Only a published event can be paused" });
      }
      const [statusOrg] = await db.select({ accountType: organizations.accountType }).from(organizations).where(eq(organizations.id, ev.organizationId)).limit(1);
      const isEventOrg = statusOrg?.accountType === "event";
      if (isEventOrg && status === "published" && ev.status !== "published") {
        // Up to 2 ACTIVE (published or paused) events per organization at a
        // time — org-wide, not per-branch. Publishing a 3rd doesn't hard-fail:
        // the client shows a warning listing the currently-active events and
        // lets the user pick one to end, then resubmits with
        // confirmEndEventId. Nothing is ended without that explicit opt-in.
        const activeRows = await db
          .select({ id: events.id, name: events.name, status: events.status })
          .from(events)
          .where(and(
            eq(events.organizationId, ev.organizationId),
            inArray(events.status, ["published", "paused"]),
            ne(events.id, ev.id),
          ));
        if (activeRows.length >= 2) {
          const confirmEndEventId = String((req.body || {}).confirmEndEventId || "");
          const toEnd = activeRows.find((r) => r.id === confirmEndEventId);
          if (!toEnd) {
            return res.status(409).json({
              error: "at_capacity",
              message: "You already have 2 active events. Publishing this one will end one of them.",
              activeEvents: activeRows,
            });
          }
          await db.update(events).set({ status: "ended", updatedAt: new Date() }).where(eq(events.id, toEnd.id));
        }
      }
      const [updated] = await db.update(events).set({ status, updatedAt: new Date() }).where(eq(events.id, ev.id)).returning();
      res.json({ event: updated });
    } catch (e) {
      console.error("[events] status change failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/dashboard/events/:eventId", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    try {
      const ev = await assertEventOwnership(req, res, String(req.params.eventId));
      if (!ev) return;
      if (ev.status === "published") return res.status(400).json({ error: "End the event before deleting it" });
      await db.delete(events).where(eq(events.id, ev.id));
      res.json({ success: true });
    } catch (e) {
      console.error("[events] delete failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Registrations list — organizer + support both need it.
  app.get("/api/dashboard/events/:eventId/registrations", requirePermission("org.events.support"), async (req: Request, res: Response) => {
    try {
      if (!(await assertEventOwnership(req, res, String(req.params.eventId)))) return;
      const { status, q, slotDate } = req.query as Record<string, string>;
      const pageSize = 20;
      const requestedPage = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
      const conds = [eq(eventRegistrations.eventId, String(req.params.eventId))];
      if (status) conds.push(inArray(eventRegistrations.status, status.split(",")));
      if (slotDate) conds.push(eq(eventRegistrations.slotDate, slotDate));
      if (q?.trim()) {
        const bookingIdConditions = getPartialTicketIdPatterns(q)
          .map((pattern) => ilike(eventRegistrations.bookingId, pattern));
        const needle = `%${q.trim()}%`;
        conds.push(or(
          ilike(eventRegistrations.customerName, needle),
          ilike(eventRegistrations.customerPhone, needle),
          or(...bookingIdConditions),
        ) as any);
      }
      const whereClause = and(...conds);
      const [countRow] = await db
        .select({ total: dsql<number>`count(*)::int` })
        .from(eventRegistrations)
        .where(whereClause);
      const total = countRow?.total ?? 0;
      const pages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(requestedPage, pages);
      const rows = await db
        .select()
        .from(eventRegistrations)
        .where(whereClause)
        .orderBy(desc(eventRegistrations.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize);
      res.json({
        registrations: rows.map(regShape),
        total,
        page,
        limit: pageSize,
        pages,
      });
    } catch (e) {
      console.error("[events] registrations list failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Live stats for the organizer dashboard.
  app.get("/api/dashboard/events/:eventId/stats", requireAnyEventsPerm(), async (req: Request, res: Response) => {
    try {
      const ev = await assertEventOwnership(req, res, String(req.params.eventId));
      if (!ev) return;
      // Optional location filter for the Dashboard "Location" selector.
      const locFilter = String((req.query.locationId as string) || "").trim();
      const allRegs = await db.select().from(eventRegistrations).where(eq(eventRegistrations.eventId, ev.id));
      const regs = locFilter ? allRegs.filter((r) => r.locationId === locFilter) : allRegs;
      // Per-location registration counts so the dashboard can populate its
      // Location selector and show a breakdown. IMPORTANT: aggregate over
      // `allRegs`, never the location-filtered `regs` — otherwise selecting a
      // location would zero out every other option's count in the dropdown.
      const byLocation: Record<string, number> = {};
      // Per-location guest headcounts (guests = 1 + familyMembersCount) plus
      // live inside/expected breakdowns. Aggregated over `allRegs` (never the
      // filtered `regs`) for the same reason as the registration counts above —
      // selecting one location must not zero out the others.
      const byLocationGuests: Record<string, { guests: number; inside: number; expected: number; arrived: number; exited: number }> = {};
      for (const r of allRegs) {
        const k = r.locationId || "";
        byLocation[k] = (byLocation[k] || 0) + 1;
        const slot = byLocationGuests[k] || (byLocationGuests[k] = { guests: 0, inside: 0, expected: 0, arrived: 0, exited: 0 });
        const g = 1 + (r.familyMembersCount || 0);
        slot.guests += g;
        if (r.status === "checked_in") slot.inside += g;
        if (["ticket_generated", "payment_completed"].includes(r.status)) slot.expected += g;
        if (r.status === "arrived") slot.arrived += g;
        if (["exited", "feedback_submitted"].includes(r.status)) slot.exited += g;
      }
      const byStatus: Record<string, number> = {};
      let insideGuests = 0, expectedGuests = 0, arrivedGuests = 0, exitedGuests = 0;
      const { customerRegistrations, storeRegistrations, customerRevenue } =
        aggregateRegistrationSourceMetrics(regs);
      const durations: number[] = [];
      for (const r of regs) {
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        const g = 1 + (r.familyMembersCount || 0);
        if (r.status === "checked_in") insideGuests += g;
        if (["ticket_generated", "payment_completed"].includes(r.status)) expectedGuests += g;
        if (r.status === "arrived") arrivedGuests += g;
        if (["exited", "feedback_submitted"].includes(r.status)) exitedGuests += g;
        if (r.visitDurationMinutes) durations.push(r.visitDurationMinutes);
      }
      const fb = await db
        .select({
          count: dsql<number>`COUNT(*)`,
          avgOverall: dsql<number>`AVG(${eventFeedback.overallRating})`,
          avgCrowd: dsql<number>`AVG(${eventFeedback.crowdManagementRating})`,
          avgStaff: dsql<number>`AVG(${eventFeedback.staffBehaviorRating})`,
          avgOrg: dsql<number>`AVG(${eventFeedback.organizationRating})`,
          avgBilling: dsql<number>`AVG(${eventFeedback.billingRating})`,
        })
        .from(eventFeedback)
        .innerJoin(eventRegistrations, eq(eventFeedback.registrationId, eventRegistrations.id))
        .where(eq(eventRegistrations.eventId, ev.id));
      const redemptions = await db
        .select({
          count: dsql<number>`COUNT(*)`,
          invoiceTotal: dsql<number>`COALESCE(SUM(${eventBillingRedemptions.invoiceAmount}),0)`,
          redeemedTotal: dsql<number>`COALESCE(SUM(${eventBillingRedemptions.advanceRedeemed}),0)`,
          customerPaid: dsql<number>`COALESCE(SUM(${eventBillingRedemptions.finalAmountDue}),0)`,
        })
        .from(eventBillingRedemptions)
        .innerJoin(eventRegistrations, eq(eventBillingRedemptions.registrationId, eventRegistrations.id))
        .where(eq(eventRegistrations.eventId, ev.id));
      const usage = await slotUsage(ev.id, locFilter || undefined);

      // Expected guests in next 60 minutes based on slot times
      const nowSlot = new Date();
      const todayStr = nowSlot.toISOString().slice(0, 10);
      const hh = nowSlot.getUTCHours();
      const curHHStr = String(hh).padStart(2, "0") + ":";
      const nxtHHStr = String((hh + 1) % 24).padStart(2, "0") + ":";
      const expectedNextHour = regs
        .filter((r) =>
          ["ticket_generated", "payment_completed", "arrived"].includes(r.status) &&
          r.slotDate === todayStr &&
          r.slotTime >= curHHStr && (hh < 23 ? r.slotTime < nxtHHStr : true),
        )
        .reduce((sum, r) => sum + 1 + (r.familyMembersCount || 0), 0);

      // Location names for the Dashboard location picker
      const locIds = Object.keys(byLocation).filter(Boolean);
      const locRows = locIds.length
        ? await db.select({ id: services.id, name: services.name }).from(services).where(inArray(services.id, locIds))
        : [];

      res.json({
        event: {
          id: ev.id,
          name: ev.name,
          status: ev.status,
          parkingEnabled: ev.parkingEnabled,
          parkingTotalSpaces: ev.parkingTotalSpaces,
          parkingOccupied: ev.parkingOccupied,
        },
        locations: locRows,
        totals: {
          registrations: regs.length,
          storeRegistrations,
          customerRegistrations,
          byStatus,
          byLocation,
          byLocationGuests,
          insideGuests,
          expectedGuests,
          arrivedGuests,
          exitedGuests,
          expectedNextHour,
          advanceRevenue: customerRevenue,
          avgVisitMinutes: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
          invalidScans: regs.reduce((a, r) => a + (r.invalidScanAttempts || 0), 0),
          duplicateAttempts: regs.reduce((a, r) => a + (r.duplicateEntryAttempts || 0), 0),
        },
        slotUsage: usage,
        feedback: fb[0] || null,
        redemptions: redemptions[0] || null,
      });
    } catch (e) {
      console.error("[events] stats failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============ RECENT ACTIVITY (requireAnyEventsPerm) ============

  app.get("/api/dashboard/events/:eventId/recent-activity", requireAnyEventsPerm(), async (req: Request, res: Response) => {
    try {
      const ev = await assertEventOwnership(req, res, String(req.params.eventId));
      if (!ev) return;
      const type = String(req.query.type || "checkin");
      const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
      const search = String(req.query.search || "").trim();
      const billingLimit = 10;
      const defaultLimit = 20;
      const limit = type === "billing" ? billingLimit : defaultLimit;
      const offset = (page - 1) * limit;

      if (type === "billing") {
        const whereConditions = [eq(eventRegistrations.eventId, ev.id)];
        if (search) {
          const bookingIdConditions = getPartialTicketIdPatterns(search)
            .map((pattern) => ilike(eventRegistrations.bookingId, pattern));
          whereConditions.push(
            or(
              ilike(eventRegistrations.customerName, `%${search}%`),
              or(...bookingIdConditions),
            ) as any,
          );
        }
        const rows = await db
          .select({
            id: eventBillingRedemptions.id,
            customerName: eventRegistrations.customerName,
            customerPhone: eventRegistrations.customerPhone,
            bookingId: eventRegistrations.bookingId,
            locationId: eventRegistrations.locationId,
            familyMembersCount: eventRegistrations.familyMembersCount,
            amountPaid: eventRegistrations.amountPaid,
            invoiceAmount: eventBillingRedemptions.invoiceAmount,
            advanceRedeemed: eventBillingRedemptions.advanceRedeemed,
            finalAmountDue: eventBillingRedemptions.finalAmountDue,
            redeemedAt: eventBillingRedemptions.redeemedAt,
          })
          .from(eventBillingRedemptions)
          .innerJoin(eventRegistrations, eq(eventBillingRedemptions.registrationId, eventRegistrations.id))
          .where(and(...whereConditions))
          .orderBy(desc(eventBillingRedemptions.redeemedAt))
          .limit(limit)
          .offset(offset);
        return res.json({ items: rows, type, limit });
      }

      const stageMap: Record<string, string[]> = {
        checkin: ["checked_in"],
        exit: ["exited"],
        arrive: ["arrived"],
      };
      const stages = stageMap[type] || ["checked_in"];

      const rows = await db
        .select({
          id: eventStageLog.id,
          stage: eventStageLog.stage,
          createdAt: eventStageLog.createdAt,
          customerName: eventRegistrations.customerName,
          bookingId: eventRegistrations.bookingId,
          locationId: eventRegistrations.locationId,
          familyMembersCount: eventRegistrations.familyMembersCount,
          slotDate: eventRegistrations.slotDate,
          slotTime: eventRegistrations.slotTime,
          checkedInAt: eventRegistrations.checkedInAt,
        })
        .from(eventStageLog)
        .innerJoin(eventRegistrations, eq(eventStageLog.registrationId, eventRegistrations.id))
        .where(
          and(
            eq(eventRegistrations.eventId, ev.id),
            inArray(eventStageLog.stage, stages),
          ),
        )
        .orderBy(desc(eventStageLog.createdAt))
        .limit(limit)
        .offset(offset);
      res.json({ items: rows, type });
    } catch (e) {
      console.error("[events] recent-activity failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/dashboard/events/:eventId/feedback", requirePermission("org.events.manage"), async (req: Request, res: Response) => {
    try {
      if (!(await assertEventOwnership(req, res, String(req.params.eventId)))) return;
      const rows = await db
        .select({
          feedback: eventFeedback,
          customerName: eventRegistrations.customerName,
          bookingId: eventRegistrations.bookingId,
        })
        .from(eventFeedback)
        .innerJoin(eventRegistrations, eq(eventFeedback.registrationId, eventRegistrations.id))
        .where(eq(eventRegistrations.eventId, String(req.params.eventId)))
        .orderBy(desc(eventFeedback.createdAt))
        .limit(500);
      res.json({ feedback: rows.map((r) => ({ ...r.feedback, customerName: r.customerName, bookingId: r.bookingId })) });
    } catch (e) {
      console.error("[events] feedback list failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Audit trail for one registration (support + organizer).
  app.get("/api/dashboard/events/registration/:registrationId/log", requireAnyEventsPerm(), async (req: Request, res: Response) => {
    try {
      const scoped = await findOrgRegistration(req, String(req.params.registrationId));
      if (!scoped) return res.status(404).json({ error: "Registration not found" });
      const rows = await db
        .select()
        .from(eventStageLog)
        .where(eq(eventStageLog.registrationId, scoped.reg.id))
        .orderBy(desc(eventStageLog.createdAt))
        .limit(200);
      res.json({ log: rows });
    } catch (e) {
      console.error("[events] log fetch failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============ SECURITY (org.events.security) ============

  // Per-action transition config, shared by the lookup (pre-check) and scan
  // (recording) routes so "which statuses count as duplicate/invalid" can't
  // drift between the preview screen and the actual check-in write.
  const SCAN_TRANSITIONS: Record<string, {
    validFrom: string[];
    duplicateWhen: string[];
    invalidMsg: (s: string) => string;
  }> = {
    arrive: {
      validFrom: ["ticket_generated", "payment_completed"],
      duplicateWhen: ["arrived", "checked_in", "exited", "feedback_submitted"],
      invalidMsg: (s) => `Ticket is not valid for arrival (status: ${s})`,
    },
    checkin: {
      validFrom: ["arrived", "ticket_generated", "payment_completed"],
      duplicateWhen: ["checked_in", "exited", "feedback_submitted"],
      invalidMsg: (s) => `Ticket is not valid for check-in (status: ${s})`,
    },
    exit: {
      validFrom: ["checked_in"],
      duplicateWhen: ["exited", "feedback_submitted"],
      invalidMsg: (s) => `Ticket is not currently checked in (status: ${s})`,
    },
  };

  // Lookup endpoint — returns registration info without recording any transition.
  // Checks the CURRENT status against the target action's validFrom/duplicateWhen
  // FIRST, so an already-checked-in / invalid ticket is rejected immediately here
  // instead of showing the staff a "Confirm check-in" preview that only fails
  // after they tap Confirm.
  app.get("/api/dashboard/events/scan/lookup", requirePermission("org.events.security"), async (req: Request, res: Response) => {
    try {
      const value = String(req.query.value || "").trim();
      if (!value) return res.status(400).json({ error: "value is required" });
      // Only the check-in scanner uses this lookup route today; default to
      // "checkin" but allow an explicit action to future-proof other scanners.
      const action = String(req.query.action || "checkin");
      const token = parseScanValue(value);
      const scoped = await findOrgRegistration(req, token);
      if (!scoped) {
        const inventoryTicket = await findUnassignedPreprintedTicketForOrg(req, token);
        if (inventoryTicket) {
          const isVoided = inventoryTicket.ticket.status === "voided";
          return res.status(409).json({
            error: isVoided
              ? "This pre-printed ticket is voided. Do not allow entry."
              : "This pre-printed ticket has not been assigned to an attendee. Do not allow entry.",
            invalid: true,
            unassignedPreprinted: !isVoided,
            voidedPreprinted: isVoided,
            eventName: inventoryTicket.ev.name,
          });
        }
        return res.status(404).json({ error: "Invalid ticket — no matching registration", invalid: true });
      }
      const { reg, ev } = scoped;
      const g = 1 + (reg.familyMembersCount || 0);
      const formLabels = await buildFormLabels(reg.locationId);

      // Once an event has been ended, no further check-ins should be
      // accepted — even for a guest who already has a valid ticket. This
      // mirrors the "paused" notice but is a hard stop, not just a heads-up.
      if (ev.status === "ended" && action === "checkin") {
        return res.status(409).json({
          error: "This event has ended. Check-ins are no longer accepted.",
          eventEnded: true,
          registration: regShape(reg),
          eventName: ev.name,
        });
      }

      const t = SCAN_TRANSITIONS[action];
      if (t && !t.validFrom.includes(reg.status)) {
        const isDup = t.duplicateWhen.includes(reg.status);
        const journey = isDup ? await registrationJourney(reg.id) : undefined;
        return res.status(409).json({
          error: isDup ? `Already ${reg.status.replace(/_/g, " ")}` : t.invalidMsg(reg.status),
          ...(isDup ? { duplicate: true } : { invalid: true }),
          ...(ev.status === "paused" ? { eventPaused: true } : {}),
          registration: regShape(reg),
          eventName: ev.name,
          formLabels,
          ...(journey ? { journey } : {}),
        });
      }

      return res.json({ registration: regShape(reg), eventName: ev.name, guests: g, eventPaused: ev.status === "paused", formLabels });
    } catch (e) {
      console.error("[events] scan lookup failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/events/scan", requirePermission("org.events.security"), async (req: Request, res: Response) => {
    try {
      const { value, action, familyMembersCount: rawFamCount } = req.body || {};
      if (!value || !["arrive", "checkin", "exit"].includes(action)) {
        return res.status(400).json({ error: "value and action (arrive|checkin|exit) are required" });
      }
      const token = parseScanValue(String(value));
      const scoped = await findOrgRegistration(req, token);
      if (!scoped) {
        const inventoryTicket = await findUnassignedPreprintedTicketForOrg(req, token);
        if (inventoryTicket) {
          const isVoided = inventoryTicket.ticket.status === "voided";
          return res.status(409).json({
            error: isVoided
              ? "This pre-printed ticket is voided. Do not allow entry."
              : "This pre-printed ticket has not been assigned to an attendee. Do not allow entry.",
            invalid: true,
            unassignedPreprinted: !isVoided,
            voidedPreprinted: isVoided,
            eventName: inventoryTicket.ev.name,
          });
        }
        return res.status(404).json({ error: "Invalid ticket — no matching registration", invalid: true });
      }
      const { reg, ev } = scoped;

      // Hard stop on check-ins once the event has ended — mirrors the
      // read-only lookup check above so a client can't bypass the notice
      // by skipping straight to the confirm step.
      if (ev.status === "ended" && action === "checkin") {
        return res.status(409).json({
          error: "This event has ended. Check-ins are no longer accepted.",
          eventEnded: true,
          registration: regShape(reg),
          eventName: ev.name,
        });
      }

      // Adjusted family members count: only honoured on check-in, ignored on exit/arrive
      const adjustedFam = (action === "checkin" && rawFamCount != null)
        ? Math.max(0, parseInt(String(rawFamCount), 10) || 0)
        : null;
      const finalFam = adjustedFam ?? (reg.familyMembersCount || 0);
      const g = 1 + finalFam;
      const now = new Date();

      // Per-action write config (validFrom/duplicateWhen/invalidMsg come from
      // the shared SCAN_TRANSITIONS above, used by the lookup pre-check too,
      // so the two routes can't drift apart on what counts as a duplicate).
      const WRITE_CONFIG: Record<string, {
        set: (r: EventRegistration) => Record<string, unknown>;
        stage: string;
        waTrigger: string;
      }> = {
        arrive: {
          set: () => ({ status: "arrived", arrivedAt: now, updatedAt: now }),
          stage: "arrived",
          waTrigger: "arrived",
        },
        checkin: {
          set: (r) => ({
            status: "checked_in",
            checkedInAt: now,
            arrivedAt: r.arrivedAt || now,
            updatedAt: now,
            ...(adjustedFam !== null ? { familyMembersCount: adjustedFam } : {}),
          }),
          stage: "checked_in",
          waTrigger: "checked_in",
        },
        exit: {
          set: (r) => ({
            status: "exited",
            exitedAt: now,
            visitDurationMinutes: r.checkedInAt ? Math.max(0, Math.round((now.getTime() - new Date(r.checkedInAt).getTime()) / 60000)) : null,
            checkoutAlertSnapshot: checkoutAlertFor(ev, r, now),
            updatedAt: now,
          }),
          stage: "exited",
          waTrigger: "thank_you_feedback",
        },
      };
      const t = { ...SCAN_TRANSITIONS[action as string], ...WRITE_CONFIG[action as string] };

      const rejectScan = async (current: EventRegistration) => {
        const isDup = t.duplicateWhen.includes(current.status);
        await db.update(eventRegistrations)
          .set(isDup
            ? { duplicateEntryAttempts: (current.duplicateEntryAttempts || 0) + 1, updatedAt: now }
            : { invalidScanAttempts: (current.invalidScanAttempts || 0) + 1, updatedAt: now })
          .where(eq(eventRegistrations.id, current.id));
        await logStage(current.id, isDup ? "duplicate_scan" : "invalid_scan", { action, status: current.status });
        const journey = isDup ? await registrationJourney(current.id) : undefined;
        return res.status(409).json({
          error: isDup ? `Already ${current.status.replace(/_/g, " ")}` : t.invalidMsg(current.status),
          ...(isDup ? { duplicate: true } : {}),
          ...(ev.status === "paused" ? { eventPaused: true } : {}),
          registration: regShape(current),
          eventName: ev.name,
          ...(journey ? { journey } : {}),
        });
      };

      if (!t.validFrom.includes(reg.status)) return rejectScan(reg);

      // Conditional transition — only succeeds if the status is still valid.
      const [updated] = await db.update(eventRegistrations)
        .set(t.set(reg))
        .where(and(eq(eventRegistrations.id, reg.id), inArray(eventRegistrations.status, t.validFrom)))
        .returning();
      if (!updated) {
        // Lost a race — someone else transitioned this ticket first.
        const [fresh] = await db.select().from(eventRegistrations).where(eq(eventRegistrations.id, reg.id)).limit(1);
        return rejectScan(fresh || reg);
      }

      await logStage(reg.id, t.stage, {
        by: getRequestUserId(req),
        ...(action === "exit" ? {
          durationMin: updated.visitDurationMinutes,
          checkoutAlert: updated.checkoutAlertSnapshot || undefined,
        } : {}),
      });
      try {
        await sendEventTrigger(ev, updated, t.waTrigger);
      } catch (e) { console.error(`[events] ${action} WA failed:`, e); }
      // Paused events still admit already-ticketed guests, but the console
      // shows a clear notice so staff know registrations are paused.
      const formLabels = await buildFormLabels(reg.locationId);
      return res.json({ success: true, action, registration: regShape(updated), eventName: ev.name, guests: g, formLabels, checkoutAlert: updated.checkoutAlertSnapshot, ...(ev.status === "paused" ? { eventPaused: true } : {}) });
    } catch (e) {
      console.error("[events] scan failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============ BILLING (org.events.billing) ============

  app.get("/api/dashboard/events/billing/lookup", requirePermission("org.events.billing"), async (req: Request, res: Response) => {
    try {
      const q = String((req.query.q as string) || "");
      const scoped = await findOrgRegistration(req, parseScanValue(q));
      if (!scoped) return res.status(404).json({ error: "No matching registration" });
      const { reg, ev } = scoped;
      const [redemption] = await db.select().from(eventBillingRedemptions).where(eq(eventBillingRedemptions.registrationId, reg.id)).limit(1);

      // Cash/counter payments (manual registration) bypass OTP — payment was
      // already physically verified by staff at the time of registration.
      let cashPaidAtCounter = false;
      if (reg.paymentId) {
        const [pmtRow] = await db.select({ paymentMethod: payments.paymentMethod })
          .from(payments).where(eq(payments.id, reg.paymentId)).limit(1);
        cashPaidAtCounter = pmtRow?.paymentMethod === "manual";
      }

      const feeExists = (ev.registrationFee || 0) > 0;
      const billingOtpEnabled = normalizeEventOtpSettings(ev.otpSettings).billing;
      const otpRequired = isEventBillingOtpRequired(ev, feeExists, cashPaidAtCounter);
      let otpVerified = false;
      if (otpRequired && !redemption) {
        const [otpRow] = await db.select().from(eventBillingOtps)
          .where(and(eq(eventBillingOtps.registrationId, reg.id), eq(eventBillingOtps.verified, true)))
          .orderBy(desc(eventBillingOtps.createdAt)).limit(1);
        otpVerified = !!otpRow;
      }
      res.json({
        registration: regShape(reg),
        eventName: ev.name,
        advanceAvailable: redemption ? 0 : (reg.amountPaid || 0),
        redemption: redemption || null,
        otpRequired,
        otpVerified,
        cashPaidAtCounter,
        billingOtpEnabled,
      });
    } catch (e) {
      console.error("[events] billing lookup failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Send the OTP that the customer reads aloud to billing staff before an
  // advance can be redeemed. Only meaningful when the event was configured
  // with a registration fee at creation (otherwise there is no advance to
  // protect and the UI skips straight to the invoice step).
  app.post("/api/dashboard/events/billing/send-otp", requirePermission("org.events.billing"), async (req: Request, res: Response) => {
    try {
      const { registrationId } = req.body || {};
      if (!registrationId) return res.status(400).json({ error: "registrationId is required" });
      const scoped = await findOrgRegistration(req, String(registrationId));
      if (!scoped) return res.status(404).json({ error: "Registration not found" });
      const { reg, ev } = scoped;
      if (!normalizeEventOtpSettings(ev.otpSettings).billing) {
        return res.json({ sent: false, otpRequired: false });
      }
      if ((ev.registrationFee || 0) <= 0) {
        return res.status(400).json({ error: "This event has no registration fee configured — OTP verification is not required" });
      }
      const [existingRedemption] = await db.select().from(eventBillingRedemptions).where(eq(eventBillingRedemptions.registrationId, reg.id)).limit(1);
      if (existingRedemption) {
        return res.status(409).json({ error: "Advance already redeemed for this ticket" });
      }
      // 60s cooldown so a fumbling staff member can't spam the customer.
      const [recent] = await db.select().from(eventBillingOtps)
        .where(and(eq(eventBillingOtps.registrationId, reg.id), gte(eventBillingOtps.createdAt, new Date(Date.now() - 60 * 1000))))
        .orderBy(desc(eventBillingOtps.createdAt)).limit(1);
      if (recent) {
        return res.status(429).json({ error: "OTP already sent — please wait a minute before requesting another" });
      }
      const code = generateOtpCode();
      await db.insert(eventBillingOtps).values({
        registrationId: reg.id,
        code,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      try {
        await sendWhatsAppOTP(reg.customerPhone, code, "billing verification");
      } catch (e) { console.error("[events] billing OTP WA failed:", e); }
      res.json({ success: true, sent: true });
    } catch (e) {
      console.error("[events] billing send-otp failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/events/billing/verify-otp", requirePermission("org.events.billing"), async (req: Request, res: Response) => {
    try {
      const { registrationId, code } = req.body || {};
      if (!registrationId || !code) return res.status(400).json({ error: "registrationId and code are required" });
      const scoped = await findOrgRegistration(req, String(registrationId));
      if (!scoped) return res.status(404).json({ error: "Registration not found" });
      const { reg, ev } = scoped;
      if (!normalizeEventOtpSettings(ev.otpSettings).billing) {
        return res.json({ verified: true, otpRequired: false });
      }
      const [otpRow] = await db.select().from(eventBillingOtps)
        .where(and(eq(eventBillingOtps.registrationId, reg.id), eq(eventBillingOtps.verified, false), gte(eventBillingOtps.expiresAt, new Date())))
        .orderBy(desc(eventBillingOtps.createdAt)).limit(1);
      if (!otpRow) {
        return res.status(400).json({ error: "No active OTP — please request a new one" });
      }
      if (otpRow.attempts >= 5) {
        return res.status(429).json({ error: "Too many incorrect attempts — please request a new OTP" });
      }
      if (String(code).trim() !== otpRow.code) {
        await db.update(eventBillingOtps).set({ attempts: otpRow.attempts + 1 }).where(eq(eventBillingOtps.id, otpRow.id));
        return res.status(400).json({ error: "Incorrect OTP" });
      }
      await db.update(eventBillingOtps).set({ verified: true }).where(eq(eventBillingOtps.id, otpRow.id));
      res.json({ success: true, verified: true });
    } catch (e) {
      console.error("[events] billing verify-otp failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/events/billing/redeem", requirePermission("org.events.billing"), async (req: Request, res: Response) => {
    try {
      const { registrationId, invoiceAmount } = req.body || {};
      const invoice = parseInt(String(invoiceAmount), 10);
      if (!registrationId || !Number.isFinite(invoice) || invoice < 0) {
        return res.status(400).json({ error: "registrationId and invoiceAmount (paise) are required" });
      }
      const scoped = await findOrgRegistration(req, String(registrationId));
      if (!scoped) return res.status(404).json({ error: "Registration not found" });
      const { reg, ev } = scoped;
      if (!["checked_in", "arrived", "exited", "feedback_submitted"].includes(reg.status)) {
        return res.status(409).json({ error: `Customer has not checked in yet (status: ${reg.status})` });
      }
      if ((ev.registrationFee || 0) > 0) {
        // Cash/counter payments bypass OTP — payment was verified in person
        let cashPaidAtCounter = false;
        if (reg.paymentId) {
          const [pmtRow] = await db.select({ paymentMethod: payments.paymentMethod })
            .from(payments).where(eq(payments.id, reg.paymentId)).limit(1);
          cashPaidAtCounter = pmtRow?.paymentMethod === "manual";
        }
        if (isEventBillingOtpRequired(ev, true, cashPaidAtCounter)) {
          const [otpRow] = await db.select().from(eventBillingOtps)
            .where(and(eq(eventBillingOtps.registrationId, reg.id), eq(eventBillingOtps.verified, true)))
            .limit(1);
          if (!otpRow) {
            return res.status(403).json({ error: "OTP verification required before redeeming the advance" });
          }
        }
      }
      const advance = reg.amountPaid || 0;
      const redeemed = Math.min(advance, invoice);
      const finalDue = Math.max(0, invoice - redeemed);

      // Guard: org owner sessions return "owner:<orgId>" which is NOT a valid
      // orgUsers UUID — inserting it breaks the FK on redeemedByUserId.
      // Resolve to null for owner callers (they have no orgUsers row).
      const rawCallerId = getRequestUserId(req);
      const redeemedByUserId = rawCallerId?.startsWith("owner:") ? null : rawCallerId;

      // Check for an existing redemption BEFORE inserting so we can return a
      // clean 409 only when the ticket is genuinely already redeemed, and let
      // other DB errors surface as 500 instead of a misleading "already redeemed".
      const [existingRedemption] = await db.select().from(eventBillingRedemptions)
        .where(eq(eventBillingRedemptions.registrationId, reg.id)).limit(1);
      if (existingRedemption) {
        return res.status(409).json({ error: "Advance already redeemed for this ticket", redemption: existingRedemption });
      }

      const [row] = await db.insert(eventBillingRedemptions).values({
        registrationId: reg.id,
        invoiceAmount: invoice,
        advanceRedeemed: redeemed,
        finalAmountDue: finalDue,
        redeemedByUserId,
      }).returning();
      await logStage(reg.id, "advance_redeemed", { invoice, redeemed, finalDue });

      // The approved template body already has "₹" hardcoded before {{2}}, so
      // pass the plain rupee amount (no currency symbol) as the variable.
      const advanceRupeesStr = String(Math.round(redeemed / 100));
      try {
        await sendEventTrigger(ev, reg, "billing", undefined, {
          advance_redeemed: advanceRupeesStr,
        });
      } catch (e) { console.error("[events] billing WA failed:", e); }
      return res.json({ success: true, redemption: row, registration: regShape(reg) });
    } catch (e) {
      console.error("[events] redeem failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Billing OTP override (staff with org.events.billing) ─────────────────
  // When a customer's phone is unavailable on event day (lost, switched off,
  // etc.) a billing staff member can override the OTP requirement. The
  // override is always logged — who did it, when, and why — providing a full
  // audit trail while keeping the billing queue moving.
  app.post("/api/dashboard/events/billing/override-redeem", requirePermission("org.events.billing"), async (req: Request, res: Response) => {
    try {
      const { registrationId, invoiceAmount, reason, notes } = req.body || {};
      const invoice = parseInt(String(invoiceAmount ?? ""), 10);
      if (!registrationId || !Number.isFinite(invoice) || invoice < 0 || !reason) {
        return res.status(400).json({ error: "registrationId, invoiceAmount (paise), and reason are required" });
      }
      const VALID_REASONS = ["lost_phone", "phone_off", "other"] as const;
      if (!VALID_REASONS.includes(String(reason) as any)) {
        return res.status(400).json({ error: "reason must be one of: lost_phone, phone_off, other" });
      }
      const scoped = await findOrgRegistration(req, String(registrationId));
      if (!scoped) return res.status(404).json({ error: "Registration not found" });
      const { reg, ev } = scoped;
      if (!["checked_in", "arrived", "exited", "feedback_submitted"].includes(reg.status)) {
        return res.status(409).json({ error: `Customer has not checked in yet (status: ${reg.status})` });
      }
      // Guard against double-redemption
      const [existingRedemption] = await db.select().from(eventBillingRedemptions)
        .where(eq(eventBillingRedemptions.registrationId, reg.id)).limit(1);
      if (existingRedemption) {
        return res.status(409).json({ error: "Advance already redeemed for this ticket", redemption: existingRedemption });
      }
      const rawCallerId = getRequestUserId(req);
      const callerId = rawCallerId?.startsWith("owner:") ? null : rawCallerId;
      // Log the override for audit trail
      await db.insert(eventBillingOverrides).values({
        registrationId: reg.id,
        overriddenBy: callerId,
        reason: String(reason),
        notes: notes ? String(notes).trim().slice(0, 500) : null,
      });
      // Execute redemption (identical to /redeem, minus the OTP check)
      const advance = reg.amountPaid || 0;
      const redeemed = Math.min(advance, invoice);
      const finalDue = Math.max(0, invoice - redeemed);
      const [row] = await db.insert(eventBillingRedemptions).values({
        registrationId: reg.id,
        invoiceAmount: invoice,
        advanceRedeemed: redeemed,
        finalAmountDue: finalDue,
        redeemedByUserId: callerId,
      }).returning();
      await logStage(reg.id, "advance_redeemed", { invoice, redeemed, finalDue, override: true, reason });
      const advanceRupeesStr = String(Math.round(redeemed / 100));
      try {
        await sendEventTrigger(ev, reg, "billing", undefined, { advance_redeemed: advanceRupeesStr });
      } catch (e) { console.error("[events] override billing WA failed:", e); }
      return res.json({ success: true, overrideLogged: true, redemption: row, registration: regShape(reg) });
    } catch (e) {
      console.error("[events] override-redeem failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============ PARKING (org.events.parking) ============

  app.post("/api/dashboard/events/:eventId/parking", requirePermission("org.events.parking"), async (req: Request, res: Response) => {
    try {
      const { action, value, logAction, vehicleRegNumber, registrationId, customerName, bookingId, customerPhone } = req.body || {};
      const ev = await assertEventOwnership(req, res, String(req.params.eventId));
      if (!ev) return;
      if (!ev.parkingEnabled) {
        return res.status(403).json({ error: "Parking is disabled for this event" });
      }

      const resolvedActionForCheck: "entry" | "exit" = logAction === "exit" ? "exit" : (action === "decrement" ? "exit" : "entry");
      // A direct parking request must not bypass the security scanner's
      // rejection of unused or voided printed inventory.
      if (bookingId) {
        const inventoryTicket = await findUnassignedPreprintedTicketForEvent(ev.id, parseScanValue(String(bookingId)));
        if (inventoryTicket) {
          return res.status(409).json({
            error: inventoryTicket.status === "voided"
              ? "This pre-printed ticket is voided. Do not allow entry."
              : "This pre-printed ticket has not been assigned to an attendee. Do not allow entry.",
            invalid: true,
            unassignedPreprinted: inventoryTicket.status === "available",
          });
        }
      }
      // Block re-entry for a customer who has already completed one full
      // park-and-exit cycle for this event — only enforceable when the scan
      // is tied to a known registration/booking (manual counter taps aren't).
      if (resolvedActionForCheck === "entry" && (registrationId || bookingId)) {
        const priorLogs = await db
          .select({ action: eventParkingLogs.action })
          .from(eventParkingLogs)
          .where(and(
            eq(eventParkingLogs.eventId, ev.id),
            registrationId
              ? eq(eventParkingLogs.registrationId, registrationId)
              : eq(eventParkingLogs.bookingId, bookingId),
          ));
        const priorEntries = priorLogs.filter((l) => l.action === "entry").length;
        const priorExits   = priorLogs.filter((l) => l.action === "exit").length;
        if (priorEntries > 0 && priorExits > 0) {
          return res.status(409).json({
            error: "This customer has already parked and exited once and cannot re-enter.",
            alreadyExited: true,
          });
        }
      }

      // Atomic read-modify-write in SQL so two concurrent counter taps can't
      // clobber each other (the classic lost-update race).
      let occupiedExpr;
      if (action === "increment") {
        const step = Math.max(1, parseInt(String(value || 1), 10) || 1);
        occupiedExpr = dsql`${events.parkingOccupied} + ${step}`;
      } else if (action === "decrement") {
        const step = Math.max(1, parseInt(String(value || 1), 10) || 1);
        occupiedExpr = dsql`${events.parkingOccupied} - ${step}`;
      } else if (action === "set") {
        occupiedExpr = dsql`${parseInt(String(value), 10) || 0}`;
      } else {
        return res.status(400).json({ error: "action must be increment, decrement, or set" });
      }
      const [updated] = await db.update(events)
        .set({
          parkingOccupied: dsql`GREATEST(0, LEAST(${events.parkingTotalSpaces}, ${occupiedExpr}))`,
          updatedAt: new Date(),
        })
        .where(eq(events.id, ev.id))
        .returning();

      // Insert a parking log entry for every counter action
      const resolvedAction: "entry" | "exit" = logAction === "exit" ? "exit" : (action === "decrement" ? "exit" : "entry");
      // getRequestUserId returns "owner:<orgId>" for org owners — not an orgUsers row.
      // createdByUserId is varchar(36) referencing orgUsers.id, so only store plain UUIDs.
      const rawUserId = getRequestUserId(req);
      const safeUserId = rawUserId && !rawUserId.startsWith("owner:") ? rawUserId : null;
      await db.insert(eventParkingLogs).values({
        eventId:         ev.id,
        registrationId:  registrationId || null,
        customerName:    customerName   || null,
        bookingId:       bookingId      || null,
        customerPhone:   customerPhone  || null,
        vehicleRegNumber: vehicleRegNumber ? String(vehicleRegNumber).trim().toUpperCase() : null,
        action:          resolvedAction,
        createdByUserId: safeUserId,
      });

      res.json({
        parkingTotalSpaces: updated.parkingTotalSpaces,
        parkingOccupied:    updated.parkingOccupied,
        available:          Math.max(0, updated.parkingTotalSpaces - updated.parkingOccupied),
      });
    } catch (e) {
      console.error("[events] parking failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/dashboard/events/:eventId/parking/logs", requirePermission("org.events.parking"), async (req: Request, res: Response) => {
    try {
      const ev = await assertEventOwnership(req, res, String(req.params.eventId));
      if (!ev) return;
      if (!ev.parkingEnabled) {
        return res.status(403).json({ error: "Parking is disabled for this event" });
      }
      const page   = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
      const search = String(req.query.search || "").trim();
      const limit  = 10;
      const offset = (page - 1) * limit;

      const whereConditions: any[] = [eq(eventParkingLogs.eventId, ev.id)];
      if (search) {
        const bookingIdConditions = getPartialTicketIdPatterns(search)
          .map((pattern) => ilike(eventParkingLogs.bookingId, pattern));
        whereConditions.push(
          or(
            ilike(eventParkingLogs.customerName,    `%${search}%`),
            or(...bookingIdConditions),
            ilike(eventParkingLogs.customerPhone,   `%${search}%`),
            ilike(eventParkingLogs.vehicleRegNumber, `%${search}%`),
          ) as any,
        );
      }

      const items = await db
        .select({
          id:              eventParkingLogs.id,
          action:          eventParkingLogs.action,
          customerName:    eventParkingLogs.customerName,
          bookingId:       eventParkingLogs.bookingId,
          customerPhone:   eventParkingLogs.customerPhone,
          vehicleRegNumber: eventParkingLogs.vehicleRegNumber,
          createdAt:       eventParkingLogs.createdAt,
        })
        .from(eventParkingLogs)
        .where(and(...whereConditions))
        .orderBy(desc(eventParkingLogs.createdAt))
        .limit(limit)
        .offset(offset);

      res.json({ items, page, limit });
    } catch (e) {
      console.error("[events] parking/logs failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============ SUPPORT (org.events.support) ============

  app.get("/api/dashboard/events/support/lookup", requireAnyEventsPerm(), async (req: Request, res: Response) => {
    try {
      const q = String((req.query.q as string) || "").trim();
      if (!q) return res.status(400).json({ error: "q is required" });
      const callerOrg = await getRequestOrganizationId(req);
      if (callerOrg === null) return res.status(401).json({ error: "Authentication required" });
      const exactScoped = await findOrgRegistration(req, parseScanValue(q));
      let rows: EventRegistration[] = exactScoped ? [exactScoped.reg] : [];
      if (!exactScoped) {
        const digits = q.replace(/\D/g, "");
        const searchCond = digits.length >= 6
          ? dsql`${eventRegistrations.customerPhone} LIKE ${"%" + digits + "%"}`
          : dsql`LOWER(${eventRegistrations.customerName}) LIKE ${"%" + q.toLowerCase() + "%"}`;
        // Fuzzy search is scoped to the caller's own org's events —
        // super-admin ("*") may search across all orgs.
        const joined = await db
          .select({ reg: eventRegistrations })
          .from(eventRegistrations)
          .innerJoin(events, eq(eventRegistrations.eventId, events.id))
          .where(callerOrg === "*" ? searchCond : and(eq(events.organizationId, callerOrg), searchCond))
          .orderBy(desc(eventRegistrations.createdAt))
          .limit(20);
        rows = joined.map((r) => r.reg);
      }
      const evIds = [...new Set(rows.map((r) => r.eventId))];
      const evRows = evIds.length ? await db.select().from(events).where(inArray(events.id, evIds)) : [];
      const evMap = new Map(evRows.map((e) => [e.id, e.name]));
      res.json({ results: rows.map((r) => ({ ...regShape(r), eventName: evMap.get(r.eventId) || "" })) });
    } catch (e) {
      console.error("[events] support lookup failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/events/support/resend-ticket", requireAnyEventsPerm(), async (req: Request, res: Response) => {
    try {
      const { registrationId } = req.body || {};
      const scoped = await findOrgRegistration(req, String(registrationId || ""));
      if (!scoped) return res.status(404).json({ error: "Registration not found" });
      const { reg, ev } = scoped;
      if (!reg.qrToken) return res.status(409).json({ error: "No ticket has been generated for this registration yet" });
      const base = getPublicBaseUrl();
      const ticketImageUrl = reg.ticketImageUrl || `${base}/event-ticket-image/${reg.qrToken}.png`;

      // Ensure the ticket image is rendered and cached before calling
      // sendEventTrigger — WhatsApp Cloud API checks the image URL at send
      // time (synchronously) and fails with 130472 if it gets a non-2xx.
      // We allow up to 25 s for the render; if it times out or fails we
      // proceed anyway so the text/template body is still delivered.
      try {
        const { getEventTicketImageCache, renderTicketImage, setEventTicketImageCache } = await import("./ticket-image");
        if (!getEventTicketImageCache(reg.qrToken)) {
          console.log(`[events] resend: rendering ticket image for ${reg.qrToken} …`);
          const png = await Promise.race<Buffer>([
            renderTicketImage(reg.qrToken),
            new Promise<Buffer>((_, reject) =>
              setTimeout(() => reject(new Error("render timeout")), 25_000),
            ),
          ]);
          setEventTicketImageCache(reg.qrToken, png);
          console.log(`[events] resend: ticket image cached (${png.length} bytes)`);
        }
      } catch (imgErr) {
        console.warn(
          "[events] resend: image render failed — sending WhatsApp without pre-cached image:",
          imgErr instanceof Error ? imgErr.message : imgErr,
        );
      }

      await sendEventTrigger(ev, reg, "ticket", ticketImageUrl);
      await logStage(reg.id, "ticket_resent", { by: getRequestUserId(req) });
      res.json({ success: true });
    } catch (e) {
      console.error("[events] resend failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Support: request OTP to authorise a batch of booking edits ───────────
  app.post("/api/dashboard/events/support/request-edit", requirePermission("org.events.support"), async (req: Request, res: Response) => {
    try {
      const { registrationId, edits } = req.body || {};
      const VALID_TYPES = ["edit_name", "edit_guests", "set_status", "cancel_billing", "edit_vehicle"];
      if (!registrationId || !Array.isArray(edits) || edits.length === 0) {
        return res.status(400).json({ error: "registrationId and edits array are required" });
      }
      for (const e of edits) {
        if (!VALID_TYPES.includes(e.editType)) {
          return res.status(400).json({ error: `Invalid editType: ${e.editType}` });
        }
      }
      const scoped = await findOrgRegistration(req, String(registrationId));
      if (!scoped) return res.status(404).json({ error: "Registration not found" });
      const { reg } = scoped;
      // 60s cooldown
      const [recent] = await db.select().from(eventSupportOtps)
        .where(and(
          eq(eventSupportOtps.registrationId, reg.id),
          gte(eventSupportOtps.createdAt, new Date(Date.now() - 60 * 1000)),
          eq(eventSupportOtps.verified, false),
        ))
        .orderBy(desc(eventSupportOtps.createdAt)).limit(1);
      if (recent) return res.status(429).json({ error: "OTP already sent — please wait a minute" });
      const code = generateOtpCode();
      await db.insert(eventSupportOtps).values({
        registrationId: reg.id,
        code,
        editType: "batch",
        editPayload: { edits },
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      try {
        await sendWhatsAppOTP(reg.customerPhone, code, "booking edit verification");
      } catch (e) { console.error("[events] support edit OTP WA failed:", e); }
      const phone = reg.customerPhone || "";
      const masked = phone.length >= 4 ? "×".repeat(phone.length - 4) + phone.slice(-4) : phone;
      res.json({ success: true, maskedPhone: masked });
    } catch (e) {
      console.error("[events] support request-edit failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Support: directly apply booking edits (no OTP) ────────────────────────
  // Support staff are trusted — edits are logged to eventStageLog for audit.
  app.post("/api/dashboard/events/support/apply-edit", requirePermission("org.events.support"), async (req: Request, res: Response) => {
    try {
      const { registrationId, edits } = req.body || {};
      const VALID_TYPES = ["edit_name", "edit_guests", "set_status", "cancel_billing", "edit_vehicle"];
      if (!registrationId || !Array.isArray(edits) || edits.length === 0) {
        return res.status(400).json({ error: "registrationId and edits array are required" });
      }
      for (const e of edits) {
        if (!VALID_TYPES.includes(e.editType)) {
          return res.status(400).json({ error: `Invalid editType: ${e.editType}` });
        }
      }
      const scoped = await findOrgRegistration(req, String(registrationId));
      if (!scoped) return res.status(404).json({ error: "Registration not found" });
      const { reg } = scoped;
      const by = getRequestUserId(req) || "support";

      async function applyEditDirect(editType: string, ep: any) {
        switch (editType) {
          case "edit_name": {
            const name = String(ep?.name || "").trim();
            if (!name) throw new Error("Name cannot be empty");
            await db.update(eventRegistrations).set({ customerName: name }).where(eq(eventRegistrations.id, reg.id));
            await logStage(reg.id, "support_edit", { field: "customerName", value: name, by });
            break;
          }
          case "edit_guests": {
            const count = parseInt(String(ep?.count), 10);
            if (!Number.isFinite(count) || count < 1 || count > 50) throw new Error("Invalid guest count");
            await db.update(eventRegistrations).set({ familyMembersCount: count - 1 }).where(eq(eventRegistrations.id, reg.id));
            await logStage(reg.id, "support_edit", { field: "guestCount", value: count, by });
            break;
          }
          case "set_status": {
            const ALLOWED = ["ticket_generated", "arrived", "checked_in", "exited"];
            const status = String(ep?.status || "");
            if (!ALLOWED.includes(status)) throw new Error("Invalid status");
            await db.update(eventRegistrations).set({ status: status as any }).where(eq(eventRegistrations.id, reg.id));
            await logStage(reg.id, "support_edit", { field: "status", value: status, by });
            break;
          }
          case "cancel_billing": {
            await db.delete(eventBillingRedemptions).where(eq(eventBillingRedemptions.registrationId, reg.id));
            await logStage(reg.id, "support_edit", { field: "billing", value: "cancelled", by });
            break;
          }
          case "edit_vehicle": {
            const vr = String(ep?.vehicleRegNumber || "").trim().toUpperCase();
            await db.update(eventParkingLogs)
              .set({ vehicleRegNumber: vr || null })
              .where(and(eq(eventParkingLogs.registrationId, reg.id), eq(eventParkingLogs.action, "entry")));
            await logStage(reg.id, "support_edit", { field: "vehicleRegNumber", value: vr, by });
            break;
          }
          default: throw new Error(`Unknown edit type: ${editType}`);
        }
      }

      for (const edit of edits) {
        await applyEditDirect(edit.editType, edit.editPayload);
      }
      const [updated] = await db.select().from(eventRegistrations).where(eq(eventRegistrations.id, reg.id)).limit(1);
      res.json({ success: true, registration: regShape(updated) });
    } catch (e: any) {
      console.error("[events] support apply-edit failed:", e);
      res.status(e?.message?.includes("cannot be empty") || e?.message?.includes("Invalid") ? 400 : 500)
        .json({ error: e?.message || "Internal server error" });
    }
  });

  // ── Support: verify OTP and apply all pending booking edits (legacy) ───────
  app.post("/api/dashboard/events/support/confirm-edit", requirePermission("org.events.support"), async (req: Request, res: Response) => {
    try {
      const { registrationId, code } = req.body || {};
      if (!registrationId || !code) return res.status(400).json({ error: "registrationId and code are required" });
      const scoped = await findOrgRegistration(req, String(registrationId));
      if (!scoped) return res.status(404).json({ error: "Registration not found" });
      const { reg } = scoped;
      const [otpRow] = await db.select().from(eventSupportOtps)
        .where(and(
          eq(eventSupportOtps.registrationId, reg.id),
          eq(eventSupportOtps.verified, false),
          gte(eventSupportOtps.expiresAt, new Date()),
        ))
        .orderBy(desc(eventSupportOtps.createdAt)).limit(1);
      if (!otpRow) return res.status(400).json({ error: "No active OTP — please request a new one" });
      if (otpRow.attempts >= 5) return res.status(429).json({ error: "Too many attempts — request a new OTP" });
      if (String(code).trim() !== otpRow.code) {
        await db.update(eventSupportOtps).set({ attempts: otpRow.attempts + 1 }).where(eq(eventSupportOtps.id, otpRow.id));
        return res.status(400).json({ error: "Incorrect OTP" });
      }
      await db.update(eventSupportOtps).set({ verified: true }).where(eq(eventSupportOtps.id, otpRow.id));
      const payload = (otpRow.editPayload as any) || {};
      // Support both new batch format and legacy single-edit format
      const edits: Array<{ editType: string; editPayload: any }> =
        payload.edits ?? [{ editType: otpRow.editType, editPayload: payload }];
      const by = getRequestUserId(req) || "support";

      async function applyEdit(editType: string, ep: any) {
        switch (editType) {
          case "edit_name": {
            const name = String(ep?.name || "").trim();
            if (!name) throw new Error("Name cannot be empty");
            await db.update(eventRegistrations).set({ customerName: name }).where(eq(eventRegistrations.id, reg.id));
            await logStage(reg.id, "support_edit", { field: "customerName", value: name, by });
            break;
          }
          case "edit_guests": {
            const count = parseInt(String(ep?.count), 10);
            if (!Number.isFinite(count) || count < 1 || count > 50) throw new Error("Invalid guest count");
            await db.update(eventRegistrations).set({ familyMembersCount: count - 1 }).where(eq(eventRegistrations.id, reg.id));
            await logStage(reg.id, "support_edit", { field: "guestCount", value: count, by });
            break;
          }
          case "set_status": {
            const ALLOWED = ["ticket_generated", "arrived", "checked_in", "exited"];
            const status = String(ep?.status || "");
            if (!ALLOWED.includes(status)) throw new Error("Invalid status");
            await db.update(eventRegistrations).set({ status: status as any }).where(eq(eventRegistrations.id, reg.id));
            await logStage(reg.id, "support_edit", { field: "status", value: status, by });
            break;
          }
          case "cancel_billing": {
            await db.delete(eventBillingRedemptions).where(eq(eventBillingRedemptions.registrationId, reg.id));
            await logStage(reg.id, "support_edit", { field: "billing", value: "cancelled", by });
            break;
          }
          case "edit_vehicle": {
            const vr = String(ep?.vehicleRegNumber || "").trim().toUpperCase();
            await db.update(eventParkingLogs)
              .set({ vehicleRegNumber: vr || null })
              .where(and(eq(eventParkingLogs.registrationId, reg.id), eq(eventParkingLogs.action, "entry")));
            await logStage(reg.id, "support_edit", { field: "vehicleRegNumber", value: vr, by });
            break;
          }
          default: throw new Error(`Unknown edit type: ${editType}`);
        }
      }

      for (const edit of edits) {
        await applyEdit(edit.editType, edit.editPayload);
      }
      const [updated] = await db.select().from(eventRegistrations).where(eq(eventRegistrations.id, reg.id)).limit(1);
      res.json({ success: true, registration: regShape(updated) });
    } catch (e: any) {
      console.error("[events] support confirm-edit failed:", e);
      res.status(e?.message?.includes("cannot be empty") || e?.message?.includes("Invalid") ? 400 : 500)
        .json({ error: e?.message || "Internal server error" });
    }
  });

  // Eagerly launch the Chromium browser singleton so it is warm before the
  // first registration arrives. Without this, the first ticket image render
  // races against Meta's image-fetch (which happens 1–5 s after the WhatsApp
  // template API call), and Chromium's cold-start (2–5 s) can lose that race,
  // causing the template to be delivered without an image.
  import("./ticket-image")
    .then(({ prewarmBrowser }) => prewarmBrowser())
    .catch((err) =>
      console.warn("[events] Chromium startup pre-warm failed:", err instanceof Error ? err.message : err),
    );
}

// ---------------------------------------------------------------
// Startup reconciliation — recover WhatsApp sends interrupted by restart
// ---------------------------------------------------------------

// On every server start, find registrations that were queued for WhatsApp
// delivery (`ticket_wa_pending` stage log exists) but where the send closure
// was killed by a restart before it completed (no `ticket_wa_sent` log).
// For each, attempt a re-send using the already-persisted Object Storage URL
// stored in ticketImageUrl; on success a `ticket_wa_sent` log is written.
//
// WHY `ticket_wa_pending` (not status = ticket_generated):
//   Registrations created before this feature was deployed have no
//   `ticket_wa_pending` log, so the reconciler never touches them — avoiding
//   the historical-resend regression where every old ticket_generated row
//   would be treated as interrupted.  Only rows explicitly marked as pending
//   by the current issueTicket code are eligible for reconciliation.
//
// Cursor-based pagination (ORDER BY id, id > cursor):
//   Each page advances past rows already seen in this run, so a failed send
//   (no ticket_wa_sent written) does not cause the same rows to be re-fetched
//   in subsequent pages.  Each row is attempted exactly once per startup;
//   remaining failures are naturally retried on the next restart.
//
// Runs as a fire-and-forget after a short delay so the HTTP server is fully
// up and ready to serve the image endpoint before any WhatsApp calls are made.
// Injectable send function type — matches sendEventTrigger's signature.
// Exposed so tests can inject a mock without module-level patching.
export type TicketSendFn = (ev: Event, reg: EventRegistration, trigger: string, imageUrl?: string) => Promise<boolean>;

// Injectable image-resolve function — given an EventRegistration, returns
// a durable public image URL (or null if the image cannot be produced).
// In production this renders+uploads via Playwright + Object Storage.
// Tests inject a deterministic stub to avoid browser dependencies.
export type TicketImageResolveFn = (reg: EventRegistration) => Promise<string | null>;

// Default production image resolver: if the registration already has an
// Object Storage URL use it directly; otherwise render the boarding-pass
// with Playwright, upload it, persist the URL, and return it.  Falls back
// to the local /event-ticket-image/ endpoint as a last resort.
async function resolveTicketImageUrl(reg: EventRegistration): Promise<string | null> {
  // Already persisted to Object Storage — no render needed.
  if (reg.ticketImageUrl && reg.ticketImageUrl.includes("/public-objects/")) {
    return reg.ticketImageUrl;
  }
  // Render, upload, persist.
  if (reg.qrToken) {
    try {
      const { renderTicketImage, setEventTicketImageCache } = await import("./ticket-image");
      const png = await renderTicketImage(reg.qrToken);
      setEventTicketImageCache(reg.qrToken, png);
      const base = getPublicBaseUrl();
      const oss = new ObjectStorageService();
      const relativePath = await oss.uploadPublicObject(png, `${reg.qrToken}.png`, "image/png", "event-tickets");
      const persistentUrl = `${base}${relativePath}`;
      await db
        .update(eventRegistrations)
        .set({ ticketImageUrl: persistentUrl, updatedAt: new Date() })
        .where(eq(eventRegistrations.id, reg.id));
      console.log(`[events] reconcile: image rendered and uploaded for reg ${reg.id}: ${persistentUrl}`);
      return persistentUrl;
    } catch (renderErr) {
      console.warn(`[events] reconcile: image render/upload failed for reg ${reg.id}:`, renderErr instanceof Error ? renderErr.message : renderErr);
      // Fall back to the dynamic endpoint — WhatsApp will attempt to fetch
      // it; a successful Playwright render at that point will still serve it.
      return `${getPublicBaseUrl()}/event-ticket-image/${reg.qrToken}.png`;
    }
  }
  return null;
}

export async function reconcileTicketWaSends(
  sendTriggerFn: TicketSendFn = sendEventTrigger,
  resolveImageFn: TicketImageResolveFn = resolveTicketImageUrl,
  leaseFn: DeliveryLeaseFn = withTicketWaLease,
): Promise<number> {
  // Returns the count of rows still pending (failed sends), so the caller
  // can schedule follow-up retries when > 0.
  const BATCH = 50;
  let cursor = ""; // UUID cursor — empty string sorts before all UUIDs
  let totalAttempted = 0;
  let totalSent = 0;
  let totalFailed = 0;

  try {
    while (true) {
      // Cursor-based page: each row is visited at most once per reconciliation
      // run regardless of send outcome — failed rows advance the cursor and are
      // retried on the next scheduled run.
      const cursorCond = cursor ? dsql`${eventRegistrations.id} > ${cursor}` : dsql`TRUE`;

      const batch = await db
        .select({
          id: eventRegistrations.id,
          eventId: eventRegistrations.eventId,
          qrToken: eventRegistrations.qrToken,
          ticketImageUrl: eventRegistrations.ticketImageUrl,
          customerPhone: eventRegistrations.customerPhone,
        })
        .from(eventRegistrations)
        .where(
          and(
            cursorCond,
            // Has a ticket_wa_pending log (only set by the current issueTicket
            // code — historical rows without it are never touched).
            dsql`EXISTS (
              SELECT 1 FROM ${eventStageLog} sl
              WHERE sl.registration_id = ${eventRegistrations.id}
                AND sl.stage = 'ticket_wa_pending'
            )`,
            // Does not yet have a ticket_wa_sent log.
            dsql`NOT EXISTS (
              SELECT 1 FROM ${eventStageLog} sl
              WHERE sl.registration_id = ${eventRegistrations.id}
                AND sl.stage = 'ticket_wa_sent'
            )`,
          ),
        )
        .orderBy(eventRegistrations.id)
        .limit(BATCH);

      if (batch.length === 0) break;

      console.log(`[events] reconcile: processing ${batch.length} pending ticket(s) (cursor=${cursor || "start"}) …`);

      for (const stub of batch) {
        totalAttempted++;
        try {
          const ev = await loadEventById(stub.eventId);
          if (!ev) {
            console.warn(`[events] reconcile: event ${stub.eventId} not found for reg ${stub.id} — marking terminal`);
            await db.insert(eventStageLog).values({
              registrationId: stub.id,
              stage: "ticket_wa_sent",
              metadata: { skipped: true, reason: "event_not_found" },
            }).catch(() => {});
            cursor = stub.id;
            continue;
          }
          const [reg] = await db
            .select()
            .from(eventRegistrations)
            .where(eq(eventRegistrations.id, stub.id))
            .limit(1);
          if (!reg) { cursor = stub.id; continue; }

          // Ensure the image is rendered, uploaded, and durable before sending.
          // This handles the case where the restart occurred before the image
          // was uploaded in the original fire-and-forget.  If the image cannot
          // be produced, fall back to a no-image text send path.
          const imageUrl = await resolveImageFn(reg);
          console.log(`[events] reconcile: attempting lease for reg ${reg.id} …`);
          // Acquire the delivery lease — prevents duplicate send if the
          // dispatcher fire-and-forget is still in flight for this registration.
          const leaseResult = await leaseFn(reg.id, async () => {
            // Re-check inside the lease: if the dispatcher wrote ticket_wa_sent
            // while we were resolving the image URL, skip the send.
            const [existing] = await db
              .select({ id: eventStageLog.id })
              .from(eventStageLog)
              .where(and(eq(eventStageLog.registrationId, reg.id), eq(eventStageLog.stage, "ticket_wa_sent")))
              .limit(1);
            if (existing) {
              console.log(`[events] reconcile: ticket_wa_sent already exists for reg ${reg.id} — skipping (dispatcher won)`);
              return "already_sent";
            }
            console.log(`[events] reconcile: sending WhatsApp for reg ${reg.id} (${reg.customerPhone}) imageUrl=${imageUrl ?? "none"} …`);
            const sent = await sendTriggerFn(ev, reg, "ticket", imageUrl ?? undefined);
            if (sent) {
              try {
                await db.insert(eventStageLog).values({
                  registrationId: reg.id,
                  stage: "ticket_wa_sent",
                  metadata: { url: imageUrl, reconciled: true },
                });
              } catch (sentErr) {
                console.error(`[events] reconcile: ticket_wa_sent insert failed for reg ${reg.id}:`, sentErr);
              }
              console.log(`[events] reconcile: delivered for reg ${reg.id}`);
              return "sent";
            } else {
              console.warn(`[events] reconcile: send returned false for reg ${reg.id} — will retry on next scheduled run`);
              return "failed";
            }
          });
          if (leaseResult === "sent" || leaseResult === "already_sent") {
            totalSent++;
          } else {
            // leaseResult === null (lease not acquired — dispatcher holds it)
            // or "failed" — count as pending for retry scheduling.
            totalFailed++;
          }
        } catch (err) {
          totalFailed++;
          console.error(`[events] reconcile: error for reg ${stub.id}:`, err instanceof Error ? err.message : err);
        }
        // Always advance cursor past this row, even on failure.
        cursor = stub.id;
      }

      // Advance cursor to the last row in the batch.
      cursor = batch[batch.length - 1].id;

      if (batch.length < BATCH) break;
    }

    if (totalAttempted > 0) {
      console.log(`[events] reconcile: done — ${totalSent} sent, ${totalFailed} failed of ${totalAttempted} attempted`);
    }
  } catch (err) {
    console.error("[events] reconcile: scan failed:", err instanceof Error ? err.message : err);
    // A scan-level error (DB connection failure, etc.) means we do not know
    // how many rows remain pending.  Return 1 so the scheduler treats this
    // run as a failure and schedules a retry rather than treating the queue
    // as drained.
    return Math.max(totalFailed, 1);
  }
  return totalFailed;
}

// Perpetual periodic scheduler for the reconciler.
// Runs an initial scan after `initialDelayMs` (allowing Chromium to pre-warm
// and image endpoints to become ready), then re-runs every `pollIntervalMs`
// for the entire lifetime of the process.
//
// WHY perpetual (not stop-on-empty):
//   If a ticket is issued after the startup scan, its dispatcher fire-and-
//   forget may fail (transient network, WhatsApp rate limit, etc.).  The
//   registration will remain in `ticket_wa_pending` state indefinitely unless
//   the reconciler scans again.  A fixed interval ensures stale pending rows
//   are always retried regardless of when they were created.
//
// Uses unref'd timers so the scheduler does not keep the process alive when
// everything else has shut down (e.g., during graceful shutdown).
export function startTicketWaReconciler(opts: {
  initialDelayMs?: number;
  pollIntervalMs?: number;
} = {}): void {
  const {
    initialDelayMs = 10_000,      // 10 s — Chromium pre-warm window
    pollIntervalMs = 5 * 60_000,  // 5 min between scans
  } = opts;

  let running = false; // prevent overlap when a scan takes longer than the interval

  const run = async () => {
    if (running) return;
    running = true;
    try {
      console.log(`[events] reconcile: starting scan …`);
      const failed = await reconcileTicketWaSends();
      if (failed > 0) {
        console.log(`[events] reconcile: ${failed} row(s) still pending — will retry at next poll`);
      }
    } finally {
      running = false;
    }
  };

  // Initial scan after startup delay.
  const startTimer = setTimeout(() => {
    run().catch((err) => console.error("[events] reconcile: initial scan error:", err));
    // Perpetual interval — runs for the lifetime of the process.
    const interval = setInterval(() => {
      run().catch((err) => console.error("[events] reconcile: periodic scan error:", err));
    }, pollIntervalMs);
    (interval as unknown as { unref?: () => void }).unref?.();
  }, initialDelayMs);
  (startTimer as unknown as { unref?: () => void }).unref?.();
}
