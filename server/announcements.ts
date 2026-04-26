import type { Express, Request, Response } from "express";
import { storage } from "./storage";

// ============================================
// TYPES
// ============================================

interface DashboardClient {
  kind: "dashboard";
  id: string;
  res: Response;
  branchId: string;
  serviceId?: string;
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

function buildEnglishText(event: AnnouncementEvent): string {
  const num = event.ticketNumber || "";
  const name = event.customerName || "";
  const desk = event.deskName || "";
  const table = event.tableNumber || "";
  const stage = event.stageName || "";
  const mode = (event.queueMode || "").replace(/_/g, "").toLowerCase();

  const tail = name ? `, ${name}` : "";

  if (event.type === "serve" && mode === "takeaway") {
    return `Order ${num}${tail}, your order is ready for pickup`;
  }
  if (mode === "dinein") {
    return table
      ? `Booking ${num}${tail}, please proceed to Table ${table}`
      : `Booking ${num}${tail}, your table is ready`;
  }
  if (mode === "takeaway") {
    return `Order ${num}${tail}, please proceed to the counter`;
  }
  if (mode === "multistage") {
    const dest = stage ? `${desk} for ${stage}` : desk;
    return `Ticket ${num}${tail}, please proceed to ${dest || "the counter"}`;
  }
  return `Ticket ${num}${tail}, please proceed to ${desk || "the counter"}`;
}

function buildArabicText(event: AnnouncementEvent): string {
  const num = digitsToArabic(event.ticketNumber || "");
  const name = event.customerName || "";
  const desk = event.deskName || "";
  const table = digitsToArabic(event.tableNumber || "");
  const mode = (event.queueMode || "").replace(/_/g, "").toLowerCase();
  const counterWord = "الكاونتر";

  const tail = name ? ` ${name}` : "";

  if (event.type === "serve" && mode === "takeaway") {
    return `الطلب رقم ${num}${tail}، طلبك جاهز للاستلام`;
  }
  if (mode === "dinein") {
    return table
      ? `الحجز رقم ${num}${tail}، يرجى التوجه إلى الطاولة ${table}`
      : `الحجز رقم ${num}${tail}، طاولتك جاهزة`;
  }
  if (mode === "takeaway") {
    return `الطلب رقم ${num}${tail}، يرجى التوجه إلى ${counterWord}`;
  }
  return `التذكرة رقم ${num}${tail}، يرجى التوجه إلى ${desk ? desk : counterWord}`;
}

// ============================================
// BROADCAST
// ============================================

function isAnnouncementsEnabledForBranch(displaySettings: unknown): boolean {
  if (!displaySettings || typeof displaySettings !== "object") return false;
  const s = displaySettings as Record<string, any>;
  return s.announcementsEnabled === true;
}

export async function broadcastAnnouncement(event: AnnouncementEvent) {
  const enrichedBase = {
    ...event,
    spokenTextEn: buildEnglishText(event),
    spokenTextAr: buildArabicText(event),
  };

  // Always notify dashboard subscribers (legacy behavior — unaffected by branch toggle).
  const dashboardSubs = clients.filter(
    (c): c is DashboardClient => c.kind === "dashboard" && c.branchId === event.branchId,
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

  // Player devices: only fire if branch has the feature enabled.
  const playerSubs = clients.filter(
    (c): c is PlayerClient => c.kind === "player" && c.branchId === event.branchId,
  );
  if (playerSubs.length === 0) return;

  let enabled = false;
  try {
    const branch = await storage.getBranchById(event.branchId);
    enabled = isAnnouncementsEnabledForBranch(branch?.displaySettings);
  } catch {
    enabled = false;
  }
  if (!enabled) return;

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

    const clientId = `dash-${branchId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const client: DashboardClient = {
      kind: "dashboard",
      id: clientId,
      res,
      branchId,
      serviceId: (req.query.serviceId as string) || undefined,
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
