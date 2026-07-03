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
import { db } from "./db";
import { and, desc, eq, gte, inArray, isNull, lt, ne, or, sql as dsql } from "drizzle-orm";
import {
  events,
  eventRegistrations,
  eventStageLog,
  eventFeedback,
  eventBillingRedemptions,
  branches,
  payments,
  type Event,
  type EventRegistration,
} from "@shared/schema";
import {
  requirePermission,
  publicRoute,
  getRequestUserId,
  getPermissionsForUser,
  isSuperAdminRequest,
  assertOrgOwnership,
  assertBranchOwnership,
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
import { renderWaMessage, type WaVars } from "./wa-templates";
import { sendWhatsAppMessage, sendWhatsAppImage } from "./whatsapp";
import { getPublicBaseUrl } from "./mailer";

const templatesDir = path.resolve(process.cwd(), "server", "templates");

// Registration rows stuck in `registration_started` (payment never
// completed) stop holding slot capacity after this many minutes.
const PENDING_HOLD_MINUTES = 30;

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function makeBookingId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return `EVT-${s}`;
}

function makeQrToken(): string {
  return crypto.randomBytes(20).toString("hex");
}

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
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
  try {
    const [h, m] = timeStr.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const hh = h % 12 === 0 ? 12 : h % 12;
    return `${hh}:${String(m).padStart(2, "0")} ${ampm}`;
  } catch {
    return timeStr;
  }
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

