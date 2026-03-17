import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import path from "path";
import fs from "fs";
import { storage, hashPassword, verifyPassword } from "./storage";
import { registerBillingRoutes } from "./billing-routes";
import {
  checkAndSendQueueNotifications,
  sendCalledNotification,
  sendCheckinConfirmationNotification,
  sendDineInCalledNotification,
  sendTakeawayReadyNotification,
  sendTakeawayDeliveredNotification,
  sendQueueJoinedNotification,
  sendStatusChangeNotification,
} from "./notifications";
import { generateRefCode, getWhatsAppRedirectUrl, processIncomingWhatsApp, getVerifyToken, sendWhatsAppStatusChangeNotification, sendWhatsAppOTP } from "./whatsapp";
import { db } from "./db";
import { orgUsers, tickets as ticketsTable, otpCodes } from "@shared/schema";
import { eq, and, gt, desc } from "drizzle-orm";

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function registerRoutes(app: Express): Promise<Server> {
  registerBillingRoutes(app);

  // ============================================
  // CUSTOMER AUTH (WhatsApp OTP)
  // ============================================

  app.post("/api/auth/send-otp", async (req: Request, res: Response) => {
    try {
      const { phone } = req.body;
      if (!phone) {
        return res.status(400).json({ error: "Phone number is required" });
      }

      const cleanPhone = phone.replace(/[^0-9]/g, "");
      if (cleanPhone.length < 8) {
        return res.status(400).json({ error: "Invalid phone number" });
      }

      const recentOtp = await db
        .select()
        .from(otpCodes)
        .where(and(eq(otpCodes.phone, cleanPhone), gt(otpCodes.createdAt, new Date(Date.now() - 60 * 1000))))
        .orderBy(desc(otpCodes.createdAt))
        .limit(1);

      if (recentOtp.length > 0) {
        return res.status(429).json({ error: "Please wait before requesting another OTP" });
      }

      const otpCode = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await db.insert(otpCodes).values({
        phone: cleanPhone,
        code: otpCode,
        purpose: "TIQKETS Registration/Login",
        expiresAt,
      });

      const existingCustomer = await storage.getCustomerByPhone(cleanPhone);

      const sent = await sendWhatsAppOTP(cleanPhone, otpCode, "TIQKETS Registration/Login");

      if (!sent) {
        return res.status(500).json({ error: "Failed to send OTP. Please try again." });
      }

      res.json({
        success: true,
        isExistingUser: !!existingCustomer,
        message: "OTP sent to your WhatsApp",
      });
    } catch (error) {
      console.error("Error sending OTP:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/auth/verify-otp", async (req: Request, res: Response) => {
    try {
      const { phone, code, firstName, lastName } = req.body;
      if (!phone || !code) {
        return res.status(400).json({ error: "Phone and OTP code are required" });
      }

      const cleanPhone = phone.replace(/[^0-9]/g, "");

      const [otpRecord] = await db
        .select()
        .from(otpCodes)
        .where(
          and(
            eq(otpCodes.phone, cleanPhone),
            eq(otpCodes.verified, false),
            gt(otpCodes.expiresAt, new Date())
          )
        )
        .orderBy(desc(otpCodes.createdAt))
        .limit(1);

      if (!otpRecord) {
        return res.status(400).json({ error: "OTP expired or not found. Please request a new one." });
      }

      if (otpRecord.attempts >= 5) {
        return res.status(429).json({ error: "Too many attempts. Please request a new OTP." });
      }

      await db.update(otpCodes).set({ attempts: otpRecord.attempts + 1 }).where(eq(otpCodes.id, otpRecord.id));

      if (otpRecord.code !== code) {
        return res.status(400).json({ error: "Invalid OTP code. Please try again." });
      }

      let customer = await storage.getCustomerByPhone(cleanPhone);

      if (customer) {
        customer = (await storage.updateCustomer(customer.id, { updatedAt: new Date() })) || customer;
      } else {
        if (!firstName) {
          return res.status(200).json({ success: true, needsRegistration: true });
        }

        const fullName = lastName ? `${firstName.trim()} ${lastName.trim()}` : firstName.trim();
        customer = await storage.createCustomer({
          name: fullName,
          phone: cleanPhone,
        });
      }

      await db.update(otpCodes).set({ verified: true }).where(eq(otpCodes.id, otpRecord.id));

      res.json({
        success: true,
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          profilePictureUrl: customer.profilePictureUrl,
          createdAt: customer.createdAt,
        },
      });
    } catch (error) {
      console.error("Error verifying OTP:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/auth/customer/:customerId", async (req: Request, res: Response) => {
    try {
      const customer = await storage.getCustomerById(req.params.customerId);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      res.json({
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          profilePictureUrl: customer.profilePictureUrl,
          createdAt: customer.createdAt,
        },
      });
    } catch (error) {
      console.error("Error fetching customer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/auth/customer/:customerId", async (req: Request, res: Response) => {
    try {
      const { name, email, profilePictureUrl } = req.body;
      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (email !== undefined) updateData.email = email;
      if (profilePictureUrl !== undefined) updateData.profilePictureUrl = profilePictureUrl;

      const customer = await storage.updateCustomer(req.params.customerId, updateData);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      res.json({
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          profilePictureUrl: customer.profilePictureUrl,
          createdAt: customer.createdAt,
        },
      });
    } catch (error) {
      console.error("Error updating customer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // QUEUE ROUTES
  // ============================================

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

      if (branch.queueStatus === "paused") {
        return res.status(403).json({ error: "Queue is temporarily paused. Please try again later." });
      }
      if (branch.queueStatus === "ended") {
        return res.status(403).json({ error: "Queue is closed for the day." });
      }
      
      const service = await storage.getServiceById(serviceId);
      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }

      if ((service as any).queueStatus === "paused") {
        return res.status(403).json({ error: `${service.name} queue is temporarily paused. Please try again later.` });
      }
      if ((service as any).queueStatus === "ended") {
        return res.status(403).json({ error: `${service.name} queue is closed for the day.` });
      }
      
      const source = req.body.source || "qr";
      const priority = req.body.priority || "normal";
      const formData = req.body.formData || customFields || {};
      const pushToken = req.body.pushToken || null;

      const whatsappRefCode = source === "qr" ? generateRefCode() : undefined;

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
        pushToken,
        estimatedWaitTime: service.averageWaitTime * (await storage.getNextQueuePosition(branchId, serviceId)),
        ...(whatsappRefCode ? { whatsappRefCode } : {}),
      });
      
      const position = ticket.position;
      const estimatedWait = position * service.averageWaitTime;
      
      const whatsappUrl = whatsappRefCode ? getWhatsAppRedirectUrl(whatsappRefCode) : undefined;

      const branchName = branch.name || "Queue";
      if (pushToken) {
        sendQueueJoinedNotification(ticket.id, branchName).catch(console.error);
      }
      
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
        queueId: ticket.id,
        whatsappRefCode,
        whatsappUrl,
      });
    } catch (error) {
      console.error("Error joining queue:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/tickets/:ticketId/push-token", async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      const { pushToken } = req.body;
      
      if (!pushToken) {
        return res.status(400).json({ error: "Push token required" });
      }
      
      const updated = await storage.updateTicket(ticketId, { pushToken });
      if (!updated) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating push token:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/acknowledge", async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      const ticket = await storage.getTicketById(ticketId);

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      if (ticket.status !== "called") {
        return res.status(400).json({ error: "Ticket is not in called status" });
      }

      const updated = await storage.updateTicket(ticketId, {
        acknowledgedAt: new Date(),
      });

      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error acknowledging ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/snooze", async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      const { positions } = req.body;
      const ticket = await storage.getTicketById(ticketId);

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      if (ticket.skipCount >= 3) {
        return res.status(400).json({ error: "Maximum snooze limit reached" });
      }

      const clampedPositions = Math.min(Math.max(positions || 1, 1), 3);

      const targetPosition = ticket.position + clampedPositions;
      const waitingTickets = await storage.getWaitingTicketsForBranch(ticket.branchId, ticket.serviceId || undefined);
      const ticketAtTarget = waitingTickets.find(t => t.position === targetPosition || t.position === targetPosition - 1);
      let newJoinedAt = ticket.joinedAt;
      if (ticketAtTarget && ticketAtTarget.id !== ticket.id) {
        newJoinedAt = new Date(new Date(ticketAtTarget.joinedAt).getTime() + 1000);
      } else {
        newJoinedAt = new Date(ticket.joinedAt.getTime() + clampedPositions * 60000);
      }

      const updated = await storage.updateTicket(ticketId, {
        skipCount: ticket.skipCount + 1,
        status: "waiting",
        acknowledgedAt: null,
        estimatedWaitTime: ticket.estimatedWaitTime + clampedPositions * 5,
        joinedAt: newJoinedAt,
      });

      if (ticket.branchId) {
        await storage.recalculatePositions(ticket.branchId, ticket.serviceId || undefined);
      }

      const refreshedTicket = await storage.getTicketById(ticketId);

      res.json({ ticket: refreshedTicket || updated });
    } catch (error) {
      console.error("Error snoozing ticket:", error);
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

        const avgWaitPerPerson = activeServices.length > 0
          ? activeServices.reduce((sum, s) => sum + (s.averageWaitTime || 15), 0) / activeServices.length
          : 15;
        const estimatedWait = Math.round(avgWaitPerPerson * Math.max(1, totalWaiting));

        results.push({
          id: branch.id,
          name: org?.name || branch.name,
          branchName: branch.name,
          address: branch.address || "",
          description: org?.name ? `${org.name} - ${branch.name}` : branch.name,
          category: (branch.settings as any)?.queueMode === "dine_in" ? "Restaurant" : "Services",
          logoUrl: org?.logoUrl || null,
          rating: 4.5,
          waitTime: estimatedWait,
          queueLength: totalWaiting,
          distance: "Nearby",
          latitude: branch.latitude ? parseFloat(branch.latitude as string) : 0,
          longitude: branch.longitude ? parseFloat(branch.longitude as string) : 0,
          queueStatus: branch.queueStatus || "active",
          isOpen: branch.isActive !== false && branch.queueStatus !== "ended",
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
      const tickets = await storage.getTodaysTicketsByBranch(branchId);
      
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
        acknowledgedAt: t.acknowledgedAt,
        tableNumber: t.tableNumber,
        skipCount: t.skipCount,
        callCount: t.callCount,
        source: t.source,
        reservationTime: t.reservationTime,
        journeyId: t.journeyId,
        currentStageIndex: t.currentStageIndex,
        currentStageId: t.currentStageId,
        stageHistory: t.stageHistory,
        currentStageName: t.currentStageId && Array.isArray(t.stageHistory) ? ((t.stageHistory as any[]).find((h: any) => h.stageId === t.currentStageId && !h.completedAt)?.stageName || null) : null,
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
      const { serviceId, deskId, deskName, tableNumber } = req.body;
      
      const ticket = await storage.callNextTicket(branchId, serviceId);
      if (!ticket) {
        return res.status(404).json({ error: "No waiting customers" });
      }

      const updateFields: any = {};
      if (deskId || deskName) {
        updateFields.deskId = deskId || null;
        updateFields.deskName = deskName || null;
      }
      if (tableNumber) {
        updateFields.tableNumber = tableNumber;
      }
      if (Object.keys(updateFields).length > 0) {
        await storage.updateTicket(ticket.id, updateFields);
      }
      
      await storage.recalculatePositions(branchId, serviceId);
      
      const branch = await storage.getBranchById(branchId);
      const branchName = branch?.name || "Queue";
      const queueMode = branch?.queueMode || "fifo";

      if (queueMode === "dine_in") {
        sendDineInCalledNotification(ticket.id, branchName, tableNumber || null).catch(console.error);
      } else {
        await sendCalledNotification(ticket.id, branchName);
      }

      checkAndSendQueueNotifications(branchId, branchName, serviceId).catch(console.error);
      
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
      const { deskId, deskName, tableNumber } = req.body || {};
      const ticket = await storage.getTicketById(ticketId);
      
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      
      const sentNotifications = (ticket.notificationsSent as string[]) || [];
      const clearedNotifications = sentNotifications.filter(
        (n: string) => ![
          "your_turn", "dinein_called",
          "whatsapp_turn", "whatsapp_dinein_called",
          "position_1", "whatsapp_position_1",
        ].includes(n)
      );
      const updateData: any = {
        status: "called",
        calledAt: new Date(),
        callCount: ticket.callCount + 1,
        acknowledgedAt: null,
        notificationsSent: clearedNotifications,
      };
      if (deskId || deskName) {
        updateData.deskId = deskId || null;
        updateData.deskName = deskName || null;
      }
      if (tableNumber) {
        updateData.tableNumber = tableNumber;
      }
      const updated = await storage.updateTicket(ticketId, updateData);
      
      const branch = await storage.getBranchById(ticket.branchId);
      const branchName = branch?.name || "Queue";
      const queueMode = branch?.queueMode || "fifo";

      if (queueMode === "dine_in") {
        sendDineInCalledNotification(ticketId, branchName, tableNumber || null).catch(console.error);
      } else {
        await sendCalledNotification(ticketId, branchName);
      }
      
      if (ticket.branchId) {
        await storage.recalculatePositions(ticket.branchId, ticket.serviceId || undefined);
        checkAndSendQueueNotifications(ticket.branchId, branchName, ticket.serviceId || undefined).catch(console.error);
      }
      
      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error calling ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/serve", async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      const ticket = await storage.getTicketById(ticketId);
      
      const updated = await storage.updateTicket(ticketId, {
        status: "serving",
        servedAt: new Date(),
      });

      if (ticket) {
        const branch = await storage.getBranchById(ticket.branchId);
        const branchName = branch?.name || "Queue";
        const queueMode = branch?.queueMode || "fifo";

        if (queueMode === "takeaway") {
          sendTakeawayReadyNotification(ticketId, branchName).catch(console.error);
        } else if (queueMode === "checkin") {
          sendCheckinConfirmationNotification(ticketId, branchName).catch(console.error);
        }
        sendStatusChangeNotification(ticketId, branchName, "serving").catch(console.error);
        sendWhatsAppStatusChangeNotification(ticketId, branchName, "serving").catch(console.error);
      }
      
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
        const branch = await storage.getBranchById(ticket.branchId);
        const branchName = branch?.name || "Queue";
        const queueMode = branch?.queueMode || "fifo";

        if (queueMode === "takeaway") {
          sendTakeawayDeliveredNotification(ticketId, branchName).catch(console.error);
        }
        sendStatusChangeNotification(ticketId, branchName, "completed").catch(console.error);
        sendWhatsAppStatusChangeNotification(ticketId, branchName, "completed").catch(console.error);

        await storage.recalculatePositions(ticket.branchId, ticket.serviceId || undefined);
        checkAndSendQueueNotifications(ticket.branchId, branchName, ticket.serviceId || undefined).catch(console.error);
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
        const branch = await storage.getBranchById(ticket.branchId);
        const branchName = branch?.name || "Queue";
        sendStatusChangeNotification(ticketId, branchName, "no_show").catch(console.error);
        sendWhatsAppStatusChangeNotification(ticketId, branchName, "no_show").catch(console.error);
        checkAndSendQueueNotifications(ticket.branchId, branchName, ticket.serviceId || undefined).catch(console.error);
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
      const ticket = await storage.getTicketById(ticketId);
      
      const updated = await storage.updateTicket(ticketId, {
        status: "hold",
        holdAt: new Date(),
      });

      if (ticket) {
        const branch = await storage.getBranchById(ticket.branchId);
        const branchName = branch?.name || "Queue";
        sendStatusChangeNotification(ticketId, branchName, "hold").catch(console.error);
        sendWhatsAppStatusChangeNotification(ticketId, branchName, "hold").catch(console.error);
      }
      
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
        const branch = await storage.getBranchById(ticket.branchId);
        checkAndSendQueueNotifications(ticket.branchId, branch?.name || "Queue", ticket.serviceId || undefined).catch(console.error);
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
        const branch = await storage.getBranchById(ticket.branchId);
        checkAndSendQueueNotifications(ticket.branchId, branch?.name || "Queue", ticket.serviceId || undefined).catch(console.error);
      }
      
      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error cancelling ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/reassign", async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      const { serviceId, serviceName } = req.body;
      if (!serviceId) {
        return res.status(400).json({ error: "Service ID is required" });
      }
      const ticket = await storage.getTicketById(ticketId);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      const updated = await storage.updateTicket(ticketId, { serviceId, serviceName: serviceName || ticket.serviceName });
      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error reassigning ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/move-stage", async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      const { stageId, stageIndex, stageName } = req.body;
      if (!stageId || stageIndex === undefined) {
        return res.status(400).json({ error: "Stage ID and index are required" });
      }
      const ticket = await storage.getTicketById(ticketId);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      const history = Array.isArray(ticket.stageHistory) ? [...ticket.stageHistory] : [];
      if (ticket.currentStageId) {
        const existingIdx = history.findIndex((h: any) => h.stageId === ticket.currentStageId && !h.completedAt);
        if (existingIdx >= 0) {
          history[existingIdx] = { ...history[existingIdx], completedAt: new Date().toISOString() };
        }
      }
      history.push({ stageId, stageName: stageName || `Stage ${stageIndex + 1}`, startedAt: new Date().toISOString(), completedAt: null, skipped: false });
      const updated = await storage.updateTicket(ticketId, {
        currentStageId: stageId,
        currentStageIndex: stageIndex,
        stageHistory: history,
        status: 'waiting',
      });
      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error moving ticket stage:", error);
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
        queueStatus: "active",
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
      const { name, description, averageWaitTime, estimatedDuration, maxDailyCapacity, inputFields, isActive, queueStatus, requiresInPersonRegistration, inPersonPerimeterMeters, serviceSettings, sortOrder } = req.body;
      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (averageWaitTime !== undefined) updateData.averageWaitTime = averageWaitTime;
      if (estimatedDuration !== undefined) updateData.estimatedDuration = estimatedDuration;
      if (maxDailyCapacity !== undefined) updateData.maxDailyCapacity = maxDailyCapacity;
      if (inputFields !== undefined) updateData.inputFields = inputFields;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (queueStatus !== undefined) updateData.queueStatus = queueStatus;
      if (requiresInPersonRegistration !== undefined) updateData.requiresInPersonRegistration = requiresInPersonRegistration;
      if (inPersonPerimeterMeters !== undefined) updateData.inPersonPerimeterMeters = inPersonPerimeterMeters;
      if (serviceSettings !== undefined) updateData.serviceSettings = serviceSettings;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      const service = await storage.updateService(serviceId, updateData);
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
      const reservation = await storage.updateReservation(reservationId, { status: "cancelled" });
      res.json({ reservation });
    } catch (error) {
      console.error("Error cancelling reservation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/branches/:branchId/reservations - Get reservations for a branch (today by default)
  app.get("/api/branches/:branchId/reservations", async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      const dateStr = req.query.date as string | undefined;
      const date = dateStr ? new Date(dateStr) : new Date();
      const reservationsList = await storage.getReservationsByBranch(branchId, date);
      res.json({ reservations: reservationsList });
    } catch (error) {
      console.error("Error getting reservations:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/reservations/:reservationId/checkin - Check in a reservation (creates a waiting ticket)
  app.post("/api/reservations/:reservationId/checkin", async (req: Request, res: Response) => {
    try {
      const reservationId = req.params.reservationId as string;
      const reservation = await storage.getReservationById(reservationId);
      if (!reservation) {
        return res.status(404).json({ error: "Reservation not found" });
      }
      if (reservation.status === "checked_in") {
        return res.status(400).json({ error: "Reservation already checked in" });
      }
      if (reservation.status === "cancelled") {
        return res.status(400).json({ error: "Reservation is cancelled" });
      }

      const ticket = await storage.createTicket({
        branchId: reservation.branchId,
        customerName: reservation.customerName,
        customerPhone: reservation.customerPhone,
        customerEmail: reservation.customerEmail,
        status: "waiting",
        source: "reservation",
        notes: `Reservation ${reservation.confirmationCode}${reservation.specialRequests ? ` | ${reservation.specialRequests}` : ""}`,
        formData: { partySize: reservation.partySize, reservationTime: reservation.reservationTime, confirmationCode: reservation.confirmationCode },
      } as any);

      await storage.updateReservation(reservationId, {
        status: "checked_in",
        checkedInAt: new Date(),
        ticketId: ticket.id,
      } as any);

      const branch = await storage.getBranchById(reservation.branchId);
      const branchName = branch?.name || "Queue";

      await storage.recalculatePositions(reservation.branchId);

      sendCheckinConfirmationNotification(ticket.id, branchName).catch(console.error);

      res.json({ ticket, reservation: { ...reservation, status: "checked_in", checkedInAt: new Date(), ticketId: ticket.id } });
    } catch (error) {
      console.error("Error checking in reservation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // DASHBOARD API ROUTES
  // ============================================

  // GET /api/dashboard/branches/:orgId - Get branches with services, journeys, operating hours, holidays
  app.get("/api/dashboard/branches/:orgId", async (req: Request, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const branches = await storage.getBranchesByOrganization(orgId);
      const branchesWithDetails = await Promise.all(branches.map(async (branch) => {
        const services = await storage.getServicesByBranch(branch.id);
        const branchDesks = await storage.getDesksByBranch(branch.id);
        const servicesWithDesks = services.map(s => ({
          ...s,
          desks: branchDesks.filter(d => d.serviceId === s.id),
        }));
        const journeys = await storage.getJourneysByBranch(branch.id);
        const journeysWithStages = await Promise.all(journeys.map(async (j) => {
          const data = await storage.getJourneyWithStages(j.id);
          return data ? { ...data.journey, stages: data.stages } : j;
        }));
        const operatingHoursData = await storage.getOperatingHours(branch.id);
        const operatingHoursWithBreaks = await Promise.all(operatingHoursData.map(async (oh) => {
          const breaks = await storage.getBreakTimes(oh.id);
          return { ...oh, breaks };
        }));
        const holidaysData = await storage.getHolidays(branch.id);
        return {
          ...branch,
          services: servicesWithDesks,
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
            holidays: holidaysData,
          }
        };
      }));
      res.json({ branches: branchesWithDetails });
    } catch (error) {
      console.error("Error getting dashboard branches:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/dashboard/branches - Create branch
  app.post("/api/dashboard/branches", async (req: Request, res: Response) => {
    try {
      const branch = await storage.createBranch(req.body);
      res.json({ branch });
    } catch (error) {
      console.error("Error creating branch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/dashboard/branches/:id - Update branch
  app.put("/api/dashboard/branches/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const branch = await storage.updateBranch(id, req.body);
      res.json({ branch });
    } catch (error) {
      console.error("Error updating branch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/dashboard/branches/:id - Delete branch
  app.delete("/api/dashboard/branches/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      await storage.deleteBranch(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting branch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/dashboard/branches/:branchId/settings - Update branch settings
  app.put("/api/dashboard/branches/:branchId/settings", async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      const { queueMode, notificationMode, autoCallNext, maxQueueSize, defaultSlotDuration, defaultSlotCapacity, displaySettings, apiSettings } = req.body;
      const updateData: any = {};
      if (queueMode !== undefined) updateData.queueMode = queueMode;
      if (notificationMode !== undefined) updateData.notificationMode = notificationMode;
      if (autoCallNext !== undefined) updateData.autoCallNext = autoCallNext;
      if (maxQueueSize !== undefined) updateData.maxQueueSize = maxQueueSize;
      if (defaultSlotDuration !== undefined) updateData.defaultSlotDuration = defaultSlotDuration;
      if (defaultSlotCapacity !== undefined) updateData.defaultSlotCapacity = defaultSlotCapacity;
      if (displaySettings !== undefined) updateData.displaySettings = displaySettings;
      if (apiSettings !== undefined) updateData.apiSettings = apiSettings;
      const branch = await storage.updateBranch(branchId, updateData);
      res.json({ branch });
    } catch (error) {
      console.error("Error updating branch settings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/dashboard/branches/:branchId/services/:serviceId/settings - Update service-level settings
  app.put("/api/dashboard/branches/:branchId/services/:serviceId/settings", async (req: Request, res: Response) => {
    try {
      const serviceId = req.params.serviceId as string;
      const newSettings = req.body;
      const service = await storage.getServiceById(serviceId);
      if (!service) {
        res.status(404).json({ error: "Service not found" });
        return;
      }
      const existingSettings = (service.serviceSettings as Record<string, any>) || {};
      const merged = { ...existingSettings, ...newSettings };
      await storage.updateService(serviceId, { serviceSettings: merged } as any);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating service settings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // DESK MANAGEMENT
  // ============================================

  // GET /api/dashboard/services/:serviceId/desks - Get desks for a service
  app.get("/api/dashboard/services/:serviceId/desks", async (req: Request, res: Response) => {
    try {
      const serviceId = req.params.serviceId as string;
      const desksList = await storage.getDesksByService(serviceId);
      res.json({ desks: desksList });
    } catch (error) {
      console.error("Error getting desks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/dashboard/services/:serviceId/desks - Create a desk
  app.post("/api/dashboard/services/:serviceId/desks", async (req: Request, res: Response) => {
    try {
      const serviceId = req.params.serviceId as string;
      const { name, branchId } = req.body;
      if (!name || !branchId) {
        res.status(400).json({ error: "Name and branchId are required" });
        return;
      }
      const existingDesks = await storage.getDesksByService(serviceId);
      const desk = await storage.createDesk({
        serviceId,
        branchId,
        name,
        isActive: true,
        queueStatus: "active",
        sortOrder: existingDesks.length,
      });
      res.json({ desk });
    } catch (error) {
      console.error("Error creating desk:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/dashboard/desks/:id - Update a desk
  app.put("/api/dashboard/desks/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { name, isActive, queueStatus, sortOrder } = req.body;
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (queueStatus !== undefined) updateData.queueStatus = queueStatus;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      const desk = await storage.updateDesk(id, updateData);
      if (!desk) {
        res.status(404).json({ error: "Desk not found" });
        return;
      }
      res.json({ desk });
    } catch (error) {
      console.error("Error updating desk:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/dashboard/desks/:id - Delete a desk
  app.delete("/api/dashboard/desks/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      await storage.deleteDesk(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting desk:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/dashboard/users/:orgId - Get users with branch assignments
  app.get("/api/dashboard/users/:orgId", async (req: Request, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const users = await storage.getOrgUsersByOrganization(orgId);
      const branchesList = await storage.getBranchesByOrganization(orgId);
      const usersWithBranches = await Promise.all(users.map(async (user) => {
        const branchIds = await storage.getOrgUserBranches(user.id);
        const userBranch = user.branchId ? branchesList.find(b => b.id === user.branchId) : null;
        return {
          ...user,
          branchIds,
          branchName: userBranch?.name,
        };
      }));
      res.json({ users: usersWithBranches });
    } catch (error) {
      console.error("Error getting dashboard users:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/dashboard/users - Create user
  app.post("/api/dashboard/users", async (req: Request, res: Response) => {
    try {
      const { organizationId, name, email, phone, password, role, branchId, branchIds, assignedServiceIds } = req.body;
      const user = await storage.createOrgUser({
        organizationId,
        name,
        email,
        phone,
        password: password || "changeme123",
        role: role || "staff",
        branchId,
        assignedServiceIds,
        isActive: true,
      });
      if (branchIds && branchIds.length > 0) {
        await storage.setOrgUserBranches(user.id, branchIds);
      }
      const userBranchIds = await storage.getOrgUserBranches(user.id);
      res.json({ user: { ...user, branchIds: userBranchIds } });
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/dashboard/users/:id - Update user
  app.put("/api/dashboard/users/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { name, email, phone, password, role, branchId, branchIds, assignedServiceIds, isActive } = req.body;
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (role !== undefined) updateData.role = role;
      if (branchId !== undefined) updateData.branchId = branchId;
      if (assignedServiceIds !== undefined) updateData.assignedServiceIds = assignedServiceIds;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (password) {
        updateData.passwordHash = await hashPassword(password);
      }
      const user = await storage.updateOrgUser(id, updateData);
      if (branchIds) {
        await storage.setOrgUserBranches(id, branchIds);
      }
      const userBranchIds = await storage.getOrgUserBranches(id);
      res.json({ user: { ...user, branchIds: userBranchIds } });
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/dashboard/users/:id - Delete user
  app.delete("/api/dashboard/users/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      await storage.deleteOrgUser(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/dashboard/services - Create service
  app.post("/api/dashboard/services", async (req: Request, res: Response) => {
    try {
      const { branchId, name, description, averageWaitTime, estimatedDuration, maxDailyCapacity, inputFields, requireInPerson, inPersonPerimeter } = req.body;
      const service = await storage.createService({
        branchId,
        name,
        description,
        averageWaitTime: averageWaitTime || 15,
        estimatedDuration: estimatedDuration || 20,
        maxDailyCapacity,
        inputFields: inputFields || [],
        requiresInPersonRegistration: requireInPerson || false,
        inPersonPerimeterMeters: inPersonPerimeter || 100,
        isActive: true,
        queueStatus: "active",
      });
      res.json({ service });
    } catch (error) {
      console.error("Error creating service:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/dashboard/services/:id - Update service
  app.put("/api/dashboard/services/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { name, description, averageWaitTime, estimatedDuration, maxDailyCapacity, inputFields, isActive, requiresInPersonRegistration, inPersonPerimeterMeters, serviceSettings } = req.body;
      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (averageWaitTime !== undefined) updateData.averageWaitTime = parseInt(averageWaitTime) || 15;
      if (estimatedDuration !== undefined) updateData.estimatedDuration = parseInt(estimatedDuration) || 10;
      if (maxDailyCapacity !== undefined) updateData.maxDailyCapacity = parseInt(maxDailyCapacity) || null;
      if (inputFields !== undefined) updateData.inputFields = inputFields;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (requiresInPersonRegistration !== undefined) updateData.requiresInPersonRegistration = requiresInPersonRegistration;
      if (inPersonPerimeterMeters !== undefined) updateData.inPersonPerimeterMeters = parseInt(inPersonPerimeterMeters) || 100;
      if (serviceSettings !== undefined) updateData.serviceSettings = serviceSettings;
      const service = await storage.updateService(id, updateData);
      res.json({ service });
    } catch (error) {
      console.error("Error updating service:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/dashboard/services/:id - Delete service
  app.delete("/api/dashboard/services/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      await storage.deleteService(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting service:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/dashboard/journeys/:branchId - Get journeys with stages
  app.get("/api/dashboard/journeys/:branchId", async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      const journeys = await storage.getJourneysByBranch(branchId);
      const journeysWithStages = await Promise.all(journeys.map(async (j) => {
        const data = await storage.getJourneyWithStages(j.id);
        return data ? { ...data.journey, stages: data.stages } : j;
      }));
      res.json({ journeys: journeysWithStages });
    } catch (error) {
      console.error("Error getting journeys:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/dashboard/journeys - Create journey
  app.post("/api/dashboard/journeys", async (req: Request, res: Response) => {
    try {
      const { branchId, name, description, isActive, stages } = req.body;
      const journey = await storage.createJourney({ branchId, name, description, isActive });
      if (stages && stages.length > 0) {
        await storage.updateJourneyStages(journey.id, stages);
      }
      const data = await storage.getJourneyWithStages(journey.id);
      res.json({ journey: data ? { ...data.journey, stages: data.stages } : journey });
    } catch (error) {
      console.error("Error creating journey:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/dashboard/journeys/:id - Update journey
  app.put("/api/dashboard/journeys/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { name, description, isActive, stages } = req.body;
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (isActive !== undefined) updateData.isActive = isActive;
      const journey = await storage.updateJourney(id, updateData);
      if (stages) {
        await storage.updateJourneyStages(id, stages);
      }
      const data = await storage.getJourneyWithStages(id);
      res.json({ journey: data ? { ...data.journey, stages: data.stages } : journey });
    } catch (error) {
      console.error("Error updating journey:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/dashboard/journeys/:id - Delete journey
  app.delete("/api/dashboard/journeys/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      await storage.deleteJourney(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting journey:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/dashboard/bookings/:branchId - Get bookings/appointments
  app.get("/api/dashboard/bookings/:branchId", async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      const dateStr = req.query.date as string;
      const date = dateStr ? new Date(dateStr) : undefined;
      const appointmentsList = await storage.getAppointmentsByBranch(branchId, date);
      res.json({ appointments: appointmentsList });
    } catch (error) {
      console.error("Error getting dashboard bookings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/dashboard/operating-hours/:id - Update operating hours
  app.put("/api/dashboard/operating-hours/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const hour = await storage.updateOperatingHour(id, req.body);
      res.json({ operatingHour: hour });
    } catch (error) {
      console.error("Error updating operating hours:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/dashboard/breaks - Create break time
  app.post("/api/dashboard/breaks", async (req: Request, res: Response) => {
    try {
      const breakTime = await storage.createBreakTime(req.body);
      res.json({ breakTime });
    } catch (error) {
      console.error("Error creating break time:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/dashboard/breaks/:id - Update break time
  app.put("/api/dashboard/breaks/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const breakTime = await storage.updateBreakTime(id, req.body);
      res.json({ breakTime });
    } catch (error) {
      console.error("Error updating break time:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/dashboard/breaks/:id - Delete break time
  app.delete("/api/dashboard/breaks/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      await storage.deleteBreakTime(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting break time:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/dashboard/holidays - Create holiday
  app.post("/api/dashboard/holidays", async (req: Request, res: Response) => {
    try {
      const holiday = await storage.createHoliday(req.body);
      res.json({ holiday });
    } catch (error) {
      console.error("Error creating holiday:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/dashboard/holidays/:id - Update holiday
  app.put("/api/dashboard/holidays/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const holiday = await storage.updateHoliday(id, req.body);
      res.json({ holiday });
    } catch (error) {
      console.error("Error updating holiday:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/dashboard/holidays/:id - Delete holiday
  app.delete("/api/dashboard/holidays/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      await storage.deleteHoliday(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting holiday:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/dashboard/booking-slots - Create booking slot
  app.post("/api/dashboard/booking-slots", async (req: Request, res: Response) => {
    try {
      const slot = await storage.createBookingSlot(req.body);
      res.json({ slot });
    } catch (error) {
      console.error("Error creating booking slot:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/dashboard/booking-slots/:id - Update booking slot
  app.put("/api/dashboard/booking-slots/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const slot = await storage.updateBookingSlot(id, req.body);
      res.json({ slot });
    } catch (error) {
      console.error("Error updating booking slot:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/organizations/staff-login - Staff login
  app.post("/api/organizations/staff-login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      const allUsers = await db.select().from(orgUsers).where(eq(orgUsers.email, email));
      if (allUsers.length === 0) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      let matchedUser = null;
      for (const user of allUsers) {
        const isValid = await verifyPassword(password, user.passwordHash);
        if (isValid) {
          matchedUser = user;
          break;
        }
      }

      if (!matchedUser) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const org = await storage.getOrganizationById(matchedUser.organizationId);
      if (!org) {
        return res.status(401).json({ error: "Organization not found" });
      }

      const branchesList = await storage.getBranchesByOrganization(org.id);
      const branchesWithServices = await Promise.all(branchesList.map(async (branch) => {
        const services = await storage.getServicesByBranch(branch.id);
        const journeys = await storage.getJourneysByBranch(branch.id);
        const journeysWithStages = await Promise.all(journeys.map(async (j) => {
          const data = await storage.getJourneyWithStages(j.id);
          return data ? { ...data.journey, stages: data.stages } : j;
        }));
        const operatingHoursData = await storage.getOperatingHours(branch.id);
        const operatingHoursWithBreaks = await Promise.all(operatingHoursData.map(async (oh) => {
          const breaks = await storage.getBreakTimes(oh.id);
          return { ...oh, breaks };
        }));
        const holidaysData = await storage.getHolidays(branch.id);
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
            holidays: holidaysData,
          }
        };
      }));

      const users = await storage.getOrgUsersByOrganization(org.id);
      const usersWithBranches = await Promise.all(users.map(async (user) => {
        const branchIds = await storage.getOrgUserBranches(user.id);
        const userBranch = user.branchId ? branchesList.find(b => b.id === user.branchId) : null;
        return {
          ...user,
          branchIds,
          branchName: userBranch?.name,
        };
      }));

      const matchedBranchIds = await storage.getOrgUserBranches(matchedUser.id);

      const stats = branchesList.length > 0
        ? await storage.getQueueStats(branchesList[0].id)
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
        currentUser: {
          id: matchedUser.id,
          name: matchedUser.name,
          email: matchedUser.email,
          role: matchedUser.role,
          branchId: matchedUser.branchId,
          branchIds: matchedBranchIds,
          assignedServiceIds: matchedUser.assignedServiceIds,
          profilePictureUrl: matchedUser.profilePictureUrl,
        },
      });
    } catch (error) {
      console.error("Error staff login:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/organizations/:id - Update organization profile
  app.put("/api/organizations/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { name, phone, logoUrl } = req.body;
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (phone !== undefined) updateData.phone = phone;
      if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
      const org = await storage.updateOrganization(id, updateData);
      res.json({ organization: org });
    } catch (error) {
      console.error("Error updating organization:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/organizations/:id/password - Change organization password
  app.post("/api/organizations/:id/password", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { currentPassword, newPassword } = req.body;

      const org = await storage.getOrganizationById(id);
      if (!org) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const isValid = await verifyPassword(currentPassword, org.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      const newHash = await hashPassword(newPassword);
      await storage.updateOrganization(id, { passwordHash: newHash });
      res.json({ success: true });
    } catch (error) {
      console.error("Error changing organization password:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/upload/profile-picture - Upload profile picture
  app.post("/api/upload/profile-picture", async (req: Request, res: Response) => {
    try {
      const { image } = req.body;
      if (!image || typeof image !== "string") {
        return res.status(400).json({ error: "No image data provided" });
      }

      const matches = image.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
      if (!matches) {
        return res.status(400).json({ error: "Invalid image data format" });
      }

      const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
      const data = matches[2];
      const fileName = `profile_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const uploadDir = path.resolve(process.cwd(), "server/uploads/profiles");
      
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      fs.writeFileSync(path.join(uploadDir, fileName), data, "base64");
      const url = `/uploads/profiles/${fileName}`;
      res.json({ url });
    } catch (error) {
      console.error("Error uploading profile picture:", error);
      res.status(500).json({ error: "Failed to upload image" });
    }
  });

  // PUT /api/dashboard/profile/:userId - Update profile
  app.put("/api/dashboard/profile/:userId", async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId as string;
      const { name, phone, profilePictureUrl } = req.body;
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (phone !== undefined) updateData.phone = phone;
      if (profilePictureUrl !== undefined) updateData.profilePictureUrl = profilePictureUrl;
      const user = await storage.updateOrgUser(userId, updateData);
      res.json({ user });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/dashboard/profile/:userId/password - Change password
  app.post("/api/dashboard/profile/:userId/password", async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId as string;
      const { currentPassword, newPassword } = req.body;

      const user = await storage.getOrgUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const isValid = await verifyPassword(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      const newHash = await hashPassword(newPassword);
      await storage.updateOrgUser(userId, { passwordHash: newHash });
      res.json({ success: true });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // WHATSAPP WEBHOOK ENDPOINTS
  // ============================================

  app.get("/webhook/whatsapp", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === getVerifyToken()) {
      console.log("WhatsApp webhook verified");
      return res.status(200).send(challenge);
    }
    res.sendStatus(403);
  });

  app.post("/webhook/whatsapp", async (req: Request, res: Response) => {
    try {
      const body = req.body;

      if (body.from && body.message) {
        const from = body.from;
        const text = body.message;
        console.log(`WhatsApp message (direct) from ${from}: ${text}`);
        await processIncomingWhatsApp(from, text);
        return res.json({ status: "processed", from, message: text });
      }

      if (body.object === "whatsapp_business_account") {
        const entries = body.entry || [];
        for (const entry of entries) {
          const changes = entry.changes || [];
          for (const change of changes) {
            if (change.field !== "messages") continue;

            const messages = change.value?.messages || [];
            for (const message of messages) {
              if (message.type === "text") {
                const from = message.from;
                const text = message.text?.body || "";
                console.log(`WhatsApp message from ${from}: ${text}`);
                processIncomingWhatsApp(from, text).catch(console.error);
              }
            }
          }
        }
        return res.sendStatus(200);
      }

      return res.sendStatus(200);
    } catch (error) {
      console.error("WhatsApp webhook error:", error);
      res.sendStatus(200);
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
