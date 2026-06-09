import type { Express, Request, Response } from "express";
import { db } from "./db";
import { tickets, reservations, branches, services, desks, orgUsers, customers } from "@shared/schema";
import { eq, and, gte, lte, sql, count, avg, inArray } from "drizzle-orm";

function maskPhone(phone: string): string {
  if (!phone || phone.length <= 3) return phone ? '***' : '';
  const visible = phone.substring(0, phone.length - 5);
  return visible + '*****';
}

export function registerReportRoutes(app: Express) {

  app.get("/api/reports/:orgId/summary", async (req: Request, res: Response) => {
    try {
      const { orgId } = req.params;
      const { startDate, endDate, branchId, serviceId, deskId, staffId, source } = req.query;

      const orgBranches = await db.select({ id: branches.id, name: branches.name, queueMode: branches.queueMode })
        .from(branches).where(eq(branches.organizationId, orgId as string));
      const branchIds = orgBranches.map(b => b.id);

      if (branchIds.length === 0) {
        return res.json({ summary: getEmptySummary(), hourly: [], daily: [], byService: [], bySource: [], byStaff: [], byDesk: [], topCustomers: [], byWeekday: [], reservationStats: null });
      }

      const conditions: any[] = [inArray(tickets.branchId, branchId ? [branchId as string] : branchIds)];
      if (startDate) conditions.push(gte(tickets.joinedAt, new Date(startDate as string)));
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        conditions.push(lte(tickets.joinedAt, end));
      }
      if (serviceId) conditions.push(eq(tickets.serviceId, serviceId as string));
      if (deskId) conditions.push(eq(tickets.deskId, deskId as string));
      if (staffId) conditions.push(eq(tickets.servedBy, staffId as string));
      if (source) conditions.push(eq(tickets.source, source as string));

      const allTickets = await db.select().from(tickets).where(and(...conditions)).orderBy(tickets.joinedAt);

      const totalTickets = allTickets.length;
      // Dine-in seats guests via the "arrived" status, which is that mode's
      // served outcome (the host never taps a separate "complete"). Treat it
      // as served everywhere. "arrived" is dine-in only, so other modes are
      // unaffected.
      const isServed = (s: string | null) => s === "completed" || s === "arrived";
      const completed = allTickets.filter(t => isServed(t.status));
      const noShows = allTickets.filter(t => t.status === "no_show");
      const waiting = allTickets.filter(t => t.status === "waiting");
      const serving = allTickets.filter(t => t.status === "serving");
      const called = allTickets.filter(t => t.status === "called");
      const cancelled = allTickets.filter(t => t.status === "cancelled");
      const hold = allTickets.filter(t => t.status === "hold");

      const waitTimes = completed
        .map(t => {
          if (t.calledAt && t.joinedAt) return (new Date(t.calledAt).getTime() - new Date(t.joinedAt).getTime()) / 60000;
          return null;
        })
        .filter((v): v is number => v !== null && v >= 0);

      const serviceTimes = completed
        .map(t => {
          if (t.completedAt && t.servedAt) return (new Date(t.completedAt).getTime() - new Date(t.servedAt).getTime()) / 60000;
          if (t.completedAt && t.calledAt) return (new Date(t.completedAt).getTime() - new Date(t.calledAt).getTime()) / 60000;
          return null;
        })
        .filter((v): v is number => v !== null && v >= 0);

      const avgWaitTime = waitTimes.length > 0 ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length : 0;
      const avgServiceTime = serviceTimes.length > 0 ? serviceTimes.reduce((a, b) => a + b, 0) / serviceTimes.length : 0;
      const maxWaitTime = waitTimes.length > 0 ? Math.max(...waitTimes) : 0;
      const minWaitTime = waitTimes.length > 0 ? Math.min(...waitTimes) : 0;

      const completionRate = totalTickets > 0 ? (completed.length / totalTickets) * 100 : 0;
      const noShowRate = totalTickets > 0 ? (noShows.length / totalTickets) * 100 : 0;
      const cancelRate = totalTickets > 0 ? (cancelled.length / totalTickets) * 100 : 0;

      const totalCallCount = allTickets.reduce((sum, t) => sum + (t.callCount || 0), 0);
      const avgCallsPerTicket = totalTickets > 0 ? totalCallCount / totalTickets : 0;

      const repeatCustomerMap = new Map<string, number>();
      allTickets.forEach(t => {
        const key = t.customerId || t.customerPhone || t.customerName || "";
        if (key) repeatCustomerMap.set(key, (repeatCustomerMap.get(key) || 0) + 1);
      });
      const repeatCustomers = Array.from(repeatCustomerMap.values()).filter(c => c > 1).length;
      const uniqueCustomers = repeatCustomerMap.size;

      const summary = {
        totalTickets,
        completed: completed.length,
        noShows: noShows.length,
        waiting: waiting.length,
        serving: serving.length,
        called: called.length,
        cancelled: cancelled.length,
        hold: hold.length,
        avgWaitTime: Math.round(avgWaitTime * 10) / 10,
        avgServiceTime: Math.round(avgServiceTime * 10) / 10,
        maxWaitTime: Math.round(maxWaitTime * 10) / 10,
        minWaitTime: Math.round(minWaitTime * 10) / 10,
        completionRate: Math.round(completionRate * 10) / 10,
        noShowRate: Math.round(noShowRate * 10) / 10,
        cancelRate: Math.round(cancelRate * 10) / 10,
        avgCallsPerTicket: Math.round(avgCallsPerTicket * 10) / 10,
        repeatCustomers,
        uniqueCustomers,
        totalCallCount,
      };

      const hourlyMap = new Map<number, { total: number; completed: number; noShow: number }>();
      for (let h = 0; h < 24; h++) hourlyMap.set(h, { total: 0, completed: 0, noShow: 0 });
      allTickets.forEach(t => {
        const hour = new Date(t.joinedAt).getHours();
        const entry = hourlyMap.get(hour)!;
        entry.total++;
        if (isServed(t.status)) entry.completed++;
        if (t.status === "no_show") entry.noShow++;
      });
      const hourly = Array.from(hourlyMap.entries()).map(([hour, data]) => ({ hour, ...data }));

      const dailyMap = new Map<string, { total: number; completed: number; noShow: number; cancelled: number }>();
      allTickets.forEach(t => {
        const day = new Date(t.joinedAt).toISOString().split("T")[0];
        if (!dailyMap.has(day)) dailyMap.set(day, { total: 0, completed: 0, noShow: 0, cancelled: 0 });
        const entry = dailyMap.get(day)!;
        entry.total++;
        if (isServed(t.status)) entry.completed++;
        if (t.status === "no_show") entry.noShow++;
        if (t.status === "cancelled") entry.cancelled++;
      });
      const daily = Array.from(dailyMap.entries()).map(([date, data]) => ({ date, ...data })).sort((a, b) => a.date.localeCompare(b.date));

      const serviceMap = new Map<string, { name: string; total: number; completed: number; noShow: number; avgWait: number[]; avgService: number[] }>();
      allTickets.forEach(t => {
        const sId = t.serviceId || "unknown";
        const sName = t.serviceName || "Unknown";
        if (!serviceMap.has(sId)) serviceMap.set(sId, { name: sName, total: 0, completed: 0, noShow: 0, avgWait: [], avgService: [] });
        const entry = serviceMap.get(sId)!;
        entry.total++;
        if (isServed(t.status)) {
          entry.completed++;
          if (t.calledAt && t.joinedAt) {
            const wt = (new Date(t.calledAt).getTime() - new Date(t.joinedAt).getTime()) / 60000;
            if (wt >= 0) entry.avgWait.push(wt);
          }
          if (t.completedAt && (t.servedAt || t.calledAt)) {
            const ref = t.servedAt || t.calledAt;
            const st = (new Date(t.completedAt).getTime() - new Date(ref!).getTime()) / 60000;
            if (st >= 0) entry.avgService.push(st);
          }
        }
        if (t.status === "no_show") entry.noShow++;
      });
      const byService = Array.from(serviceMap.entries()).map(([id, d]) => ({
        serviceId: id,
        serviceName: d.name,
        total: d.total,
        completed: d.completed,
        noShow: d.noShow,
        avgWaitTime: d.avgWait.length > 0 ? Math.round((d.avgWait.reduce((a, b) => a + b, 0) / d.avgWait.length) * 10) / 10 : 0,
        avgServiceTime: d.avgService.length > 0 ? Math.round((d.avgService.reduce((a, b) => a + b, 0) / d.avgService.length) * 10) / 10 : 0,
      })).sort((a, b) => b.total - a.total);

      const sourceMap = new Map<string, number>();
      allTickets.forEach(t => {
        const s = t.source || "unknown";
        sourceMap.set(s, (sourceMap.get(s) || 0) + 1);
      });
      const bySource = Array.from(sourceMap.entries()).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);

      const staffMap = new Map<string, { name: string; total: number; avgService: number[] }>();
      allTickets.filter(t => t.servedBy).forEach(t => {
        if (!staffMap.has(t.servedBy!)) staffMap.set(t.servedBy!, { name: "", total: 0, avgService: [] });
        const entry = staffMap.get(t.servedBy!)!;
        entry.total++;
        if (t.completedAt && (t.servedAt || t.calledAt)) {
          const ref = t.servedAt || t.calledAt;
          const st = (new Date(t.completedAt).getTime() - new Date(ref!).getTime()) / 60000;
          if (st >= 0) entry.avgService.push(st);
        }
      });
      if (staffMap.size > 0) {
        const staffIds = Array.from(staffMap.keys());
        const staffUsers = await db.select({ id: orgUsers.id, name: orgUsers.name, role: orgUsers.role })
          .from(orgUsers).where(inArray(orgUsers.id, staffIds));
        staffUsers.forEach(u => {
          if (staffMap.has(u.id)) staffMap.get(u.id)!.name = u.name;
        });
      }
      const byStaff = Array.from(staffMap.entries()).map(([id, d]) => ({
        staffId: id,
        staffName: d.name || "Unknown",
        ticketsServed: d.total,
        avgServiceTime: d.avgService.length > 0 ? Math.round((d.avgService.reduce((a, b) => a + b, 0) / d.avgService.length) * 10) / 10 : 0,
      })).sort((a, b) => b.ticketsServed - a.ticketsServed);

      const deskMap = new Map<string, { name: string; total: number; avgService: number[] }>();
      allTickets.filter(t => t.deskId).forEach(t => {
        const dName = t.deskName || "Unknown";
        if (!deskMap.has(t.deskId!)) deskMap.set(t.deskId!, { name: dName, total: 0, avgService: [] });
        const entry = deskMap.get(t.deskId!)!;
        entry.total++;
        if (t.completedAt && (t.servedAt || t.calledAt)) {
          const ref = t.servedAt || t.calledAt;
          const st = (new Date(t.completedAt).getTime() - new Date(ref!).getTime()) / 60000;
          if (st >= 0) entry.avgService.push(st);
        }
      });
      const byDesk = Array.from(deskMap.entries()).map(([id, d]) => ({
        deskId: id,
        deskName: d.name,
        ticketsProcessed: d.total,
        avgServiceTime: d.avgService.length > 0 ? Math.round((d.avgService.reduce((a, b) => a + b, 0) / d.avgService.length) * 10) / 10 : 0,
      })).sort((a, b) => b.ticketsProcessed - a.ticketsProcessed);

      const topCustomerMap = new Map<string, { name: string; phone: string; visits: number; lastVisit: Date }>();
      allTickets.forEach(t => {
        const key = t.customerId || t.customerPhone || t.customerName || "";
        if (!key) return;
        if (!topCustomerMap.has(key)) {
          topCustomerMap.set(key, {
            name: t.customerName || "Unknown",
            phone: t.customerPhone || "",
            visits: 0,
            lastVisit: new Date(t.joinedAt),
          });
        }
        const entry = topCustomerMap.get(key)!;
        entry.visits++;
        if (new Date(t.joinedAt) > entry.lastVisit) entry.lastVisit = new Date(t.joinedAt);
        if (t.customerName && entry.name === "Unknown") entry.name = t.customerName;
      });
      const topCustomers = Array.from(topCustomerMap.values())
        .sort((a, b) => b.visits - a.visits)
        .slice(0, 20)
        .map(c => ({ ...c, phone: maskPhone(c.phone), lastVisit: c.lastVisit.toISOString() }));

      let reservationStats = null;
      const activeBranch = branchId ? orgBranches.find(b => b.id === branchId) : null;
      const isDineIn = activeBranch ? (activeBranch.queueMode === "dine_in" || activeBranch.queueMode === "dinein") : false;

      if (isDineIn && branchId) {
        const resConds: any[] = [eq(reservations.branchId, branchId as string)];
        if (startDate) resConds.push(gte(reservations.reservationDate, new Date(startDate as string)));
        if (endDate) {
          const end = new Date(endDate as string);
          end.setHours(23, 59, 59, 999);
          resConds.push(lte(reservations.reservationDate, end));
        }
        const allRes = await db.select().from(reservations).where(and(...resConds));
        const checkedIn = allRes.filter(r => r.status === "checked_in" || r.checkedInAt);
        const totalPartySize = allRes.reduce((sum, r) => sum + (r.partySize || 0), 0);
        const avgPartySize = allRes.length > 0 ? totalPartySize / allRes.length : 0;

        const walkIns = allTickets.filter(t => t.source !== "reservation");
        const resTickets = allTickets.filter(t => t.source === "reservation");

        const tableMap = new Map<string, number>();
        allTickets.filter(t => t.tableNumber).forEach(t => {
          tableMap.set(t.tableNumber!, (tableMap.get(t.tableNumber!) || 0) + 1);
        });
        const tableUtilization = Array.from(tableMap.entries())
          .map(([table, count]) => ({ table, count }))
          .sort((a, b) => b.count - a.count);

        reservationStats = {
          totalReservations: allRes.length,
          checkedIn: checkedIn.length,
          avgPartySize: Math.round(avgPartySize * 10) / 10,
          walkIns: walkIns.length,
          reservationTickets: resTickets.length,
          reservationVsWalkIn: allTickets.length > 0 ? Math.round((resTickets.length / allTickets.length) * 1000) / 10 : 0,
          tableUtilization,
        };
      }

      const weekdayMap = new Map<number, { total: number; completed: number }>();
      for (let d = 0; d < 7; d++) weekdayMap.set(d, { total: 0, completed: 0 });
      allTickets.forEach(t => {
        const day = new Date(t.joinedAt).getDay();
        const entry = weekdayMap.get(day)!;
        entry.total++;
        if (t.status === "completed") entry.completed++;
      });
      const byWeekday = Array.from(weekdayMap.entries()).map(([day, data]) => ({
        day,
        dayName: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day],
        ...data,
      }));

      res.json({
        summary,
        hourly,
        daily,
        byService,
        bySource,
        byStaff,
        byDesk,
        topCustomers,
        reservationStats,
        byWeekday,
        branches: orgBranches,
      });
    } catch (error) {
      console.error("Error generating report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  app.get("/api/reports/:orgId/filters", async (req: Request, res: Response) => {
    try {
      const { orgId } = req.params;
      const { branchId, serviceId } = req.query;

      const orgBranches = await db.select({ id: branches.id, name: branches.name, queueMode: branches.queueMode })
        .from(branches).where(eq(branches.organizationId, orgId as string));

      let branchServices: any[] = [];
      let branchDesks: any[] = [];
      if (branchId) {
        branchServices = await db.select({ id: services.id, name: services.name })
          .from(services).where(eq(services.branchId, branchId as string));
        // Desks belong to a service, so they are only meaningful once a
        // service is selected — scope them to that service so the desk filter
        // stays consistent with the service filter.
        if (serviceId) {
          branchDesks = await db.select({ id: desks.id, name: desks.name })
            .from(desks).where(eq(desks.serviceId, serviceId as string));
        }
      }

      const staffUsers = await db.select({ id: orgUsers.id, name: orgUsers.name, role: orgUsers.role, branchId: orgUsers.branchId })
        .from(orgUsers).where(eq(orgUsers.organizationId, orgId as string));

      res.json({
        branches: orgBranches,
        services: branchServices,
        desks: branchDesks,
        staff: staffUsers,
      });
    } catch (error) {
      console.error("Error loading report filters:", error);
      res.status(500).json({ error: "Failed to load filters" });
    }
  });

  app.get("/api/reports/:orgId/export", async (req: Request, res: Response) => {
    try {
      const { orgId } = req.params;
      const { startDate, endDate, branchId, serviceId, deskId, staffId, source } = req.query;

      const orgBranches = await db.select({ id: branches.id })
        .from(branches).where(eq(branches.organizationId, orgId as string));
      const branchIds = orgBranches.map(b => b.id);

      if (branchIds.length === 0) {
        return res.status(200).send("No data to export");
      }

      const conditions: any[] = [inArray(tickets.branchId, branchId ? [branchId as string] : branchIds)];
      if (startDate) conditions.push(gte(tickets.joinedAt, new Date(startDate as string)));
      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        conditions.push(lte(tickets.joinedAt, end));
      }
      if (serviceId) conditions.push(eq(tickets.serviceId, serviceId as string));
      if (deskId) conditions.push(eq(tickets.deskId, deskId as string));
      if (staffId) conditions.push(eq(tickets.servedBy, staffId as string));
      if (source) conditions.push(eq(tickets.source, source as string));

      const allTickets = await db.select().from(tickets).where(and(...conditions)).orderBy(tickets.joinedAt);

      const headers = [
        "Ticket Number", "Customer Name", "Customer Phone", "Service", "Status", "Source",
        "Joined At", "Called At", "Served At", "Completed At", "Wait Time (min)", "Service Time (min)",
        "Table Number", "Desk", "Call Count", "Skip Count", "Notes"
      ];

      const rows = allTickets.map(t => {
        const waitTime = t.calledAt && t.joinedAt ? Math.round((new Date(t.calledAt).getTime() - new Date(t.joinedAt).getTime()) / 60000 * 10) / 10 : "";
        const serviceTime = t.completedAt && (t.servedAt || t.calledAt)
          ? Math.round((new Date(t.completedAt).getTime() - new Date((t.servedAt || t.calledAt)!).getTime()) / 60000 * 10) / 10
          : "";

        return [
          t.ticketNumber,
          t.customerName || "",
          maskPhone(t.customerPhone || ""),
          t.serviceName || "",
          t.status,
          t.source,
          t.joinedAt ? new Date(t.joinedAt).toISOString() : "",
          t.calledAt ? new Date(t.calledAt).toISOString() : "",
          t.servedAt ? new Date(t.servedAt).toISOString() : "",
          t.completedAt ? new Date(t.completedAt).toISOString() : "",
          waitTime,
          serviceTime,
          t.tableNumber || "",
          t.deskName || "",
          t.callCount || 0,
          t.skipCount || 0,
          (t.notes || "").replace(/,/g, ";"),
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
      });

      const csv = [headers.join(","), ...rows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=tiqkets-report-${new Date().toISOString().split("T")[0]}.csv`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting report:", error);
      res.status(500).json({ error: "Failed to export report" });
    }
  });
}

function getEmptySummary() {
  return {
    totalTickets: 0, completed: 0, noShows: 0, waiting: 0, serving: 0, called: 0, cancelled: 0, hold: 0,
    avgWaitTime: 0, avgServiceTime: 0, maxWaitTime: 0, minWaitTime: 0,
    completionRate: 0, noShowRate: 0, cancelRate: 0, avgCallsPerTicket: 0,
    repeatCustomers: 0, uniqueCustomers: 0, totalCallCount: 0,
  };
}
