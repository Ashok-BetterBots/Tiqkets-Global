import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { getRequestUserId } from "./rbac";

// ============================================
// TYPES
// ============================================

interface DashboardClient {
  kind: "dashboard";
  id: string;
  res: Response;
  branchId: string;
  serviceId?: string;
  userId: string | null;
}

interface PlayerClient {
  kind: "player";
  id: string;
  res: Response;
  branchId: string;
  deviceId: string;
  language: string;
}

type AnnouncementClient = DashboardClient | PlayerClient;

interface AnnouncementEvent {
  type: "call" | "serve";
  ticketNumber: string;
  customerName: string;
  serviceName: string;
  deskName: string | null;
  tableNumber: string | null;
  queueMode: string;
  branchId: string;
  serviceId: string | null;
  stageName?: string | null;
}

const clients: AnnouncementClient[] = [];

// ============================================
// TEXT CONSTRUCTION
// ============================================

function digitsToArabic(input: string): string {
  const map: Record<string, string> = {
    "0": "٠", "1": "١", "2": "٢", "3": "٣", "4": "٤",
    "5": "٥", "6": "٦", "7": "٧", "8": "٨", "9": "٩",
  };
  return input.replace(/[0-9]/g, (d) => map[d] || d);
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key) => {
    return vars[key] != null ? String(vars[key]) : "";
  });
}

function buildEnglishVars(event: AnnouncementEvent): Record<string, string> {
  const name = event.customerName || "";
  return {
    ticketNumber: event.ticketNumber || "",
    customerName: name,
    customerNameTail: name ? `, ${name}` : "",
    desk: event.deskName || "the counter",
    table: event.tableNumber || "",
    stage: event.stageName || "",
    service: event.serviceName || "",
  };
}

function buildArabicVars(event: AnnouncementEvent): Record<string, string> {
  const name = event.customerName || "";
  return {
    ticketNumber: digitsToArabic(event.ticketNumber || ""),
    customerName: name,
    customerNameTail: name ? ` ${name}` : "",
    desk: event.deskName || "الكاونتر",
    table: digitsToArabic(event.tableNumber || ""),
    stage: event.stageName || "",
    service: event.serviceName || "",
  };
}

const FALLBACK_TEMPLATES: Record<string, { en: string; ar: string }> = {
  fifo: {
    en: "Ticket {ticketNumber}{customerNameTail}, please proceed to {desk}",
    ar: "التذكرة رقم {ticketNumber}{customerNameTail}، يرجى التوجه إلى {desk}",
  },
  selective: {
    en: "Ticket {ticketNumber}{customerNameTail}, please proceed to {desk}",
    ar: "التذكرة رقم {ticketNumber}{customerNameTail}، يرجى التوجه إلى {desk}",
  },
  checkin: {
    en: "Ticket {ticketNumber}{customerNameTail}, please proceed to {desk}",
    ar: "التذكرة رقم {ticketNumber}{customerNameTail}، يرجى التوجه إلى {desk}",
  },
  multistage: {
    en: "Ticket {ticketNumber}{customerNameTail}, please proceed to {desk} for {stage}",
    ar: "التذكرة رقم {ticketNumber}{customerNameTail}، يرجى التوجه إلى {desk} لـ {stage}",
  },
  dinein: {
    en: "Booking {ticketNumber}{customerNameTail}, please proceed to Table {table}",
    ar: "الحجز رقم {ticketNumber}{customerNameTail}، يرجى التوجه إلى الطاولة {table}",
  },
  takeaway: {
    en: "Order {ticketNumber}{customerNameTail}, please proceed to the counter",
    ar: "الطلب رقم {ticketNumber}{customerNameTail}، يرجى التوجه إلى الكاونتر",
  },
};

const NORMALIZE_MODE = (m: string): string => (m || "").replace(/_/g, "").toLowerCase();

// Cached settings — invalidated by upserts via the API. Cache for 30s as a
// simple safety net so changes propagate quickly without per-event DB hits.
let _settingsCache: { at: number; byMode: Map<string, { templateEn: string | null; templateAr: string | null; alertSoundUrl: string | null }> } | null = null;

