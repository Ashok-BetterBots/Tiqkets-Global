import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { registerBillingRoutes } from "./billing-routes";

export async function registerRoutes(app: Express): Promise<Server> {
  registerBillingRoutes(app);
  app.get("/api/join/:branchId", async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      const branch = await storage.getBranchById(branchId);
      
      if (!branch) {
        return res.status(404).json({ error: "Branch not found" });
      }
      
      const org = await storage.getOrganizationById(branch.organizationId);
      const branchServices = await storage.getServicesByBranch(branchId);
      const activeTickets = await storage.getActiveTicketsByBranch(branchId);
      
      const servicesWithQueueInfo = branchServices.filter(s => s.isActive).map(service => {
        const currentQueue = activeTickets.filter(
          t => t.serviceId === service.id && t.status === "waiting"
        ).length;
        
        return {
          id: service.id,
          name: service.name,
          avgWaitTime: service.averageWaitTime,
          inputFields: service.inputFields || [],
          currentQueue,
          requiresInPersonRegistration: service.requiresInPersonRegistration,
          inPersonPerimeterMeters: service.inPersonPerimeterMeters
        };
      });
      
      res.json({
        branchId: branch.id,
        branchName: branch.name,
        organizationName: org?.name || "Organization",
        latitude: branch.latitude ? parseFloat(branch.latitude) : null,
        longitude: branch.longitude ? parseFloat(branch.longitude) : null,
        services: servicesWithQueueInfo
      });
    } catch (error) {
      console.error("Error getting branch info:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/join/:branchId", async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      const { serviceId, customerName, customerPhone, customerEmail, customFields } = req.body;
      
      const branch = await storage.getBranchById(branchId);
      if (!branch) {
        return res.status(404).json({ error: "Branch not found" });
      }
      
      const service = await storage.getServiceById(serviceId);
      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }
      
      const source = req.body.source || "qr";
      const priority = req.body.priority || "normal";
      const formData = req.body.formData || customFields || {};

      const ticket = await storage.createTicket({
        branchId,
        serviceId,
        customerName,
        customerPhone,
        customerEmail,
        serviceName: service.name,
        formData,
        source,
        status: "waiting",
        priority,
        estimatedWaitTime: service.averageWaitTime * (await storage.getNextQueuePosition(branchId, serviceId)),
      });
      
      const position = ticket.position;
      const estimatedWait = position * service.averageWaitTime;
      
      res.json({
        success: true,
        ticket: {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          position,
          estimatedWaitMinutes: estimatedWait,
          joinedAt: ticket.joinedAt || new Date().toISOString(),
        },
        ticketNumber: ticket.ticketNumber,
        position,
        totalInQueue: position,
        estimatedWait,
        queueId: ticket.id
      });
    } catch (error) {
      console.error("Error joining queue:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/join/:branchId", (req: Request, res: Response) => {
    const templatePath = path.join(__dirname, "templates", "join-queue.html");
    
    if (fs.existsSync(templatePath)) {
      res.sendFile(templatePath);
    } else {
      res.status(404).send("Join queue page not found");
    }
  });
  
  app.get("/dashboard", (req: Request, res: Response) => {
    const dashboardPath = path.join(__dirname, "templates", "dashboard.html");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.sendFile(dashboardPath);
  });

  app.get("/manifest.json", (req: Request, res: Response) => {
    const manifestPath = path.join(__dirname, "templates", "manifest.json");
    res.setHeader("Content-Type", "application/json");
    res.sendFile(manifestPath);
  });
  
  app.get("/sw.js", (req: Request, res: Response) => {
    const swPath = path.join(__dirname, "templates", "sw.js");
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Service-Worker-Allowed", "/");
    res.sendFile(swPath);
  });
  
  app.get("/reserve/:branchId", (req: Request, res: Response) => {
    const templatePath = path.join(__dirname, "templates", "reservation.html");
    
    if (fs.existsSync(templatePath)) {
      res.sendFile(templatePath);
    } else {
      res.status(404).send("Reservation page not found");
    }
  });
  
  app.get("/api/reserve/:branchId", async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      const dateStr = req.query.date as string || new Date().toISOString().split('T')[0];
      const date = new Date(dateStr);
      
      const branch = await storage.getBranchById(branchId);
      if (!branch) {
        return res.status(404).json({ error: "Branch not found" });
      }
      
      const org = await storage.getOrganizationById(branch.organizationId);
      const existingReservations = await storage.getReservationsByBranch(branchId, date);
      
      const slots = [];
      for (let hour = 9; hour <= 21; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
          const reservationsAtTime = existingReservations.filter(
            r => r.reservationTime === time && r.status !== "cancelled"
          ).length;
          
          slots.push({
            time,
            available: reservationsAtTime < (branch.defaultSlotCapacity || 5),
            spotsLeft: Math.max(0, (branch.defaultSlotCapacity || 5) - reservationsAtTime)
          });
        }
      }
      
      res.json({
        branchId: branch.id,
        branchName: branch.name,
        organizationName: org?.name || "Organization",
        date: dateStr,
        slots
      });
    } catch (error) {
      console.error("Error getting reservation slots:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/reserve/:branchId", async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      const { customerName, customerPhone, customerEmail, partySize, date, time, specialRequests } = req.body;
      
      const branch = await storage.getBranchById(branchId);
      if (!branch) {
        return res.status(404).json({ error: "Branch not found" });
      }
      
      const reservationDate = new Date(date);
      reservationDate.setHours(0, 0, 0, 0);
      
      const reservation = await storage.createReservation({
        branchId,
        customerName,
        customerPhone,
        customerEmail,
        reservationDate,
        reservationTime: time,
        partySize: partySize || 2,
        specialRequests,
        status: "confirmed",
      });
      
      res.json({
        success: true,
        confirmationNumber: reservation.confirmationCode,
        date,
        time,
        partySize: partySize || 2
      });
    } catch (error) {
      console.error("Error creating reservation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/queue/:branchId", async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      const serviceId = req.query.serviceId as string | undefined;
      
      let tickets = await storage.getActiveTicketsByBranch(branchId);
      
      if (serviceId) {
        tickets = tickets.filter(t => t.serviceId === serviceId);
      }
      
      res.json({
        queue: tickets.sort((a, b) => a.position - b.position)
      });
    } catch (error) {
      console.error("Error getting queue:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/discover", async (req: Request, res: Response) => {
    try {
      const allBranches = await storage.getAllBranches();
      const results = [];

      for (const branch of allBranches) {
        const org = await storage.getOrganizationById(branch.organizationId);
        const branchServices = await storage.getServicesByBranch(branch.id);
        const activeTickets = await storage.getActiveTicketsByBranch(branch.id);

        const activeServices = branchServices.filter(s => s.isActive);
        const totalWaiting = activeTickets.filter(t => t.status === "waiting").length;

        results.push({
          id: branch.id,
          name: org?.name || branch.name,
          branchName: branch.name,
          address: branch.address || "",
          description: org?.name ? `${org.name} - ${branch.name}` : branch.name,
          category: (branch.settings as any)?.queueMode === "dine_in" ? "Restaurant" : "Services",
          rating: 4.5,
          waitTime: activeServices.length > 0 ? activeServices[0].averageWaitTime * Math.max(1, totalWaiting) : 10,
          queueLength: totalWaiting,
          distance: "Nearby",
          latitude: branch.latitude ? parseFloat(branch.latitude as string) : 0,
          longitude: branch.longitude ? parseFloat(branch.longitude as string) : 0,
          isOpen: branch.isActive !== false,
          services: activeServices.map(s => ({
            id: s.id,
            name: s.name,
            description: s.description || s.name,
            averageWaitTime: s.averageWaitTime || 15,
            requiresInPersonRegistration: s.requiresInPersonRegistration || false,
            inPersonPerimeterMeters: s.inPersonPerimeterMeters || 100,
            formFields: ((s.inputFields as any[]) || []).map((f: any, idx: number) => ({
              id: f.id || `f${idx}`,
              label: f.label || f.name || "Field",
              type: f.type || "text",
              required: f.required !== false,
              options: f.options || [],
            })),
          })),
        });
      }

      res.json({ organizations: results });
    } catch (error) {
      console.error("Error discovering organizations:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/organizations", async (req: Request, res: Response) => {
    try {
      res.json({ organizations: [] });
    } catch (error) {
      console.error("Error getting organizations:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/organizations/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      
      const org = await storage.getOrganizationByEmail(email);
      if (!org) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      const { verifyPassword } = await import("./storage");
      const isValid = await verifyPassword(password, org.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      const branches = await storage.getBranchesByOrganization(org.id);
      const branchesWithServices = await Promise.all(branches.map(async (branch) => {
        const services = await storage.getServicesByBranch(branch.id);
        const journeys = await storage.getJourneysByBranch(branch.id);
        const journeysWithStages = await Promise.all(journeys.map(async (j) => {
          const data = await storage.getJourneyWithStages(j.id);
          return data ? { ...data.journey, stages: data.stages } : j;
        }));
        const operatingHours = await storage.getOperatingHours(branch.id);
        const operatingHoursWithBreaks = await Promise.all(operatingHours.map(async (oh) => {
          const breaks = await storage.getBreakTimes(oh.id);
          return { ...oh, breaks };
        }));
        const holidays = await storage.getHolidays(branch.id);
        
        return {
          ...branch,
          services,
          journeys: journeysWithStages,
          settings: {
            queueMode: branch.queueMode,
            notificationMode: branch.notificationMode,
            autoCallNext: branch.autoCallNext,
            maxQueueSize: branch.maxQueueSize,
            defaultSlotDuration: branch.defaultSlotDuration,
            defaultSlotCapacity: branch.defaultSlotCapacity,
            display: branch.displaySettings,
            api: branch.apiSettings,
            operatingHours: operatingHoursWithBreaks,
            holidays,
          }
        };
      }));
      
      const users = await storage.getOrgUsersByOrganization(org.id);
      const usersWithBranches = await Promise.all(users.map(async (user) => {
        const branchIds = await storage.getOrgUserBranches(user.id);
        const userBranch = user.branchId ? branches.find(b => b.id === user.branchId) : null;
        return {
          ...user,
          branchIds,
          branchName: userBranch?.name,
        };
      }));
      
      const stats = branches.length > 0 
        ? await storage.getQueueStats(branches[0].id)
        : { todayServed: 0, todayWaiting: 0, todayNoShow: 0, averageWaitTime: 0, averageServiceTime: 0 };
      
      res.json({
        organization: {
          id: org.id,
          name: org.name,
          email: org.email,
          phone: org.phone,
          address: org.address,
          city: org.city,
          state: org.state,
          pincode: org.pincode,
          latitude: org.latitude ? parseFloat(org.latitude) : null,
          longitude: org.longitude ? parseFloat(org.longitude) : null,
          logoUrl: org.logoUrl,
          category: org.category,
          description: org.description,
          isVerified: org.isVerified,
          isActive: org.isActive,
          createdAt: org.createdAt,
          stats: {
            ...stats,
            peakHour: "",
            totalBookingsToday: 0,
            upcomingBookings: 0,
          },
        },
        branches: branchesWithServices,
        users: usersWithBranches,
      });
    } catch (error) {
      console.error("Error logging in:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/organizations/register", async (req: Request, res: Response) => {
    try {
      const { name, email, password, phone, address, city, state, pincode, category, description } = req.body;
      
      const existingOrg = await storage.getOrganizationByEmail(email);
      if (existingOrg) {
        return res.status(400).json({ error: "Organization with this email already exists" });
      }
      
      const org = await storage.createOrganization({
        name,
        email,
        password,
        phone,
        address,
        city,
        state,
        pincode,
        category,
        description,
        isVerified: false,
        isActive: true,
      });
      
      const branch = await storage.createBranch({
        organizationId: org.id,
        name: "Main Branch",
        address: address,
        city: city,
        state: state,
        pincode: pincode,
        isActive: true,
        queueMode: "fifo",
        notificationMode: "all_alerts",
        autoCallNext: false,
        maxQueueSize: 100,
        defaultSlotDuration: 30,
        defaultSlotCapacity: 3,
        displaySettings: {},
        apiSettings: {},
      });
      
      const adminUser = await storage.createOrgUser({
        organizationId: org.id,
        name: "Admin",
        email: email,
        password: password,
        role: "admin",
        isActive: true,
      });
      
      res.json({
        success: true,
        organizationId: org.id,
        branchId: branch.id,
        userId: adminUser.id,
      });
    } catch (error) {
      console.error("Error registering organization:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/branches/:branchId/queue", async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      const tickets = await storage.getActiveTicketsByBranch(branchId);
      
      const queue = tickets.map(t => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        customerName: t.customerName,
        customerPhone: t.customerPhone,
        customerEmail: t.customerEmail,
        serviceId: t.serviceId,
        serviceName: t.serviceName,
        position: t.position,
        joinedAt: t.joinedAt,
        estimatedWaitTime: t.estimatedWaitTime,
        status: t.status,
        formData: t.formData,
        priority: t.priority,
        notes: t.notes,
        calledAt: t.calledAt,
        servedAt: t.servedAt,
        completedAt: t.completedAt,
        holdAt: t.holdAt,
        arrivedAt: t.arrivedAt,
        tableNumber: t.tableNumber,
        skipCount: t.skipCount,
        callCount: t.callCount,
        source: t.source,
        reservationTime: t.reservationTime,
        journeyId: t.journeyId,
        currentStageIndex: t.currentStageIndex,
        currentStageId: t.currentStageId,
        stageHistory: t.stageHistory,
      }));
      
      res.json({ queue });
    } catch (error) {
      console.error("Error getting branch queue:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/branches/:branchId/queue/call-next", async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      const { serviceId } = req.body;
      
      const ticket = await storage.callNextTicket(branchId, serviceId);
      if (!ticket) {
        return res.status(404).json({ error: "No waiting customers" });
      }
      
      await storage.recalculatePositions(branchId, serviceId);
      
      res.json({ ticket });
    } catch (error) {
      console.error("Error calling next:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/tickets/:ticketId", async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      const ticket = await storage.getTicketById(ticketId);
      
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      res.json({ ticket });
    } catch (error) {
      console.error("Error getting ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/call", async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      const ticket = await storage.getTicketById(ticketId);
      
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      const updated = await storage.updateTicket(ticketId, {
        status: "called",
        calledAt: new Date(),
        callCount: ticket.callCount + 1,
      });
      
      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error calling ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/serve", async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      
      const updated = await storage.updateTicket(ticketId, {
        status: "serving",
        servedAt: new Date(),
      });
      
      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error marking as serving:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/complete", async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      const ticket = await storage.getTicketById(ticketId);
      
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      const now = new Date();
      const joinedAt = new Date(ticket.joinedAt);
      const servedAt = ticket.servedAt ? new Date(ticket.servedAt) : now;
      
      const actualWaitTime = Math.round((servedAt.getTime() - joinedAt.getTime()) / 60000);
      const serviceTime = Math.round((now.getTime() - servedAt.getTime()) / 60000);
      
      const updated = await storage.updateTicket(ticketId, {
        status: "completed",
        completedAt: now,
        actualWaitTime,
        serviceTime,
      });
      
      if (ticket.branchId) {
        await storage.recalculatePositions(ticket.branchId, ticket.serviceId || undefined);
      }
      
      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error completing ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/no-show", async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      const ticket = await storage.getTicketById(ticketId);
      
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      const updated = await storage.updateTicket(ticketId, {
        status: "no_show",
        completedAt: new Date(),
      });
      
      if (ticket.branchId) {
        await storage.recalculatePositions(ticket.branchId, ticket.serviceId || undefined);
      }
      
      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error marking as no-show:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/hold", async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      
      const updated = await storage.updateTicket(ticketId, {
        status: "hold",
        holdAt: new Date(),
      });
      
      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error putting on hold:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/resume", async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      const ticket = await storage.getTicketById(ticketId);
      
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      const updated = await storage.updateTicket(ticketId, {
        status: "waiting",
        holdAt: null,
        tableNumber: null,
      });
      
      if (ticket.branchId) {
        await storage.recalculatePositions(ticket.branchId, ticket.serviceId || undefined);
      }
      
      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error resuming ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/cancel", async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      const ticket = await storage.getTicketById(ticketId);
      
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      const updated = await storage.updateTicket(ticketId, {
        status: "cancelled",
        completedAt: new Date(),
      });
      
      if (ticket.branchId) {
        await storage.recalculatePositions(ticket.branchId, ticket.serviceId || undefined);
      }
      
      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error cancelling ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/branches/:branchId/services", async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      const serviceData = req.body;
      
      const service = await storage.createService({
        branchId,
        name: serviceData.name,
        description: serviceData.description,
        averageWaitTime: serviceData.averageWaitTime || 15,
        estimatedDuration: serviceData.estimatedDuration || 20,
        isActive: serviceData.isActive !== false,
        maxDailyCapacity: serviceData.maxDailyCapacity,
        requiresInPersonRegistration: serviceData.requiresInPersonRegistration || false,
        inPersonPerimeterMeters: serviceData.inPersonPerimeterMeters || 100,
        inputFields: serviceData.inputFields || [],
      });
      
      res.json({ service });
    } catch (error) {
      console.error("Error creating service:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/services/:serviceId", async (req: Request, res: Response) => {
    try {
      const serviceId = req.params.serviceId as string;
      const updates = req.body;
      
      const service = await storage.updateService(serviceId, updates);
      res.json({ service });
    } catch (error) {
      console.error("Error updating service:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/services/:serviceId", async (req: Request, res: Response) => {
    try {
      const serviceId = req.params.serviceId as string;
      await storage.deleteService(serviceId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting service:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/branches/:branchId/stats", async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      const stats = await storage.getQueueStats(branchId);
      res.json(stats);
    } catch (error) {
      console.error("Error getting stats:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/branches/:branchId/bookings", async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      const bookingData = req.body;
      
      const booking = await storage.createBooking({
        branchId,
        serviceId: bookingData.serviceId,
        userId: bookingData.userId,
        customerName: bookingData.customerName || "Guest",
        customerPhone: bookingData.customerPhone || "",
        customerEmail: bookingData.customerEmail || "",
        scheduledDate: new Date(bookingData.scheduledDate),
        scheduledTime: bookingData.scheduledTime,
        endTime: bookingData.endTime,
        notes: bookingData.notes || "",
        status: "confirmed",
      });
      
      res.json({ booking });
    } catch (error) {
      console.error("Error creating booking:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/bookings/:bookingId/cancel", async (req: Request, res: Response) => {
    try {
      const bookingId = req.params.bookingId as string;
      const booking = await storage.updateBooking(bookingId, { status: "cancelled" });
      res.json({ booking });
    } catch (error) {
      console.error("Error cancelling booking:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/reservations/:reservationId/cancel", async (req: Request, res: Response) => {
    try {
      const reservationId = req.params.reservationId as string;
      const ticket = await storage.updateTicket(reservationId, { status: "cancelled" });
      res.json({ ticket });
    } catch (error) {
      console.error("Error cancelling reservation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
