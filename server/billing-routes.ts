import type { Express, Request, Response } from "express";
import { storage, hashPassword } from "./storage";
import crypto from "crypto";

export function registerBillingRoutes(app: Express) {
  storage.seedDefaultPlans().catch(console.error);

  app.get("/api/billing/plans", async (_req: Request, res: Response) => {
    try {
      const plans = await storage.getAllPlans();
      res.json({ plans });
    } catch (error) {
      console.error("Error getting plans:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/billing/subscription/:orgId", async (req: Request, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
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

  app.post("/api/billing/subscribe", async (req: Request, res: Response) => {
    try {
      const { orgId, planId } = req.body;
      if (!orgId || !planId) {
        return res.status(400).json({ error: "orgId and planId are required" });
      }
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

  app.post("/api/billing/create-order", async (req: Request, res: Response) => {
    try {
      const { orgId, planId, amount } = req.body;
      if (!orgId || !planId || !amount) {
        return res.status(400).json({ error: "orgId, planId, and amount are required" });
      }
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

  app.post("/api/billing/verify-payment", async (req: Request, res: Response) => {
    try {
      const { razorpay_payment_id, razorpay_order_id, razorpay_signature, orgId, subscriptionId, amount } = req.body;
      if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
        return res.status(400).json({ error: "Payment verification details are required" });
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

  app.get("/api/billing/payments/:orgId", async (req: Request, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const paymentList = await storage.getPaymentsByOrg(orgId);
      res.json({ payments: paymentList });
    } catch (error) {
      console.error("Error getting payments:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/billing/cancel-subscription/:subscriptionId", async (req: Request, res: Response) => {
    try {
      const subId = req.params.subscriptionId as string;
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

  app.get("/api/dashboard/branches/:orgId", async (req: Request, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const branchList = await storage.getBranchesByOrganization(orgId);
      const branchesWithServices = await Promise.all(
        branchList.map(async (branch) => {
          const branchServices = await storage.getServicesByBranch(branch.id);
          return { ...branch, services: branchServices };
        })
      );
      res.json({ branches: branchesWithServices });
    } catch (error) {
      console.error("Error getting branches:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/branches", async (req: Request, res: Response) => {
    try {
      const { orgId, name, address, city, state, pincode, phone, latitude, longitude } = req.body;
      if (!orgId || !name) {
        return res.status(400).json({ error: "orgId and name are required" });
      }
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
      res.json({ branch });
    } catch (error) {
      console.error("Error creating branch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/dashboard/branches/:branchId", async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      const branch = await storage.updateBranch(branchId, req.body);
      if (!branch) {
        return res.status(404).json({ error: "Branch not found" });
      }
      res.json({ branch });
    } catch (error) {
      console.error("Error updating branch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/dashboard/branches/:branchId", async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      const branch = await storage.updateBranch(branchId, { isActive: false });
      if (!branch) {
        return res.status(404).json({ error: "Branch not found" });
      }
      res.json({ success: true, branch });
    } catch (error) {
      console.error("Error deleting branch:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/services", async (req: Request, res: Response) => {
    try {
      const { branchId, name, description, averageWaitTime, estimatedDuration, maxDailyCapacity, inputFields, sortOrder } = req.body;
      if (!branchId || !name) {
        return res.status(400).json({ error: "branchId and name are required" });
      }
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

  app.put("/api/dashboard/services/:serviceId", async (req: Request, res: Response) => {
    try {
      const serviceId = req.params.serviceId as string;
      const service = await storage.updateService(serviceId, req.body);
      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }
      res.json({ service });
    } catch (error) {
      console.error("Error updating service:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/dashboard/services/:serviceId", async (req: Request, res: Response) => {
    try {
      const serviceId = req.params.serviceId as string;
      const service = await storage.updateService(serviceId, { isActive: false });
      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }
      res.json({ success: true, service });
    } catch (error) {
      console.error("Error deleting service:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/dashboard/users/:orgId", async (req: Request, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const users = await storage.getOrgUsersByOrganization(orgId);
      res.json({ users });
    } catch (error) {
      console.error("Error getting users:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/users", async (req: Request, res: Response) => {
    try {
      const { organizationId, name, email, phone, password, role, branchId, assignedServiceIds } = req.body;
      if (!organizationId || !name || !email || !password || !role) {
        return res.status(400).json({ error: "organizationId, name, email, password, and role are required" });
      }
      const user = await storage.createOrgUser({
        organizationId,
        name,
        email,
        phone,
        role,
        branchId,
        assignedServiceIds,
        password,
      } as any);
      res.json({ user });
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/dashboard/users/:userId", async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId as string;
      const updateData = { ...req.body };
      if (updateData.password) {
        updateData.passwordHash = await hashPassword(updateData.password);
        delete updateData.password;
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

  app.delete("/api/dashboard/users/:userId", async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId as string;
      const user = await storage.updateOrgUser(userId, { isActive: false });
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ success: true, user });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/dashboard/bookings/:branchId", async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
      const dateStr = req.query.date as string | undefined;
      const date = dateStr ? new Date(dateStr) : undefined;
      const appointmentList = await storage.getAppointmentsByBranch(branchId, date);
      res.json({ appointments: appointmentList });
    } catch (error) {
      console.error("Error getting bookings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/dashboard/branches/:branchId/settings", async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
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
      res.json({ branch });
    } catch (error) {
      console.error("Error updating branch settings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Operating Hours endpoints
  app.put("/api/dashboard/operating-hours/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { openTime, closeTime, isOpen } = req.body;
      const hour = await storage.updateOperatingHour(id, { openTime, closeTime, isOpen });
      if (!hour) return res.status(404).json({ error: "Operating hour not found" });
      res.json({ operatingHour: hour });
    } catch (error) {
      console.error("Error updating operating hour:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Break Times endpoints
  app.get("/api/dashboard/breaks/:operatingHourId", async (req: Request, res: Response) => {
    try {
      const breaks = await storage.getBreakTimes(req.params.operatingHourId as string);
      res.json({ breaks });
    } catch (error) {
      console.error("Error getting breaks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/dashboard/breaks", async (req: Request, res: Response) => {
    try {
      const { operatingHourId, name, startTime, endTime } = req.body;
      if (!operatingHourId || !name || !startTime || !endTime) {
        return res.status(400).json({ error: "operatingHourId, name, startTime, endTime required" });
      }
      const bt = await storage.createBreakTime({ operatingHourId, name, startTime, endTime });
      res.json({ break: bt });
    } catch (error) {
      console.error("Error creating break:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/dashboard/breaks/:id", async (req: Request, res: Response) => {
    try {
      const { name, startTime, endTime, isActive } = req.body;
      const bt = await storage.updateBreakTime(req.params.id as string, { name, startTime, endTime, isActive });
      if (!bt) return res.status(404).json({ error: "Break not found" });
      res.json({ break: bt });
    } catch (error) {
      console.error("Error updating break:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/dashboard/breaks/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteBreakTime(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting break:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Holiday endpoints
  app.post("/api/dashboard/holidays", async (req: Request, res: Response) => {
    try {
      const { branchId, date, name, isRecurring } = req.body;
      if (!branchId || !date || !name) {
        return res.status(400).json({ error: "branchId, date, name required" });
      }
      const holiday = await storage.createHoliday({ branchId, date: new Date(date), name, isRecurring: isRecurring || false });
      res.json({ holiday });
    } catch (error) {
      console.error("Error creating holiday:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/dashboard/holidays/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteHoliday(req.params.id as string);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting holiday:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/dashboard/journeys/:branchId", async (req: Request, res: Response) => {
    try {
      const branchId = req.params.branchId as string;
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

  app.post("/api/dashboard/journeys", async (req: Request, res: Response) => {
    try {
      const { branchId, name, description, isActive, stages } = req.body;
      if (!branchId || !name) {
        return res.status(400).json({ error: "branchId and name are required" });
      }
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

  app.put("/api/dashboard/journeys/:journeyId", async (req: Request, res: Response) => {
    try {
      const journeyId = req.params.journeyId as string;
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

  app.delete("/api/dashboard/journeys/:journeyId", async (req: Request, res: Response) => {
    try {
      const journeyId = req.params.journeyId as string;
      await storage.deleteJourney(journeyId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting journey:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