async function loadNotificationSettings() {
  const now = Date.now();
  if (_settingsCache && now - _settingsCache.at < 30_000) return _settingsCache.byMode;
  try {
    const rows = await storage.listNotificationSettings();
    const byMode = new Map(rows.map((r) => [NORMALIZE_MODE(r.queueMode), {
      templateEn: r.templateEn,
      templateAr: r.templateAr,
      alertSoundUrl: r.alertSoundUrl,
    }]));
    _settingsCache = { at: now, byMode };
    return byMode;
  } catch {
    return new Map();
  }
}

export function invalidateNotificationSettingsCache() {
  _settingsCache = null;
}

function pickEnglishFallback(event: AnnouncementEvent): string {
  const mode = NORMALIZE_MODE(event.queueMode || "");
  const hasTable = !!(event.tableNumber && String(event.tableNumber).length > 0);
  const hasStage = !!(event.stageName && String(event.stageName).length > 0);
  if (event.type === "serve" && mode === "takeaway") {
    return "Order {ticketNumber}{customerNameTail}, your order is ready for pickup";
  }
  if (mode === "dinein") {
    return hasTable
      ? "Booking {ticketNumber}{customerNameTail}, please proceed to Table {table}"
      : "Booking {ticketNumber}{customerNameTail}, your table is ready";
  }
  if (mode === "multistage") {
    return hasStage
      ? "Ticket {ticketNumber}{customerNameTail}, please proceed to {desk} for {stage}"
      : "Ticket {ticketNumber}{customerNameTail}, please proceed to {desk}";
  }
  return FALLBACK_TEMPLATES[mode]?.en || FALLBACK_TEMPLATES.fifo.en;
}

function pickArabicFallback(event: AnnouncementEvent): string {
  const mode = NORMALIZE_MODE(event.queueMode || "");
  const hasTable = !!(event.tableNumber && String(event.tableNumber).length > 0);
  const hasStage = !!(event.stageName && String(event.stageName).length > 0);
  if (event.type === "serve" && mode === "takeaway") {
    return "الطلب رقم {ticketNumber}{customerNameTail}، طلبك جاهز للاستلام";
  }
  if (mode === "dinein") {
    return hasTable
      ? "الحجز رقم {ticketNumber}{customerNameTail}، يرجى التوجه إلى الطاولة {table}"
      : "الحجز رقم {ticketNumber}{customerNameTail}، طاولتك جاهزة";
  }
  if (mode === "multistage") {
    return hasStage
      ? "التذكرة رقم {ticketNumber}{customerNameTail}، يرجى التوجه إلى {desk} لـ {stage}"
      : "التذكرة رقم {ticketNumber}{customerNameTail}، يرجى التوجه إلى {desk}";
  }
  return FALLBACK_TEMPLATES[mode]?.ar || FALLBACK_TEMPLATES.fifo.ar;
}

function buildEnglishText(event: AnnouncementEvent, override?: string | null): string {
  const vars = buildEnglishVars(event);
  const template = override || pickEnglishFallback(event);
  return renderTemplate(template, vars);
}

function buildArabicText(event: AnnouncementEvent, override?: string | null): string {
  const vars = buildArabicVars(event);
  const template = override || pickArabicFallback(event);
  return renderTemplate(template, vars);
}

// ============================================
// BROADCAST
// ============================================

function isAnnouncementsEnabledForBranch(displaySettings: unknown): boolean {
  if (!displaySettings || typeof displaySettings !== "object") return false;
  const s = displaySettings as Record<string, any>;
  return s.announcementsEnabled === true;
}

function useDedicatedPlayerDevicesFor(displaySettings: unknown): boolean {
  if (!displaySettings || typeof displaySettings !== "object") return false;
  const s = displaySettings as Record<string, any>;
  return s.useDedicatedPlayerDevices === true;
}

