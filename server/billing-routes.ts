import type { Express, Request, Response } from "express";
import { storage, hashPassword } from "./storage";
import crypto from "crypto";
import {
  requirePermission,
  writeAudit,
  publicRoute,
  assertOrgOwnership,
  assertBranchOwnership,
  assertServiceOwnership,
  assertOrgUserOwnership,
  assertOperatingHourOwnership,
  assertBreakOwnership,
  assertHolidayOwnership,
  assertJourneyOwnership,
} from "./rbac";

export function registerBillingRoutes(app: Express) {
  storage.seedDefaultPlans().catch(console.error);

  app.get("/api/billing/plans", publicRoute("public plan catalog used by signup/marketing"), async (_req: Request, res: Response) => {
    try {
      const plans = await storage.getAllPlans();
      res.json({ plans });
    } catch (error) {
      console.error("Error getting plans:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/billing/subscription/:orgId", requirePermission("org.billing.view"), async (req: Request, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      if (!(await assertOrgOwnership(req, res, orgId))) return;
      const subscription = await storage.getSubscriptionByOrg(orgId);
      if (!subscription) {
        return res.json({ subscription: null });
      }
      const plan = await storage.getPlanById(subscription.planId);
      res.json({ subscription: { ...subscription, plan } });
    } catch (error) {
      console.error("Error getting subscription:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/billing/subscribe", requirePermission("org.billing.payment_method"), async (req: Request, res: Response) => {
    try {
      const { orgId, planId } = req.body;
      if (!orgId || !planId) {
        return res.status(400).json({ error: "orgId and planId are required" });
      }
      if (!(await assertOrgOwnership(req, res, orgId))) return;
      const plan = await storage.getPlanById(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }
      const existing = await storage.getSubscriptionByOrg(orgId);
      if (existing && (existing.status === "active" || existing.status === "trialing")) {
        return res.status(400).json({ error: "Organization already has an active subscription" });
      }
      const subscription = await storage.createTrialSubscription(orgId, planId);
      res.json({ subscription });
    } catch (error) {
      console.error("Error creating subscription:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/billing/create-order", requirePermission("org.billing.payment_method"), async (req: Request, res: Response) => {
    try {
      const { orgId, planId, amount } = req.body;
      if (!orgId || !planId || !amount) {
        return res.status(400).json({ error: "orgId, planId, and amount are required" });
      }
      if (!(await assertOrgOwnership(req, res, orgId))) return;
      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keyId || !keySecret) {
        return res.status(500).json({ error: "Razorpay credentials not configured" });
      }
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
      const response = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({
          amount,
          currency: "INR",
          receipt: `sub_${orgId}_${Date.now()}`,
        }),
      });
      if (!response.ok) {
        const errorData = await response.text();
        console.error("Razorpay order creation failed:", errorData);
        return res.status(500).json({ error: "Failed to create Razorpay order" });
      }
      const order = await response.json();
      res.json({ orderId: order.id, order });
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/billing/verify-payment", requirePermission("org.billing.payment_method"), async (req: Request, res: Response) => {
    try {
      const { razorpay_payment_id, razorpay_order_id, razorpay_signature, orgId, subscriptionId, amount } = req.body;
      if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
        return res.status(400).json({ error: "Payment verification details are required" });
      }
      if (!(await assertOrgOwnership(req, res, orgId))) return;
      if (subscriptionId) {
        const sub = await storage.getSubscriptionById(subscriptionId);
        if (!sub) return res.status(404).json({ error: "Subscription not found" });
        if (sub.organizationId !== orgId) {
          return res.status(403).json({ error: "Subscription does not belong to this organization" });
        }
      }
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keySecret) {
        return res.status(500).json({ error: "Razorpay credentials not configured" });
      }
      const expectedSignature = crypto
        .createHmac("sha256", keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");
      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({ error: "Invalid payment signature" });
      }
      if (subscriptionId) {
        await storage.updateSubscription(subscriptionId, { status: "active" });
      }
      const payment = await storage.createPayment({
        organizationId: orgId,
        subscriptionId: subscriptionId || null,
        amount: amount || 0,
        currency: "INR",
        status: "captured",
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        razorpaySignature: razorpay_signature,
        paidAt: new Date(),
      });
      res.json({ success: true, payment });
    } catch (error) {
      console.error("Error verifying payment:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/billing/payments/:orgId", requirePermission("org.billing.view"), async (req: Request, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      if (!(await assertOrgOwnership(req, res, orgId))) return;
      const paymentList = await storage.getPaymentsByOrg(orgId);
      res.json({ payments: paymentList });
    } catch (error) {
      console.error("Error getting payments:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/billing/cancel-subscription/:subscriptionId", requirePermission("org.billing.payment_method"), async (req: Request, res: Response) => {
    try {
      const subId = req.params.subscriptionId as string;
      // Resolve the subscription's org first, then verify the caller owns
      // that org. Without this, any user with org.billing.payment_method on
      // any org could cancel another org's subscription via its id (IDOR).
      const existing = await storage.getSubscriptionById(subId);
      if (!existing) {
        return res.status(404).json({ error: "Subscription not found" });
      }
      if (!(await assertOrgOwnership(req, res, existing.organizationId))) return;
      const subscription = await storage.updateSubscription(subId, {
        status: "cancelled",
        cancelledAt: new Date(),
      });
      if (!subscription) {
        return res.status(404).json({ error: "Subscription not found" });
      }
      res.json({ subscription });
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // DASHBOARD MANAGEMENT ROUTES
  // ============================================

  app.get("/api/dashboard/branches/:orgId", requirePermission("org.branches.view"), async (req: Request, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      if (!await assertOrgOwnership(req, res, orgId)) return;
      const branchList = await storage.getBranchesByOrganization(orgId);
      const branchesWithServices = await Promise.all(
        branchList.map(async (branch) => {
          const branchServices = await storage.getServicesByBranch(branch.id);
          const branchDesks = await storage.getDesksByBranch(branch.id);
          const servicesWithDesks = branchServices.map(s => ({
            ...s,
            desks: branchDesks.filter(d => d.serviceId === s.id),
          }));
          const journeys = await storage.getJourneysByBranch(branch.id);
          const journeysWithStages = await Promise.all(journeys.map(async (j) => {
            const data = await storage.getJourneyWithStages(j.id);
            return data ? { ...data.journey, stages: data.stages } : j;
          }));
          const operatingHoursList = await storage.getOperatingHours(branch.id);
          const operatingHoursWithBreaks = await Promise.all(operatingHoursList.map(async (oh) => {
            const breaks = await storage.getBreakTimes(oh.id);
            return { ...oh, breaks };
          }));
          const holidaysList = await storage.getHolidays(branch.id);
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
              holidays: holidaysList,
            },
          };
        })
      );
      res.json({ branches: branchesWithServices });
    } catch (error) {
      console.error("Error getting branches:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/branches", requirePermission("org.branches.create"), async (req: Request, res: Response) => {
    try {
      const { orgId, name, address, city, state, pincode, phone, latitude, longitude } = req.body;
      if (!orgId || !name) {
        return res.status(400).json({ error: "orgId and name are required" });
      }
      if (!await assertOrgOwnership(req, res, orgId)) return;
      const branch = await storage.createBranch({
        organizationId: orgId,
        name,
        address,
        city,
        state,
        pincode,
        phone,
        latitude,
        longitude,
      });
      await writeAudit(req, { action: "branch.create", targetType: "branch", targetId: branch.id, targetLabel: branch.name, diff: req.body });
      res.json({ branch });
    } catch (error) {
      console.error("Error creating branch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/dashboard/branches/:branchId", requirePermission("org.branches.edit"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const branch = await storage.updateBranch(branchId, req.body);
      if (!branch) {
        return res.status(404).json({ error: "Branch not found" });
      }
      await writeAudit(req, { action: "branch.update", targetType: "branch", targetId: branchId, targetLabel: branch.name, diff: req.body });
      res.json({ branch });
    } catch (error) {
      console.error("Error updating branch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/dashboard/branches/:branchId", requirePermission("org.branches.delete"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const branch = await storage.updateBranch(branchId, { isActive: false });
      if (!branch) {
        return res.status(404).json({ error: "Branch not found" });
      }
      await writeAudit(req, { action: "branch.delete", targetType: "branch", targetId: branchId, targetLabel: branch.name });
      res.json({ success: true, branch });
    } catch (error) {
      console.error("Error deleting branch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/services", requirePermission("org.services.create"), async (req: Request, res: Response) => {
    try {
      const { branchId, name, description, averageWaitTime, estimatedDuration, maxDailyCapacity, inputFields, sortOrder } = req.body;
      if (!branchId || !name) {
        return res.status(400).json({ error: "branchId and name are required" });
      }
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const service = await storage.createService({
        branchId,
        name,
        description,
        averageWaitTime,
        estimatedDuration,
        maxDailyCapacity,
        inputFields,
        sortOrder,
      });
      res.json({ service });
    } catch (error) {
      console.error("Error creating service:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/dashboard/services/:serviceId", requirePermission("org.services.edit"), async (req: Request, res: Response) => {
    try {
      const serviceId = req.params.serviceId as string;
      if (!await assertServiceOwnership(req, res, serviceId)) return;
      const { name, description, averageWaitTime, estimatedDuration, maxDailyCapacity, inputFields, isActive, requiresInPersonRegistration, inPersonPerimeterMeters, serviceSettings, sortOrder } = req.body;
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
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      const service = await storage.updateService(serviceId, updateData);
      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }
      res.json({ service });
    } catch (error) {
      console.error("Error updating service:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/dashboard/services/:serviceId", requirePermission("org.services.delete"), async (req: Request, res: Response) => {
    try {
      const serviceId = req.params.serviceId as string;
      if (!await assertServiceOwnership(req, res, serviceId)) return;
      const service = await storage.updateService(serviceId, { isActive: false });
      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }
      await writeAudit(req, { action: "service.delete", targetType: "service", targetId: serviceId, targetLabel: service.name });
      res.json({ success: true, service });
    } catch (error) {
      console.error("Error deleting service:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/dashboard/users/:orgId", requirePermission("org.users.view"), async (req: Request, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      if (!await assertOrgOwnership(req, res, orgId)) return;
      const users = await storage.getOrgUsersByOrganization(orgId);
      res.json({ users });
    } catch (error) {
      console.error("Error getting users:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/users", requirePermission("org.users.invite"), async (req: Request, res: Response) => {
    try {
      const { organizationId, name, email, phone, password, role, branchId, assignedServiceIds } = req.body;
      if (!organizationId || !name || !email || !password || !role) {
        return res.status(400).json({ error: "organizationId, name, email, password, and role are required" });
      }
      if (!await assertOrgOwnership(req, res, organizationId)) return;
      if (branchId && !await assertBranchOwnership(req, res, branchId)) return;
      const roleRow = await storage.getRoleByKey(role);
      if (!roleRow) {
        return res.status(400).json({ error: `Unknown role: ${role}` });
      }
      if (roleRow.key === "super_admin" || roleRow.key === "owner") {
        return res.status(403).json({ error: `Role ${roleRow.key} cannot be assigned to org users` });
      }
      const user = await storage.createOrgUser({
        organizationId,
        name,
        email,
        phone,
        role: roleRow.key,
        roleId: roleRow.id,
        branchId,
        assignedServiceIds,
        password,
      });
      res.json({ user });
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/dashboard/users/:userId", requirePermission("org.users.edit"), async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId as string;
      if (!await assertOrgUserOwnership(req, res, userId)) return;
      const updateData = { ...req.body };
      if (updateData.branchId && !await assertBranchOwnership(req, res, updateData.branchId)) return;
      delete updateData.organizationId;
      if (updateData.password) {
        updateData.passwordHash = await hashPassword(updateData.password);
        delete updateData.password;
      }
      if (updateData.role !== undefined) {
        const roleRow = await storage.getRoleByKey(updateData.role);
        if (!roleRow) {
          return res.status(400).json({ error: `Unknown role: ${updateData.role}` });
        }
        if (roleRow.key === "super_admin" || roleRow.key === "owner") {
          return res.status(403).json({ error: `Role ${roleRow.key} cannot be assigned to org users` });
        }
        updateData.role = roleRow.key;
        updateData.roleId = roleRow.id;
      }
      const user = await storage.updateOrgUser(userId, updateData);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ user });
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/dashboard/users/:userId", requirePermission("org.users.deactivate"), async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId as string;
      if (!await assertOrgUserOwnership(req, res, userId)) return;
      const user = await storage.updateOrgUser(userId, { isActive: false });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      await writeAudit(req, { action: "user.deactivate", targetType: "org_user", targetId: userId, targetLabel: user.email });
      res.json({ success: true, user });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/dashboard/bookings/:branchId", requirePermission("org.bookings.view"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const dateStr = req.query.date as string | undefined;
      const date = dateStr ? new Date(dateStr) : undefined;
      const appointmentList = await storage.getAppointmentsByBranch(branchId, date);
      res.json({ appointments: appointmentList });
    } catch (error) {
      console.error("Error getting bookings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/dashboard/branches/:branchId/settings", requirePermission("org.settings.queue.edit"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const { queueMode, notificationMode, autoCallNext, maxQueueSize, defaultSlotDuration, defaultSlotCapacity, displaySettings, apiSettings } = req.body;
      const branch = await storage.updateBranch(branchId, {
        queueMode,
        notificationMode,
        autoCallNext,
        maxQueueSize,
        defaultSlotDuration,
        defaultSlotCapacity,
        displaySettings,
        apiSettings,
      });
      if (!branch) {
        return res.status(404).json({ error: "Branch not found" });
      }
      await writeAudit(req, { action: "branch.settings.update", targetType: "branch", targetId: branchId, targetLabel: branch.name, diff: req.body });
      res.json({ branch });
    } catch (error) {
      console.error("Error updating branch settings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Operating Hours endpoints
  app.put("/api/dashboard/operating-hours/:id", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertOperatingHourOwnership(req, res, id)) return;
      const { openTime, closeTime, isOpen } = req.body;
      const hour = await storage.updateOperatingHour(id, { openTime, closeTime, isOpen });
      if (!hour) return res.status(404).json({ error: "Operating hour not found" });
      await writeAudit(req, { action: "operating_hours.update", targetType: "operating_hours", targetId: id, diff: req.body });
      res.json({ operatingHour: hour });
    } catch (error) {
      console.error("Error updating operating hour:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Break Times endpoints
  app.get("/api/dashboard/breaks/:operatingHourId", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const operatingHourId = req.params.operatingHourId as string;
      if (!await assertOperatingHourOwnership(req, res, operatingHourId)) return;
      const breaks = await storage.getBreakTimes(operatingHourId);
      res.json({ breaks });
    } catch (error) {
      console.error("Error getting breaks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/breaks", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const { operatingHourId, name, startTime, endTime } = req.body;
      if (!operatingHourId || !name || !startTime || !endTime) {
        return res.status(400).json({ error: "operatingHourId, name, startTime, endTime required" });
      }
      if (!await assertOperatingHourOwnership(req, res, operatingHourId)) return;
      const bt = await storage.createBreakTime({ operatingHourId, name, startTime, endTime });
      await writeAudit(req, { action: "break.create", targetType: "break", targetId: bt.id, targetLabel: name, diff: req.body });
      res.json({ break: bt });
    } catch (error) {
      console.error("Error creating break:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/dashboard/breaks/:id", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertBreakOwnership(req, res, id)) return;
      const { name, startTime, endTime, isActive } = req.body;
      const bt = await storage.updateBreakTime(id, { name, startTime, endTime, isActive });
      if (!bt) return res.status(404).json({ error: "Break not found" });
      await writeAudit(req, { action: "break.update", targetType: "break", targetId: id, targetLabel: bt.name, diff: req.body });
      res.json({ break: bt });
    } catch (error) {
      console.error("Error updating break:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/dashboard/breaks/:id", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertBreakOwnership(req, res, id)) return;
      await storage.deleteBreakTime(id);
      await writeAudit(req, { action: "break.delete", targetType: "break", targetId: id });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting break:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Holiday endpoints
  app.post("/api/dashboard/holidays", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const { branchId, date, name, isRecurring } = req.body;
      if (!branchId || !date || !name) {
        return res.status(400).json({ error: "branchId, date, name required" });
      }
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const holiday = await storage.createHoliday({ branchId, date: new Date(date), name, isRecurring: isRecurring || false });
      await writeAudit(req, { action: "holiday.create", targetType: "holiday", targetId: holiday.id, targetLabel: name, diff: req.body });
      res.json({ holiday });
    } catch (error) {
      console.error("Error creating holiday:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/dashboard/holidays/:id", requirePermission("org.settings.hours.edit"), async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      if (!await assertHolidayOwnership(req, res, id)) return;
      await storage.deleteHoliday(id);
      await writeAudit(req, { action: "holiday.delete", targetType: "holiday", targetId: id });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting holiday:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/dashboard/journeys/:branchId", requirePermission("org.journeys.view"), async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const journeyList = await storage.getJourneysByBranch(branchId);
      const journeysWithStages = await Promise.all(
        journeyList.map(async (journey) => {
          const data = await storage.getJourneyWithStages(journey.id);
          return data ? { ...data.journey, stages: data.stages } : { ...journey, stages: [] };
        })
      );
      res.json({ journeys: journeysWithStages });
    } catch (error) {
      console.error("Error getting journeys:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/journeys", requirePermission("org.journeys.create"), async (req: Request, res: Response) => {
    try {
      const { branchId, name, description, isActive, stages } = req.body;
      if (!branchId || !name) {
        return res.status(400).json({ error: "branchId and name are required" });
      }
      if (!await assertBranchOwnership(req, res, branchId)) return;
      const journey = await storage.createJourney({ branchId, name, description, isActive });
      if (stages && Array.isArray(stages) && stages.length > 0) {
        await storage.updateJourneyStages(journey.id, stages);
      }
      const data = await storage.getJourneyWithStages(journey.id);
      res.json({ journey: data ? { ...data.journey, stages: data.stages } : journey });
    } catch (error) {
      console.error("Error creating journey:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/dashboard/journeys/:journeyId", requirePermission("org.journeys.edit"), async (req: Request, res: Response) => {
    try {
      const journeyId = req.params.journeyId as string;
      if (!await assertJourneyOwnership(req, res, journeyId)) return;
      const { name, description, isActive, stages } = req.body;
      const journey = await storage.updateJourney(journeyId, { name, description, isActive });
      if (!journey) {
        return res.status(404).json({ error: "Journey not found" });
      }
      if (stages && Array.isArray(stages)) {
        await storage.updateJourneyStages(journeyId, stages);
      }
      const data = await storage.getJourneyWithStages(journeyId);
      res.json({ journey: data ? { ...data.journey, stages: data.stages } : journey });
    } catch (error) {
      console.error("Error updating journey:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/dashboard/journeys/:journeyId", requirePermission("org.journeys.delete"), async (req: Request, res: Response) => {
    try {
      const journeyId = req.params.journeyId as string;
      if (!await assertJourneyOwnership(req, res, journeyId)) return;
      await storage.deleteJourney(journeyId);
      await writeAudit(req, { action: "journey.delete", targetType: "journey", targetId: journeyId });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting journey:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
