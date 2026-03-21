import type { Express, Request, Response } from "express";
import { storage } from "./storage";

interface AnnouncementClient {
  id: string;
  res: Response;
  branchId: string;
  serviceId?: string;
}

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

export function broadcastAnnouncement(event: AnnouncementEvent) {
  const data = JSON.stringify(event);
  const matchingClients = clients.filter(c => {
    if (c.branchId !== event.branchId) return false;
    return true;
  });

  matchingClients.forEach(client => {
    try {
      client.res.write(`data: ${data}\n\n`);
    } catch (e) {
      removeClient(client.id);
    }
  });
}

function removeClient(id: string) {
  const idx = clients.findIndex(c => c.id === id);
  if (idx !== -1) clients.splice(idx, 1);
}

export function registerAnnouncementRoutes(app: Express) {
  app.get("/api/announcements/stream", async (req: Request, res: Response) => {
    const branchId = req.query.branchId as string;
    const orgId = req.query.orgId as string;
    if (!branchId || !orgId) {
      return res.status(400).json({ error: "branchId and orgId required" });
    }

    const branch = await storage.getBranchById(branchId);
    if (!branch || branch.orgId !== orgId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    res.write(": connected\n\n");

    const clientId = `${branchId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const client: AnnouncementClient = {
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
}