export async function broadcastAnnouncement(event: AnnouncementEvent) {
  const settings = await loadNotificationSettings();
  const modeKey = NORMALIZE_MODE(event.queueMode || "");
  const override = settings.get(modeKey) || null;

  const enrichedBase = {
    ...event,
    spokenTextEn: buildEnglishText(event, override?.templateEn),
    spokenTextAr: buildArabicText(event, override?.templateAr),
    alertSoundUrl: override?.alertSoundUrl || null,
  };

  let branch: any = null;
  try {
    branch = await storage.getBranchById(event.branchId);
  } catch {
    branch = null;
  }
  if (!branch) return;

  // Master branch toggle. If the branch hasn't enabled announcements, do nothing.
  if (!isAnnouncementsEnabledForBranch(branch.displaySettings)) return;

  const announcerUserId: string | null = branch.announcerUserId || null;
  const useDedicated = useDedicatedPlayerDevicesFor(branch.displaySettings);

  // Dashboard channel: ONLY deliver to the chosen announcer user's session(s).
  // No announcer set => no dashboard fires (prevents overlap).
  // When dedicated player devices are in use, the dashboard channel is silenced
  // so a single source plays the audio.
  if (announcerUserId && !useDedicated) {
    const dashboardSubs = clients.filter(
      (c): c is DashboardClient =>
        c.kind === "dashboard" &&
        c.branchId === event.branchId &&
        c.userId === announcerUserId,
    );
    if (dashboardSubs.length > 0) {
      const data = JSON.stringify(enrichedBase);
      dashboardSubs.forEach((client) => {
        try {
          client.res.write(`data: ${data}\n\n`);
        } catch {
          removeClient(client.id);
        }
      });
    }
  }

  // Player devices: only fire when the per-branch advanced flag is on.
  if (!useDedicated) return;

  const playerSubs = clients.filter(
    (c): c is PlayerClient => c.kind === "player" && c.branchId === event.branchId,
  );
  if (playerSubs.length === 0) return;

  playerSubs.forEach((client) => {
    const payload = {
      ...enrichedBase,
      language: client.language,
      spokenText: client.language === "ar" ? enrichedBase.spokenTextAr : enrichedBase.spokenTextEn,
    };
    try {
      client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      removeClient(client.id);
    }
  });
}

function removeClient(id: string) {
  const idx = clients.findIndex((c) => c.id === id);
  if (idx !== -1) clients.splice(idx, 1);
}

// ============================================
// ROUTES
// ============================================

export function registerAnnouncementRoutes(app: Express) {
  // Existing dashboard SSE (used by dashboard tab) — unchanged auth/contract.
  app.get("/api/announcements/stream", async (req: Request, res: Response) => {
    const branchId = req.query.branchId as string;
    const orgId = req.query.orgId as string;
    if (!branchId || !orgId) {
      return res.status(400).json({ error: "branchId and orgId required" });
    }

    const branch = await storage.getBranchById(branchId);
    if (!branch || branch.organizationId !== orgId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    res.write(": connected\n\n");

    const userId = getRequestUserId(req);
    const clientId = `dash-${branchId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const client: DashboardClient = {
      kind: "dashboard",
      id: clientId,
      res,
      branchId,
      serviceId: (req.query.serviceId as string) || undefined,
      userId,
    };
    clients.push(client);

    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        clearInterval(heartbeat);
        removeClient(clientId);
      }
    }, 30000);

    req.on("close", () => {
      clearInterval(heartbeat);
      removeClient(clientId);
    });
  });

  // New player SSE — auth via deviceToken (the token IS the credential).
  app.get("/api/announcement-player/stream", async (req: Request, res: Response) => {
    const token = (req.query.token as string) || "";
    if (!token) {
      return res.status(400).json({ error: "token required" });
    }
    const device = await storage.getAnnouncementDeviceByToken(token);
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }
    if (!device.isActive) {
      return res.status(403).json({ error: "Device disabled" });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`: connected device=${device.id}\n\n`);
    res.write(`event: ready\ndata: ${JSON.stringify({ deviceId: device.id, deviceName: device.deviceName, language: device.language, branchId: device.branchId })}\n\n`);

    storage.touchAnnouncementDeviceLastSeen(device.id).catch(() => undefined);

    const clientId = `play-${device.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const client: PlayerClient = {
      kind: "player",
      id: clientId,
      res,
      branchId: device.branchId,
      deviceId: device.id,
      language: device.language || "en",
    };
    clients.push(client);

    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
        storage.touchAnnouncementDeviceLastSeen(device.id).catch(() => undefined);
      } catch {
        clearInterval(heartbeat);
        removeClient(clientId);
      }
    }, 30000);

    req.on("close", () => {
      clearInterval(heartbeat);
      removeClient(clientId);
    });
  });
}
