import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { timingSafeEqual, randomBytes } from "node:crypto";
import path from "path";
import fs from "fs";

function timingSafeEqualStrings(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
import { storage, hashPassword, verifyPassword } from "./storage";
import { getBranchAvailability } from "./branch-availability";
import { registerBillingRoutes } from "./billing-routes";
import { registerReportRoutes } from "./reports";
import { broadcastAnnouncement } from "./announcements";
import {
  checkAndSendQueueNotifications,
  sendCalledNotification,
  sendCheckinConfirmationNotification,
  sendDineInCalledNotification,
  sendDineInBookingConfirmedNotification,
  sendTakeawayReadyNotification,
  sendTakeawayDeliveredNotification,
  sendTakeawayConfirmedNotification,
  sendQueueJoinedNotification,
  sendStatusChangeNotification,
  notifyServiceQueueStatusChange,
} from "./notifications";
import { generateRefCode, getWhatsAppRedirectUrl, processIncomingWhatsApp, getVerifyToken, sendWhatsAppStatusChangeNotification, sendWhatsAppOTP, sendWhatsAppMessage } from "./whatsapp";
import { evaluateBranchAlerts, notifyOrgServiceQueueStatusChange, buildTestAlertMessage, buildTestAlertTitle, sendAlertToRecipient } from "./branch-alerts";
import { invalidateWaTemplateCache } from "./wa-templates";
import { getWaTemplateBundle } from "@shared/wa-templates";
import { isSupportedLanguage } from "@shared/languages";
import { db } from "./db";
import { orgUsers, tickets as ticketsTable, otpCodes, organizations } from "@shared/schema";
import { eq, and, gt, desc, sql } from "drizzle-orm";
import {
  PERMISSION_CATALOG,
  ALL_PERMISSION_KEYS,
  BUILT_IN_ROLES,
} from "@shared/permissions";
import {
  getPermissionsForUser,
  writeAudit,
  getActorInfo,
  BUILT_IN_ROLE_KEYS,
  getBuiltinPermissions,
  requirePermission,
  publicRoute,
  assertOrgRouteCoverage,
  isSuperAdminRequest,
  getRequestUserId,
  makeSuperAdminCookie,
  clearSuperAdminCookie,
  makeOrgSessionCookie,
  makeOwnerSessionCookie,
  clearOrgSessionCookie,
  OWNER_PREFIX,
  assertOrgOwnership,
  assertBranchOwnership,
  assertServiceOwnership,
  assertOrgUserOwnership,
  assertOperatingHourOwnership,
  assertBreakOwnership,
  assertHolidayOwnership,
  assertJourneyOwnership,
  assertTicketOwnership,
  assertDeskOwnership,
  assertAppointmentOwnership,
  assertReservationOwnership,
  assertBookingSlotOwnership,
  resolveAssignableRole,
  sanitizeOrgUser,
  getCallerContext,
  callerCanAccessBranch,
  callerCanManageTargetUser,
} from "./rbac";
import { getRoleRank } from "@shared/permissions";
import {
  assertCanCreateBranch,
  assertCanCreateOrgUser,
  assertCanCreateService,
  assertCanCreateDesk,
  assertCanCreateTicketForOrg,
  assertSubscriptionActive,
  getPlanUsageSnapshot,
} from "./plan-limits";
import { ensureTrialSubscription } from "./subscription-service";
import {
  sendOrgVerificationEmail,
  sendOrgVerificationOtpEmail,
  getPublicBaseUrl,
  isMailerConfigured,
} from "./mailer";

function hasSuperAdminCookie(req: Request): boolean {
  return isSuperAdminRequest(req);
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function registerRoutes(app: Express): Promise<Server> {
  registerBillingRoutes(app);
  registerReportRoutes(app);

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

      if (branch.isActive === false) {
        return res.status(404).json({ error: "Branch not found" });
      }

      const org = await storage.getOrganizationById(branch.organizationId);
      const branchServices = await storage.getServicesByBranch(branchId);
      const activeTickets = await storage.getActiveTicketsByBranch(branchId);
      const availability = await getBranchAvailability(branchId);

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
          inPersonPerimeterMeters: service.inPersonPerimeterMeters,
          queueStatus: (service as any).queueStatus || "active",
        };
      });

      // The schedule-derived `effectiveQueueStatus` shadows the raw branch
      // status when the schedule says we're closed. Both fields are emitted
      // so clients that care about the override can show a different label.
      const manualQueueStatus = branch.queueStatus || "active";
      const effectiveQueueStatus = availability.overrideActive
        ? manualQueueStatus
        : (manualQueueStatus === "ended" || manualQueueStatus === "paused"
            ? manualQueueStatus
            : availability.effectiveQueueStatus);

      res.json({
        branchId: branch.id,
        branchName: branch.name,
        organizationName: org?.name || "Organization",
        latitude: branch.latitude ? parseFloat(branch.latitude) : null,
        longitude: branch.longitude ? parseFloat(branch.longitude) : null,
        branchQueueStatus: effectiveQueueStatus,
        manualQueueStatus,
        availability,
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

      if (branch.isActive === false) {
        return res.status(403).json({ error: "This branch is currently unavailable." });
      }

      if (branch.queueStatus === "paused") {
        return res.status(403).json({ error: "Queue is temporarily paused. Please try again later." });
      }
      if (branch.queueStatus === "ended") {
        return res.status(403).json({ error: "Queue is closed for the day." });
      }

      // Schedule-driven gate: working hours / holidays / breaks. When the
      // branch is closed by schedule (and admin hasn't enabled override),
      // we refuse the join and surface the explanatory message. Breaks
      // intentionally fall through — customers ARE allowed to queue during
      // a break, they just see a banner about the resume time.
      const availability = await getBranchAvailability(branch.id);
      if (!availability.canJoin) {
        return res.status(403).json({
          error: availability.message,
          state: availability.state,
          availability,
        });
      }

      // Subscription gate: an expired trial / unpaid period blocks all
      // queue activity (both customer-side join and staff-side processing).
      // Checked before service lookup so an expired org returns the
      // billing 402 even when a serviceId is missing or invalid — the
      // queue is fundamentally unavailable, so the precise service
      // error would just be misleading.
      if (!await assertSubscriptionActive(req, res, branch.organizationId)) return;

      const service = await storage.getServiceById(serviceId);
      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }

      if (!service.isActive) {
        return res.status(403).json({ error: "This service is currently unavailable." });
      }

      if ((service as any).queueStatus === "paused") {
        return res.status(403).json({ error: `${service.name} queue is temporarily paused. Please try again later.` });
      }
      if ((service as any).queueStatus === "ended") {
        return res.status(403).json({ error: `${service.name} queue is closed for the day.` });
      }
      // Plan cap: refuse new ticket if org has hit its daily-tickets allowance.
      // Done after queue/service paused-checks so customers get the most
      // specific error message first (queue closed > plan exhausted).
      if (!await assertCanCreateTicketForOrg(req, res, branch.organizationId)) return;
      
      const source = req.body.source || "qr";
      const priority = req.body.priority || "normal";
      const formData = req.body.formData || customFields || {};
      const pushToken = req.body.pushToken || null;
      const customerId = req.body.customerId || null;

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
        ...(customerId ? { customerId } : {}),
      });
      
      const position = ticket.position;
      const estimatedWait = position * service.averageWaitTime;
      
      const whatsappUrl = whatsappRefCode ? getWhatsAppRedirectUrl(whatsappRefCode) : undefined;

      const branchName = branch.name || "Queue";
      const queueMode = branch.queueMode || "fifo";
      const isDineIn = queueMode === "dine_in" || queueMode === "dinein";
      if (pushToken) {
        if (isDineIn) {
          sendDineInBookingConfirmedNotification(ticket.id, branchName).catch(console.error);
        } else if (queueMode === "takeaway") {
          sendTakeawayConfirmedNotification(ticket.id, branchName).catch(console.error);
        } else {
          sendQueueJoinedNotification(ticket.id, branchName).catch(console.error);
        }
      }

      evaluateBranchAlerts(branchId).catch(console.error);

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
  
  app.post("/api/tickets/:ticketId/push-token", publicRoute("ticket holder registers own push token"), async (req: Request, res: Response) => {
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

  app.post("/api/tickets/:ticketId/acknowledge", publicRoute("ticket holder acknowledges own notification"), async (req: Request, res: Response) => {
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

  app.post("/api/tickets/:ticketId/snooze", publicRoute("ticket holder snoozes own notification"), async (req: Request, res: Response) => {
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

      const waitingTickets = await storage.getWaitingTicketsForBranch(ticket.branchId, ticket.serviceId || undefined);
      const others = waitingTickets.filter(t => t.id !== ticket.id);
      const targetIndex = Math.min(others.length - 1, Math.max(0, ticket.position - 1 + clampedPositions - 1));
      const anchor = others[targetIndex];
      let newJoinedAt = ticket.joinedAt;
      if (anchor) {
        newJoinedAt = new Date(new Date(anchor.joinedAt).getTime() + 1000);
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

  app.get("/super-admin", (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) {
      return res.redirect("/dashboard");
    }
    const superAdminPath = path.join(__dirname, "templates", "super-admin.html");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, must-revalidate");
    res.sendFile(superAdminPath);
  });

  app.post("/super-admin/logout", (_req: Request, res: Response) => {
    res.setHeader("Set-Cookie", [clearSuperAdminCookie(), clearOrgSessionCookie()]);
    res.json({ ok: true });
  });

  // Org dashboard logout — clears both the org session cookie and any stale
  // Super-Admin cookie so the next sign-in starts from a clean state.
  app.post("/api/organizations/logout", (_req: Request, res: Response) => {
    res.setHeader("Set-Cookie", [clearSuperAdminCookie(), clearOrgSessionCookie()]);
    res.json({ ok: true });
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

  app.get("/announce/:deviceToken", (req: Request, res: Response) => {
    const templatePath = path.join(__dirname, "templates", "announcement-player.html");
    if (fs.existsSync(templatePath)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, must-revalidate");
      res.sendFile(templatePath);
    } else {
      res.status(404).send("Announcement player not found");
    }
  });
  
  app.get("/api/reserve/:branchId", async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      const dateStr = req.query.date as string || new Date().toISOString().split('T')[0];
      const date = new Date(dateStr);
      
      const branch = await storage.getBranchById(branchId);
      if (!branch || branch.isActive === false) {
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
      if (branch.isActive === false) {
        return res.status(403).json({ error: "This branch is currently unavailable." });
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
      const allBranches = (await storage.getAllBranches()).filter(b => b.isActive !== false);
      // Compute schedule availability for every branch in parallel up-front
      // so the per-branch loop below doesn't serialise N database round-trips.
      // Indexed by branch.id for O(1) lookup inside the loop.
      const availabilityByBranch = new Map<string, Awaited<ReturnType<typeof getBranchAvailability>>>();
      await Promise.all(allBranches.map(async b => {
        availabilityByBranch.set(b.id, await getBranchAvailability(b.id));
      }));
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
          category: ((branch.settings as any)?.queueMode === "dine_in" || (branch.settings as any)?.queueMode === "dinein" || branch.queueMode === "dine_in" || branch.queueMode === "dinein") ? "Restaurant" : "Services",
          logoUrl: org?.logoUrl || null,
          rating: 4.5,
          waitTime: estimatedWait,
          queueLength: totalWaiting,
          distance: "Nearby",
          latitude: branch.latitude ? parseFloat(branch.latitude as string) : 0,
          longitude: branch.longitude ? parseFloat(branch.longitude as string) : 0,
          queueStatus: branch.queueStatus || "active",
          // `isOpen` now folds in the working-hours/holiday schedule so the
          // discover feed greys out branches that are physically closed even
          // if their manual queueStatus is still "active". The branch's
          // schedule override (admin force-open) is honoured by the helper.
          // Lookup is O(1) via the precomputed map (no per-branch DB hit).
          isOpen: branch.isActive !== false
            && branch.queueStatus !== "ended"
            && branch.queueStatus !== "paused"
            && (availabilityByBranch.get(branch.id)?.canJoin ?? true),
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

      // Super Admin login — credentials live in env vars (SUPER_ADMIN_EMAIL /
      // SUPER_ADMIN_PASSWORD). Dev fallback ONLY when NODE_ENV !== 'production'
      // so production deployments cannot accidentally ship a hardcoded backdoor.
      const isProd = process.env.NODE_ENV === "production";
      const saEmail = (process.env.SUPER_ADMIN_EMAIL || (isProd ? "" : "superadmin@tiqkets.com")).trim().toLowerCase();
      const saPassword = process.env.SUPER_ADMIN_PASSWORD || (isProd ? "" : "superadmin123");
      const normalizedEmail = String(email ?? "").trim().toLowerCase();
      const normalizedPassword = String(password ?? "");
      if (
        saEmail &&
        saPassword &&
        normalizedEmail === saEmail &&
        timingSafeEqualStrings(normalizedPassword, saPassword)
      ) {
        res.setHeader("Set-Cookie", makeSuperAdminCookie());
        return res.json({
          superAdmin: true,
          redirect: "/super-admin",
          user: {
            id: "super_admin",
            name: "Super Admin",
            email: normalizedEmail,
            role: "super_admin",
          },
        });
      }

      const org = await storage.getOrganizationByEmail(email);
      if (!org) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      const isValid = await verifyPassword(password, org.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Block any session issuance for orgs that have not completed email
      // verification. This is the load-bearing gate for the OTP flow — the
      // registration endpoint deliberately does NOT issue a session, so the
      // login endpoint must also refuse until isVerified=true. The frontend
      // uses these fields to pivot the user to the verify screen with a
      // pre-filled orgId/email so they can finish verification (or request
      // a fresh OTP) without re-typing the registration form.
      if (!org.isVerified) {
        return res.status(403).json({
          error: "Please verify your email address before signing in.",
          requiresEmailVerification: true,
          organizationId: org.id,
          email: org.email,
        });
      }

      // Clear any stale Super-Admin cookie left over from a prior SA session
      // in the same browser; otherwise gated routes would see SA precedence
      // and grant the org owner full platform-wide permissions.
      res.setHeader("Set-Cookie", [clearSuperAdminCookie(), makeOwnerSessionCookie(org.id)]);

      const branches = await storage.getBranchesByOrganization(org.id);
      const branchesWithServices = await Promise.all(branches.map(async (branch) => {
        const rawServices = await storage.getServicesByBranch(branch.id);
        const services = await Promise.all(rawServices.map(async (service) => {
          const desks = await storage.getDesksByService(service.id);
          return { ...service, desks };
        }));
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
          ...sanitizeOrgUser(user)!,
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
        permissions: await storage.getRolePermissionsByKey("admin"),
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
        if (existingOrg.isVerified) {
          // Email belongs to a real, verified org — reject so the
          // owner uses the login flow / password-reset instead of
          // silently overwriting their account.
          return res.status(400).json({ error: "Organization with this email already exists" });
        }
        // Existing org is half-registered (never verified). Treat this
        // request as a controlled "restart registration": delete the
        // stale row (FKs cascade to branches, org users, sessions, etc.
        // — see shared/schema.ts onDelete: "cascade") and fall through
        // to the normal create path below. This prevents users from
        // being permanently locked out of an email address they own
        // just because they abandoned a previous signup, and also
        // self-heals the case where a stranger tried to squat the
        // email — they couldn't have verified without controlling the
        // inbox, so the real owner can simply re-register.
        //
        // BUT: refuse to reclaim an org that's only seconds old. The
        // create flow below isn't a single atomic transaction (the
        // branch INSERT and its child operating_hours INSERT happen as
        // separate statements inside storage.createBranch, and we go on
        // to provision starter users after that). If a parallel
        // restart-register grabbed the freshly-inserted org between
        // those statements, our cascade-delete would wipe the still-
        // being-provisioned branch out from under the original
        // request, causing FK violations. A short grace window
        // (provisioning takes well under a second; we use 10s of
        // safety) closes that window while remaining invisible to
        // legitimate UX flows — by the time a user has clicked back
        // out of the verify screen and resubmitted register, the
        // grace period has long since elapsed.
        const RESTART_GRACE_MS = 10_000;
        const orgAgeMs = Date.now() - new Date(existingOrg.createdAt).getTime();
        // Fail closed if createdAt is missing/malformed (would yield NaN)
        // or implausibly in the future (clock skew). Schema guarantees a
        // non-null defaultNow() value so this is purely defense-in-depth.
        if (!Number.isFinite(orgAgeMs) || orgAgeMs < RESTART_GRACE_MS) {
          return res.status(400).json({ error: "Organization with this email already exists" });
        }
        // The DELETE is conditional on is_verified=false so a concurrent
        // verify between our read and our delete cannot result in us
        // wiping an org that just became verified. If the delete affects
        // zero rows we treat the email as "now verified by someone else"
        // and reject this registration attempt.
        const deletedRows = await db
          .delete(organizations)
          .where(and(eq(organizations.id, existingOrg.id), eq(organizations.isVerified, false)))
          .returning({ id: organizations.id });
        if (deletedRows.length === 0) {
          return res.status(400).json({ error: "Organization with this email already exists" });
        }
      }

      // Pre-issue a 6-digit email-verification OTP at create time so the
      // INSERT, the stored value, and the outgoing email all use the same
      // code. We use OTP (not a clickable link) because the registration
      // flow lives inside the Expo mobile app — a deep-link round-trip
      // through a browser is fragile, and copying a 6-digit code is the
      // industry-standard pattern users are familiar with.
      //
      // 10-minute expiry: short enough to limit replay, long enough to
      // accommodate slow inboxes / users who get distracted mid-signup.
      // Registration NEVER blocks on email delivery — if SMTP is down the
      // owner can hit "Resend code" once they're on the verify screen.
      const verificationToken = generateOTP();
      const OTP_EXPIRY_MINUTES = 10;
      const verificationTokenExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

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
        verificationToken,
        verificationTokenExpiresAt,
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

      // Auto-provision a starter "Main Service" with a "Counter 1" desk so a
      // fresh org can immediately accept tickets without first wiring up the
      // services/desks tree by hand. Wrapped in try/catch so a failure here
      // never aborts the registration — the owner can still configure these
      // manually from the dashboard.
      try {
        const mainService = await storage.createService({
          branchId: branch.id,
          name: "Main Service",
          averageWaitTime: 15,
          estimatedDuration: 20,
          inputFields: [],
          requiresInPersonRegistration: false,
          inPersonPerimeterMeters: 100,
          isActive: true,
          queueStatus: "active",
        });
        await storage.createDesk({
          serviceId: mainService.id,
          branchId: branch.id,
          name: "Counter 1",
          isActive: true,
          queueStatus: "active",
          sortOrder: 0,
        });
      } catch (seedErr) {
        console.warn(`[register] Failed to seed Main Service/Counter 1 for org=${org.id}:`, seedErr);
      }

      // Primary user is the org ADMIN (rank 100) — full org access. Re-uses
      // the org's own email/password so the registrant can sign in immediately
      // either via the org login (cookie) or staff-login (rank-aware).
      const ownerUser = await storage.createOrgUser({
        organizationId: org.id,
        name: name || "Admin",
        email,
        password,
        role: "admin",
        isActive: true,
      });

      // Auto-provision a starter user for each downstream role so the owner
      // doesn't have to set them up by hand. Permissions on each user are
      // resolved from the role catalog (controlled by Super Admin) via
      // createOrgUser populating roleId from the role key.
      //
      // Each starter gets a UNIQUE random temp password (returned ONCE in the
      // response) — avoids the "globally known shared default password"
      // attack surface where every fresh org would otherwise share the same
      // credentials on guessable addresses.
      const generateStarterPassword = (): string => {
        // 12 chars, base64url-style, no ambiguous characters. Always includes
        // a fixed prefix so the owner can recognize it as a starter password.
        const raw = randomBytes(9).toString("base64").replace(/[+/=]/g, "");
        return `Tk-${raw}`;
      };
      const emailDomain = email.includes("@") ? email.split("@")[1] : "tiqkets.local";
      const ownerLocal = email.includes("@") ? email.split("@")[0].toLowerCase() : "";

      const starterTemplates: Array<{ role: string; name: string; localPart: string }> = [
        { role: "location_manager", name: "Location Manager", localPart: "location" },
        { role: "floor_manager", name: "Floor Manager", localPart: "floor" },
        { role: "front_desk", name: "Front Desk", localPart: "front" },
      ];

      const createdStarters: Array<{ role: string; name: string; email: string; password: string }> = [];
      void ownerLocal; // reserved for potential future heuristics
      const MAX_SUFFIX_ATTEMPTS = 50;
      for (const tpl of starterTemplates) {
        // If the owner already uses one of these local-parts (e.g. "admin@..."),
        // OR (defensively) the address is somehow already taken in this org,
        // append a numeric suffix until we find a free address. The unique
        // index is (email, organization_id).
        let suffix = 0;
        let candidate = `${tpl.localPart}@${emailDomain}`;
        let resolved = false;
        for (let i = 0; i < MAX_SUFFIX_ATTEMPTS; i++) {
          const clashesWithOwner = candidate.toLowerCase() === email.toLowerCase();
          const alreadyExists = clashesWithOwner
            ? false
            : !!(await storage.getOrgUserByEmail(candidate, org.id));
          if (!clashesWithOwner && !alreadyExists) {
            resolved = true;
            break;
          }
          suffix += 1;
          candidate = `${tpl.localPart}${suffix}@${emailDomain}`;
        }
        if (!resolved) {
          // Extremely unlikely on a brand-new org. Skip this starter rather
          // than letting createOrgUser throw and leave a half-provisioned
          // tenant. The owner can add the role manually via the Staff page.
          console.warn(
            `[register] Could not allocate a free email for starter role=${tpl.role} in org=${org.id}; skipping.`,
          );
          continue;
        }

        const tempPassword = generateStarterPassword();
        const starter = await storage.createOrgUser({
          organizationId: org.id,
          name: tpl.name,
          email: candidate,
          password: tempPassword,
          role: tpl.role,
          branchId: branch.id,
          isActive: true,
        });
        await storage.setOrgUserBranches(starter.id, [branch.id]);

        createdStarters.push({
          role: tpl.role,
          name: tpl.name,
          email: candidate,
          password: tempPassword,
        });
      }

      // Auto-enroll the new org into a 14-day free trial. Done after the
      // org + branch + users are created so a partial provisioning failure
      // doesn't leave a dangling trial subscription pointing at a missing
      // org. Failures here are logged but don't block registration —
      // billing routes will lazily create the trial on first read if it
      // ever ends up missing.
      try {
        await ensureTrialSubscription(org.id);
      } catch (e) {
        console.error("[register] Failed to enroll trial for org", org.id, e);
      }

      // Fire-and-forget OTP email. We do NOT await — a slow or down SMTP
      // relay must not delay or fail registration. The mailer itself never
      // throws (returns false on failure) but we still wrap in .catch as a
      // defence-in-depth measure. If delivery fails, the owner can hit
      // "Resend code" on the verify screen which retries.
      void sendOrgVerificationOtpEmail({
        to: email,
        orgName: name || "your organization",
        recipientName: name || "there",
        otp: verificationToken,
        expiresInMinutes: OTP_EXPIRY_MINUTES,
      }).catch((err) => {
        console.error("[register] Verification OTP email failed for", org.id, err);
      });

      // IMPORTANT: we do NOT issue a session cookie here, and we omit any
      // identifiers (userId, branchId, starter passwords) the client could
      // use to bypass verification. The frontend's contract is: see
      // `requiresEmailVerification: true`, navigate to the OTP screen,
      // call POST /verify-email-otp with {organizationId, otp}, and only
      // then proceed to login. Starter passwords are handed back AFTER
      // successful verification (see verify-email-otp endpoint) so they
      // never sit in client memory for an unverified org.
      res.json({
        success: true,
        requiresEmailVerification: true,
        organizationId: org.id,
        email: org.email,
        emailVerificationSent: isMailerConfigured(),
        otpExpiresInMinutes: OTP_EXPIRY_MINUTES,
      });
    } catch (error) {
      // Postgres unique-violation (errcode 23505) on the email column
      // means a concurrent register/restart-register won the race and
      // inserted the same email between our deletion check and our
      // insert. Return a clean 400 instead of a generic 500 so the
      // client can surface a sensible message ("already registered —
      // try again or sign in") rather than an internal-error toast.
      const pgCode = (error as { code?: string } | null | undefined)?.code;
      if (pgCode === "23505") {
        return res.status(400).json({ error: "Organization with this email already exists" });
      }
      console.error("Error registering organization:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/organizations/verify-email/:token
  // Public link emailed to the org owner on registration. Validates the
  // token + expiry, sets is_verified=true, clears the single-use token,
  // and renders a small confirmation HTML page (this endpoint is opened
  // directly in the browser from the email client). We respond with HTML
  // rather than JSON because the user lands here from an email client.
  app.get("/api/organizations/verify-email/:token", publicRoute("email verification landing"), async (req: Request, res: Response) => {
    const baseUrl = getPublicBaseUrl();
    const renderPage = (status: "success" | "expired" | "invalid" | "already", message: string) => {
      const heading = {
        success: "Email confirmed",
        already: "Already confirmed",
        expired: "Link expired",
        invalid: "Invalid link",
      }[status];
      const color = status === "success" || status === "already" ? "#16A34A" : "#DC2626";
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(status === "success" || status === "already" ? 200 : 400).send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${heading} — TIQKETS</title></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Helvetica,Arial,sans-serif;color:#0F172A;">
<div style="max-width:520px;margin:80px auto;background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
  <div style="background:#0F172A;padding:18px 24px;color:#fff;font-weight:700;letter-spacing:1px;">TIQKETS</div>
  <div style="padding:32px 28px;">
    <h1 style="margin:0 0 12px;font-size:22px;color:${color};">${heading}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#0F172A;">${message}</p>
    <a href="${baseUrl}/dashboard" style="display:inline-block;padding:11px 22px;background:#2563EB;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Open dashboard</a>
  </div>
</div></body></html>`);
    };

    try {
      const token = req.params.token as string;
      // Only accept the legacy 64-char hex token here. We deliberately do
      // NOT accept the 6-digit OTPs the new flow stores in the same
      // column — this route is unauthenticated and unthrottled, so
      // shrinking the search space to ~10^6 codes would make brute-force
      // verification of arbitrary orgs trivial. OTP verification must go
      // through POST /verify-email-otp which scopes the lookup to a known
      // organizationId and enforces a per-org attempts cap. We also
      // require a strict hex character class so a caller can't smuggle a
      // specially-padded short token through length tricks.
      if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
        return renderPage("invalid", "This verification link is malformed. Please request a new one from your dashboard.");
      }
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.verificationToken, token))
        .limit(1);
      if (!org) {
        return renderPage("invalid", "We couldn't find a matching verification request. The link may have already been used or revoked.");
      }
      if (org.isVerified) {
        return renderPage("already", "Your email is already confirmed — you're all set.");
      }
      if (
        org.verificationTokenExpiresAt &&
        new Date(org.verificationTokenExpiresAt).getTime() < Date.now()
      ) {
        return renderPage("expired", "This verification link expired. Sign in to your dashboard to request a fresh one.");
      }
      await storage.updateOrganization(org.id, {
        isVerified: true,
        verificationToken: null,
        verificationTokenExpiresAt: null,
      });
      return renderPage("success", `Thanks! Your email is confirmed for <strong>${(org.name || "your organization").replace(/[<>&"']/g, "")}</strong>. You can return to the dashboard.`);
    } catch (error) {
      console.error("Error verifying email:", error);
      return renderPage("invalid", "Something went wrong while confirming your email. Please try again later.");
    }
  });

  // POST /api/organizations/verify-email-otp
  // In-app OTP verification — the primary path the mobile app uses to
  // confirm email ownership after registration. Body: { organizationId, otp }.
  // On success, flips is_verified=true and clears the token. The client is
  // expected to call /api/organizations/login with the credentials it
  // already has from the registration form right after this returns.
  //
  // Hardening:
  //  - Public endpoint by design (caller has no session yet); we limit
  //    blast radius via per-org attempt counter (max 5) + 10-min token
  //    expiry. After the cap, the only path forward is a fresh resend.
  //  - Constant-ish error wording so an attacker can't distinguish
  //    "wrong code" from "no such org" from "expired" — they all just
  //    say the verification failed.
  //  - Token cleared on success so a captured code is single-use.
  app.post(
    "/api/organizations/verify-email-otp",
    publicRoute("org email OTP verification"),
    async (req: Request, res: Response) => {
      try {
        const organizationId = String(req.body?.organizationId ?? "").trim();
        const rawOtp = String(req.body?.otp ?? "").trim();
        // Strip whitespace/dashes the user may paste from the email.
        const otp = rawOtp.replace(/\D+/g, "");

        if (!organizationId) {
          return res.status(400).json({ error: "Organization id is required." });
        }
        if (!/^\d{6}$/.test(otp)) {
          return res.status(400).json({ error: "Please enter the 6-digit code from your email." });
        }

        const org = await storage.getOrganizationById(organizationId);
        if (!org) {
          // Don't leak whether the org exists.
          return res.status(400).json({ error: "Verification failed. Please request a new code." });
        }
        if (org.isVerified) {
          // Idempotent: if it's already verified, treat as success so the
          // client can move on. No new token to clear.
          return res.json({ success: true, alreadyVerified: true });
        }

        const MAX_ATTEMPTS = 5;
        // Note: we don't pre-check the cap here. The check + increment
        // happens atomically in a single SQL UPDATE below — pre-checking
        // would re-introduce the race we just closed (parallel wrong
        // submissions reading attempts=N-1 and all being allowed in).

        const tokenExpired =
          !org.verificationTokenExpiresAt ||
          new Date(org.verificationTokenExpiresAt).getTime() < Date.now();
        if (!org.verificationToken || tokenExpired) {
          return res.status(400).json({
            error: "Your verification code has expired. Please request a new one.",
            requiresResend: true,
          });
        }

        // Constant-time compare to avoid leaking partial-match timing.
        const expected = Buffer.from(org.verificationToken, "utf8");
        const provided = Buffer.from(otp, "utf8");
        const matches =
          expected.length === provided.length &&
          timingSafeEqual(expected, provided);

        if (!matches) {
          // Increment attempts atomically AND enforce the cap in the
          // same SQL statement. The WHERE clause requires the current
          // value to be < MAX_ATTEMPTS, so once the cap is reached the
          // UPDATE matches zero rows and no further increment occurs —
          // closing the race where parallel wrong submissions could all
          // pass a pre-check and each get an extra guess. We also gate
          // on is_verified=false so a successful concurrent verify can't
          // be undone by a slow wrong-OTP submission.
          const updatedRows = await db
            .update(organizations)
            .set({
              verificationOtpAttempts: sql`${organizations.verificationOtpAttempts} + 1`,
            })
            .where(
              sql`${organizations.id} = ${org.id} AND ${organizations.isVerified} = false AND COALESCE(${organizations.verificationOtpAttempts}, 0) < ${MAX_ATTEMPTS}`,
            )
            .returning({ attempts: organizations.verificationOtpAttempts });

          if (updatedRows.length === 0) {
            // Either the cap was already hit by a concurrent request, or
            // the org was just verified by another flow. Treat as
            // cap-reached and tell the client to resend.
            return res.status(429).json({
              error: "Too many incorrect attempts. Please request a new code.",
              attemptsRemaining: 0,
              requiresResend: true,
            });
          }

          const newAttempts = updatedRows[0].attempts ?? MAX_ATTEMPTS;
          const remaining = Math.max(0, MAX_ATTEMPTS - newAttempts);
          return res.status(400).json({
            error:
              remaining > 0
                ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
                : "Incorrect code. Please request a new one.",
            attemptsRemaining: remaining,
            requiresResend: remaining === 0,
          });
        }

        // Success — flip the flag, clear the token, reset attempts so the
        // record is in a clean post-verification state.
        await storage.updateOrganization(org.id, {
          isVerified: true,
          verificationToken: null,
          verificationTokenExpiresAt: null,
          verificationOtpAttempts: 0,
        });

        return res.json({ success: true });
      } catch (error) {
        console.error("Error verifying org email OTP:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // POST /api/organizations/resend-email-otp
  // Issue a fresh 6-digit code for the given org. Used both immediately
  // after registration (if the first email never arrived) and from the
  // dashboard later (if the owner closed the app and came back).
  //
  // Rate limit: 60 seconds between sends per org. We derive this from the
  // existing token's age (token created at expiry - 10min) so we don't
  // need a separate "last-sent" column.
  app.post(
    "/api/organizations/resend-email-otp",
    publicRoute("org email OTP resend"),
    async (req: Request, res: Response) => {
      try {
        const organizationId = String(req.body?.organizationId ?? "").trim();
        if (!organizationId) {
          return res.status(400).json({ error: "Organization id is required." });
        }
        const org = await storage.getOrganizationById(organizationId);
        if (!org) {
          // Don't leak existence — pretend it worked.
          return res.json({ success: true });
        }
        if (org.isVerified) {
          // Nothing to send; signal success so client can move on.
          return res.json({ success: true, alreadyVerified: true });
        }

        const OTP_EXPIRY_MINUTES = 10;
        const RESEND_COOLDOWN_MS = 60 * 1000;
        if (org.verificationTokenExpiresAt) {
          const issuedAtMs =
            new Date(org.verificationTokenExpiresAt).getTime() -
            OTP_EXPIRY_MINUTES * 60 * 1000;
          const sinceIssue = Date.now() - issuedAtMs;
          if (sinceIssue >= 0 && sinceIssue < RESEND_COOLDOWN_MS) {
            const retryAfterSec = Math.ceil(
              (RESEND_COOLDOWN_MS - sinceIssue) / 1000,
            );
            res.setHeader("Retry-After", String(retryAfterSec));
            return res.status(429).json({
              error: `Please wait ${retryAfterSec}s before requesting another code.`,
              retryAfterSec,
            });
          }
        }

        const newOtp = generateOTP();
        const newExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
        await storage.updateOrganization(org.id, {
          verificationToken: newOtp,
          verificationTokenExpiresAt: newExpiry,
          verificationOtpAttempts: 0,
        });

        void sendOrgVerificationOtpEmail({
          to: org.email,
          orgName: org.name || "your organization",
          recipientName: org.name || "there",
          otp: newOtp,
          expiresInMinutes: OTP_EXPIRY_MINUTES,
        }).catch((err) => {
          console.error("[resend-email-otp] Send failed for", org.id, err);
        });

        return res.json({
          success: true,
          emailSent: isMailerConfigured(),
          otpExpiresInMinutes: OTP_EXPIRY_MINUTES,
        });
      } catch (error) {
        console.error("Error resending org email OTP:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  app.get("/api/branches/:branchId/queue", publicRoute("public queue display for waiting customers"), async (req: Request, res: Response) => {
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

  app.post("/api/branches/:branchId/queue/call-next", requirePermission("org.queue.call_next"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const { serviceId, deskId, deskName, tableNumber } = req.body;
      if (serviceId && !await assertServiceOwnership(req, res, serviceId)) return;

      // Block staff-side queue processing once the org's trial/period has
      // expired. Resolve the org from the branch we already validated.
      const branchForGate = await storage.getBranchById(branchId);
      if (branchForGate && !await assertSubscriptionActive(req, res, branchForGate.organizationId)) return;

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
      const isDineIn = queueMode === "dine_in" || queueMode === "dinein";

      if (isDineIn) {
        sendDineInCalledNotification(ticket.id, branchName, tableNumber || null).catch(console.error);
      } else {
        await sendCalledNotification(ticket.id, branchName);
      }

      if (queueMode !== "checkin" && queueMode !== "check_in") {
        const updatedTicket = await storage.getTicketById(ticket.id);
        if (updatedTicket) {
          broadcastAnnouncement({
            type: "call",
            ticketNumber: updatedTicket.ticketNumber || "",
            customerName: updatedTicket.customerName || "",
            serviceName: updatedTicket.serviceName || "",
            deskName: deskName || updatedTicket.deskName || null,
            tableNumber: tableNumber || updatedTicket.tableNumber || null,
            queueMode,
            branchId,
            serviceId: updatedTicket.serviceId || null,
            stageName: null,
          });
        }
      }

      checkAndSendQueueNotifications(branchId, branchName, serviceId).catch(console.error);
      evaluateBranchAlerts(branchId).catch(console.error);

      res.json({ ticket });
    } catch (error) {
      console.error("Error calling next:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/tickets/:ticketId", publicRoute("ticket holder views own ticket status by ticket id"), async (req: Request, res: Response) => {
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

  app.get("/api/customers/:customerId/active-ticket", async (req: Request, res: Response) => {
    try {
      const customerId = req.params.customerId as string;
      const customerTickets = await storage.getTicketsByCustomer(customerId);
      const activeTicket = customerTickets.find(t =>
        !["completed", "cancelled", "no_show"].includes(t.status)
      );
      if (activeTicket) {
        const branch = await storage.getBranchById(activeTicket.branchId);
        let organizationName = "";
        if (branch) {
          const org = await storage.getOrganizationById(branch.organizationId);
          organizationName = org?.name || branch.name || "";
        }
        res.json({ ticket: { ...activeTicket, organizationName } });
      } else {
        res.json({ ticket: null });
      }
    } catch (error) {
      console.error("Error getting active ticket for customer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/call", requirePermission("org.queue.call_specific"), async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      if (!await assertTicketOwnership(req, res, ticketId)) return;
      const { deskId, deskName, tableNumber } = req.body || {};
      const ticket = await storage.getTicketById(ticketId);

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      // Block staff queue processing on expired subscriptions.
      const branchForGate = await storage.getBranchById(ticket.branchId);
      if (branchForGate && !await assertSubscriptionActive(req, res, branchForGate.organizationId)) return;
      
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
      const isDineIn = queueMode === "dine_in" || queueMode === "dinein";

      if (isDineIn) {
        sendDineInCalledNotification(ticketId, branchName, tableNumber || null).catch(console.error);
      } else {
        await sendCalledNotification(ticketId, branchName);
      }

      if (queueMode !== "checkin" && queueMode !== "check_in") {
        broadcastAnnouncement({
          type: "call",
          ticketNumber: updated?.ticketNumber || ticket.ticketNumber || "",
          customerName: updated?.customerName || ticket.customerName || "",
          serviceName: updated?.serviceName || ticket.serviceName || "",
          deskName: deskName || updated?.deskName || ticket.deskName || null,
          tableNumber: tableNumber || updated?.tableNumber || ticket.tableNumber || null,
          queueMode,
          branchId: ticket.branchId,
          serviceId: ticket.serviceId || null,
          stageName: null,
        });
      }
      
      if (ticket.branchId) {
        await storage.recalculatePositions(ticket.branchId, ticket.serviceId || undefined);
        checkAndSendQueueNotifications(ticket.branchId, branchName, ticket.serviceId || undefined).catch(console.error);
        evaluateBranchAlerts(ticket.branchId).catch(console.error);
      }
      
      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error calling ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/serve", requirePermission("org.queue.call_next"), async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      if (!await assertTicketOwnership(req, res, ticketId)) return;
      const ticket = await storage.getTicketById(ticketId);
      if (ticket) {
        const branchForGate = await storage.getBranchById(ticket.branchId);
        if (branchForGate && !await assertSubscriptionActive(req, res, branchForGate.organizationId)) return;
      }

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
          broadcastAnnouncement({
            type: "serve",
            ticketNumber: ticket.ticketNumber || "",
            customerName: ticket.customerName || "",
            serviceName: ticket.serviceName || "",
            deskName: null,
            tableNumber: null,
            queueMode,
            branchId: ticket.branchId,
            serviceId: ticket.serviceId || null,
            stageName: null,
          });
        } else if (queueMode === "checkin") {
          sendCheckinConfirmationNotification(ticketId, branchName).catch(console.error);
        } else if (queueMode !== "dine_in" && queueMode !== "dinein") {
          sendStatusChangeNotification(ticketId, branchName, "serving").catch(console.error);
        }

        evaluateBranchAlerts(ticket.branchId).catch(console.error);
      }
      
      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error marking as serving:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/complete", requirePermission("org.queue.complete"), async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      if (!await assertTicketOwnership(req, res, ticketId)) return;
      const ticket = await storage.getTicketById(ticketId);

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      const branchForGate = await storage.getBranchById(ticket.branchId);
      if (branchForGate && !await assertSubscriptionActive(req, res, branchForGate.organizationId)) return;

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

        await storage.recalculatePositions(ticket.branchId, ticket.serviceId || undefined);
        checkAndSendQueueNotifications(ticket.branchId, branchName, ticket.serviceId || undefined).catch(console.error);
        evaluateBranchAlerts(ticket.branchId).catch(console.error);
      }
      
      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error completing ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/no-show", requirePermission("org.queue.no_show"), async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      if (!await assertTicketOwnership(req, res, ticketId)) return;
      const ticket = await storage.getTicketById(ticketId);

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      const branchForGate = await storage.getBranchById(ticket.branchId);
      if (branchForGate && !await assertSubscriptionActive(req, res, branchForGate.organizationId)) return;

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
        evaluateBranchAlerts(ticket.branchId).catch(console.error);
      }
      
      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error marking as no-show:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/arrive", requirePermission("org.queue.hold"), async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      if (!await assertTicketOwnership(req, res, ticketId)) return;
      const ticket = await storage.getTicketById(ticketId);
      
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Block all queue mutations on expired/no-sub orgs. Resolved off
      // the ticket's branch so we don't trust client-supplied org ids.
      const branchForGate = await storage.getBranchById(ticket.branchId);
      if (branchForGate && !await assertSubscriptionActive(req, res, branchForGate.organizationId)) return;

      if (ticket.status !== "called") {
        return res.status(400).json({ error: "Customer must be in called status to mark as arrived" });
      }
      
      const updated = await storage.updateTicket(ticketId, {
        status: "arrived",
        arrivedAt: new Date(),
      });
      
      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error marking as arrived:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/hold", requirePermission("org.queue.hold"), async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      if (!await assertTicketOwnership(req, res, ticketId)) return;
      const ticket = await storage.getTicketById(ticketId);

      if (ticket) {
        const branchForGate = await storage.getBranchById(ticket.branchId);
        if (branchForGate && !await assertSubscriptionActive(req, res, branchForGate.organizationId)) return;
      }

      const updated = await storage.updateTicket(ticketId, {
        status: "hold",
        holdAt: new Date(),
      });

      if (ticket) {
        const branch = await storage.getBranchById(ticket.branchId);
        const branchName = branch?.name || "Queue";
        sendStatusChangeNotification(ticketId, branchName, "hold").catch(console.error);
        sendWhatsAppStatusChangeNotification(ticketId, branchName, "hold").catch(console.error);
        evaluateBranchAlerts(ticket.branchId).catch(console.error);
      }
      
      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error putting on hold:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/resume", requirePermission("org.queue.hold"), async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      if (!await assertTicketOwnership(req, res, ticketId)) return;
      const ticket = await storage.getTicketById(ticketId);
      
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const branchForGate = await storage.getBranchById(ticket.branchId);
      if (branchForGate && !await assertSubscriptionActive(req, res, branchForGate.organizationId)) return;

      const updated = await storage.updateTicket(ticketId, {
        status: "waiting",
        holdAt: null,
        tableNumber: null,
      });
      
      if (ticket.branchId) {
        await storage.recalculatePositions(ticket.branchId, ticket.serviceId || undefined);
        const branch = await storage.getBranchById(ticket.branchId);
        const branchName = branch?.name || "Queue";
        checkAndSendQueueNotifications(ticket.branchId, branchName, ticket.serviceId || undefined).catch(console.error);
        sendStatusChangeNotification(ticketId, branchName, "waiting").catch(console.error);
        evaluateBranchAlerts(ticket.branchId).catch(console.error);
      }
      
      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error resuming ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/cancel", requirePermission("org.queue.complete"), async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      if (!await assertTicketOwnership(req, res, ticketId)) return;
      const ticket = await storage.getTicketById(ticketId);
      
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const branchForGate = await storage.getBranchById(ticket.branchId);
      if (branchForGate && !await assertSubscriptionActive(req, res, branchForGate.organizationId)) return;

      const updated = await storage.updateTicket(ticketId, {
        status: "cancelled",
        completedAt: new Date(),
      });
      
      if (ticket.branchId) {
        await storage.recalculatePositions(ticket.branchId, ticket.serviceId || undefined);
        const branch = await storage.getBranchById(ticket.branchId);
        checkAndSendQueueNotifications(ticket.branchId, branch?.name || "Queue", ticket.serviceId || undefined).catch(console.error);
        evaluateBranchAlerts(ticket.branchId).catch(console.error);
      }
      
      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error cancelling ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/reassign", requirePermission("org.queue.allocate_table"), async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      if (!await assertTicketOwnership(req, res, ticketId)) return;
      const { serviceId, serviceName } = req.body;
      if (!serviceId) {
        return res.status(400).json({ error: "Service ID is required" });
      }
      const ticket = await storage.getTicketById(ticketId);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      const branchForGate = await storage.getBranchById(ticket.branchId);
      if (branchForGate && !await assertSubscriptionActive(req, res, branchForGate.organizationId)) return;
      if (serviceId && !await assertServiceOwnership(req, res, serviceId)) return;
      const targetService = await storage.getServiceById(serviceId);
      if (!targetService) {
        return res.status(404).json({ error: "Service not found" });
      }
      if (!targetService.isActive) {
        return res.status(403).json({ error: "Cannot reassign to an inactive service." });
      }
      const updated = await storage.updateTicket(ticketId, { serviceId, serviceName: serviceName || ticket.serviceName });
      res.json({ ticket: updated });
    } catch (error) {
      console.error("Error reassigning ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tickets/:ticketId/move-stage", requirePermission("org.queue.move_stage"), async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      if (!await assertTicketOwnership(req, res, ticketId)) return;
      const { stageId, stageIndex, stageName } = req.body;
      if (!stageId || stageIndex === undefined) {
        return res.status(400).json({ error: "Stage ID and index are required" });
      }
      const ticket = await storage.getTicketById(ticketId);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      const branchForGate = await storage.getBranchById(ticket.branchId);
      if (branchForGate && !await assertSubscriptionActive(req, res, branchForGate.organizationId)) return;
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

  // ═══════════════════════════════════════════════
  // SWAP REQUESTS
  // ═══════════════════════════════════════════════

  // Customer-initiated swap request (ticket holder asks to swap with someone ahead).
  // Not gated by org permissions — caller is the ticket holder, not org staff.
  app.post("/api/tickets/:ticketId/swap-request", publicRoute("ticket holder requests swap with another customer"), async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      const { isPremium, premiumAmount } = req.body;

      const ticket = await storage.getTicketById(ticketId);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      if (ticket.status !== "waiting") {
        return res.status(400).json({ error: "Can only request swaps while waiting" });
      }

      if (ticket.position <= 1) {
        return res.status(400).json({ error: "You are already first in line" });
      }

      const existingPending = await storage.getPendingSwapRequestsForTicket(ticketId);
      if (existingPending.length > 0) {
        return res.status(400).json({ error: "You already have a pending swap request" });
      }

      const swapRequest = await storage.createSwapRequest({
        requesterTicketId: ticketId,
        branchId: ticket.branchId,
        serviceId: ticket.serviceId || undefined,
        requesterPosition: ticket.position,
        status: "pending",
        isPremium: isPremium || false,
        premiumAmount: premiumAmount || undefined,
      });

      const ticketsAhead = await storage.getWaitingTicketsAheadInService(
        ticket.branchId,
        ticket.serviceId || "",
        ticket.position
      );

      const branch = await storage.getBranchById(ticket.branchId);
      const branchName = branch?.name || "Queue";
      const pushMessages: Array<{to: string; title: string; body: string; data: Record<string, any>; sound: "default"; channelId: string; priority: "high"}> = [];

      for (const aheadTicket of ticketsAhead) {
        if (aheadTicket.pushToken && (aheadTicket.pushToken.startsWith("ExponentPushToken[") || aheadTicket.pushToken.startsWith("ExpoPushToken["))) {
          pushMessages.push({
            to: aheadTicket.pushToken,
            title: "Swap Request",
            body: `${ticket.ticketNumber} (Position #${ticket.position}) wants to swap with someone ahead.${isPremium ? ` Premium swap - you could earn $${(Number(premiumAmount) * 0.8).toFixed(2)}!` : " Accept to move back and help them out."}`,
            data: {
              type: "swap_request",
              swapRequestId: swapRequest.id,
              requesterTicketNumber: ticket.ticketNumber,
              requesterPosition: ticket.position,
              yourTicketId: aheadTicket.id,
              isPremium: isPremium || false,
            },
            sound: "default",
            channelId: "queue-alerts",
            priority: "high",
          });
        }
      }

      if (pushMessages.length > 0) {
        fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Accept": "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(pushMessages),
        }).catch(console.error);
      }

      res.json({
        success: true,
        swapRequest,
        notifiedCount: ticketsAhead.length,
      });
    } catch (error) {
      console.error("Error creating swap request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/tickets/:ticketId/swap-requests/incoming", publicRoute("ticket holder views own incoming swap requests"), async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      const ticket = await storage.getTicketById(ticketId);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const allPending = await storage.getPendingSwapRequestsForBranch(ticket.branchId);
      const incoming = [];

      for (const sr of allPending) {
        if (sr.requesterTicketId === ticketId) continue;
        const requesterTicket = await storage.getTicketById(sr.requesterTicketId);
        if (!requesterTicket) continue;
        if (requesterTicket.serviceId !== ticket.serviceId) continue;
        if (requesterTicket.position <= ticket.position) continue;

        incoming.push({
          ...sr,
          requesterTicketNumber: requesterTicket.ticketNumber,
          requesterPosition: requesterTicket.position,
          requesterName: requesterTicket.customerName,
        });
      }

      res.json({ swapRequests: incoming });
    } catch (error) {
      console.error("Error fetching incoming swap requests:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/tickets/:ticketId/swap-requests/outgoing", publicRoute("ticket holder views own outgoing swap requests"), async (req: Request, res: Response) => {
    try {
      const ticketId = req.params.ticketId as string;
      const pending = await storage.getPendingSwapRequestsForTicket(ticketId);
      res.json({ swapRequests: pending });
    } catch (error) {
      console.error("Error fetching outgoing swap requests:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/swap-requests/:swapRequestId/accept", async (req: Request, res: Response) => {
    try {
      const swapRequestId = req.params.swapRequestId as string;
      const { acceptorTicketId } = req.body;

      if (!acceptorTicketId) {
        return res.status(400).json({ error: "acceptorTicketId is required" });
      }

      const swapRequest = await storage.getSwapRequestById(swapRequestId);
      if (!swapRequest) {
        return res.status(404).json({ error: "Swap request not found" });
      }

      if (swapRequest.status !== "pending") {
        return res.status(400).json({ error: "Swap request is no longer pending" });
      }

      if (swapRequest.expiresAt && new Date(swapRequest.expiresAt) < new Date()) {
        await storage.updateSwapRequest(swapRequestId, { status: "expired" } as any);
        return res.status(400).json({ error: "Swap request has expired" });
      }

      const requesterTicket = await storage.getTicketById(swapRequest.requesterTicketId);
      const acceptorTicket = await storage.getTicketById(acceptorTicketId);

      if (!requesterTicket || !acceptorTicket) {
        return res.status(404).json({ error: "One or both tickets not found" });
      }

      if (requesterTicket.id === acceptorTicket.id) {
        return res.status(400).json({ error: "Cannot swap with yourself" });
      }

      if (requesterTicket.status !== "waiting" || acceptorTicket.status !== "waiting") {
        return res.status(400).json({ error: "Both tickets must be in waiting status" });
      }

      if (requesterTicket.branchId !== acceptorTicket.branchId) {
        return res.status(400).json({ error: "Both tickets must be in the same branch" });
      }

      if (requesterTicket.serviceId !== acceptorTicket.serviceId) {
        return res.status(400).json({ error: "Both tickets must be in the same service" });
      }

      if (acceptorTicket.position >= requesterTicket.position) {
        return res.status(400).json({ error: "Acceptor must be ahead of requester" });
      }

      const requesterPos = requesterTicket.position;
      const acceptorPos = acceptorTicket.position;

      await storage.updateTicket(requesterTicket.id, { position: acceptorPos });
      await storage.updateTicket(acceptorTicket.id, { position: requesterPos });

      await storage.updateSwapRequest(swapRequestId, {
        status: "accepted",
        acceptedByTicketId: acceptorTicketId,
        targetTicketId: acceptorTicketId,
      } as any);

      if (requesterTicket.pushToken && (requesterTicket.pushToken.startsWith("ExponentPushToken[") || requesterTicket.pushToken.startsWith("ExpoPushToken["))) {
        fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Accept": "application/json", "Content-Type": "application/json" },
          body: JSON.stringify([{
            to: requesterTicket.pushToken,
            title: "Swap Accepted!",
            body: `Your swap request was accepted! You've moved from position #${requesterPos} to #${acceptorPos}.`,
            data: {
              type: "swap_accepted",
              newPosition: acceptorPos,
              oldPosition: requesterPos,
            },
            sound: "default",
            channelId: "queue-alerts",
            priority: "high",
          }]),
        }).catch(console.error);
      }

      res.json({
        success: true,
        requesterNewPosition: acceptorPos,
        acceptorNewPosition: requesterPos,
      });
    } catch (error) {
      console.error("Error accepting swap request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/swap-requests/:swapRequestId/decline", async (req: Request, res: Response) => {
    try {
      const swapRequestId = req.params.swapRequestId as string;
      const { declinedByTicketId } = req.body;

      const swapRequest = await storage.getSwapRequestById(swapRequestId);
      if (!swapRequest) {
        return res.status(404).json({ error: "Swap request not found" });
      }

      if (swapRequest.status !== "pending") {
        return res.status(400).json({ error: "Swap request is no longer pending" });
      }

      res.json({ success: true, declined: true });
    } catch (error) {
      console.error("Error declining swap request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/swap-requests/:swapRequestId/cancel", async (req: Request, res: Response) => {
    try {
      const swapRequestId = req.params.swapRequestId as string;

      const swapRequest = await storage.getSwapRequestById(swapRequestId);
      if (!swapRequest) {
        return res.status(404).json({ error: "Swap request not found" });
      }

      if (swapRequest.status !== "pending") {
        return res.status(400).json({ error: "Swap request is no longer pending" });
      }

      await storage.updateSwapRequest(swapRequestId, { status: "cancelled" } as any);

      res.json({ success: true });
    } catch (error) {
      console.error("Error cancelling swap request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/branches/:branchId/candidates-for-swap/:ticketId", publicRoute("ticket holder browses candidates for swap"), async (req: Request, res: Response) => {
    try {
      const { branchId, ticketId } = req.params;
      const ticket = await storage.getTicketById(ticketId);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const ticketsAhead = await storage.getWaitingTicketsAheadInService(
        branchId,
        ticket.serviceId || "",
        ticket.position
      );

      const candidates = ticketsAhead.map(t => ({
        id: t.id,
        position: t.position,
        ticketNumber: t.ticketNumber,
        priority: t.priority || "normal",
      }));

      res.json({ candidates });
    } catch (error) {
      console.error("Error fetching swap candidates:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/branches/:branchId/services", requirePermission("org.services.create"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
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

  app.put("/api/services/:serviceId", requirePermission("org.services.edit"), async (req: Request, res: Response) => {
    try {
      const serviceId = req.params.serviceId as string;
      if (!await assertServiceOwnership(req, res, serviceId)) return;
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

      const existingService = await storage.getServiceById(serviceId);
      const previousStatus = (existingService as any)?.queueStatus || "active";

      const service = await storage.updateService(serviceId, updateData);

      if (queueStatus && previousStatus !== queueStatus && service) {
        const branch = service.branchId ? await storage.getBranchById(service.branchId) : null;
        const branchName = branch?.name || "Queue";
        notifyServiceQueueStatusChange(serviceId, branchName, service.name, queueStatus).catch(console.error);
        if (service.branchId) {
          notifyOrgServiceQueueStatusChange(service.branchId, serviceId, service.name, queueStatus as any).catch(console.error);
        }
      }

      res.json({ service });
    } catch (error) {
      console.error("Error updating service:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/services/:serviceId", requirePermission("org.services.delete"), async (req: Request, res: Response) => {
    try {
      const serviceId = req.params.serviceId as string;
      if (!await assertServiceOwnership(req, res, serviceId)) return;
      await storage.deleteService(serviceId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting service:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/branches/:branchId/stats", requirePermission("org.dashboard.view"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const stats = await storage.getQueueStats(branchId);
      res.json(stats);
    } catch (error) {
      console.error("Error getting stats:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/branches/:branchId/bookings", publicRoute("public customer booking creation"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      const bookingData = req.body;

      const bookingBranch = await storage.getBranchById(branchId);
      if (!bookingBranch || bookingBranch.isActive === false) {
        return res.status(404).json({ error: "Branch not found" });
      }

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

  app.post("/api/bookings/:bookingId/cancel", requirePermission("org.bookings.manual"), async (req: Request, res: Response) => {
    try {
      const bookingId = req.params.bookingId as string;
      if (!await assertAppointmentOwnership(req, res, bookingId)) return;
      const booking = await storage.updateBooking(bookingId, { status: "cancelled" });
      res.json({ booking });
    } catch (error) {
      console.error("Error cancelling booking:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/reservations/:reservationId/cancel", requirePermission("org.bookings.manual"), async (req: Request, res: Response) => {
    try {
      const reservationId = req.params.reservationId as string;
      if (!await assertReservationOwnership(req, res, reservationId)) return;
      const reservation = await storage.updateReservation(reservationId, { status: "cancelled" });
      res.json({ reservation });
    } catch (error) {
      console.error("Error cancelling reservation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/branches/:branchId/reservations - Get reservations for a branch (today by default)
  app.get("/api/branches/:branchId/reservations", requirePermission("org.bookings.view"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
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
  app.post("/api/reservations/:reservationId/checkin", requirePermission("org.bookings.manual"), async (req: Request, res: Response) => {
    try {
      const reservationId = req.params.reservationId as string;
      if (!await assertReservationOwnership(req, res, reservationId)) return;
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

      // Plan cap: a checked-in reservation becomes a ticket and counts
      // toward the org's daily-ticket allowance, same as a /api/join.
      const reservationBranch = await storage.getBranchById(reservation.branchId);
      if (reservationBranch && !await assertCanCreateTicketForOrg(req, res, reservationBranch.organizationId)) return;

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
  app.get("/api/dashboard/branches/:orgId", requirePermission("org.branches.view"), async (req: Request, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      if (!await assertOrgOwnership(req, res, orgId)) return;
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
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.post("/api/dashboard/branches", requirePermission("org.branches.create"), async (req: Request, res: Response) => {
    try {
      const orgId = (req.body || {}).organizationId as string | undefined;
      if (!orgId || !await assertOrgOwnership(req, res, orgId)) return;
      if (!await assertCanCreateBranch(req, res, orgId)) return;
      const branch = await storage.createBranch(req.body);
      await writeAudit(req, { action: "branch.create", targetType: "branch", targetId: branch.id, targetLabel: branch.name, diff: req.body });
      res.json({ branch });
    } catch (error) {
      console.error("Error creating branch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/dashboard/branches/:id - Update branch
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.put("/api/dashboard/branches/:id", requirePermission("org.branches.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertBranchOwnership(req, res, id)) return;
      const branch = await storage.updateBranch(id, req.body);
      await writeAudit(req, { action: "branch.update", targetType: "branch", targetId: id, targetLabel: branch?.name, diff: req.body });
      res.json({ branch });
    } catch (error) {
      console.error("Error updating branch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/dashboard/branches/:id - Delete branch
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.delete("/api/dashboard/branches/:id", requirePermission("org.branches.delete"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertBranchOwnership(req, res, id)) return;
      await storage.deleteBranch(id);
      await writeAudit(req, { action: "branch.delete", targetType: "branch", targetId: id });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting branch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/dashboard/branches/:branchId/settings - Update branch settings
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.put("/api/dashboard/branches/:branchId/settings", requirePermission("org.settings.queue.edit"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const { queueMode, notificationMode, autoCallNext, maxQueueSize, defaultSlotDuration, defaultSlotCapacity, displaySettings, apiSettings, announcerUserId } = req.body;
      const updateData: any = {};
      if (queueMode !== undefined) updateData.queueMode = queueMode;
      if (notificationMode !== undefined) updateData.notificationMode = notificationMode;
      if (autoCallNext !== undefined) updateData.autoCallNext = autoCallNext;
      if (maxQueueSize !== undefined) updateData.maxQueueSize = maxQueueSize;
      if (defaultSlotDuration !== undefined) updateData.defaultSlotDuration = defaultSlotDuration;
      if (defaultSlotCapacity !== undefined) updateData.defaultSlotCapacity = defaultSlotCapacity;
      if (displaySettings !== undefined) updateData.displaySettings = displaySettings;
      if (apiSettings !== undefined) updateData.apiSettings = apiSettings;
      if (announcerUserId !== undefined) {
        if (announcerUserId === null || announcerUserId === "") {
          updateData.announcerUserId = null;
        } else {
          const target = await storage.getOrgUserById(announcerUserId);
          const existingBranch = await storage.getBranchById(branchId);
          if (!target || !existingBranch || target.organizationId !== existingBranch.organizationId) {
            return res.status(400).json({ error: "announcerUserId must belong to the same organization" });
          }
          updateData.announcerUserId = announcerUserId;
        }
      }
      const branch = await storage.updateBranch(branchId, updateData);
      res.json({ branch });
    } catch (error) {
      console.error("Error updating branch settings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // ANNOUNCEMENT DEVICES (per-branch reception speakers)
  // ============================================
  function generateAnnouncementToken(): string {
    return randomBytes(24).toString("hex");
  }

  function sanitizeDevice(device: any) {
    if (!device) return device;
    return {
      id: device.id,
      branchId: device.branchId,
      deviceName: device.deviceName,
      deviceToken: device.deviceToken,
      language: device.language,
      isActive: device.isActive,
      lastSeenAt: device.lastSeenAt,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    };
  }

  app.get("/api/branches/:branchId/announcement-devices", requirePermission("org.announcements.toggle"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const devices = await storage.listAnnouncementDevices(branchId);
      res.json({ devices: devices.map(sanitizeDevice) });
    } catch (error) {
      console.error("Error listing announcement devices:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/branches/:branchId/announcement-devices", requirePermission("org.announcements.toggle"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const rawName = (req.body?.deviceName ?? "").toString().trim();
      const reqLang = (req.body?.language ?? "en").toString();
      const language = isSupportedLanguage(reqLang) ? reqLang : "en";
      const isActive = req.body?.isActive === false ? false : true;
      if (!rawName) {
        return res.status(400).json({ error: "deviceName is required" });
      }
      const deviceName = rawName.slice(0, 80);
      const device = await storage.createAnnouncementDevice({
        branchId,
        deviceName,
        deviceToken: generateAnnouncementToken(),
        language,
        isActive,
      });
      await writeAudit(req, { action: "announcement_device.create", targetType: "announcement_device", targetId: device.id, targetLabel: deviceName });
      res.json({ device: sanitizeDevice(device) });
    } catch (error) {
      console.error("Error creating announcement device:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/announcement-devices/:deviceId", requirePermission("org.announcements.toggle"), async (req: Request, res: Response) => {
    try {
      const deviceId = req.params.deviceId as string;
      const existing = await storage.getAnnouncementDeviceById(deviceId);
      if (!existing) return res.status(404).json({ error: "Device not found" });
      if (!await assertBranchOwnership(req, res, existing.branchId)) return;

      const updates: Partial<{ deviceName: string; language: string; isActive: boolean }> = {};
      if (req.body?.deviceName !== undefined) {
        const n = req.body.deviceName.toString().trim();
        if (!n) return res.status(400).json({ error: "deviceName cannot be empty" });
        updates.deviceName = n.slice(0, 80);
      }
      if (req.body?.language !== undefined) {
        const reqLang = req.body.language.toString();
        updates.language = isSupportedLanguage(reqLang) ? reqLang : "en";
      }
      if (req.body?.isActive !== undefined) {
        updates.isActive = req.body.isActive === true;
      }

      const device = await storage.updateAnnouncementDevice(deviceId, updates);
      await writeAudit(req, { action: "announcement_device.update", targetType: "announcement_device", targetId: deviceId, targetLabel: device?.deviceName || "", diff: updates });
      res.json({ device: sanitizeDevice(device) });
    } catch (error) {
      console.error("Error updating announcement device:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/announcement-devices/:deviceId/regenerate-token", requirePermission("org.announcements.toggle"), async (req: Request, res: Response) => {
    try {
      const deviceId = req.params.deviceId as string;
      const existing = await storage.getAnnouncementDeviceById(deviceId);
      if (!existing) return res.status(404).json({ error: "Device not found" });
      if (!await assertBranchOwnership(req, res, existing.branchId)) return;
      const device = await storage.updateAnnouncementDevice(deviceId, { deviceToken: generateAnnouncementToken() });
      await writeAudit(req, { action: "announcement_device.regenerate_token", targetType: "announcement_device", targetId: deviceId, targetLabel: existing.deviceName });
      res.json({ device: sanitizeDevice(device) });
    } catch (error) {
      console.error("Error regenerating announcement device token:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/announcement-devices/:deviceId", requirePermission("org.announcements.toggle"), async (req: Request, res: Response) => {
    try {
      const deviceId = req.params.deviceId as string;
      const existing = await storage.getAnnouncementDeviceById(deviceId);
      if (!existing) return res.status(404).json({ error: "Device not found" });
      if (!await assertBranchOwnership(req, res, existing.branchId)) return;
      await storage.deleteAnnouncementDevice(deviceId);
      await writeAudit(req, { action: "announcement_device.delete", targetType: "announcement_device", targetId: deviceId, targetLabel: existing.deviceName });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting announcement device:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // BRANCH OPERATIONS ALERTS (WhatsApp recipients)
  // ============================================
  function sanitizePhone(raw: string): string {
    return raw.replace(/[^0-9+]/g, "").slice(0, 24);
  }
  function isValidPhone(p: string): boolean {
    const digits = p.replace(/[^0-9]/g, "");
    return digits.length >= 8 && digits.length <= 15;
  }
  function pickRecipientUpdates(body: any): any {
    const updates: any = {};
    if (body?.name !== undefined) {
      const n = String(body.name).trim();
      if (n) updates.name = n.slice(0, 80);
    }
    if (body?.phoneNumber !== undefined) {
      const raw = String(body.phoneNumber ?? "").trim();
      updates.phoneNumber = raw ? sanitizePhone(raw) : null;
    }
    if (body?.userId !== undefined) {
      const raw = String(body.userId ?? "").trim();
      updates.userId = raw ? raw : null;
    }
    if (body?.sendViaWhatsapp !== undefined) updates.sendViaWhatsapp = body.sendViaWhatsapp === true;
    if (body?.sendViaPush !== undefined) updates.sendViaPush = body.sendViaPush === true;
    if (body?.alertOnQueueOpenClose !== undefined) updates.alertOnQueueOpenClose = body.alertOnQueueOpenClose === true;
    if (body?.alertOnWaitingCountMax !== undefined) updates.alertOnWaitingCountMax = body.alertOnWaitingCountMax === true;
    if (body?.alertOnAvgWaitTimeMax !== undefined) updates.alertOnAvgWaitTimeMax = body.alertOnAvgWaitTimeMax === true;
    if (body?.isActive !== undefined) updates.isActive = body.isActive === true;
    return updates;
  }

  app.get("/api/dashboard/branches/:branchId/alert-recipients", requirePermission("org.settings.queue.edit"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const recipients = await storage.listBranchAlertRecipients(branchId);
      res.json({ recipients });
    } catch (error) {
      console.error("Error listing alert recipients:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/branches/:branchId/alert-recipients", requirePermission("org.settings.queue.edit"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const branch = await storage.getBranchById(branchId);
      if (!branch) return res.status(404).json({ error: "Branch not found" });
      const name = String(req.body?.name ?? "").trim();
      if (!name) return res.status(400).json({ error: "name is required" });

      const sendViaWhatsapp = req.body?.sendViaWhatsapp === true;
      const sendViaPush = req.body?.sendViaPush === true;
      if (!sendViaWhatsapp && !sendViaPush) {
        return res.status(400).json({ error: "At least one channel (WhatsApp or mobile push) must be enabled" });
      }

      const rawPhone = String(req.body?.phoneNumber ?? "").trim();
      let phoneNumber: string | null = null;
      if (sendViaWhatsapp) {
        phoneNumber = sanitizePhone(rawPhone);
        if (!phoneNumber || !isValidPhone(phoneNumber)) {
          return res.status(400).json({ error: "Valid phoneNumber is required when WhatsApp channel is enabled (8-15 digits, optional + prefix)" });
        }
      } else if (rawPhone) {
        phoneNumber = sanitizePhone(rawPhone);
      }

      const userIdRaw = String(req.body?.userId ?? "").trim();
      let userId: string | null = userIdRaw || null;
      if (sendViaPush && !userId) {
        return res.status(400).json({ error: "Please link a team member when mobile push channel is enabled" });
      }
      if (userId) {
        const user = await storage.getOrgUserById(userId);
        if (!user || user.organizationId !== branch.organizationId) {
          return res.status(400).json({ error: "Linked user not found in this organization" });
        }
      }

      const recipient = await storage.createBranchAlertRecipient({
        organizationId: branch.organizationId,
        branchId,
        userId,
        name: name.slice(0, 80),
        phoneNumber,
        sendViaWhatsapp,
        sendViaPush,
        alertOnQueueOpenClose: req.body?.alertOnQueueOpenClose === false ? false : true,
        alertOnWaitingCountMax: req.body?.alertOnWaitingCountMax === false ? false : true,
        alertOnAvgWaitTimeMax: req.body?.alertOnAvgWaitTimeMax === false ? false : true,
        isActive: req.body?.isActive === false ? false : true,
      });
      await writeAudit(req, { action: "alert_recipient.create", targetType: "alert_recipient", targetId: recipient.id, targetLabel: recipient.name });
      res.json({ recipient });
    } catch (error) {
      console.error("Error creating alert recipient:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/dashboard/alert-recipients/:id", requirePermission("org.settings.queue.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const existing = await storage.getBranchAlertRecipientById(id);
      if (!existing) return res.status(404).json({ error: "Recipient not found" });
      if (!await assertBranchOwnership(req, res, existing.branchId)) return;
      const updates = pickRecipientUpdates(req.body);
      const merged = { ...existing, ...updates };
      const finalSendViaWhatsapp = merged.sendViaWhatsapp === true;
      const finalSendViaPush = merged.sendViaPush === true;
      if (!finalSendViaWhatsapp && !finalSendViaPush) {
        return res.status(400).json({ error: "At least one channel (WhatsApp or mobile push) must be enabled" });
      }
      if (finalSendViaWhatsapp) {
        const p = merged.phoneNumber as string | null | undefined;
        if (!p || !isValidPhone(p)) {
          return res.status(400).json({ error: "Valid phoneNumber is required when WhatsApp channel is enabled (8-15 digits, optional + prefix)" });
        }
      }
      if (finalSendViaPush && !merged.userId) {
        return res.status(400).json({ error: "Please link a team member when mobile push channel is enabled" });
      }
      if (updates.userId) {
        const user = await storage.getOrgUserById(updates.userId);
        if (!user || user.organizationId !== existing.organizationId) {
          return res.status(400).json({ error: "Linked user not found in this organization" });
        }
      }
      const recipient = await storage.updateBranchAlertRecipient(id, updates);
      await writeAudit(req, { action: "alert_recipient.update", targetType: "alert_recipient", targetId: id, targetLabel: recipient?.name || "", diff: updates });
      res.json({ recipient });
    } catch (error) {
      console.error("Error updating alert recipient:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/dashboard/alert-recipients/:id", requirePermission("org.settings.queue.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const existing = await storage.getBranchAlertRecipientById(id);
      if (!existing) return res.status(404).json({ error: "Recipient not found" });
      if (!await assertBranchOwnership(req, res, existing.branchId)) return;
      await storage.deleteBranchAlertRecipient(id);
      await writeAudit(req, { action: "alert_recipient.delete", targetType: "alert_recipient", targetId: id, targetLabel: existing.name });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting alert recipient:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/alert-recipients/:id/test", requirePermission("org.settings.queue.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const existing = await storage.getBranchAlertRecipientById(id);
      if (!existing) return res.status(404).json({ error: "Recipient not found" });
      if (!await assertBranchOwnership(req, res, existing.branchId)) return;
      const branch = await storage.getBranchById(existing.branchId);
      const branchName = branch?.name || "Branch";
      const title = buildTestAlertTitle();
      const message = buildTestAlertMessage(branchName);
      const result = await sendAlertToRecipient(existing, { title, message });
      await writeAudit(req, { action: "alert_recipient.test", targetType: "alert_recipient", targetId: id, targetLabel: existing.name, diff: result });
      const channels: string[] = [];
      if (existing.sendViaWhatsapp) channels.push(`WhatsApp ${result.wa ? "OK" : "FAILED"}`);
      if (existing.sendViaPush) channels.push(`Push ${result.push ? "OK" : "FAILED"}`);
      const anyOk = (existing.sendViaWhatsapp && result.wa) || (existing.sendViaPush && result.push);
      const anyAttempted = existing.sendViaWhatsapp || existing.sendViaPush;
      const summary = anyAttempted
        ? channels.join(" · ")
        : "No channels enabled for this recipient";
      res.json({ success: anyOk, message: summary, detail: result });
    } catch (error) {
      console.error("Error sending test alert:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/dashboard/branches/:branchId/team-members - For alert-recipient picker
  app.get("/api/dashboard/branches/:branchId/team-members", requirePermission("org.settings.queue.edit"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const branch = await storage.getBranchById(branchId);
      if (!branch) return res.status(404).json({ error: "Branch not found" });
      const users = await storage.getOrgUsersByOrganization(branch.organizationId);
      const members = users
        .filter((u: any) => u.isActive !== false)
        .map((u: any) => ({
          id: u.id,
          name: u.fullName || u.email || u.username || "User",
          email: u.email || null,
          role: u.role || null,
        }));
      res.json({ members });
    } catch (error) {
      console.error("Error listing team members:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/dashboard/me/push-token - Org user (mobile app login) registers their push token
  app.post("/api/dashboard/me/push-token", publicRoute("org user manages own push token (auth enforced inside handler)"), async (req: Request, res: Response) => {
    try {
      const userId = getRequestUserId(req);
      if (!userId || userId.startsWith(OWNER_PREFIX)) {
        return res.status(401).json({ error: "Authentication required (org user login)" });
      }
      const user = await storage.getOrgUserById(userId);
      if (!user) return res.status(401).json({ error: "Unknown user" });
      const pushToken = String(req.body?.pushToken ?? "").trim();
      if (!pushToken || pushToken.length < 8 || pushToken.length > 256) {
        return res.status(400).json({ error: "Valid pushToken is required" });
      }
      const deviceLabel = req.body?.deviceLabel ? String(req.body.deviceLabel).trim().slice(0, 80) : null;
      const token = await storage.upsertOrgUserPushToken({ userId, pushToken, deviceLabel });
      res.json({ token });
    } catch (error) {
      console.error("Error registering org user push token:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/dashboard/me/push-token - Org user revokes their push token (logout)
  app.delete("/api/dashboard/me/push-token", publicRoute("org user manages own push token (auth enforced inside handler)"), async (req: Request, res: Response) => {
    try {
      const userId = getRequestUserId(req);
      if (!userId || userId.startsWith(OWNER_PREFIX)) {
        return res.status(401).json({ error: "Authentication required (org user login)" });
      }
      const pushToken = String(req.body?.pushToken ?? "").trim();
      if (!pushToken) return res.status(400).json({ error: "pushToken is required" });
      await storage.deleteOrgUserPushTokenForUser(userId, pushToken);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting org user push token:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/dashboard/branches/:branchId/services/:serviceId/settings - Update service-level settings
  app.put("/api/dashboard/branches/:branchId/services/:serviceId/settings", requirePermission("org.services.edit"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      const serviceId = req.params.serviceId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
      if (!await assertServiceOwnership(req, res, serviceId)) return;
      const newSettings = req.body;
      const service = await storage.getServiceById(serviceId);
      if (!service) {
        res.status(404).json({ error: "Service not found" });
        return;
      }
      const existingSettings = (service.serviceSettings as Record<string, any>) || {};
      const merged = { ...existingSettings, ...newSettings };
      await storage.updateService(serviceId, { serviceSettings: merged } as any);
      await writeAudit(req, { action: "service.settings.update", targetType: "service", targetId: serviceId, targetLabel: service.name, diff: req.body });
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
  app.get("/api/dashboard/services/:serviceId/desks", requirePermission("org.services.view"), async (req: Request, res: Response) => {
    try {
      const serviceId = req.params.serviceId as string;
      if (!await assertServiceOwnership(req, res, serviceId)) return;
      const desksList = await storage.getDesksByService(serviceId);
      res.json({ desks: desksList });
    } catch (error) {
      console.error("Error getting desks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/dashboard/services/:serviceId/desks - Create a desk
  app.post("/api/dashboard/services/:serviceId/desks", requirePermission("org.desks.create"), async (req: Request, res: Response) => {
    try {
      const serviceId = req.params.serviceId as string;
      if (!await assertServiceOwnership(req, res, serviceId)) return;
      const { name, branchId } = req.body;
      if (!name || !branchId) {
        res.status(400).json({ error: "Name and branchId are required" });
        return;
      }
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const ownerBranch = await storage.getBranchById(branchId);
      if (!ownerBranch) return res.status(404).json({ error: "Branch not found" });
      if (!await assertCanCreateDesk(req, res, ownerBranch.organizationId)) return;
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
  app.put("/api/dashboard/desks/:id", requirePermission("org.desks.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertDeskOwnership(req, res, id)) return;
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
  app.delete("/api/dashboard/desks/:id", requirePermission("org.desks.delete"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertDeskOwnership(req, res, id)) return;
      await storage.deleteDesk(id);
      await writeAudit(req, { action: "desk.delete", targetType: "desk", targetId: id });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting desk:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/dashboard/users/:orgId - Get users with branch assignments
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.get("/api/dashboard/users/:orgId", requirePermission("org.users.view"), async (req: Request, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      if (!await assertOrgOwnership(req, res, orgId)) return;
      const ctx = await getCallerContext(req);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      const users = await storage.getOrgUsersByOrganization(orgId);
      const branchesList = await storage.getBranchesByOrganization(orgId);
      const usersWithBranches = await Promise.all(users.map(async (user) => {
        const branchIds = await storage.getOrgUserBranches(user.id);
        const userBranch = user.branchId ? branchesList.find(b => b.id === user.branchId) : null;
        const role = user.roleId ? await storage.getRoleById(user.roleId) : (user.role ? await storage.getRoleByKey(user.role) : undefined);
        const rank = role ? getRoleRank(role) : getRoleRank(user.role || "");
        return {
          ...sanitizeOrgUser(user)!,
          branchIds,
          branchName: userBranch?.name,
          rank,
        };
      }));
      // Hierarchy + branch filter (Owner sees all; non-Owner only sees lower-rank users in their branches).
      const visible = usersWithBranches.filter((u) => callerCanManageTargetUser(ctx, { role: u.role, rank: u.rank, branchId: u.branchId, branchIds: u.branchIds }));
      res.json({ users: visible });
    } catch (error) {
      console.error("Error getting dashboard users:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/dashboard/users - Create user
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.post("/api/dashboard/users", requirePermission("org.users.invite"), async (req: Request, res: Response) => {
    try {
      const { organizationId, name, email, phone, password, role, branchId, branchIds, assignedServiceIds } = req.body;
      if (!organizationId || !await assertOrgOwnership(req, res, organizationId)) return;
      const ctx = await getCallerContext(req);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      const branchIdNorm = (typeof branchId === "string" && branchId.trim() === "") || branchId == null ? null : branchId;
      if (branchIdNorm && !await assertBranchOwnership(req, res, branchIdNorm)) return;
      if (branchIdNorm && !callerCanAccessBranch(ctx, branchIdNorm)) {
        return res.status(403).json({ error: "Branch is not in your scope" });
      }
      if (Array.isArray(branchIds)) {
        for (const bid of branchIds) {
          if (!await assertBranchOwnership(req, res, bid)) return;
          if (!callerCanAccessBranch(ctx, bid)) {
            return res.status(403).json({ error: "Branch is not in your scope" });
          }
        }
      }
      const requestedRoleKey = role || "front_desk";
      const roleRow = await resolveAssignableRole(res, requestedRoleKey, organizationId, ctx.rank);
      if (!roleRow) return;
      if (!await assertCanCreateOrgUser(req, res, organizationId)) return;
      const user = await storage.createOrgUser({
        organizationId,
        name,
        email,
        phone,
        password: password || "changeme123",
        role: roleRow.key,
        roleId: roleRow.id,
        branchId: branchIdNorm,
        assignedServiceIds,
        isActive: true,
      });
      if (branchIds && branchIds.length > 0) {
        await storage.setOrgUserBranches(user.id, branchIds);
      }
      const userBranchIds = await storage.getOrgUserBranches(user.id);
      res.json({ user: { ...sanitizeOrgUser(user)!, branchIds: userBranchIds } });
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/dashboard/users/:id - Update user
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.put("/api/dashboard/users/:id", requirePermission("org.users.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertOrgUserOwnership(req, res, id)) return;
      const ctx = await getCallerContext(req);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      const target = await storage.getOrgUserById(id);
      if (!target) return res.status(404).json({ error: "User not found" });
      const targetBranchIds = await storage.getOrgUserBranches(id);
      if (!callerCanManageTargetUser(ctx, { role: target.role, branchId: target.branchId, branchIds: targetBranchIds })) {
        return res.status(403).json({ error: "You cannot manage this user" });
      }
      const { name, email, phone, password, role, branchId, branchIds, assignedServiceIds, isActive } = req.body;
      const branchIdNorm = branchId === undefined ? undefined : ((typeof branchId === "string" && branchId.trim() === "") || branchId == null ? null : branchId);
      if (branchIdNorm && !await assertBranchOwnership(req, res, branchIdNorm)) return;
      if (branchIdNorm && !callerCanAccessBranch(ctx, branchIdNorm)) {
        return res.status(403).json({ error: "Branch is not in your scope" });
      }
      if (Array.isArray(branchIds)) {
        for (const bid of branchIds) {
          if (!await assertBranchOwnership(req, res, bid)) return;
          if (!callerCanAccessBranch(ctx, bid)) {
            return res.status(403).json({ error: "Branch is not in your scope" });
          }
        }
      }
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (role !== undefined) {
        const roleRow = await resolveAssignableRole(res, role, target.organizationId, ctx.rank);
        if (!roleRow) return;
        updateData.role = roleRow.key;
        updateData.roleId = roleRow.id;
      }
      if (branchIdNorm !== undefined) updateData.branchId = branchIdNorm;
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
      res.json({ user: { ...sanitizeOrgUser(user)!, branchIds: userBranchIds } });
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/dashboard/users/:id - Delete user
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.delete("/api/dashboard/users/:id", requirePermission("org.users.deactivate"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertOrgUserOwnership(req, res, id)) return;
      const ctx = await getCallerContext(req);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      const target = await storage.getOrgUserById(id);
      if (!target) return res.status(404).json({ error: "User not found" });
      const targetBranchIds = await storage.getOrgUserBranches(id);
      if (!callerCanManageTargetUser(ctx, { role: target.role, branchId: target.branchId, branchIds: targetBranchIds })) {
        return res.status(403).json({ error: "You cannot manage this user" });
      }
      await storage.deleteOrgUser(id);
      await writeAudit(req, { action: "user.delete", targetType: "org_user", targetId: id });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/dashboard/services - Create service
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.post("/api/dashboard/services", requirePermission("org.services.create"), async (req: Request, res: Response) => {
    try {
      const { branchId, name, description, averageWaitTime, estimatedDuration, maxDailyCapacity, inputFields, requireInPerson, inPersonPerimeter } = req.body;
      if (!branchId || !await assertBranchOwnership(req, res, branchId)) return;
      const ownerBranch2 = await storage.getBranchById(branchId);
      if (!ownerBranch2) return res.status(404).json({ error: "Branch not found" });
      if (!await assertCanCreateService(req, res, ownerBranch2.organizationId, branchId)) return;
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
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.put("/api/dashboard/services/:id", requirePermission("org.services.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertServiceOwnership(req, res, id)) return;
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
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.delete("/api/dashboard/services/:id", requirePermission("org.services.delete"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertServiceOwnership(req, res, id)) return;
      await storage.deleteService(id);
      await writeAudit(req, { action: "service.delete", targetType: "service", targetId: id });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting service:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/dashboard/journeys/:branchId - Get journeys with stages
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.get("/api/dashboard/journeys/:branchId", requirePermission("org.journeys.view"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
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
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.post("/api/dashboard/journeys", requirePermission("org.journeys.create"), async (req: Request, res: Response) => {
    try {
      const { branchId, name, description, isActive, stages } = req.body;
      if (!branchId || !await assertBranchOwnership(req, res, branchId)) return;
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
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.put("/api/dashboard/journeys/:id", requirePermission("org.journeys.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertJourneyOwnership(req, res, id)) return;
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
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.delete("/api/dashboard/journeys/:id", requirePermission("org.journeys.delete"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertJourneyOwnership(req, res, id)) return;
      await storage.deleteJourney(id);
      await writeAudit(req, { action: "journey.delete", targetType: "journey", targetId: id });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting journey:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/dashboard/bookings/:branchId - Get bookings/appointments
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.get("/api/dashboard/bookings/:branchId", requirePermission("org.bookings.view"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
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
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.put("/api/dashboard/operating-hours/:id", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertOperatingHourOwnership(req, res, id)) return;
      const hour = await storage.updateOperatingHour(id, req.body);
      res.json({ operatingHour: hour });
    } catch (error) {
      console.error("Error updating operating hours:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/dashboard/breaks - Create break time
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.post("/api/dashboard/breaks", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const operatingHourId = (req.body || {}).operatingHourId as string | undefined;
      if (!operatingHourId || !await assertOperatingHourOwnership(req, res, operatingHourId)) return;
      const breakTime = await storage.createBreakTime(req.body);
      res.json({ breakTime });
    } catch (error) {
      console.error("Error creating break time:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/dashboard/breaks/:id - Update break time
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.put("/api/dashboard/breaks/:id", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertBreakOwnership(req, res, id)) return;
      const breakTime = await storage.updateBreakTime(id, req.body);
      res.json({ breakTime });
    } catch (error) {
      console.error("Error updating break time:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/dashboard/breaks/:id - Delete break time
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.delete("/api/dashboard/breaks/:id", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertBreakOwnership(req, res, id)) return;
      await storage.deleteBreakTime(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting break time:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/dashboard/holidays - Create holiday
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.post("/api/dashboard/holidays", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const branchId = (req.body || {}).branchId as string | undefined;
      if (!branchId || !await assertBranchOwnership(req, res, branchId)) return;
      const holiday = await storage.createHoliday(req.body);
      res.json({ holiday });
    } catch (error) {
      console.error("Error creating holiday:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/dashboard/holidays/:id - Update holiday
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.put("/api/dashboard/holidays/:id", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertHolidayOwnership(req, res, id)) return;
      const holiday = await storage.updateHoliday(id, req.body);
      res.json({ holiday });
    } catch (error) {
      console.error("Error updating holiday:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/dashboard/holidays/:id - Delete holiday
  // NOTE: shadowed by billing-routes; kept here for defense-in-depth.
  app.delete("/api/dashboard/holidays/:id", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertHolidayOwnership(req, res, id)) return;
      await storage.deleteHoliday(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting holiday:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/dashboard/booking-slots - Create booking slot
  app.post("/api/dashboard/booking-slots", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const branchId = (req.body || {}).branchId as string | undefined;
      if (!branchId || !await assertBranchOwnership(req, res, branchId)) return;
      const serviceId = (req.body || {}).serviceId as string | undefined;
      if (serviceId && !await assertServiceOwnership(req, res, serviceId)) return;
      const slot = await storage.createBookingSlot(req.body);
      res.json({ slot });
    } catch (error) {
      console.error("Error creating booking slot:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/dashboard/booking-slots/:id - Update booking slot
  app.put("/api/dashboard/booking-slots/:id", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertBookingSlotOwnership(req, res, id)) return;
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

      // Mirror the gate from /login: if the parent organization has not
      // completed email verification, none of its staff can sign in either.
      // Staff inherit the org's trust state. We surface a generic message
      // (no orgId/email) because staff did not initiate the registration —
      // the org owner must complete verification before staff can use the
      // app.
      if (!org.isVerified) {
        return res.status(403).json({
          error: "Your organization's email is not yet verified. Please ask your administrator to complete verification before signing in.",
          requiresEmailVerification: true,
        });
      }

      // Clear any stale Super-Admin cookie left over from a prior SA session
      // in the same browser; otherwise gated routes would see SA precedence
      // and grant the staff member full platform-wide permissions instead of
      // their assigned org role.
      res.setHeader("Set-Cookie", [clearSuperAdminCookie(), makeOrgSessionCookie(matchedUser.id)]);

      const branchesList = await storage.getBranchesByOrganization(org.id);
      const branchesWithServices = await Promise.all(branchesList.map(async (branch) => {
        const rawServices = await storage.getServicesByBranch(branch.id);
        const services = await Promise.all(rawServices.map(async (service) => {
          const desks = await storage.getDesksByService(service.id);
          return { ...service, desks };
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
          ...sanitizeOrgUser(user)!,
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
          rank: getRoleRank(
            matchedUser.roleId
              ? (await storage.getRoleById(matchedUser.roleId)) ?? matchedUser.role
              : matchedUser.role,
          ),
          branchId: matchedUser.branchId,
          branchIds: matchedBranchIds,
          assignedServiceIds: matchedUser.assignedServiceIds,
          profilePictureUrl: matchedUser.profilePictureUrl,
        },
        permissions: (await getPermissionsForUser(matchedUser.id))?.permissions ?? [],
      });
    } catch (error) {
      console.error("Error staff login:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/organizations/me - Restore session from HttpOnly cookie
  // Used by the client on app launch to validate the long-lived session
  // cookie and re-hydrate org/user/branches/permissions without requiring
  // the user to log in again. Returns 401 when the cookie is missing or
  // invalid so the client can clear any stale local state.
  app.get("/api/organizations/me", async (req: Request, res: Response) => {
    try {
      // Auth state must never be cached. Without these headers, Express's
      // built-in ETag handling will return 304 to a freshly-logged-out
      // browser and serve the previously-cached "logged in" JSON, which
      // makes logout silently appear to fail after a page reload.
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      const cookieUserId = getRequestUserId(req);
      if (!cookieUserId) {
        // Always emit a clear directive so a malformed/expired cookie that
        // failed signature verification gets removed from the client jar
        // (no-op when there was no cookie to begin with).
        res.setHeader("Set-Cookie", clearOrgSessionCookie());
        return res.status(401).json({ error: "Not authenticated" });
      }

      const isOwnerCookie = cookieUserId.startsWith(OWNER_PREFIX);

      // For staff cookies, also verify the user is still active. Owner
      // cookies don't have a separate org_users row — owners are gated by
      // `org.isVerified` further below.
      let staffUserPrefetch = null as Awaited<ReturnType<typeof storage.getOrgUserById>> | null;
      if (!isOwnerCookie) {
        staffUserPrefetch = await storage.getOrgUserById(cookieUserId);
        if (!staffUserPrefetch || staffUserPrefetch.isActive === false) {
          // Either the user was deleted or they were deactivated by an
          // admin. Either way the long-lived cookie must stop working
          // immediately.
          res.setHeader("Set-Cookie", clearOrgSessionCookie());
          return res.status(401).json({ error: "Session no longer valid" });
        }
      }

      const orgId = isOwnerCookie
        ? cookieUserId.slice(OWNER_PREFIX.length)
        : staffUserPrefetch?.organizationId;

      if (!orgId) {
        res.setHeader("Set-Cookie", clearOrgSessionCookie());
        return res.status(401).json({ error: "Session no longer valid" });
      }

      const org = await storage.getOrganizationById(orgId);
      if (!org || !org.isVerified || org.isActive === false) {
        res.setHeader("Set-Cookie", clearOrgSessionCookie());
        return res.status(401).json({ error: "Organization unavailable" });
      }

      const branchesList = await storage.getBranchesByOrganization(org.id);
      const branchesWithServices = await Promise.all(branchesList.map(async (branch) => {
        const rawServices = await storage.getServicesByBranch(branch.id);
        const services = await Promise.all(rawServices.map(async (service) => {
          const desks = await storage.getDesksByService(service.id);
          return { ...service, desks };
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

      const allUsers = await storage.getOrgUsersByOrganization(org.id);
      const usersWithBranches = await Promise.all(allUsers.map(async (user) => {
        const branchIds = await storage.getOrgUserBranches(user.id);
        const userBranch = user.branchId ? branchesList.find(b => b.id === user.branchId) : null;
        return {
          ...sanitizeOrgUser(user)!,
          branchIds,
          branchName: userBranch?.name,
        };
      }));

      const stats = branchesList.length > 0
        ? await storage.getQueueStats(branchesList[0].id)
        : { todayServed: 0, todayWaiting: 0, todayNoShow: 0, averageWaitTime: 0, averageServiceTime: 0 };

      const orgPayload = {
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
      };

      if (isOwnerCookie) {
        const ownerPerms = (await getPermissionsForUser(cookieUserId))?.permissions
          ?? (await storage.getRolePermissionsByKey("admin"));
        return res.json({
          mode: "owner",
          organization: orgPayload,
          branches: branchesWithServices,
          users: usersWithBranches,
          permissions: ownerPerms,
        });
      }

      const staffUser = await storage.getOrgUserById(cookieUserId);
      if (!staffUser) {
        res.setHeader("Set-Cookie", clearOrgSessionCookie());
        return res.status(401).json({ error: "Session no longer valid" });
      }
      const staffBranchIds = await storage.getOrgUserBranches(staffUser.id);
      return res.json({
        mode: "staff",
        organization: orgPayload,
        branches: branchesWithServices,
        users: usersWithBranches,
        currentUser: {
          id: staffUser.id,
          name: staffUser.name,
          email: staffUser.email,
          role: staffUser.role,
          rank: getRoleRank(
            staffUser.roleId
              ? (await storage.getRoleById(staffUser.roleId)) ?? staffUser.role
              : staffUser.role,
          ),
          branchId: staffUser.branchId,
          branchIds: staffBranchIds,
          assignedServiceIds: staffUser.assignedServiceIds,
          profilePictureUrl: staffUser.profilePictureUrl,
        },
        permissions: (await getPermissionsForUser(staffUser.id))?.permissions ?? [],
      });
    } catch (error) {
      console.error("Error restoring session:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/organizations/:id - Update organization profile
  app.put("/api/organizations/:id", requirePermission("org.users.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertOrgOwnership(req, res, id)) return;
      const { name, phone, logoUrl } = req.body;
      const updateData: { name?: string; phone?: string; logoUrl?: string } = {};
      if (name !== undefined) updateData.name = name;
      if (phone !== undefined) updateData.phone = phone;
      if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
      const org = await storage.updateOrganization(id, updateData);
      await writeAudit(req, { action: "organization.update", targetType: "organization", targetId: id, targetLabel: org?.name, diff: updateData });
      res.json({ organization: org });
    } catch (error) {
      console.error("Error updating organization:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/organizations/:id/password - Change organization password
  // POST /api/organizations/:id/password — owner-only self-service (or SA)
  app.post("/api/organizations/:id/password", publicRoute("inline owner-only guard: caller cookie must match owner:<orgId> or be SA"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!isSuperAdminRequest(req)) {
        const cookieUserId = getRequestUserId(req);
        // Owner-direct sessions are stored as `owner:<orgId>`; only that owner (or SA) may change.
        if (!cookieUserId || cookieUserId !== `${OWNER_PREFIX}${id}`) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }
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
      await writeAudit(req, { action: "organization.password.change", targetType: "organization", targetId: id, targetLabel: org.name });
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

  // PUT /api/dashboard/profile/:userId - Update profile (self-service: requester must match userId or have super_admin)
  app.put("/api/dashboard/profile/:userId", publicRoute("inline self-service guard: caller must be the user being edited or SA"), async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId as string;
      const requesterId = getRequestUserId(req);
      const isSA = isSuperAdminRequest(req);
      if (!isSA && requesterId !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { name, phone, profilePictureUrl } = req.body;
      const updateData: { name?: string; phone?: string; profilePictureUrl?: string } = {};
      if (name !== undefined) updateData.name = name;
      if (phone !== undefined) updateData.phone = phone;
      if (profilePictureUrl !== undefined) updateData.profilePictureUrl = profilePictureUrl;
      const user = await storage.updateOrgUser(userId, updateData);
      await writeAudit(req, { action: "profile.update", targetType: "org_user", targetId: userId, targetLabel: user?.email, diff: updateData });
      res.json({ user: sanitizeOrgUser(user) });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/dashboard/profile/:userId/password - Change password (self-service)
  // Inline self-service guard: an authenticated org_user may only change their
  // OWN password. The platform super-admin may change any org_user's password
  // (account-recovery flow). All other callers — including unauthenticated
  // ones, owner sessions targeting an org_user, and other staff in the same
  // org — are rejected. Knowing the current password is NOT a substitute for
  // session identity (previously this route was publicRoute, which let
  // anonymous callers attempt password changes against any user id).
  app.post("/api/dashboard/profile/:userId/password", publicRoute("inline self-service guard: caller must be the user changing their own password or super-admin"), async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId as string;
      const requesterId = getRequestUserId(req);
      const isSA = isSuperAdminRequest(req);
      if (!isSA) {
        if (!requesterId) return res.status(401).json({ error: "Authentication required" });
        if (requesterId !== userId) return res.status(403).json({ error: "Forbidden" });
      }
      const { currentPassword, newPassword } = req.body;

      const user = await storage.getOrgUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Super-admin can rotate any password without knowing the old one
      // (account-recovery). Self-service still requires the current password.
      if (!isSA) {
        const isValid = await verifyPassword(currentPassword, user.passwordHash);
        if (!isValid) {
          return res.status(401).json({ error: "Current password is incorrect" });
        }
      }

      const newHash = await hashPassword(newPassword);
      await storage.updateOrgUser(userId, { passwordHash: newHash });
      await writeAudit(req, { action: "profile.password_change", targetType: "org_user", targetId: userId, targetLabel: user.email });
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
    // ----- Inbound webhook diagnostics -----
    // The global request logger only logs /api paths, so without these
    // explicit lines we have zero visibility into whether Meta is
    // actually delivering to /webhook/whatsapp in production. Log the
    // top-level payload shape on every hit so we can confirm arrival
    // even when the body is a status receipt (no `messages` array) or
    // a shape we don't recognise.
    const wbBody = req.body || {};
    const wbBodyKeys = Object.keys(wbBody);
    const wbObject = wbBody.object;
    const wbFirstChange = wbBody.entry?.[0]?.changes?.[0];
    const wbField = wbFirstChange?.field;
    const wbHasMessages = Array.isArray(wbFirstChange?.value?.messages);
    const wbHasStatuses = Array.isArray(wbFirstChange?.value?.statuses);
    console.log(
      `[whatsapp-webhook] arrived: keys=[${wbBodyKeys.join(",")}] object=${wbObject ?? "—"} field=${wbField ?? "—"} messages=${wbHasMessages} statuses=${wbHasStatuses}`,
    );

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
            // We always log the field name (messages / message_template_status_update / etc)
            // so we can tell when a webhook is arriving but for the wrong subscription field.
            if (change.field !== "messages") {
              console.log(`[whatsapp-webhook] non-messages field: ${change.field}`);
              continue;
            }

            // Status receipts (sent/delivered/read) come through the same
            // "messages" field. Logging them confirms inbound is healthy
            // even when no customer text arrived.
            const statuses = change.value?.statuses || [];
            for (const s of statuses) {
              console.log(`[whatsapp-webhook] status: id=${s.id} status=${s.status} recipient=${s.recipient_id}`);
            }

            const messages = change.value?.messages || [];
            if (messages.length === 0 && statuses.length === 0) {
              // Surface the raw value so we can see what Meta sent when neither
              // arm of our handler matched. JSON kept short to avoid log bloat.
              const raw = JSON.stringify(change.value || {}).slice(0, 500);
              console.log(`[whatsapp-webhook] empty messages+statuses, value=${raw}`);
            }
            for (const message of messages) {
              const from = message.from;
              const type = message.type;
              if (type === "text") {
                const text = message.text?.body || "";
                console.log(`WhatsApp message from ${from}: ${text}`);
                processIncomingWhatsApp(from, text).catch(console.error);
              } else {
                // Customers may send images / interactive replies / location etc.
                // These never trigger the confirmation reply because the ref
                // code lives in TEXT only — log so we can spot misuse.
                console.log(`[whatsapp-webhook] non-text message type=${type} from=${from}`);
              }
            }
          }
        }
        return res.sendStatus(200);
      }

      // Anything else: log a small body slice so we can inspect what Meta
      // (or whoever) sent us. Without this we have no breadcrumb.
      const rawSlice = JSON.stringify(wbBody).slice(0, 500);
      console.log(`[whatsapp-webhook] unrecognised body shape, body=${rawSlice}`);
      return res.sendStatus(200);
    } catch (error) {
      console.error("WhatsApp webhook error:", error);
      res.sendStatus(200);
    }
  });

  // ============================================
  // RBAC: ROLES, PERMISSIONS & AUDIT LOG ROUTES
  // ============================================

  function requireSuperAdminCookie(req: Request, res: Response, next: () => void) {
    if (!hasSuperAdminCookie(req)) {
      return res.status(403).json({ error: "Super Admin access required" });
    }
    next();
  }

  // Permission catalog (used by Super Admin matrix UI)
  app.get("/api/superadmin/permissions/catalog", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    res.json({ catalog: PERMISSION_CATALOG, allKeys: ALL_PERMISSION_KEYS });
  });

  // List all roles (with user counts and permission counts)
  app.get("/api/superadmin/roles", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const all = await storage.listRoles();
      const enriched = await Promise.all(
        all.map(async (r) => {
          const perms = await storage.getRolePermissions(r.id);
          const userCount = await storage.countUsersByRoleId(r.id);
          return {
            ...r,
            permissionCount: perms.length,
            userCount,
          };
        })
      );
      res.json({ roles: enriched });
    } catch (err) {
      console.error("listRoles failed:", err);
      res.status(500).json({ error: "Failed to list roles" });
    }
  });

  // Create role
  app.post("/api/superadmin/roles", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const { name, description, scope, cloneFromRoleId, permissions, organizationId } = req.body || {};
      if (!name || typeof name !== "string") return res.status(400).json({ error: "Name required" });
      const trimmedName = name.trim();
      // If organizationId is provided, validate it exists
      let scopedOrgId: string | null = null;
      if (typeof organizationId === "string" && organizationId.trim()) {
        const org = await storage.getOrganizationById(organizationId);
        if (!org) return res.status(400).json({ error: "Organization not found" });
        scopedOrgId = organizationId;
      }
      const baseKey =
        "custom_" +
        trimmedName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 32);
      let key = baseKey;
      let attempt = 1;
      while (await storage.getRoleByKey(key)) {
        attempt += 1;
        key = `${baseKey}_${attempt}`;
      }
      const created = await storage.createRole({
        key,
        name: trimmedName,
        description: description ?? null,
        isSystem: false,
        scope: scope === "platform" ? "platform" : "organization",
        organizationId: scopedOrgId,
      });

      let initialPerms: string[] = [];
      if (Array.isArray(permissions)) {
        initialPerms = permissions.filter((p) => ALL_PERMISSION_KEYS.includes(p));
      } else if (cloneFromRoleId) {
        initialPerms = await storage.getRolePermissions(cloneFromRoleId);
      }
      await storage.setRolePermissions(created.id, initialPerms);

      await writeAudit(req, {
        action: "role.create",
        targetType: "role",
        targetId: created.id,
        targetLabel: created.name,
        diff: { name: created.name, scope: created.scope, permissionsCount: initialPerms.length },
      });

      res.status(201).json({ role: created, permissions: initialPerms });
    } catch (err) {
      console.error("createRole failed:", err);
      res.status(500).json({ error: "Failed to create role" });
    }
  });

  // Update role (name/description; key + isSystem locked)
  app.patch("/api/superadmin/roles/:id", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const { id } = req.params;
      const role = await storage.getRoleById(id);
      if (!role) return res.status(404).json({ error: "Role not found" });
      const { name, description } = req.body || {};
      const updates: { name?: string; description?: string | null } = {};
      if (typeof name === "string" && name.trim()) updates.name = name.trim();
      if (typeof description === "string" || description === null) updates.description = description;
      const updated = await storage.updateRole(id, updates);
      await writeAudit(req, {
        action: "role.update",
        targetType: "role",
        targetId: id,
        targetLabel: updated?.name ?? role.name,
        diff: { before: { name: role.name, description: role.description }, after: updates },
      });
      res.json({ role: updated });
    } catch (err) {
      console.error("updateRole failed:", err);
      res.status(500).json({ error: "Failed to update role" });
    }
  });

  // Delete role (with mandatory fallback when users are assigned)
  app.delete("/api/superadmin/roles/:id", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const { id } = req.params;
      const role = await storage.getRoleById(id);
      if (!role) return res.status(404).json({ error: "Role not found" });
      if (role.isSystem) return res.status(400).json({ error: "Cannot delete a system role" });
      const userCount = await storage.countUsersByRoleId(id);
      const fallbackId = (req.query.fallbackRoleId as string) || undefined;
      if (userCount > 0) {
        if (!fallbackId) {
          return res.status(409).json({
            error: "Role has users assigned. Provide fallbackRoleId.",
            userCount,
          });
        }
        const fallback = await storage.getRoleById(fallbackId);
        if (!fallback) return res.status(400).json({ error: "Fallback role not found" });
        await storage.reassignUsersRole(id, fallback.id, fallback.key);
      }
      await storage.deleteRole(id);
      await writeAudit(req, {
        action: "role.delete",
        targetType: "role",
        targetId: id,
        targetLabel: role.name,
        diff: { reassignedUsers: userCount, fallbackRoleId: fallbackId ?? null },
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("deleteRole failed:", err);
      res.status(500).json({ error: "Failed to delete role" });
    }
  });

  // Get permissions for a single role
  app.get("/api/superadmin/roles/:id/permissions", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const { id } = req.params;
      const role = await storage.getRoleById(id);
      if (!role) return res.status(404).json({ error: "Role not found" });
      const permissions = await storage.getRolePermissions(id);
      res.json({ role, permissions });
    } catch (err) {
      console.error("get role permissions failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // Replace permissions for a role
  app.put("/api/superadmin/roles/:id/permissions", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const { id } = req.params;
      const { permissions } = req.body || {};
      if (!Array.isArray(permissions)) {
        return res.status(400).json({ error: "permissions array required" });
      }
      const role = await storage.getRoleById(id);
      if (!role) return res.status(404).json({ error: "Role not found" });
      const filtered = permissions.filter((p: string) => ALL_PERMISSION_KEYS.includes(p));
      const before = await storage.getRolePermissions(id);
      await storage.setRolePermissions(id, filtered);

      const beforeSet = new Set(before);
      const afterSet = new Set(filtered);
      const added = filtered.filter((p: string) => !beforeSet.has(p));
      const removed = before.filter((p) => !afterSet.has(p));

      await writeAudit(req, {
        action: "role.permissions.update",
        targetType: "role",
        targetId: id,
        targetLabel: role.name,
        diff: { added, removed, total: filtered.length },
      });
      res.json({ ok: true, permissions: filtered });
    } catch (err) {
      console.error("set role permissions failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // Restore defaults for a system role
  app.post("/api/superadmin/roles/:id/restore-defaults", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const { id } = req.params;
      const role = await storage.getRoleById(id);
      if (!role) return res.status(404).json({ error: "Role not found" });
      if (!role.isSystem) {
        return res.status(400).json({ error: "Only system roles have defaults" });
      }
      const defaults = getBuiltinPermissions(role.key);
      await storage.setRolePermissions(id, defaults);
      await writeAudit(req, {
        action: "role.permissions.restore_defaults",
        targetType: "role",
        targetId: id,
        targetLabel: role.name,
        diff: { restoredCount: defaults.length },
      });
      res.json({ ok: true, permissions: defaults });
    } catch (err) {
      console.error("restore defaults failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // Audit logs (Super Admin only)
  app.get("/api/superadmin/audit-logs", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const limit = Math.min(parseInt((req.query.limit as string) || "200", 10) || 200, 1000);
      const action = (req.query.action as string) || undefined;
      const logs = await storage.listAuditLogs({ limit, action });
      res.json({ logs });
    } catch (err) {
      console.error("listAuditLogs failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // Aggregated platform stats for the Super Admin Dashboard
  app.get("/api/superadmin/stats", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const stats = await storage.getPlatformStats();
      res.json(stats);
    } catch (err) {
      console.error("platform stats failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // Onboarding/Organisations list
  app.get("/api/superadmin/organizations", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const limit = Math.min(parseInt((req.query.limit as string) || "200", 10) || 200, 500);
      const items = await storage.listOrganizationsForAdmin({ search, limit });
      res.json({ organizations: items });
    } catch (err) {
      console.error("list organizations (admin) failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // All org users (Admins page) — every staff record across every org
  app.get("/api/superadmin/admins", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const limit = Math.min(parseInt((req.query.limit as string) || "200", 10) || 200, 500);
      const onlyOwners = req.query.ownersOnly === "1";
      let items = await storage.listAllOrgUsersForAdmin({ search, limit });
      if (onlyOwners) items = items.filter((u) => u.role === "admin");
      res.json({ admins: items });
    } catch (err) {
      console.error("list admins failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // Subscribers
  app.get("/api/superadmin/subscribers", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const limit = Math.min(parseInt((req.query.limit as string) || "200", 10) || 200, 500);
      const subs = await storage.listSubscriptionsForAdmin({ search, limit });
      res.json({ subscribers: subs });
    } catch (err) {
      console.error("list subscribers failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // Transactions / payments
  app.get("/api/superadmin/transactions", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const limit = Math.min(parseInt((req.query.limit as string) || "200", 10) || 200, 500);
      const items = await storage.listPaymentsForAdmin({ search, status, limit });
      res.json({ transactions: items });
    } catch (err) {
      console.error("list transactions failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // -- VISITORS ----------------------------------------------------------
  app.get("/api/superadmin/visitors", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const sinceDays = Math.max(1, Math.min(365, parseInt((req.query.days as string) || "30", 10) || 30));
      const limit = Math.max(1, Math.min(50, parseInt((req.query.limit as string) || "10", 10) || 10));
      const data = await storage.getVisitorReport({ sinceDays, limit });
      res.json(data);
    } catch (err) {
      console.error("visitors report failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // -- REPORTS -----------------------------------------------------------
  app.get("/api/superadmin/reports", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const reports = await storage.listAvailableReports();
      res.json({ reports });
    } catch (err) {
      console.error("list reports failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.get("/api/superadmin/reports/:id/download", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const { filename, csv } = await storage.exportReportCsv(req.params.id);
      if (!csv) return res.status(404).json({ error: "Report not found" });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
      res.send(csv);
    } catch (err) {
      console.error("download report failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // -- PRICING PLANS -----------------------------------------------------
  app.get("/api/superadmin/plans", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const plans = await storage.listSubscriptionPlansForAdmin();
      res.json({ plans });
    } catch (err) {
      console.error("list plans failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.post("/api/superadmin/plans", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const body = req.body || {};
      if (!body.name || !body.slug) return res.status(400).json({ error: "name and slug required" });
      const plan = await storage.createSubscriptionPlan({
        name: String(body.name),
        slug: String(body.slug),
        description: body.description ?? null,
        monthlyPrice: Number(body.monthlyPrice ?? 0),
        yearlyPrice: body.yearlyPrice != null ? Number(body.yearlyPrice) : null,
        currency: body.currency ?? "USD",
        maxBranches: body.maxBranches != null ? Number(body.maxBranches) : null,
        maxStaffUsers: body.maxStaffUsers != null ? Number(body.maxStaffUsers) : null,
        maxDailyTickets: body.maxDailyTickets != null ? Number(body.maxDailyTickets) : null,
        features: body.features ?? null,
        isActive: body.isActive !== false,
        sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
      });
      res.status(201).json({ plan });
    } catch (err) {
      console.error("create plan failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.patch("/api/superadmin/plans/:id", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const b = req.body || {};
      const update: any = {};
      for (const k of ["name", "slug", "description", "currency"]) if (b[k] !== undefined) update[k] = b[k];
      for (const k of ["monthlyPrice", "yearlyPrice", "maxBranches", "maxStaffUsers", "maxDailyTickets", "sortOrder"])
        if (b[k] !== undefined) update[k] = b[k] === null ? null : Number(b[k]);
      if (b.features !== undefined) update.features = b.features;
      if (b.isActive !== undefined) update.isActive = !!b.isActive;
      const plan = await storage.updateSubscriptionPlan(req.params.id, update);
      if (!plan) return res.status(404).json({ error: "Not found" });
      res.json({ plan });
    } catch (err) {
      console.error("update plan failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.delete("/api/superadmin/plans/:id", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const ok = await storage.deleteSubscriptionPlan(req.params.id);
      if (!ok) return res.status(404).json({ error: "Not found" });
      res.json({ ok: true });
    } catch (err: any) {
      const msg = err?.message || "Failed";
      const code = msg.includes("in use") ? 409 : 500;
      console.error("delete plan failed:", err);
      res.status(code).json({ error: msg });
    }
  });

  // -- PRICING FEATURES + matrix ---------------------------------------
  app.get("/api/superadmin/pricing-features", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const [features, matrix] = await Promise.all([
        storage.listPricingFeatures(),
        storage.listPlanFeatureMatrix(),
      ]);
      res.json({ features, matrix });
    } catch (err) {
      console.error("list pricing features failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.post("/api/superadmin/pricing-features", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const b = req.body || {};
      if (!b.label) return res.status(400).json({ error: "label required" });
      const feature = await storage.createPricingFeature({
        label: String(b.label),
        isActive: b.isActive !== false,
        sortOrder: b.sortOrder != null ? Number(b.sortOrder) : 0,
      });
      res.status(201).json({ feature });
    } catch (err) {
      console.error("create pricing feature failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.patch("/api/superadmin/pricing-features/:id", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const b = req.body || {};
      const update: any = {};
      if (b.label !== undefined) update.label = String(b.label);
      if (b.isActive !== undefined) update.isActive = !!b.isActive;
      if (b.sortOrder !== undefined) update.sortOrder = Number(b.sortOrder);
      const feature = await storage.updatePricingFeature(req.params.id, update);
      if (!feature) return res.status(404).json({ error: "Not found" });
      res.json({ feature });
    } catch (err) {
      console.error("update pricing feature failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.delete("/api/superadmin/pricing-features/:id", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const ok = await storage.deletePricingFeature(req.params.id);
      if (!ok) return res.status(404).json({ error: "Not found" });
      res.json({ ok: true });
    } catch (err) {
      console.error("delete pricing feature failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.put("/api/superadmin/pricing-matrix", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const { planId, featureId, enabled } = req.body || {};
      if (!planId || !featureId) return res.status(400).json({ error: "planId and featureId required" });
      await storage.setPlanFeature(String(planId), String(featureId), !!enabled);
      res.json({ ok: true });
    } catch (err) {
      console.error("set plan feature failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // -- SUPPORT TICKETS ---------------------------------------------------
  app.get("/api/superadmin/support-tickets", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const limit = Math.min(parseInt((req.query.limit as string) || "200", 10) || 200, 500);
      const [tickets, stats] = await Promise.all([
        storage.listSupportTickets({ search, status, limit }),
        storage.getSupportTicketStats(),
      ]);
      res.json({ tickets, stats });
    } catch (err) {
      console.error("list support tickets failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.post("/api/superadmin/support-tickets", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const b = req.body || {};
      if (!b.subject) return res.status(400).json({ error: "subject required" });
      const ticketNumber = b.ticketNumber || `T-${Date.now().toString(36).toUpperCase()}`;
      const ticket = await storage.createSupportTicket({
        organizationId: b.organizationId ?? null,
        ticketNumber,
        subject: String(b.subject),
        description: b.description ?? null,
        priority: b.priority ?? "medium",
        status: b.status ?? "open",
        assignee: b.assignee ?? null,
        reportedByEmail: b.reportedByEmail ?? null,
      });
      res.status(201).json({ ticket });
    } catch (err) {
      console.error("create support ticket failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.patch("/api/superadmin/support-tickets/:id", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const b = req.body || {};
      const update: any = {};
      for (const k of ["subject", "description", "priority", "status", "assignee", "reportedByEmail", "organizationId"])
        if (b[k] !== undefined) update[k] = b[k];
      const ticket = await storage.updateSupportTicket(req.params.id, update);
      if (!ticket) return res.status(404).json({ error: "Not found" });
      res.json({ ticket });
    } catch (err) {
      console.error("update support ticket failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.delete("/api/superadmin/support-tickets/:id", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const ok = await storage.deleteSupportTicket(req.params.id);
      if (!ok) return res.status(404).json({ error: "Not found" });
      res.json({ ok: true });
    } catch (err) {
      console.error("delete support ticket failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // -- WHATSAPP TEMPLATE METADATA + OVERRIDES --------------------------
  // Bundle of static metadata (modes, languages, triggers, variables,
  // sample data, English/localized defaults). Served from the shared
  // module so the Super Admin UI never drifts from the server-side
  // resolver.
  app.get("/api/superadmin/whatsapp-defaults", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    res.json(getWaTemplateBundle());
  });

  app.get("/api/superadmin/whatsapp-overrides", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const rows = await storage.listWhatsappOverrides();
      // Return as a flat map keyed by mode|key|lang for easy frontend hydration.
      const overrides: Record<string, string> = {};
      for (const r of rows) overrides[`${r.mode}|${r.triggerKey}|${r.language}`] = r.content;
      res.json({ overrides });
    } catch (err) {
      console.error("list whatsapp overrides failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.put("/api/superadmin/whatsapp-overrides", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const { mode, triggerKey, language, content } = req.body || {};
      if (!mode || !triggerKey || !language || typeof content !== "string") {
        return res.status(400).json({ error: "mode, triggerKey, language, content required" });
      }
      const row = await storage.setWhatsappOverride(String(mode), String(triggerKey), String(language), String(content));
      // Invalidate the in-process resolver cache so the next outgoing
      // WhatsApp message picks up this edit immediately.
      invalidateWaTemplateCache();
      res.json({ override: row });
    } catch (err) {
      console.error("save whatsapp override failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.delete("/api/superadmin/whatsapp-overrides", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const mode = req.query.mode as string;
      const triggerKey = req.query.triggerKey as string;
      const language = req.query.language as string;
      if (!mode || !triggerKey || !language) return res.status(400).json({ error: "mode, triggerKey, language required" });
      const ok = await storage.deleteWhatsappOverride(mode, triggerKey, language);
      invalidateWaTemplateCache();
      res.json({ ok });
    } catch (err) {
      console.error("delete whatsapp override failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // -- MASTER DATA ------------------------------------------------------
  app.get("/api/superadmin/master/industries", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const items = await storage.listIndustries();
      res.json({ industries: items });
    } catch (err) {
      console.error("list industries failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // Simple static catalog of currencies — no DB persistence yet, but exposed
  // via API so the front-end can stop hardcoding it. Add real persistence
  // when the platform actually supports multi-currency billing.
  app.get("/api/superadmin/master/currencies", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      // Enumerate currencies actually used by orgs/plans.
      const planCurrencies = await storage.listSubscriptionPlansForAdmin();
      const seen = new Set<string>();
      for (const p of planCurrencies) if (p.currency) seen.add(p.currency.toUpperCase());
      // Always include a baseline.
      ["USD", "EUR", "GBP", "AED", "INR", "SGD"].forEach((c) => seen.add(c));
      const meta: Record<string, { symbol: string; name: string; rate: number }> = {
        USD: { symbol: "$", name: "US Dollar", rate: 1 },
        EUR: { symbol: "€", name: "Euro", rate: 1.08 },
        GBP: { symbol: "£", name: "British Pound", rate: 1.27 },
        AED: { symbol: "د.إ", name: "UAE Dirham", rate: 0.27 },
        INR: { symbol: "₹", name: "Indian Rupee", rate: 0.012 },
        SGD: { symbol: "S$", name: "Singapore Dollar", rate: 0.74 },
      };
      const currencies = Array.from(seen).map((code) => ({
        code,
        symbol: meta[code]?.symbol ?? code,
        name: meta[code]?.name ?? code,
        rate: meta[code]?.rate ?? 1,
      }));
      res.json({ currencies });
    } catch (err) {
      console.error("list currencies failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // -- SYSTEM ERRORS ----------------------------------------------------
  app.get("/api/superadmin/system-errors", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const limit = Math.min(parseInt((req.query.limit as string) || "200", 10) || 200, 500);
      const level = typeof req.query.level === "string" ? req.query.level : undefined;
      const errors = await storage.listSystemErrors({ limit, level });
      res.json({ errors });
    } catch (err) {
      console.error("list system errors failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // ============================================
  // NOTIFICATION SETTINGS (per-queueMode templates + alert sound)
  // ============================================
  const SUPPORTED_QUEUE_MODES = ["fifo", "selective", "checkin", "multistage", "dinein", "takeaway"] as const;
  const DEFAULT_TEMPLATES: Record<string, { en: string; ar: string }> = {
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

  app.get("/api/superadmin/notification-settings", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    try {
      const { SUPPORTED_LANGUAGES, SUPPORTED_LANGUAGE_CODES } = await import("../shared/languages");
      const rows = await storage.listNotificationSettings();
      const byMode = new Map(rows.map((r) => [r.queueMode, r]));
      const out = SUPPORTED_QUEUE_MODES.map((mode) => {
        const row = byMode.get(mode);
        const stored = (row?.templates as Record<string, string> | null) || {};
        // Merge legacy columns into the templates map so the editor sees them.
        const templates: Record<string, string> = { ...stored };
        if (templates.en == null && row?.templateEn) templates.en = row.templateEn;
        if (templates.ar == null && row?.templateAr) templates.ar = row.templateAr;
        return {
          queueMode: mode,
          alertSoundUrl: row?.alertSoundUrl || null,
          templateEn: templates.en ?? DEFAULT_TEMPLATES[mode]?.en ?? "",
          templateAr: templates.ar ?? DEFAULT_TEMPLATES[mode]?.ar ?? "",
          templates,
          isCustom: !!row,
          updatedAt: row?.updatedAt || null,
        };
      });
      res.json({
        settings: out,
        variables: ["{ticketNumber}", "{customerName}", "{customerNameTail}", "{desk}", "{table}", "{stage}", "{service}"],
        languages: SUPPORTED_LANGUAGES,
        defaultTemplates: DEFAULT_TEMPLATES,
      });
    } catch (err) {
      console.error("list notification settings failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.put("/api/superadmin/notification-settings/:queueMode", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    const { queueMode } = req.params;
    if (!SUPPORTED_QUEUE_MODES.includes(queueMode as any)) {
      return res.status(400).json({ error: "Unsupported queueMode" });
    }
    try {
      const { SUPPORTED_LANGUAGE_CODES } = await import("../shared/languages");
      const body = (req.body || {}) as Record<string, any>;
      const { templateEn, templateAr, alertSoundUrl } = body;
      const incomingTemplates = (body.templates && typeof body.templates === "object") ? body.templates as Record<string, any> : null;

      // Build the canonical templates map: filter to supported codes, accept
      // empty string as "explicitly cleared". Legacy templateEn/templateAr are
      // also folded in if the caller is using the older shape.
      const existing = await storage.getNotificationSetting(queueMode);
      const existingTemplates: Record<string, string> = { ...((existing?.templates as Record<string, string> | null) || {}) };
      if (existingTemplates.en == null && existing?.templateEn) existingTemplates.en = existing.templateEn;
      if (existingTemplates.ar == null && existing?.templateAr) existingTemplates.ar = existing.templateAr;

      const merged: Record<string, string> = { ...existingTemplates };
      if (incomingTemplates) {
        for (const [k, v] of Object.entries(incomingTemplates)) {
          const code = String(k).toLowerCase();
          if (!SUPPORTED_LANGUAGE_CODES.includes(code)) continue;
          if (typeof v !== "string") continue;
          merged[code] = v;
        }
      }
      if (typeof templateEn === "string") merged.en = templateEn;
      if (typeof templateAr === "string") merged.ar = templateAr;

      const row = await storage.upsertNotificationSetting({
        queueMode,
        templateEn: merged.en ?? null,
        templateAr: merged.ar ?? null,
        templates: merged,
        alertSoundUrl: typeof alertSoundUrl === "string" || alertSoundUrl === null ? alertSoundUrl : undefined,
      } as any);
      const { invalidateNotificationSettingsCache } = await import("./announcements");
      invalidateNotificationSettingsCache();
      res.json({ setting: row });
    } catch (err) {
      console.error("upsert notification setting failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  app.post("/api/superadmin/notification-settings/:queueMode/upload-sound", publicRoute("super-admin-only via inline hasSuperAdminCookie check"), async (req: Request, res: Response) => {
    if (!hasSuperAdminCookie(req)) return res.status(403).json({ error: "Forbidden" });
    const { queueMode } = req.params;
    if (!SUPPORTED_QUEUE_MODES.includes(queueMode as any)) {
      return res.status(400).json({ error: "Unsupported queueMode" });
    }
    try {
      const { filename, dataBase64 } = req.body || {};
      if (typeof dataBase64 !== "string" || dataBase64.length === 0) {
        return res.status(400).json({ error: "dataBase64 required" });
      }
      const cleanName = String(filename || "sound").replace(/[^a-zA-Z0-9._-]/g, "_");
      const ext = (cleanName.split(".").pop() || "wav").toLowerCase();
      if (!["wav", "mp3", "ogg", "m4a"].includes(ext)) {
        return res.status(400).json({ error: "Unsupported audio format" });
      }
      const fs = await import("fs");
      const path = await import("path");
      const dir = path.resolve(process.cwd(), "server/public/sounds");
      fs.mkdirSync(dir, { recursive: true });
      const finalName = `${queueMode}-${Date.now()}.${ext}`;
      const filePath = path.join(dir, finalName);
      const buf = Buffer.from(dataBase64, "base64");
      if (buf.length > 5 * 1024 * 1024) {
        return res.status(400).json({ error: "File too large (max 5MB)" });
      }
      fs.writeFileSync(filePath, buf);
      const url = `/public/sounds/${finalName}`;
      const row = await storage.upsertNotificationSetting({
        queueMode,
        alertSoundUrl: url,
      } as any);
      const { invalidateNotificationSettingsCache } = await import("./announcements");
      invalidateNotificationSettingsCache();
      res.json({ url, setting: row });
    } catch (err) {
      console.error("upload notification sound failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // Get effective permissions for an org user (used by Org app on login/refresh).
  // Allowed for: super admin, the same user (matched via signed cookie), or
  // any owner-session for the same organization.
  app.get("/api/org/users/:id/permissions", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const callerId = getRequestUserId(req);
      const isSA = isSuperAdminRequest(req);
      let allowed = isSA;
      if (!allowed && callerId) {
        if (callerId === id) {
          allowed = true;
        } else if (callerId.startsWith("owner:")) {
          const ownerOrgId = callerId.slice("owner:".length);
          const target = await storage.getOrgUserById(id);
          if (target && target.organizationId === ownerOrgId) allowed = true;
        }
      }
      if (!allowed) return res.status(403).json({ error: "Forbidden" });
      const result = await getPermissionsForUser(id);
      if (!result) return res.status(404).json({ error: "User not found" });
      res.json(result);
    } catch (err) {
      console.error("get user permissions failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // -- helpers shared by /api/org/roles routes ---------------------------
  // Resolve the caller's organization id from the signed cookie. Super admin
  // gets `null` and is allowed to act on any org via ?organizationId=… query.
  async function resolveCallerOrgId(req: Request): Promise<{ orgId: string | null; isSA: boolean; isOwner: boolean } | null> {
    if (isSuperAdminRequest(req)) {
      const orgIdQ = typeof req.query.organizationId === "string" ? req.query.organizationId : null;
      return { orgId: orgIdQ, isSA: true, isOwner: true };
    }
    const callerId = getRequestUserId(req);
    if (!callerId) return null;
    if (callerId.startsWith("owner:")) {
      return { orgId: callerId.slice("owner:".length), isSA: false, isOwner: true };
    }
    const u = await storage.getOrgUserById(callerId);
    if (!u) return null;
    return { orgId: u.organizationId, isSA: false, isOwner: u.role === "admin" };
  }

  // Org-scoped role catalog: returns the role templates an org-session
  // user can pick from in the Team Members "Add/Edit User" picker.
  // Returns: system roles (organization_id IS NULL) + roles owned by the
  // caller's organisation. Excludes super_admin and owner — neither is
  // assignable through the picker.
  app.get("/api/org/roles", async (req: Request, res: Response) => {
    try {
      const ctx = await resolveCallerOrgId(req);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      const callerCtx = await getCallerContext(req);
      const callerRank = callerCtx?.rank ?? Infinity; // SA/owner-cookie callers without org_users row default to Infinity (unrestricted)
      const all = ctx.isSA && !ctx.orgId
        ? await storage.listRoles()
        : await storage.listRoles({ organizationId: ctx.orgId ?? undefined });
      // Hierarchy: never expose super_admin/admin (top org role) via the picker,
      // AND drop any role at-or-above the caller's own rank so a Location
      // Manager can't see/assign Admin, etc.
      const assignable = all.filter((r) => {
        if (r.key === "super_admin" || r.key === "admin") return false;
        if (!Number.isFinite(callerRank)) return true;
        return getRoleRank(r) < callerRank;
      });
      // Enrich with permission count for the management screen
      const enriched = await Promise.all(
        assignable.map(async (r) => ({
          id: r.id,
          key: r.key,
          name: r.name,
          description: r.description,
          isSystem: r.isSystem,
          organizationId: r.organizationId,
          rank: getRoleRank(r),
          permissionCount: (await storage.getRolePermissions(r.id)).length,
          userCount: ctx.orgId
            ? await storage.countUsersByRoleIdInOrg(r.id, ctx.orgId)
            : await storage.countUsersByRoleId(r.id),
        })),
      );
      res.json({ roles: enriched });
    } catch (err) {
      console.error("list org roles failed:", err);
      res.status(500).json({ error: "Failed to list roles" });
    }
  });

  // Get permissions for a single role (system or org-owned). Org users may
  // read system role permissions (read-only) and their own org's role perms.
  app.get("/api/org/roles/:id/permissions", async (req: Request, res: Response) => {
    try {
      const ctx = await resolveCallerOrgId(req);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      const role = await storage.getRoleById(req.params.id);
      if (!role) return res.status(404).json({ error: "Role not found" });
      // system role → readable by anyone in any org. Org-owned → must match.
      if (role.organizationId && role.organizationId !== ctx.orgId && !ctx.isSA) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const perms = await storage.getRolePermissions(role.id);
      res.json({ role, permissions: perms });
    } catch (err) {
      console.error("get org role permissions failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // Create a custom role scoped to the caller's organisation. Owner-only.
  app.post("/api/org/roles", async (req: Request, res: Response) => {
    try {
      const ctx = await resolveCallerOrgId(req);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      if (!ctx.isOwner) return res.status(403).json({ error: "Owner permission required" });
      if (!ctx.orgId) return res.status(400).json({ error: "Organization id required" });
      const { name, description, cloneFromRoleId, permissions } = req.body || {};
      if (!name || typeof name !== "string" || !name.trim()) return res.status(400).json({ error: "Name required" });
      const trimmedName = name.trim();
      const baseKey =
        "custom_" +
        trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32);
      let key = baseKey;
      let attempt = 1;
      while (await storage.getRoleByKey(key)) {
        attempt += 1;
        key = `${baseKey}_${attempt}`;
      }
      const created = await storage.createRole({
        key,
        name: trimmedName,
        description: typeof description === "string" ? description : null,
        isSystem: false,
        scope: "organization",
        organizationId: ctx.orgId,
      });
      let initialPerms: string[] = [];
      if (Array.isArray(permissions)) {
        initialPerms = permissions.filter((p) => ALL_PERMISSION_KEYS.includes(p));
      } else if (typeof cloneFromRoleId === "string" && cloneFromRoleId) {
        const src = await storage.getRoleById(cloneFromRoleId);
        // Only allow cloning from system roles or own-org roles
        if (src && (!src.organizationId || src.organizationId === ctx.orgId || ctx.isSA)) {
          initialPerms = await storage.getRolePermissions(cloneFromRoleId);
        }
      }
      await storage.setRolePermissions(created.id, initialPerms);
      await writeAudit(req, {
        action: "org.role.create",
        targetType: "role",
        targetId: created.id,
        targetLabel: created.name,
        diff: { name: created.name, organizationId: ctx.orgId, permissionsCount: initialPerms.length },
      });
      res.status(201).json({ role: created, permissions: initialPerms });
    } catch (err) {
      console.error("create org role failed:", err);
      res.status(500).json({ error: "Failed to create role" });
    }
  });

  // Update name/description of an org-owned custom role
  app.patch("/api/org/roles/:id", async (req: Request, res: Response) => {
    try {
      const ctx = await resolveCallerOrgId(req);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      if (!ctx.isOwner) return res.status(403).json({ error: "Owner permission required" });
      const role = await storage.getRoleById(req.params.id);
      if (!role) return res.status(404).json({ error: "Role not found" });
      if (role.isSystem) return res.status(400).json({ error: "System role cannot be edited" });
      if (!role.organizationId || (role.organizationId !== ctx.orgId && !ctx.isSA)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const { name, description } = req.body || {};
      const updates: { name?: string; description?: string | null } = {};
      if (typeof name === "string" && name.trim()) updates.name = name.trim();
      if (typeof description === "string" || description === null) updates.description = description;
      const updated = await storage.updateRole(role.id, updates);
      await writeAudit(req, {
        action: "org.role.update",
        targetType: "role",
        targetId: role.id,
        targetLabel: updated?.name ?? role.name,
        diff: { before: { name: role.name, description: role.description }, after: updates },
      });
      res.json({ role: updated });
    } catch (err) {
      console.error("update org role failed:", err);
      res.status(500).json({ error: "Failed to update role" });
    }
  });

  // Replace permission set for an org-owned custom role
  app.put("/api/org/roles/:id/permissions", async (req: Request, res: Response) => {
    try {
      const ctx = await resolveCallerOrgId(req);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      if (!ctx.isOwner) return res.status(403).json({ error: "Owner permission required" });
      const role = await storage.getRoleById(req.params.id);
      if (!role) return res.status(404).json({ error: "Role not found" });
      if (role.isSystem) return res.status(400).json({ error: "System role permissions are read-only" });
      if (!role.organizationId || (role.organizationId !== ctx.orgId && !ctx.isSA)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const incoming = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
      const filtered = incoming.filter((p: unknown) => typeof p === "string" && ALL_PERMISSION_KEYS.includes(p));
      const before = await storage.getRolePermissions(role.id);
      await storage.setRolePermissions(role.id, filtered);
      await writeAudit(req, {
        action: "org.role.permissions.update",
        targetType: "role",
        targetId: role.id,
        targetLabel: role.name,
        diff: { added: filtered.filter((p: string) => !before.includes(p)), removed: before.filter((p) => !filtered.includes(p)) },
      });
      res.json({ permissions: filtered });
    } catch (err) {
      console.error("update org role perms failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // Delete a custom org role; reassigns members to fallbackRoleId (must be
  // a role visible to this org) before deletion.
  app.delete("/api/org/roles/:id", async (req: Request, res: Response) => {
    try {
      const ctx = await resolveCallerOrgId(req);
      if (!ctx) return res.status(401).json({ error: "Authentication required" });
      if (!ctx.isOwner) return res.status(403).json({ error: "Owner permission required" });
      const role = await storage.getRoleById(req.params.id);
      if (!role) return res.status(404).json({ error: "Role not found" });
      if (role.isSystem) return res.status(400).json({ error: "System role cannot be deleted" });
      if (!role.organizationId || (role.organizationId !== ctx.orgId && !ctx.isSA)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const fallbackRoleId = typeof req.body?.fallbackRoleId === "string" ? req.body.fallbackRoleId : null;
      // Org-scoped count: only members of the role's owning org are reassigned.
      const ownerOrgId = role.organizationId ?? ctx.orgId!;
      const userCount = await storage.countUsersByRoleIdInOrg(role.id, ownerOrgId);
      if (userCount > 0) {
        if (!fallbackRoleId) return res.status(400).json({ error: "fallbackRoleId required (role has assigned users)" });
        if (fallbackRoleId === role.id) {
          return res.status(400).json({ error: "Fallback role cannot be the role being deleted" });
        }
        const fallback = await storage.getRoleById(fallbackRoleId);
        if (!fallback) return res.status(400).json({ error: "Fallback role not found" });
        // Block escalation: fallback must be a normal assignable role, never
        // super_admin or admin (top org role) — both are excluded from the
        // org picker and would represent a privilege jump for the affected
        // users.
        if (fallback.key === "super_admin" || fallback.key === "admin") {
          return res.status(400).json({ error: `Cannot reassign users to ${fallback.key} role` });
        }
        if (fallback.organizationId && fallback.organizationId !== ctx.orgId && !ctx.isSA) {
          return res.status(400).json({ error: "Fallback role is not accessible to this organisation" });
        }
        await storage.reassignUsersRoleInOrg(role.id, fallback.id, fallback.key, ownerOrgId);
      }
      await storage.deleteRole(role.id);
      await writeAudit(req, {
        action: "org.role.delete",
        targetType: "role",
        targetId: role.id,
        targetLabel: role.name,
        diff: { reassignedUsers: userCount, fallbackRoleId },
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("delete org role failed:", err);
      res.status(500).json({ error: "Failed to delete role" });
    }
  });

  // Convenience: caller's own permissions (resolved from signed session cookie).
  app.get("/api/org/me/permissions", async (req: Request, res: Response) => {
    try {
      if (isSuperAdminRequest(req)) {
        const result = await getPermissionsForUser("super_admin");
        return res.json(result);
      }
      const callerId = getRequestUserId(req);
      if (!callerId) return res.status(401).json({ error: "Authentication required" });
      const result = await getPermissionsForUser(callerId);
      if (!result) return res.status(404).json({ error: "User not found" });
      res.json(result);
    } catch (err) {
      console.error("get me permissions failed:", err);
      res.status(500).json({ error: "Failed" });
    }
  });

  // Verify every org-scoped route is wrapped by either requirePermission()
  // or publicRoute() — fails server boot if a future route is added without
  // explicit coverage.
  const coverage = assertOrgRouteCoverage(app);
  console.log(`[rbac] Org-route coverage OK: ${coverage.covered} gated method(s).`);

  const httpServer = createServer(app);

  return httpServer;
}
