import type { Express, Request, Response } from "express";
import path from "path";
import fs from "fs";
import { db } from "./db";
import { tickets, branches, services } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getRequestOrganizationId, publicRoute, requirePermission } from "./rbac";

const templatesDir = path.resolve(process.cwd(), "server", "templates");

function getPublicBaseUrl(): string {
  const domain = process.env.APP_DOMAIN || process.env.EXPO_PUBLIC_DOMAIN || process.env.REPLIT_DEV_DOMAIN;
  if (domain) {
    const proto = domain.startsWith("localhost") ? "http" : "https";
    return `${proto}://${domain}`;
  }
  return `http://127.0.0.1:${process.env.PORT || 5000}`;
}

async function findTicketByToken(qrToken: string) {
  const [row] = await db
    .select({
      id: tickets.id,
      ticketNumber: tickets.ticketNumber,
      customerName: tickets.customerName,
      customerPhone: tickets.customerPhone,
      serviceName: tickets.serviceName,
      serviceId: tickets.serviceId,
      branchId: tickets.branchId,
      status: tickets.status,
      position: tickets.position,
      estimatedWaitTime: tickets.estimatedWaitTime,
      joinedAt: tickets.joinedAt,
      calledAt: tickets.calledAt,
      servedAt: tickets.servedAt,
      completedAt: tickets.completedAt,
      formData: tickets.formData,
      tableNumber: tickets.tableNumber,
      qrToken: tickets.qrToken,
      branchName: branches.name,
      queueMode: branches.queueMode,
      organizationId: branches.organizationId,
    })
    .from(tickets)
    .leftJoin(branches, eq(tickets.branchId, branches.id))
    .where(eq(tickets.qrToken, qrToken))
    .limit(1);
  return row || null;
}

function getStatusLabel(status: string, mode: string): string {
  if (status === "waiting") {
    if (mode === "dinein" || mode === "dine_in") return "Waiting for table";
    if (mode === "checkin" || mode === "check_in") return "Awaiting check-in";
    if (mode === "takeaway") return "Order received";
    return "Waiting";
  }
  if (status === "called") {
    if (mode === "dinein" || mode === "dine_in") return "Table ready";
    if (mode === "checkin" || mode === "check_in") return "Please approach reception";
    return "It's your turn";
  }
  if (status === "serving") {
    if (mode === "dinein" || mode === "dine_in") return "Seated";
    if (mode === "checkin" || mode === "check_in") return "Checked in";
    return "In service";
  }
  if (status === "completed") return "Completed";
  if (status === "no_show") return "Missed";
  return "Cancelled";
}

function getScanResult(ticket: NonNullable<Awaited<ReturnType<typeof findTicketByToken>>>) {
  const mode = ticket.queueMode || "fifo";
  const status = ticket.status;
  const pos = ticket.position || 0;

  const terminal = ["completed", "no_show", "cancelled"];
  if (terminal.includes(status)) {
    return {
      isTheirTurn: false,
      statusLabel: status === "completed" ? "ALREADY SERVED" : status === "no_show" ? "NO SHOW" : "CANCELLED",
      statusColor: "gray",
      suggestedAction: null as string | null,
      actionLabel: null as string | null,
      waitMessage: null as string | null,
    };
  }

  if (status === "called") {
    const action = (mode === "dinein" || mode === "dine_in") ? "arrive" :
      (mode === "checkin" || mode === "check_in") ? "arrive" : "serve";
    const label = (mode === "dinein" || mode === "dine_in") ? "Seat Customer" :
      (mode === "checkin" || mode === "check_in") ? "Mark Arrived" : "Serve Customer";
    return {
      isTheirTurn: true,
      statusLabel: "IT'S THEIR TURN",
      statusColor: "green",
      suggestedAction: action,
      actionLabel: label,
      waitMessage: null,
    };
  }

  if (status === "serving") {
    const action = (mode === "takeaway") ? "complete" : "complete";
    const label = (mode === "takeaway") ? "Confirm Pickup" : "Mark Complete";
    return {
      isTheirTurn: true,
      statusLabel: "IN SERVICE",
      statusColor: "blue",
      suggestedAction: action,
      actionLabel: label,
      waitMessage: null,
    };
  }

  if (status === "waiting") {
    if (mode === "dinein" || mode === "dine_in") {
      return {
        isTheirTurn: pos <= 2,
        statusLabel: pos <= 1 ? "NEXT TABLE UP" : "PLEASE WAIT",
        statusColor: pos <= 1 ? "green" : "amber",
        suggestedAction: "arrive",
        actionLabel: "Seat Table Now",
        waitMessage: pos > 1 ? `Queue position: ${pos}` : null,
      };
    }
    if (mode === "checkin" || mode === "check_in") {
      return {
        isTheirTurn: true,
        statusLabel: "AWAITING CHECK-IN",
        statusColor: "blue",
        suggestedAction: "arrive",
        actionLabel: "Mark Arrived",
        waitMessage: null,
      };
    }
    if (mode === "takeaway") {
      return {
        isTheirTurn: false,
        statusLabel: "ORDER IN QUEUE",
        statusColor: "amber",
        suggestedAction: "serve",
        actionLabel: "Order Ready for Pickup",
        waitMessage: `Queue position: ${pos}`,
      };
    }
    if (pos <= 1) {
      return {
        isTheirTurn: true,
        statusLabel: "NEXT UP",
        statusColor: "green",
        suggestedAction: "call",
        actionLabel: "Call Customer",
        waitMessage: null,
      };
    }
    const wait = ticket.estimatedWaitTime || 0;
    return {
      isTheirTurn: false,
      statusLabel: "PLEASE WAIT",
      statusColor: "amber",
      suggestedAction: null,
      actionLabel: null,
      waitMessage: `Position ${pos}${wait > 0 ? ` · ~${wait} min` : ""}`,
    };
  }

  return {
    isTheirTurn: false,
    statusLabel: "UNKNOWN",
    statusColor: "gray",
    suggestedAction: null,
    actionLabel: null,
    waitMessage: null,
  };
}