// Build the list of slot times ("HH:MM") for an event day.
export function buildSlotTimes(ev: Event): string[] {
  const [sh, sm] = ev.operatingHoursStart.split(":").map(Number);
  const [eh, em] = ev.operatingHoursEnd.split(":").map(Number);
  const startMin = sh * 60 + (sm || 0);
  const endMin = eh * 60 + (em || 0);
  const dur = Math.max(5, ev.slotDurationMinutes || 30);
  const out: string[] = [];
  for (let t = startMin; t + dur <= endMin; t += dur) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return out;
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

const CAPACITY_STATUSES_SQL = dsql`(${eventRegistrations.status} <> 'registration_started' OR ${eventRegistrations.createdAt} > NOW() - INTERVAL '${dsql.raw(String(PENDING_HOLD_MINUTES))} minutes')`;

// guests per registration = 1 + familyMembersCount
async function slotUsage(eventId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({
      slotDate: eventRegistrations.slotDate,
      slotTime: eventRegistrations.slotTime,
      guests: dsql<number>`SUM(1 + ${eventRegistrations.familyMembersCount})`,
    })
    .from(eventRegistrations)
    .where(and(eq(eventRegistrations.eventId, eventId), CAPACITY_STATUSES_SQL))
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

// Resolve the WhatsApp body for an events trigger: organizer per-event
// template override → super-admin override / shared default.
export async function renderEventMessage(ev: Event, trigger: string, vars: WaVars): Promise<string> {
  const custom = (ev.messageTemplates || {})[trigger];
  if (custom && custom.trim()) {
    return custom.replace(/\{\{\s*([a-z_0-9]+)\s*\}\}/gi, (_m, k) => {
      const v = vars[k];
      return v === undefined || v === null ? "" : String(v);
    });
  }
  return renderWaMessage("events", trigger, "en", vars);
}

export function eventVars(ev: Event, reg: EventRegistration): WaVars {
  const base = getPublicBaseUrl();
  return {
    customer_name: reg.customerName,
    event_name: ev.name,
    booking_id: reg.bookingId,
    slot_date: formatSlotDate(reg.slotDate),
    slot_time: formatSlotTime(reg.slotTime),
    venue: ev.venue || "",
    family_count: 1 + (reg.familyMembersCount || 0),
    amount_paid: formatPaise(reg.amountPaid || 0),
    support_contact: ev.supportContact || "",
    feedback_link: `${base}/event-ticket/${reg.qrToken}#feedback`,
    maps_link: ev.googleMapsLink || "",
  };
}

// Generate the ticket (bookingId + qrToken + QR image URL), persist it,
// send the WhatsApp boarding pass. Idempotent per registration.
async function issueTicket(ev: Event, reg: EventRegistration): Promise<EventRegistration> {
  if (reg.status === "registration_started" || reg.status === "payment_completed") {
    const bookingId = reg.bookingId || makeBookingId();
    const qrToken = reg.qrToken || makeQrToken();
    const base = getPublicBaseUrl();
    const ticketImageUrl = `${base}/event-qr/${qrToken}.png`;
    const [updated] = await db
      .update(eventRegistrations)
      .set({ bookingId, qrToken, ticketImageUrl, status: "ticket_generated", updatedAt: new Date() })
      .where(eq(eventRegistrations.id, reg.id))
      .returning();
    reg = updated;
    await logStage(reg.id, "ticket_generated", { bookingId });
    try {
      const caption = await renderEventMessage(ev, "ticket", eventVars(ev, reg));
      const sent = await sendWhatsAppImage(reg.customerPhone, ticketImageUrl, caption);
      if (!sent) await sendWhatsAppMessage(reg.customerPhone, `${caption}\n\nYour ticket: ${base}/event-ticket/${qrToken}`);
      else await sendWhatsAppMessage(reg.customerPhone, `View your boarding pass any time: ${base}/event-ticket/${qrToken}`);
    } catch (e) {
      console.error("[events] ticket WhatsApp send failed:", e);
    }
  }
  return reg;
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
    registrationFee: ev.registrationFee,
    termsAndConditions: ev.termsAndConditions,
    faqs: ev.faqs,
    supportContact: ev.supportContact,
    bannerUrl: ev.bannerUrl,
    logoUrl: ev.logoUrl,
    galleryUrls: ev.galleryUrls,
    venueMapUrl: ev.venueMapUrl,
    status: ev.status,
  };
}

function regShape(r: EventRegistration) {
  return {
    id: r.id,
    bookingId: r.bookingId,
    qrToken: r.qrToken,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    customerEmail: r.customerEmail,
    familyMembersCount: r.familyMembersCount,
    slotDate: r.slotDate,
    slotTime: r.slotTime,
    status: r.status,
    amountPaid: r.amountPaid,
    ticketImageUrl: r.ticketImageUrl,
    arrivedAt: r.arrivedAt,
    checkedInAt: r.checkedInAt,
    exitedAt: r.exitedAt,
    visitDurationMinutes: r.visitDurationMinutes,
    invalidScanAttempts: r.invalidScanAttempts,
    duplicateEntryAttempts: r.duplicateEntryAttempts,
    createdAt: r.createdAt,
  };
}

async function findRegistrationByAny(idOrCode: string): Promise<EventRegistration | null> {
  const v = (idOrCode || "").trim();
  if (!v) return null;
  const rows = await db
    .select()
    .from(eventRegistrations)
    .where(or(
      eq(eventRegistrations.qrToken, v.toLowerCase()),
      eq(eventRegistrations.bookingId, v.toUpperCase()),
      eq(eventRegistrations.id, v),
    ))
    .limit(1);
  return rows[0] || null;
}

// Public-route lookup: qrToken ONLY. Booking IDs (EVT-XXXXXX) are short and
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

export function registerEventsRoutes(app: Express) {
  // ============ CUSTOMER (PUBLIC) ============

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

  app.get("/api/event/:branchId", publicRoute("public event landing data"), async (req: Request, res: Response) => {
    try {
      const ev = await loadEventForBranch(String(req.params.branchId), { publishedOnly: true });
      if (!ev) return res.status(404).json({ error: "No active event for this branch" });
      const [branch] = await db.select().from(branches).where(eq(branches.id, ev.branchId)).limit(1);
      const usage = await slotUsage(ev.id);
      const dates = buildEventDates(ev);
      const times = buildSlotTimes(ev);
      const tz = branch?.timezone || "Asia/Kolkata";
      const now = Date.now();
      const slots = dates.map((date) => ({
        date,
        label: formatSlotDate(date),
        times: times.map((time) => {
          const used = usage[`${date}|${time}`] || 0;
          const capacity = (ev.slotCapacityOverrides || {})[`${date}|${time}`] ?? ev.maxCapacityPerSlot;
          const startUtc = zonedTimeToUtc(date, time, tz).getTime();
          return {
            time,
            label: formatSlotTime(time),
            capacity,
            used,
            available: Math.max(0, capacity - used),
            past: startUtc < now,
          };
        }),
      }));
      res.json({
        event: publicEventShape(ev),
        branchName: branch?.name || "",
        organizationId: ev.organizationId,
        razorpayKeyId: process.env.RAZORPAY_KEY_ID || null,
        slots,
      });
    } catch (e) {
      console.error("[events] public event fetch failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/event/:branchId/register", publicRoute("customer event registration"), async (req: Request, res: Response) => {
    try {
      const ev = await loadEventForBranch(String(req.params.branchId), { publishedOnly: true });
      if (!ev) return res.status(404).json({ error: "No active event for this branch" });
      if (ev.status === "paused") {
        return res.status(403).json({ error: "Registrations are temporarily paused for this event. Please check back soon.", paused: true });
      }
      const { customerName, customerPhone, customerEmail, familyMembersCount, slotDate, slotTime } = req.body || {};
      const name = String(customerName || "").trim();
      const phone = String(customerPhone || "").replace(/[^0-9+]/g, "");
      const fam = Math.max(0, Math.min(20, parseInt(String(familyMembersCount ?? 0), 10) || 0));
      if (!name || name.length < 2) return res.status(400).json({ error: "Name is required" });
      if (!phone || phone.replace(/\D/g, "").length < 10) return res.status(400).json({ error: "A valid WhatsApp number is required" });
      const dates = buildEventDates(ev);
      const times = buildSlotTimes(ev);
      if (!dates.includes(slotDate) || !times.includes(slotTime)) {
        return res.status(400).json({ error: "Invalid slot selection" });
      }
      // Capacity check + insert inside one transaction, serialized per event
      // via a row lock on the event, so two concurrent registrations can't
      // both pass the check and oversell the slot.
      const guests = 1 + fam;
      const result = await db.transaction(async (tx) => {
        await tx.execute(dsql`SELECT id FROM events WHERE id = ${ev.id} FOR UPDATE`);
        const [row] = await tx
          .select({ used: dsql<number>`COALESCE(SUM(1 + ${eventRegistrations.familyMembersCount}), 0)` })
          .from(eventRegistrations)
          .where(and(
            eq(eventRegistrations.eventId, ev.id),
            eq(eventRegistrations.slotDate, slotDate),
            eq(eventRegistrations.slotTime, slotTime),
            CAPACITY_STATUSES_SQL,
          ));
        const used = Number(row?.used) || 0;
        const slotCap = (ev.slotCapacityOverrides || {})[`${slotDate}|${slotTime}`] ?? ev.maxCapacityPerSlot;
        if (used + guests > slotCap) {
          return { full: true as const, available: Math.max(0, slotCap - used) };
        }
        const [inserted] = await tx.insert(eventRegistrations).values({
          eventId: ev.id,
          customerName: name,
          customerPhone: phone,
          customerEmail: customerEmail ? String(customerEmail).trim() : null,
          familyMembersCount: fam,
          slotDate,
          slotTime,
          status: "registration_started",
          amountPaid: 0,
        }).returning();
        return { full: false as const, reg: inserted };
      });
      if (result.full) {
        return res.status(409).json({ error: "This slot is full. Please pick another slot.", available: result.available });
      }
      const reg = result.reg;
      const fee = ev.registrationFee || 0;
      await logStage(reg.id, "registration_started", { slotDate, slotTime, guests });

      if (fee <= 0) {
        // Free event — issue the ticket immediately.
        const done = await issueTicket(ev, { ...reg, amountPaid: 0 });
        return res.json({ registration: regShape(done), payment: null });
      }

      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keyId || !keySecret) {
        return res.status(500).json({ error: "Payments are not configured for this event" });
      }
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
      const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
        body: JSON.stringify({
          amount: fee,
          currency: "INR",
          receipt: `evt_${reg.id.slice(0, 12)}_${Date.now()}`,
          notes: { type: "event_registration", registrationId: reg.id, eventId: ev.id },
        }),
      });
      if (!orderRes.ok) {
        console.error("[events] Razorpay order failed:", await orderRes.text());
        return res.status(500).json({ error: "Failed to start payment" });
      }
      const order = await orderRes.json();
      res.json({
        registration: regShape(reg),
        payment: { orderId: order.id, amount: fee, currency: "INR", keyId },
      });
    } catch (e) {
      console.error("[events] register failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/event/verify-payment", publicRoute("customer payment verification (signature-checked)"), async (req: Request, res: Response) => {
    try {
      const { registrationId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
      if (!registrationId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ error: "Missing payment fields" });
      }
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keySecret) return res.status(500).json({ error: "Payments not configured" });
      const expected = crypto
        .createHmac("sha256", keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");
      if (expected !== razorpay_signature) {
        return res.status(400).json({ error: "Payment signature verification failed" });
      }
      const [reg] = await db.select().from(eventRegistrations).where(eq(eventRegistrations.id, registrationId)).limit(1);
      if (!reg) return res.status(404).json({ error: "Registration not found" });
      const [ev] = await db.select().from(events).where(eq(events.id, reg.eventId)).limit(1);
      if (!ev) return res.status(404).json({ error: "Event not found" });

      if (reg.status !== "registration_started") {
        // Already processed — idempotent success.
        return res.json({ registration: regShape(reg) });
      }

      // Confirm with Razorpay that the order is actually paid & amount matches.
      const keyId = process.env.RAZORPAY_KEY_ID!;
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
      const orderRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpay_order_id}`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!orderRes.ok) return res.status(500).json({ error: "Could not confirm payment with Razorpay" });
      const order = await orderRes.json();
      if (order.status !== "paid") return res.status(400).json({ error: "Payment not completed" });
      if (String(order.notes?.registrationId || "") !== reg.id) {
        return res.status(400).json({ error: "Payment does not belong to this registration" });
      }
      if (Number(order.amount) !== (ev.registrationFee || 0)) {
        return res.status(400).json({ error: "Payment amount mismatch" });
      }

      // Persist a payments row (org-scoped, matches existing conventions:
      // captured = paid).
      let paymentRowId: string | null = null;
      try {
        const [p] = await db.insert(payments).values({
          organizationId: ev.organizationId,
          amount: ev.registrationFee || 0,
          currency: "INR",
          status: "captured",
          razorpayPaymentId: razorpay_payment_id,
          razorpayOrderId: razorpay_order_id,
          razorpaySignature: razorpay_signature,
          description: `Event registration — ${ev.name}`,
          paidAt: new Date(),
        }).returning();
        paymentRowId = p?.id || null;
      } catch (e) {
        console.error("[events] payment row insert failed (continuing):", e);
      }

      const [paid] = await db
        .update(eventRegistrations)
        .set({ status: "payment_completed", amountPaid: ev.registrationFee || 0, paymentId: paymentRowId, updatedAt: new Date() })
        .where(and(eq(eventRegistrations.id, reg.id), eq(eventRegistrations.status, "registration_started")))
        .returning();
      if (!paid) {
        const [current] = await db.select().from(eventRegistrations).where(eq(eventRegistrations.id, reg.id)).limit(1);
        return res.json({ registration: regShape(current) });
      }
      await logStage(reg.id, "payment_completed", { razorpay_payment_id, amount: ev.registrationFee });
      const done = await issueTicket(ev, paid);
      res.json({ registration: regShape(done) });
    } catch (e) {
      console.error("[events] verify payment failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/event/ticket/:qrToken", publicRoute("public boarding-pass data (unguessable token)"), async (req: Request, res: Response) => {
    try {
      const reg = await findRegistrationByToken(String(req.params.qrToken || ""));
      if (!reg) return res.status(404).json({ error: "Ticket not found" });
      const [ev] = await db.select().from(events).where(eq(events.id, reg.eventId)).limit(1);
      if (!ev) return res.status(404).json({ error: "Event not found" });
      const [fb] = await db.select().from(eventFeedback).where(eq(eventFeedback.registrationId, reg.id)).limit(1);
      res.json({
        registration: regShape(reg),
        event: publicEventShape(ev),
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
      const fileName = `event_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const uploadDir = path.resolve(process.cwd(), "server/uploads/events");
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
      fs.writeFileSync(path.join(uploadDir, fileName), data, "base64");
      res.json({ url: `/uploads/events/${fileName}` });
    } catch (e) {
      console.error("[events] image upload failed:", e);
      res.status(500).json({ error: "Failed to upload image" });
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
        registrationFee: Math.max(0, parseInt(String(b.registrationFee || 0), 10) || 0),
        termsAndConditions: b.termsAndConditions || null,
        faqs: Array.isArray(b.faqs) ? b.faqs : [],
        supportContact: b.supportContact || null,
        bannerUrl: b.bannerUrl || null,
        logoUrl: b.logoUrl || null,
        galleryUrls: Array.isArray(b.galleryUrls) ? b.galleryUrls : [],
        venueMapUrl: b.venueMapUrl || null,
        messageTemplates: b.messageTemplates && typeof b.messageTemplates === "object" ? b.messageTemplates : {},
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
      const strFields = ["name", "description", "venue", "googleMapsLink", "operatingHoursStart", "operatingHoursEnd", "termsAndConditions", "supportContact", "bannerUrl", "logoUrl", "venueMapUrl"] as const;
      for (const f of strFields) if (f in b) patch[f] = b[f] === "" ? null : b[f];
      if ("name" in patch && !patch.name) delete patch.name;
      if ("operatingHoursStart" in patch && !patch.operatingHoursStart) patch.operatingHoursStart = "09:00";
      if ("operatingHoursEnd" in patch && !patch.operatingHoursEnd) patch.operatingHoursEnd = "21:00";
      if (b.startDate) patch.startDate = new Date(b.startDate);
      if (b.endDate) patch.endDate = new Date(b.endDate);
      if (b.slotDurationMinutes !== undefined) patch.slotDurationMinutes = Math.max(5, parseInt(String(b.slotDurationMinutes), 10) || 30);
      if (b.maxCapacityPerSlot !== undefined) patch.maxCapacityPerSlot = Math.max(1, parseInt(String(b.maxCapacityPerSlot), 10) || 50);
      if (b.registrationFee !== undefined) patch.registrationFee = Math.max(0, parseInt(String(b.registrationFee), 10) || 0);
      if (Array.isArray(b.faqs)) patch.faqs = b.faqs;
      if (Array.isArray(b.galleryUrls)) patch.galleryUrls = b.galleryUrls;
      if (b.messageTemplates && typeof b.messageTemplates === "object") patch.messageTemplates = b.messageTemplates;
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
      if (status === "published") {
        // Only one live (published or paused) event per branch at a time.
        await db.update(events)
          .set({ status: "ended", updatedAt: new Date() })
          .where(and(eq(events.branchId, ev.branchId), inArray(events.status, ["published", "paused"]), ne(events.id, ev.id)));
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
      const conds = [eq(eventRegistrations.eventId, String(req.params.eventId))];
      if (status) conds.push(inArray(eventRegistrations.status, status.split(",")));
      if (slotDate) conds.push(eq(eventRegistrations.slotDate, slotDate));
      let rows = await db
        .select()
        .from(eventRegistrations)
        .where(and(...conds))
        .orderBy(desc(eventRegistrations.createdAt))
        .limit(1000);
      if (q) {
        const needle = q.toLowerCase();
        rows = rows.filter((r) =>
          r.customerName.toLowerCase().includes(needle) ||
          r.customerPhone.includes(needle) ||
          (r.bookingId || "").toLowerCase().includes(needle));
      }
      res.json({ registrations: rows.map(regShape) });
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
      const regs = await db.select().from(eventRegistrations).where(eq(eventRegistrations.eventId, ev.id));
      const byStatus: Record<string, number> = {};
      let insideGuests = 0, expectedGuests = 0, arrivedGuests = 0, exitedGuests = 0;
      let revenue = 0, durations: number[] = [];
      for (const r of regs) {
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        const g = 1 + (r.familyMembersCount || 0);
        if (r.status === "checked_in") insideGuests += g;
        if (["ticket_generated", "payment_completed"].includes(r.status)) expectedGuests += g;
        if (r.status === "arrived") arrivedGuests += g;
        if (["exited", "feedback_submitted"].includes(r.status)) exitedGuests += g;
        revenue += r.amountPaid || 0;
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
        })
        .from(eventBillingRedemptions)
        .innerJoin(eventRegistrations, eq(eventBillingRedemptions.registrationId, eventRegistrations.id))
        .where(eq(eventRegistrations.eventId, ev.id));
      const usage = await slotUsage(ev.id);
      res.json({
        event: { id: ev.id, name: ev.name, status: ev.status, parkingTotalSpaces: ev.parkingTotalSpaces, parkingOccupied: ev.parkingOccupied },
        totals: {
          registrations: regs.length,
          byStatus,
          insideGuests,
          expectedGuests,
          arrivedGuests,
          exitedGuests,
          advanceRevenue: revenue,
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
  app.get("/api/dashboard/events/registration/:registrationId/log", requirePermission("org.events.support"), async (req: Request, res: Response) => {
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

  app.post("/api/dashboard/events/scan", requirePermission("org.events.security"), async (req: Request, res: Response) => {
    try {
      const { value, action } = req.body || {};
      if (!value || !["arrive", "checkin", "exit"].includes(action)) {
        return res.status(400).json({ error: "value and action (arrive|checkin|exit) are required" });
      }
      const token = parseScanValue(String(value));
      const scoped = await findOrgRegistration(req, token);
      if (!scoped) {
        return res.status(404).json({ error: "Invalid ticket — no matching registration", invalid: true });
      }
      const { reg, ev } = scoped;

      const g = 1 + (reg.familyMembersCount || 0);
      const now = new Date();

      // Per-action transition config. The UPDATE itself is conditional on the
      // current status (WHERE status IN validFrom), so two concurrent scans of
      // the same ticket can't both succeed — the loser gets 0 rows and is
      // re-classified as duplicate/invalid from the fresh row.
      const transitions: Record<string, {
        validFrom: string[];
        duplicateWhen: string[];
        set: (r: EventRegistration) => Record<string, unknown>;
        stage: string;
        waTrigger: string;
        invalidMsg: (s: string) => string;
      }> = {
        arrive: {
          validFrom: ["ticket_generated", "payment_completed"],
          duplicateWhen: ["arrived", "checked_in", "exited", "feedback_submitted"],
          set: () => ({ status: "arrived", arrivedAt: now, updatedAt: now }),
          stage: "arrived",
          waTrigger: "arrived",
          invalidMsg: (s) => `Ticket is not valid for arrival (status: ${s})`,
        },
        checkin: {
          validFrom: ["arrived", "ticket_generated", "payment_completed"],
          duplicateWhen: ["checked_in", "exited", "feedback_submitted"],
          set: (r) => ({ status: "checked_in", checkedInAt: now, arrivedAt: r.arrivedAt || now, updatedAt: now }),
          stage: "checked_in",
          waTrigger: "checked_in",
          invalidMsg: (s) => `Ticket is not valid for check-in (status: ${s})`,
        },
        exit: {
          validFrom: ["checked_in"],
          duplicateWhen: ["exited", "feedback_submitted"],
          set: (r) => ({
            status: "exited",
            exitedAt: now,
            visitDurationMinutes: r.checkedInAt ? Math.max(0, Math.round((now.getTime() - new Date(r.checkedInAt).getTime()) / 60000)) : null,
            updatedAt: now,
          }),
          stage: "exited",
          waTrigger: "thank_you_feedback",
          invalidMsg: (s) => `Ticket is not currently checked in (status: ${s})`,
        },
      };
      const t = transitions[action as string];

      const rejectScan = async (current: EventRegistration) => {
        const isDup = t.duplicateWhen.includes(current.status);
        await db.update(eventRegistrations)
          .set(isDup
            ? { duplicateEntryAttempts: (current.duplicateEntryAttempts || 0) + 1, updatedAt: now }
            : { invalidScanAttempts: (current.invalidScanAttempts || 0) + 1, updatedAt: now })
          .where(eq(eventRegistrations.id, current.id));
        await logStage(current.id, isDup ? "duplicate_scan" : "invalid_scan", { action, status: current.status });
        return res.status(409).json({
          error: isDup ? `Already ${current.status.replace(/_/g, " ")}` : t.invalidMsg(current.status),
          ...(isDup ? { duplicate: true } : {}),
          ...(ev.status === "paused" ? { eventPaused: true } : {}),
          registration: regShape(current),
          eventName: ev.name,
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
        ...(action === "exit" ? { durationMin: updated.visitDurationMinutes } : {}),
      });
      try {
        const msg = await renderEventMessage(ev, t.waTrigger, eventVars(ev, updated));
        if (msg) await sendWhatsAppMessage(updated.customerPhone, msg);
      } catch (e) { console.error(`[events] ${action} WA failed:`, e); }
      // Paused events still admit already-ticketed guests, but the console
      // shows a clear notice so staff know registrations are paused.
      return res.json({ success: true, action, registration: regShape(updated), eventName: ev.name, guests: g, ...(ev.status === "paused" ? { eventPaused: true } : {}) });
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
      res.json({
        registration: regShape(reg),
        eventName: ev.name,
        advanceAvailable: redemption ? 0 : (reg.amountPaid || 0),
        redemption: redemption || null,
      });
    } catch (e) {
      console.error("[events] billing lookup failed:", e);
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
      const { reg } = scoped;
      if (!["checked_in", "arrived", "exited", "feedback_submitted"].includes(reg.status)) {
        return res.status(409).json({ error: `Customer has not checked in yet (status: ${reg.status})` });
      }
      const advance = reg.amountPaid || 0;
      const redeemed = Math.min(advance, invoice);
      const finalDue = Math.max(0, invoice - redeemed);
      try {
        const [row] = await db.insert(eventBillingRedemptions).values({
          registrationId: reg.id,
          invoiceAmount: invoice,
          advanceRedeemed: redeemed,
          finalAmountDue: finalDue,
          redeemedByUserId: getRequestUserId(req),
        }).returning();
        await logStage(reg.id, "advance_redeemed", { invoice, redeemed, finalDue });
        return res.json({ success: true, redemption: row, registration: regShape(reg) });
      } catch {
        const [existing] = await db.select().from(eventBillingRedemptions).where(eq(eventBillingRedemptions.registrationId, reg.id)).limit(1);
        return res.status(409).json({ error: "Advance already redeemed for this ticket", redemption: existing || null });
      }
    } catch (e) {
      console.error("[events] redeem failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============ PARKING (org.events.parking) ============

  app.post("/api/dashboard/events/:eventId/parking", requirePermission("org.events.parking"), async (req: Request, res: Response) => {
    try {
      const { action, value } = req.body || {};
      const ev = await assertEventOwnership(req, res, String(req.params.eventId));
      if (!ev) return;
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
      res.json({
        parkingTotalSpaces: updated.parkingTotalSpaces,
        parkingOccupied: updated.parkingOccupied,
        available: Math.max(0, updated.parkingTotalSpaces - updated.parkingOccupied),
      });
    } catch (e) {
      console.error("[events] parking failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============ SUPPORT (org.events.support) ============

  app.get("/api/dashboard/events/support/lookup", requirePermission("org.events.support"), async (req: Request, res: Response) => {
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

  app.post("/api/dashboard/events/support/resend-ticket", requirePermission("org.events.support"), async (req: Request, res: Response) => {
    try {
      const { registrationId } = req.body || {};
      const scoped = await findOrgRegistration(req, String(registrationId || ""));
      if (!scoped) return res.status(404).json({ error: "Registration not found" });
      const { reg, ev } = scoped;
      if (!reg.qrToken) return res.status(409).json({ error: "No ticket has been generated for this registration yet" });
      const base = getPublicBaseUrl();
      const caption = await renderEventMessage(ev, "ticket", eventVars(ev, reg));
      const sent = await sendWhatsAppImage(reg.customerPhone, `${base}/event-qr/${reg.qrToken}.png`, caption);
      if (!sent) await sendWhatsAppMessage(reg.customerPhone, `${caption}\n\nYour ticket: ${base}/event-ticket/${reg.qrToken}`);
      await logStage(reg.id, "ticket_resent", { by: getRequestUserId(req) });
      res.json({ success: true });
    } catch (e) {
      console.error("[events] resend failed:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
