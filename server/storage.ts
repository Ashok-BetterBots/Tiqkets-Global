import { eq, and, gte, lte, desc, asc, sql, inArray, isNull, or } from "drizzle-orm";
import { db } from "./db";
import {
  organizations,
  branches,
  services,
  journeys,
  journeyStages,
  customers,
  orgUsers,
  orgUserBranches,
  tickets,
  reservations,
  appointments,
  operatingHours,
  breakTimes,
  holidays,
  bookingSlots,
  ticketCounters,
  dailyStats,
  subscriptionPlans,
  subscriptions,
  payments,
  type Organization,
  type InsertOrganization,
  type Branch,
  type InsertBranch,
  type Service,
  type InsertService,
  type Journey,
  type JourneyStage,
  type Ticket,
  type InsertTicket,
  type Reservation,
  type InsertReservation,
  type Appointment,
  type InsertAppointment,
  type OrgUser,
  type InsertOrgUser,
  type Customer,
  type InsertCustomer,
  type OperatingHour,
  type BreakTime,
  type Holiday,
  type BookingSlot,
  type DailyStat,
  type SubscriptionPlan,
  type InsertSubscriptionPlan,
  type Subscription,
  type InsertSubscription,
  type Payment,
  type InsertPayment,
} from "@shared/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export class DatabaseStorage {
  async createOrganization(data: InsertOrganization & { password: string }): Promise<Organization> {
    const passwordHash = await hashPassword(data.password);
    const [org] = await db.insert(organizations).values({
      ...data,
      passwordHash,
    }).returning();
    return org;
  }

  async getOrganizationById(id: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    return org;
  }

  async getOrganizationByEmail(email: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.email, email)).limit(1);
    return org;
  }

  async updateOrganization(id: string, data: Partial<InsertOrganization>): Promise<Organization | undefined> {
    const [org] = await db.update(organizations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning();
    return org;
  }

  async createBranch(data: InsertBranch): Promise<Branch> {
    const [branch] = await db.insert(branches).values(data).returning();
    await this.createDefaultOperatingHours(branch.id);
    return branch;
  }

  async getBranchesByOrganization(organizationId: string): Promise<Branch[]> {
    return db.select().from(branches)
      .where(eq(branches.organizationId, organizationId))
      .orderBy(asc(branches.name));
  }

  async getBranchById(id: string): Promise<Branch | undefined> {
    const [branch] = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
    return branch;
  }

  async updateBranch(id: string, data: Partial<InsertBranch>): Promise<Branch | undefined> {
    const [branch] = await db.update(branches)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(branches.id, id))
      .returning();
    return branch;
  }

  async deleteBranch(id: string): Promise<void> {
    await db.delete(branches).where(eq(branches.id, id));
  }

  async createService(data: InsertService): Promise<Service> {
    const [service] = await db.insert(services).values(data).returning();
    return service;
  }

  async getServicesByBranch(branchId: string): Promise<Service[]> {
    return db.select().from(services)
      .where(eq(services.branchId, branchId))
      .orderBy(asc(services.sortOrder), asc(services.name));
  }

  async getServiceById(id: string): Promise<Service | undefined> {
    const [service] = await db.select().from(services).where(eq(services.id, id)).limit(1);
    return service;
  }

  async updateService(id: string, data: Partial<InsertService>): Promise<Service | undefined> {
    const [service] = await db.update(services)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(services.id, id))
      .returning();
    return service;
  }

  async deleteService(id: string): Promise<void> {
    await db.delete(services).where(eq(services.id, id));
  }

  async createJourney(data: { branchId: string; name: string; description?: string; isActive?: boolean }): Promise<Journey> {
    const [journey] = await db.insert(journeys).values(data).returning();
    return journey;
  }

  async getJourneysByBranch(branchId: string): Promise<Journey[]> {
    return db.select().from(journeys)
      .where(eq(journeys.branchId, branchId))
      .orderBy(asc(journeys.name));
  }

  async getJourneyById(id: string): Promise<Journey | undefined> {
    const [journey] = await db.select().from(journeys).where(eq(journeys.id, id)).limit(1);
    return journey;
  }

  async getJourneyWithStages(id: string): Promise<{ journey: Journey; stages: JourneyStage[] } | undefined> {
    const journey = await this.getJourneyById(id);
    if (!journey) return undefined;
    const stages = await db.select().from(journeyStages)
      .where(eq(journeyStages.journeyId, id))
      .orderBy(asc(journeyStages.stageOrder));
    return { journey, stages };
  }

  async updateJourney(id: string, data: Partial<Journey>): Promise<Journey | undefined> {
    const [journey] = await db.update(journeys)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(journeys.id, id))
      .returning();
    return journey;
  }

  async deleteJourney(id: string): Promise<void> {
    await db.delete(journeys).where(eq(journeys.id, id));
  }

  async createJourneyStage(data: { journeyId: string; serviceId?: string; serviceName: string; stageOrder: number; isOptional?: boolean; estimatedDuration?: number }): Promise<JourneyStage> {
    const [stage] = await db.insert(journeyStages).values(data).returning();
    return stage;
  }

  async updateJourneyStages(journeyId: string, stages: Array<{ id?: string; serviceId?: string; serviceName: string; stageOrder: number; isOptional?: boolean; estimatedDuration?: number }>): Promise<JourneyStage[]> {
    await db.delete(journeyStages).where(eq(journeyStages.journeyId, journeyId));
    const newStages = await Promise.all(stages.map(s => 
      this.createJourneyStage({ ...s, journeyId })
    ));
    return newStages;
  }

  async createOrgUser(data: InsertOrgUser & { password: string }): Promise<OrgUser> {
    const passwordHash = await hashPassword(data.password);
    const [user] = await db.insert(orgUsers).values({
      ...data,
      passwordHash,
    }).returning();
    return user;
  }

  async getOrgUsersByOrganization(organizationId: string): Promise<OrgUser[]> {
    return db.select().from(orgUsers)
      .where(eq(orgUsers.organizationId, organizationId))
      .orderBy(asc(orgUsers.name));
  }

  async getOrgUserById(id: string): Promise<OrgUser | undefined> {
    const [user] = await db.select().from(orgUsers).where(eq(orgUsers.id, id)).limit(1);
    return user;
  }

  async getOrgUserByEmail(email: string, organizationId: string): Promise<OrgUser | undefined> {
    const [user] = await db.select().from(orgUsers)
      .where(and(
        eq(orgUsers.email, email),
        eq(orgUsers.organizationId, organizationId)
      ))
      .limit(1);
    return user;
  }

  async updateOrgUser(id: string, data: Partial<InsertOrgUser>): Promise<OrgUser | undefined> {
    const [user] = await db.update(orgUsers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(orgUsers.id, id))
      .returning();
    return user;
  }

  async deleteOrgUser(id: string): Promise<void> {
    await db.delete(orgUsers).where(eq(orgUsers.id, id));
  }

  async setOrgUserBranches(orgUserId: string, branchIds: string[]): Promise<void> {
    await db.delete(orgUserBranches).where(eq(orgUserBranches.orgUserId, orgUserId));
    if (branchIds.length > 0) {
      await db.insert(orgUserBranches).values(
        branchIds.map(branchId => ({ orgUserId, branchId }))
      );
    }
  }

  async getOrgUserBranches(orgUserId: string): Promise<string[]> {
    const results = await db.select({ branchId: orgUserBranches.branchId })
      .from(orgUserBranches)
      .where(eq(orgUserBranches.orgUserId, orgUserId));
    return results.map(r => r.branchId);
  }

  async getNextTicketNumber(branchId: string, prefix: string = "T"): Promise<string> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select()
        .from(ticketCounters)
        .where(and(
          eq(ticketCounters.branchId, branchId),
          eq(ticketCounters.prefix, prefix),
          gte(ticketCounters.date, today)
        ))
        .limit(1);

      if (existing) {
        const newCounter = existing.counter + 1;
        await tx.update(ticketCounters)
          .set({ counter: newCounter })
          .where(eq(ticketCounters.id, existing.id));
        return newCounter;
      } else {
        await tx.insert(ticketCounters).values({
          branchId,
          prefix,
          date: today,
          counter: 1,
        });
        return 1;
      }
    });

    return `${prefix}${result.toString().padStart(3, "0")}`;
  }

  async createTicket(data: InsertTicket): Promise<Ticket> {
    const ticketNumber = data.ticketNumber || await this.getNextTicketNumber(data.branchId, "T");
    const position = await this.getNextQueuePosition(data.branchId, data.serviceId || undefined);
    
    const [ticket] = await db.insert(tickets).values({
      ...data,
      ticketNumber,
      position,
    }).returning();
    return ticket;
  }

  async getNextQueuePosition(branchId: string, serviceId?: string): Promise<number> {
    const conditions = [
      eq(tickets.branchId, branchId),
      inArray(tickets.status, ["waiting", "called", "serving"])
    ];
    if (serviceId) {
      conditions.push(eq(tickets.serviceId, serviceId));
    }
    
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(and(...conditions));
    
    return (result?.count || 0) + 1;
  }

  async getTicketsByBranch(branchId: string, statuses?: string[]): Promise<Ticket[]> {
    const conditions = [eq(tickets.branchId, branchId)];
    if (statuses && statuses.length > 0) {
      conditions.push(inArray(tickets.status, statuses));
    }
    
    return db.select().from(tickets)
      .where(and(...conditions))
      .orderBy(asc(tickets.position), asc(tickets.joinedAt));
  }

  async getActiveTicketsByBranch(branchId: string): Promise<Ticket[]> {
    return this.getTicketsByBranch(branchId, ["waiting", "called", "serving", "hold", "arrived", "reservation"]);
  }

  async getTodaysTicketsByBranch(branchId: string): Promise<Ticket[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return db.select().from(tickets)
      .where(and(
        eq(tickets.branchId, branchId),
        gte(tickets.joinedAt, today),
        lte(tickets.joinedAt, tomorrow)
      ))
      .orderBy(asc(tickets.joinedAt));
  }

  async getTicketById(id: string): Promise<Ticket | undefined> {
    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
    return ticket;
  }

  async getTicketByNumber(ticketNumber: string, branchId: string): Promise<Ticket | undefined> {
    const [ticket] = await db.select().from(tickets)
      .where(and(
        eq(tickets.ticketNumber, ticketNumber),
        eq(tickets.branchId, branchId)
      ))
      .limit(1);
    return ticket;
  }

  async updateTicket(id: string, data: Partial<InsertTicket>): Promise<Ticket | undefined> {
    const [ticket] = await db.update(tickets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tickets.id, id))
      .returning();
    return ticket;
  }

  async callNextTicket(branchId: string, serviceId?: string): Promise<Ticket | undefined> {
    const conditions = [
      eq(tickets.branchId, branchId),
      eq(tickets.status, "waiting")
    ];
    if (serviceId) {
      conditions.push(eq(tickets.serviceId, serviceId));
    }

    const [nextTicket] = await db.select().from(tickets)
      .where(and(...conditions))
      .orderBy(
        desc(sql`CASE WHEN ${tickets.priority} = 'emergency' THEN 3 WHEN ${tickets.priority} = 'vip' THEN 2 ELSE 1 END`),
        asc(tickets.joinedAt)
      )
      .limit(1);

    if (nextTicket) {
      return this.updateTicket(nextTicket.id, {
        status: "called",
        calledAt: new Date(),
        callCount: nextTicket.callCount + 1,
      });
    }
    return undefined;
  }

  async recalculatePositions(branchId: string, serviceId?: string): Promise<void> {
    const conditions = [
      eq(tickets.branchId, branchId),
      eq(tickets.status, "waiting")
    ];
    if (serviceId) {
      conditions.push(eq(tickets.serviceId, serviceId));
    }

    const waitingTickets = await db.select().from(tickets)
      .where(and(...conditions))
      .orderBy(
        desc(sql`CASE WHEN ${tickets.priority} = 'emergency' THEN 3 WHEN ${tickets.priority} = 'vip' THEN 2 ELSE 1 END`),
        asc(tickets.joinedAt)
      );

    await Promise.all(waitingTickets.map((ticket, index) =>
      this.updateTicket(ticket.id, { position: index + 1 })
    ));
  }

  async createReservation(data: InsertReservation): Promise<Reservation> {
    const confirmationCode = data.confirmationCode || `R${Date.now().toString(36).toUpperCase()}`;
    const [reservation] = await db.insert(reservations).values({
      ...data,
      confirmationCode,
    }).returning();
    return reservation;
  }

  async getReservationsByBranch(branchId: string, date?: Date): Promise<Reservation[]> {
    const conditions = [eq(reservations.branchId, branchId)];
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      conditions.push(gte(reservations.reservationDate, startOfDay));
      conditions.push(lte(reservations.reservationDate, endOfDay));
    }

    return db.select().from(reservations)
      .where(and(...conditions))
      .orderBy(asc(reservations.reservationDate), asc(reservations.reservationTime));
  }

  async getReservationById(id: string): Promise<Reservation | undefined> {
    const [reservation] = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
    return reservation;
  }

  async getReservationByCode(confirmationCode: string): Promise<Reservation | undefined> {
    const [reservation] = await db.select().from(reservations)
      .where(eq(reservations.confirmationCode, confirmationCode))
      .limit(1);
    return reservation;
  }

  async updateReservation(id: string, data: Partial<InsertReservation>): Promise<Reservation | undefined> {
    const [reservation] = await db.update(reservations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reservations.id, id))
      .returning();
    return reservation;
  }

  async createAppointment(data: InsertAppointment): Promise<Appointment> {
    const ticketNumber = data.ticketNumber || await this.getNextTicketNumber(data.branchId, "A");
    const confirmationCode = data.confirmationCode || `APT${Date.now().toString(36).toUpperCase()}`;
    
    const [appointment] = await db.insert(appointments).values({
      ...data,
      ticketNumber,
      confirmationCode,
    }).returning();
    return appointment;
  }

  async getAppointmentsByBranch(branchId: string, date?: Date): Promise<Appointment[]> {
    const conditions = [eq(appointments.branchId, branchId)];
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      conditions.push(gte(appointments.scheduledDate, startOfDay));
      conditions.push(lte(appointments.scheduledDate, endOfDay));
    }

    return db.select().from(appointments)
      .where(and(...conditions))
      .orderBy(asc(appointments.scheduledDate), asc(appointments.scheduledTime));
  }

  async getAppointmentsByCustomer(customerId: string): Promise<Appointment[]> {
    return db.select().from(appointments)
      .where(eq(appointments.customerId, customerId))
      .orderBy(desc(appointments.scheduledDate));
  }

  async getAppointmentById(id: string): Promise<Appointment | undefined> {
    const [appointment] = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
    return appointment;
  }

  async updateAppointment(id: string, data: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    const [appointment] = await db.update(appointments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(appointments.id, id))
      .returning();
    return appointment;
  }

  async createBooking(data: {
    branchId: string;
    serviceId: string;
    userId?: string;
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    scheduledDate: Date;
    scheduledTime: string;
    endTime?: string;
    notes?: string;
    status?: string;
  }): Promise<Appointment> {
    const ticketNumber = `B${Date.now().toString(36).toUpperCase()}`;
    const [appointment] = await db.insert(appointments).values({
      id: randomUUID(),
      branchId: data.branchId,
      serviceId: data.serviceId,
      customerId: data.userId,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerEmail: data.customerEmail,
      ticketNumber,
      scheduledDate: data.scheduledDate,
      scheduledTime: data.scheduledTime,
      endTime: data.endTime || data.scheduledTime,
      status: (data.status || "confirmed") as "pending" | "confirmed" | "cancelled" | "completed" | "no_show",
      notes: data.notes,
    }).returning();
    return appointment;
  }

  async updateBooking(id: string, data: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    const [appointment] = await db.update(appointments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(appointments.id, id))
      .returning();
    return appointment;
  }

  async createDefaultOperatingHours(branchId: string): Promise<void> {
    const days = [
      { dayOfWeek: 0, openTime: "09:00", closeTime: "17:00", isOpen: false },
      { dayOfWeek: 1, openTime: "09:00", closeTime: "17:00", isOpen: true },
      { dayOfWeek: 2, openTime: "09:00", closeTime: "17:00", isOpen: true },
      { dayOfWeek: 3, openTime: "09:00", closeTime: "17:00", isOpen: true },
      { dayOfWeek: 4, openTime: "09:00", closeTime: "17:00", isOpen: true },
      { dayOfWeek: 5, openTime: "09:00", closeTime: "17:00", isOpen: true },
      { dayOfWeek: 6, openTime: "09:00", closeTime: "14:00", isOpen: true },
    ];

    await db.insert(operatingHours).values(days.map(d => ({ branchId, ...d })));
  }

  async getOperatingHours(branchId: string): Promise<OperatingHour[]> {
    return db.select().from(operatingHours)
      .where(eq(operatingHours.branchId, branchId))
      .orderBy(asc(operatingHours.dayOfWeek));
  }

  async updateOperatingHour(id: string, data: Partial<OperatingHour>): Promise<OperatingHour | undefined> {
    const [hour] = await db.update(operatingHours)
      .set(data)
      .where(eq(operatingHours.id, id))
      .returning();
    return hour;
  }

  async getHolidays(branchId: string): Promise<Holiday[]> {
    return db.select().from(holidays)
      .where(eq(holidays.branchId, branchId))
      .orderBy(asc(holidays.date));
  }

  async createHoliday(data: { branchId: string; date: Date; name: string; isRecurring?: boolean }): Promise<Holiday> {
    const [holiday] = await db.insert(holidays).values(data).returning();
    return holiday;
  }

  async deleteHoliday(id: string): Promise<void> {
    await db.delete(holidays).where(eq(holidays.id, id));
  }

  async getBookingSlots(branchId: string, serviceId: string | null, date: Date): Promise<BookingSlot[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const conditions = [
      eq(bookingSlots.branchId, branchId),
      gte(bookingSlots.date, startOfDay),
      lte(bookingSlots.date, endOfDay)
    ];
    
    if (serviceId) {
      conditions.push(eq(bookingSlots.serviceId, serviceId));
    }

    return db.select().from(bookingSlots)
      .where(and(...conditions))
      .orderBy(asc(bookingSlots.startTime));
  }

  async updateOrCreateBookingSlot(data: {
    branchId: string;
    serviceId?: string;
    date: Date;
    startTime: string;
    endTime: string;
    maxCapacity?: number;
    isBlocked?: boolean;
  }): Promise<BookingSlot> {
    const existing = await db.select().from(bookingSlots)
      .where(and(
        eq(bookingSlots.branchId, data.branchId),
        eq(bookingSlots.startTime, data.startTime),
        data.serviceId ? eq(bookingSlots.serviceId, data.serviceId) : isNull(bookingSlots.serviceId)
      ))
      .limit(1);

    if (existing.length > 0) {
      const [updated] = await db.update(bookingSlots)
        .set(data)
        .where(eq(bookingSlots.id, existing[0].id))
        .returning();
      return updated;
    }

    const [slot] = await db.insert(bookingSlots).values(data).returning();
    return slot;
  }

  async incrementBookingSlot(branchId: string, serviceId: string | null, date: Date, startTime: string): Promise<boolean> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const conditions = [
      eq(bookingSlots.branchId, branchId),
      eq(bookingSlots.startTime, startTime),
      gte(bookingSlots.date, startOfDay)
    ];
    
    if (serviceId) {
      conditions.push(eq(bookingSlots.serviceId, serviceId));
    }

    const [slot] = await db.select().from(bookingSlots).where(and(...conditions)).limit(1);
    
    if (slot && slot.currentBookings < slot.maxCapacity && !slot.isBlocked) {
      await db.update(bookingSlots)
        .set({ currentBookings: slot.currentBookings + 1 })
        .where(eq(bookingSlots.id, slot.id));
      return true;
    }
    return false;
  }

  async getDailyStats(branchId: string, date: Date): Promise<DailyStat | undefined> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const [stat] = await db.select().from(dailyStats)
      .where(and(
        eq(dailyStats.branchId, branchId),
        gte(dailyStats.date, startOfDay)
      ))
      .limit(1);
    return stat;
  }

  async calculateAndSaveDailyStats(branchId: string, date: Date): Promise<DailyStat> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const dayTickets = await db.select().from(tickets)
      .where(and(
        eq(tickets.branchId, branchId),
        gte(tickets.joinedAt, startOfDay),
        lte(tickets.joinedAt, endOfDay)
      ));

    const served = dayTickets.filter(t => t.status === "completed").length;
    const noShow = dayTickets.filter(t => t.status === "no_show").length;
    const cancelled = dayTickets.filter(t => t.status === "cancelled").length;
    
    const completedWithWait = dayTickets.filter(t => t.actualWaitTime !== null);
    const avgWaitTime = completedWithWait.length > 0
      ? Math.round(completedWithWait.reduce((sum, t) => sum + (t.actualWaitTime || 0), 0) / completedWithWait.length)
      : 0;
    
    const completedWithService = dayTickets.filter(t => t.serviceTime !== null);
    const avgServiceTime = completedWithService.length > 0
      ? Math.round(completedWithService.reduce((sum, t) => sum + (t.serviceTime || 0), 0) / completedWithService.length)
      : 0;

    const existing = await this.getDailyStats(branchId, date);
    
    const data = {
      branchId,
      date: startOfDay,
      totalServed: served,
      totalNoShow: noShow,
      totalCancelled: cancelled,
      avgWaitTime,
      avgServiceTime,
      updatedAt: new Date(),
    };

    if (existing) {
      const [stat] = await db.update(dailyStats)
        .set(data)
        .where(eq(dailyStats.id, existing.id))
        .returning();
      return stat;
    }

    const [stat] = await db.insert(dailyStats).values(data).returning();
    return stat;
  }

  async createCustomer(data: InsertCustomer & { password?: string }): Promise<Customer> {
    const insertData: any = { ...data };
    if (data.password) {
      insertData.passwordHash = await hashPassword(data.password);
      delete insertData.password;
    }
    const [customer] = await db.insert(customers).values(insertData).returning();
    return customer;
  }

  async getCustomerById(id: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
    return customer;
  }

  async getCustomerByEmail(email: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
    return customer;
  }

  async updateCustomer(id: string, data: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const [customer] = await db.update(customers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();
    return customer;
  }

  async getTicketsByCustomer(customerId: string): Promise<Ticket[]> {
    return db.select().from(tickets)
      .where(eq(tickets.customerId, customerId))
      .orderBy(desc(tickets.joinedAt));
  }

  async getQueueStats(branchId: string): Promise<{
    todayServed: number;
    todayWaiting: number;
    todayNoShow: number;
    averageWaitTime: number;
    averageServiceTime: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dayTickets = await db.select().from(tickets)
      .where(and(
        eq(tickets.branchId, branchId),
        gte(tickets.joinedAt, today),
        lte(tickets.joinedAt, tomorrow)
      ));

    const todayServed = dayTickets.filter(t => t.status === "completed").length;
    const todayWaiting = dayTickets.filter(t => ["waiting", "called", "serving"].includes(t.status)).length;
    const todayNoShow = dayTickets.filter(t => t.status === "no_show").length;
    
    const completedWithWait = dayTickets.filter(t => t.actualWaitTime !== null);
    const averageWaitTime = completedWithWait.length > 0
      ? Math.round(completedWithWait.reduce((sum, t) => sum + (t.actualWaitTime || 0), 0) / completedWithWait.length)
      : 0;
    
    const completedWithService = dayTickets.filter(t => t.serviceTime !== null);
    const averageServiceTime = completedWithService.length > 0
      ? Math.round(completedWithService.reduce((sum, t) => sum + (t.serviceTime || 0), 0) / completedWithService.length)
      : 0;

    return { todayServed, todayWaiting, todayNoShow, averageWaitTime, averageServiceTime };
  }

  // ============================================
  // SUBSCRIPTION PLANS
  // ============================================
  async getAllPlans(): Promise<SubscriptionPlan[]> {
    return db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true)).orderBy(asc(subscriptionPlans.sortOrder));
  }

  async getPlanById(id: string): Promise<SubscriptionPlan | undefined> {
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id)).limit(1);
    return plan;
  }

  async getPlanBySlug(slug: string): Promise<SubscriptionPlan | undefined> {
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, slug)).limit(1);
    return plan;
  }

  async createPlan(data: InsertSubscriptionPlan): Promise<SubscriptionPlan> {
    const [plan] = await db.insert(subscriptionPlans).values(data).returning();
    return plan;
  }

  async updatePlan(id: string, data: Partial<InsertSubscriptionPlan>): Promise<SubscriptionPlan | undefined> {
    const [plan] = await db.update(subscriptionPlans).set({ ...data, updatedAt: new Date() }).where(eq(subscriptionPlans.id, id)).returning();
    return plan;
  }

  // ============================================
  // SUBSCRIPTIONS
  // ============================================
  async getSubscriptionByOrg(organizationId: string): Promise<Subscription | undefined> {
    const [sub] = await db.select().from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    return sub;
  }

  async createSubscription(data: InsertSubscription): Promise<Subscription> {
    const [sub] = await db.insert(subscriptions).values(data).returning();
    return sub;
  }

  async updateSubscription(id: string, data: Partial<InsertSubscription>): Promise<Subscription | undefined> {
    const [sub] = await db.update(subscriptions).set({ ...data, updatedAt: new Date() }).where(eq(subscriptions.id, id)).returning();
    return sub;
  }

  async createTrialSubscription(organizationId: string, planId: string): Promise<Subscription> {
    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + 24);
    
    const [sub] = await db.insert(subscriptions).values({
      organizationId,
      planId,
      status: "trialing",
      billingCycle: "monthly",
      trialStartDate: now,
      trialEndDate: trialEnd,
      currentPeriodStart: now,
      currentPeriodEnd: trialEnd,
    }).returning();
    return sub;
  }

  // ============================================
  // PAYMENTS
  // ============================================
  async getPaymentsByOrg(organizationId: string): Promise<Payment[]> {
    return db.select().from(payments)
      .where(eq(payments.organizationId, organizationId))
      .orderBy(desc(payments.createdAt));
  }

  async createPayment(data: InsertPayment): Promise<Payment> {
    const [payment] = await db.insert(payments).values(data).returning();
    return payment;
  }

  async updatePayment(id: string, data: Partial<InsertPayment>): Promise<Payment | undefined> {
    const [payment] = await db.update(payments).set({ ...data, updatedAt: new Date() }).where(eq(payments.id, id)).returning();
    return payment;
  }

  async getPaymentByRazorpayId(razorpayPaymentId: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.razorpayPaymentId, razorpayPaymentId)).limit(1);
    return payment;
  }

  // ============================================
  // SEED DEFAULT PLANS
  // ============================================
  async seedDefaultPlans(): Promise<void> {
    const existingPlans = await db.select().from(subscriptionPlans).limit(1);
    if (existingPlans.length > 0) return;

    await db.insert(subscriptionPlans).values([
      {
        name: "Starter",
        slug: "starter",
        description: "Perfect for small businesses getting started with queue management",
        monthlyPrice: 99900,
        yearlyPrice: 999900,
        currency: "INR",
        maxBranches: 1,
        maxServicesPerBranch: 5,
        maxStaffUsers: 3,
        maxDailyTickets: 100,
        features: { queueModes: ["fifo"], analytics: "basic", support: "email" },
        sortOrder: 1,
      },
      {
        name: "Professional",
        slug: "professional",
        description: "For growing businesses with multiple services and staff",
        monthlyPrice: 249900,
        yearlyPrice: 2499900,
        currency: "INR",
        maxBranches: 3,
        maxServicesPerBranch: 15,
        maxStaffUsers: 10,
        maxDailyTickets: 500,
        features: { queueModes: ["fifo", "selective", "dine_in"], analytics: "advanced", support: "priority", multiStage: true },
        sortOrder: 2,
      },
      {
        name: "Enterprise",
        slug: "enterprise",
        description: "Unlimited power for large organizations with complex needs",
        monthlyPrice: 499900,
        yearlyPrice: 4999900,
        currency: "INR",
        maxBranches: -1,
        maxServicesPerBranch: -1,
        maxStaffUsers: -1,
        maxDailyTickets: -1,
        features: { queueModes: ["fifo", "selective", "dine_in", "multi_stage", "takeaway"], analytics: "enterprise", support: "dedicated", multiStage: true, apiAccess: true, customBranding: true },
        sortOrder: 3,
      },
    ]);
  }
}

export const storage = new DatabaseStorage();
