import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import path from "path";
import fs from "fs";

interface QueueEntry {
  id: string;
  branchId: string;
  serviceId: string;
  ticketNumber: string;
  customerName: string;
  customerPhone: string;
  customFields: Record<string, string>;
  position: number;
  status: "waiting" | "called" | "serving" | "completed" | "no-show";
  joinedAt: string;
}

interface Branch {
  id: string;
  name: string;
  organizationName: string;
  services: Array<{
    id: string;
    name: string;
    avgWaitTime: number;
    inputFields: Array<{
      id: string;
      label: string;
      type: string;
      required: boolean;
      options?: string[];
    }>;
  }>;
}

const mockBranches: Record<string, Branch> = {
  "branch-main": {
    id: "branch-main",
    name: "Main Branch - Downtown",
    organizationName: "Test Company",
    services: [
      {
        id: "service-1",
        name: "General Consultation",
        avgWaitTime: 15,
        inputFields: [
          { id: "reason", label: "Reason for Visit", type: "select", required: true, options: ["New Account", "Inquiry", "Complaint", "Other"] }
        ]
      },
      {
        id: "service-2",
        name: "Document Processing",
        avgWaitTime: 20,
        inputFields: [
          { id: "docType", label: "Document Type", type: "select", required: true, options: ["ID Renewal", "Certificate", "License", "Permit"] },
          { id: "notes", label: "Additional Notes", type: "textarea", required: false }
        ]
      }
    ]
  },
  "branch-north": {
    id: "branch-north",
    name: "North Branch - Marina",
    organizationName: "Test Company",
    services: [
      {
        id: "service-3",
        name: "Walk-in Appointments",
        avgWaitTime: 10,
        inputFields: []
      }
    ]
  }
};

const queueStore: QueueEntry[] = [];
let ticketCounter = 100;

function generateTicketNumber(): string {
  ticketCounter++;
  return `T${ticketCounter}`;
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/join/:branchId", (req: Request, res: Response) => {
    const branchId = req.params.branchId as string;
    const branch = mockBranches[branchId];
    
    if (!branch) {
      return res.status(404).json({ error: "Branch not found" });
    }
    
    const servicesWithQueueInfo = branch.services.map((service: Branch["services"][0]) => {
      const currentQueue = queueStore.filter(
        q => q.branchId === branchId && q.serviceId === service.id && q.status === "waiting"
      ).length;
      
      return {
        ...service,
        currentQueue
      };
    });
    
    res.json({
      branchId: branch.id,
      branchName: branch.name,
      organizationName: branch.organizationName,
      services: servicesWithQueueInfo
    });
  });
  
  app.post("/api/join/:branchId", (req: Request, res: Response) => {
    const branchId = req.params.branchId as string;
    const { serviceId, customerName, customerPhone, customFields } = req.body;
    
    const branch = mockBranches[branchId];
    if (!branch) {
      return res.status(404).json({ error: "Branch not found" });
    }
    
    const service = branch.services.find((s: Branch["services"][0]) => s.id === serviceId);
    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }
    
    const waitingInQueue = queueStore.filter(
      q => q.branchId === branchId && q.serviceId === serviceId && q.status === "waiting"
    );
    
    const position = waitingInQueue.length + 1;
    const estimatedWait = position * service.avgWaitTime;
    
    const entry: QueueEntry = {
      id: generateId(),
      branchId,
      serviceId,
      ticketNumber: generateTicketNumber(),
      customerName,
      customerPhone,
      customFields: customFields || {},
      position,
      status: "waiting",
      joinedAt: new Date().toISOString()
    };
    
    queueStore.push(entry);
    
    res.json({
      success: true,
      ticketNumber: entry.ticketNumber,
      position,
      totalInQueue: position,
      estimatedWait,
      queueId: entry.id
    });
  });
  
  app.get("/join/:branchId", (req: Request, res: Response) => {
    const templatePath = path.join(__dirname, "templates", "join-queue.html");
    
    if (fs.existsSync(templatePath)) {
      res.sendFile(templatePath);
    } else {
      res.status(404).send("Join queue page not found");
    }
  });
  
  app.get("/api/queue/:branchId", (req: Request, res: Response) => {
    const branchId = req.params.branchId as string;
    const serviceId = req.query.serviceId as string | undefined;
    
    let queue = queueStore.filter(q => q.branchId === branchId);
    
    if (serviceId) {
      queue = queue.filter(q => q.serviceId === serviceId);
    }
    
    res.json({
      queue: queue.sort((a, b) => a.position - b.position)
    });
  });

  const httpServer = createServer(app);

  return httpServer;
}