export function registerQueueTicketRoutes(app: Express) {

  // ── Public: ticket web page ──────────────────────────────────────────────
  app.get("/queue-ticket/:qrToken", publicRoute("queue ticket web page"), (_req: Request, res: Response) => {
    const p = path.join(templatesDir, "queue-ticket.html");
    if (fs.existsSync(p)) res.sendFile(p);
    else res.status(404).send("Ticket page not found");
  });

  // ── Public: QR code PNG ──────────────────────────────────────────────────
  app.get("/queue-qr/:token.png", publicRoute("queue QR code image"), async (req: Request, res: Response) => {
    try {
      const token = String(req.params.token || "").toLowerCase();
      const ticket = await findTicketByToken(token);
      if (!ticket) return res.status(404).send("Not found");

      const QRCode = (await import("qrcode")).default;
      const base = getPublicBaseUrl();
      const png = await QRCode.toBuffer(`${base}/queue-ticket/${ticket.qrToken}`, {
        type: "png", width: 480, margin: 1, errorCorrectionLevel: "M",
        color: { dark: "#2d2419", light: "#ffffff" },
      });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(png);
    } catch (e) {
      console.error("[queue-ticket] QR render failed:", e);
      res.status(500).send("QR failed");
    }
  });

  // ── Public: ticket JSON (for live page polling) ──────────────────────────
  app.get("/api/queue-ticket/:qrToken", publicRoute("queue ticket data"), async (req: Request, res: Response) => {
    try {
      const token = String(req.params.qrToken || "");
      const ticket = await findTicketByToken(token);
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });

      res.setHeader("Cache-Control", "no-store");
      res.json({
        ticketNumber: ticket.ticketNumber,
        customerName: ticket.customerName,
        serviceName: ticket.serviceName,
        branchName: ticket.branchName,
        queueMode: ticket.queueMode || "fifo",
        status: ticket.status,
        position: ticket.position,
        estimatedWait: ticket.estimatedWaitTime,
        joinedAt: ticket.joinedAt,
        calledAt: ticket.calledAt,
        tableNumber: ticket.tableNumber,
        formData: ticket.formData,
      });
    } catch (e) {
      console.error("[queue-ticket] JSON error:", e);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // ── Public: designed ticket image (Playwright screenshot for WhatsApp) ───
  app.get("/queue-ticket-image/:token.png", publicRoute("queue ticket image for WhatsApp"), async (req: Request, res: Response) => {
    try {
      const token = String(req.params.token || "").toLowerCase();
      const ticket = await findTicketByToken(token);
      if (!ticket) return res.status(404).send("Not found");

      const { renderQueueTicketImage } = await import("./ticket-image");
      const png = await renderQueueTicketImage(ticket.qrToken!);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store");
      res.send(png);
    } catch (e) {
      console.error("[queue-ticket] image render failed:", e);
      res.status(500).send("Image render failed");
    }
  });

  // ── Org: staff scan endpoint ─────────────────────────────────────────────
  app.post("/api/dashboard/queue/scan", requirePermission("org.queue.call_next"), async (req: Request, res: Response) => {
    try {
      const orgId = await getRequestOrganizationId(req);
      if (!orgId) return res.status(401).json({ error: "Unauthorized" });

      const { qrToken } = req.body as { qrToken?: string };
      if (!qrToken || typeof qrToken !== "string") {
        return res.status(400).json({ valid: false, message: "qrToken is required" });
      }

      const ticket = await findTicketByToken(qrToken.trim().toLowerCase());

      if (!ticket) {
        return res.status(404).json({ valid: false, message: "Ticket not found. Please scan a valid TIQKETS QR code." });
      }

      if (ticket.organizationId !== orgId) {
        return res.status(403).json({ valid: false, message: "This ticket does not belong to your organization." });
      }

      const scanResult = getScanResult(ticket);
      const mode = ticket.queueMode || "fifo";

      return res.json({
        valid: true,
        ...scanResult,
        statusText: getStatusLabel(ticket.status, mode),
        ticket: {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          customerName: ticket.customerName || "Guest",
          serviceName: ticket.serviceName || "Service",
          branchName: ticket.branchName || "Branch",
          queueMode: mode,
          status: ticket.status,
          position: ticket.position,
          estimatedWait: ticket.estimatedWaitTime || 0,
          joinedAt: ticket.joinedAt,
          tableNumber: ticket.tableNumber,
          formData: ticket.formData,
        },
      });
    } catch (e) {
      console.error("[queue/scan] error:", e);
      res.status(500).json({ valid: false, message: "Server error" });
    }
  });
}
