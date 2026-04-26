import { eq, and, gte, lte, desc, asc, sql, inArray, isNull, or } from "drizzle-orm";
import { db } from "./db";
import {
  organizations,
  branches,
  services,
  desks,
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
  swapRequests,
  roles,
  rolePermissions,
  auditLogs,
  type Role,
  type InsertRole,
  type AuditLog,
  type InsertAuditLog,
  type SwapRequest,
  type InsertSwapRequest,
  type Organization,
  type InsertOrganization,
  type Branch,
  type InsertBranch,
  type Service,
  type InsertService,
  type Desk,
  type InsertDesk,
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
  supportTickets,
  whatsappOverrides,
  systemErrors,
  pricingFeatures,
  planFeatures,
  type SupportTicket,
  type InsertSupportTicket,
  type WhatsappOverride,
  type InsertWhatsappOverride,
  type SystemError,
  type InsertSystemError,
  type PricingFeature,
  type InsertPricingFeature,
  type PlanFeature,
  announcementDevices,
  type AnnouncementDevice,
  type InsertAnnouncementDevice,
  notificationSettings,
  type NotificationSetting,
  type InsertNotificationSetting,
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
  async createOrganization(data: Omit<InsertOrganization, 'passwordHash'> & { password: string }): Promise<Organization> {
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

  async getAllBranches(): Promise<Branch[]> {
    return db.select().from(branches).orderBy(asc(branches.name));
  }

  async getBranchById(id: string): Promise<Branch | undefined> {
    const [branch] = await db.select().from(branches).where(eq(branches.id, id)).limit(1);
    return branch;
  }

  async updateBranch(id: string, data: Partial<InsertBranch>): Promise<Branch | undefined> {
    const { id: _id, createdAt: _ca, updatedAt: _ua, organizationId: _oid, ...safeData } = data as any;
    const [branch] = await db.update(branches)
      .set({ ...safeData, updatedAt: new Date() })
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

  async createDesk(data: InsertDesk): Promise<Desk> {
    const [desk] = await db.insert(desks).values(data).returning();
    return desk;
  }

  async getDesksByService(serviceId: string): Promise<Desk[]> {
    return db.select().from(desks)
      .where(eq(desks.serviceId, serviceId))
      .orderBy(asc(desks.sortOrder), asc(desks.name));
  }

  async getDesksByBranch(branchId: string): Promise<Desk[]> {
    return db.select().from(desks)
      .where(eq(desks.branchId, branchId))
      .orderBy(asc(desks.sortOrder), asc(desks.name));
  }

  async getDeskById(id: string): Promise<Desk | undefined> {
    const [desk] = await db.select().from(desks).where(eq(desks.id, id)).limit(1);
    return desk;
  }

  async updateDesk(id: string, data: Partial<InsertDesk>): Promise<Desk | undefined> {
    const [desk] = await db.update(desks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(desks.id, id))
      .returning();
    return desk;
  }

  async deleteDesk(id: string): Promise<void> {
    await db.delete(desks).where(eq(desks.id, id));
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

  async createOrgUser(data: Omit<InsertOrgUser, 'passwordHash'> & { password: string }): Promise<OrgUser> {
    const passwordHash = await hashPassword(data.password);
    const { password, ...rest } = data;
    const insertData: any = { ...rest, passwordHash };
    if (insertData.role && !insertData.roleId) {
      const role = await this.getRoleByKey(insertData.role);
      if (role) insertData.roleId = role.id;
    }
    const [user] = await db.insert(orgUsers).values(insertData).returning();
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
    const updateData: any = { ...data, updatedAt: new Date() };
    if (updateData.role !== undefined && updateData.roleId === undefined) {
      const role = await this.getRoleByKey(updateData.role);
      updateData.roleId = role ? role.id : null;
    }
    const [user] = await db.update(orgUsers)
      .set(updateData)
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

  async getWaitingTicketsForBranch(branchId: string, serviceId?: string): Promise<Ticket[]> {
    const conditions = [
      eq(tickets.branchId, branchId),
      eq(tickets.status, "waiting")
    ];
    if (serviceId) {
      conditions.push(eq(tickets.serviceId, serviceId));
    }
    return db.select().from(tickets)
      .where(and(...conditions))
      .orderBy(
        desc(sql`CASE WHEN ${tickets.priority} = 'emergency' THEN 3 WHEN ${tickets.priority} = 'vip' THEN 2 ELSE 1 END`),
        asc(tickets.joinedAt)
      );
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

  async getOperatingHourById(id: string): Promise<OperatingHour | undefined> {
    const [oh] = await db.select().from(operatingHours).where(eq(operatingHours.id, id));
    return oh;
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

  async getHolidayById(id: string): Promise<Holiday | undefined> {
    const [h] = await db.select().from(holidays).where(eq(holidays.id, id));
    return h;
  }

  async createHoliday(data: { branchId: string; date: Date; name: string; isRecurring?: boolean }): Promise<Holiday> {
    const [holiday] = await db.insert(holidays).values(data).returning();
    return holiday;
  }

  async updateHoliday(id: string, data: Partial<{ date: Date; name: string; isRecurring: boolean }>): Promise<Holiday | undefined> {
    const [holiday] = await db.update(holidays)
      .set(data)
      .where(eq(holidays.id, id))
      .returning();
    return holiday;
  }

  async deleteHoliday(id: string): Promise<void> {
    await db.delete(holidays).where(eq(holidays.id, id));
  }

  async getBreakTimes(operatingHourId: string): Promise<BreakTime[]> {
    return db.select().from(breakTimes)
      .where(eq(breakTimes.operatingHourId, operatingHourId))
      .orderBy(asc(breakTimes.startTime));
  }

  async getBreakTimeById(id: string): Promise<BreakTime | undefined> {
    const [b] = await db.select().from(breakTimes).where(eq(breakTimes.id, id));
    return b;
  }

  async createBreakTime(data: { operatingHourId: string; name: string; startTime: string; endTime: string; isActive?: boolean }): Promise<BreakTime> {
    const [bt] = await db.insert(breakTimes).values(data).returning();
    return bt;
  }

  async updateBreakTime(id: string, data: Partial<{ name: string; startTime: string; endTime: string; isActive: boolean }>): Promise<BreakTime | undefined> {
    const [bt] = await db.update(breakTimes)
      .set(data)
      .where(eq(breakTimes.id, id))
      .returning();
    return bt;
  }

  async deleteBreakTime(id: string): Promise<void> {
    await db.delete(breakTimes).where(eq(breakTimes.id, id));
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

  async createBookingSlot(data: {
    branchId: string;
    serviceId?: string;
    date: Date;
    startTime: string;
    endTime: string;
    maxCapacity?: number;
    isBlocked?: boolean;
  }): Promise<BookingSlot> {
    const [slot] = await db.insert(bookingSlots).values(data).returning();
    return slot;
  }

  async getBookingSlotById(id: string): Promise<BookingSlot | undefined> {
    const [slot] = await db.select().from(bookingSlots).where(eq(bookingSlots.id, id)).limit(1);
    return slot;
  }

  async updateBookingSlot(id: string, data: Partial<{
    startTime: string;
    endTime: string;
    maxCapacity: number;
    currentBookings: number;
    isBlocked: boolean;
  }>): Promise<BookingSlot | undefined> {
    const [slot] = await db.update(bookingSlots)
      .set(data)
      .where(eq(bookingSlots.id, id))
      .returning();
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

  async getCustomerByPhone(phone: string): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
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

  async getSubscriptionById(id: string): Promise<Subscription | undefined> {
    const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
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
  async createSwapRequest(data: InsertSwapRequest): Promise<SwapRequest> {
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const [request] = await db.insert(swapRequests).values({
      ...data,
      expiresAt,
    }).returning();
    return request;
  }

  async getSwapRequestById(id: string): Promise<SwapRequest | undefined> {
    const [request] = await db.select().from(swapRequests).where(eq(swapRequests.id, id)).limit(1);
    return request;
  }

  async getPendingSwapRequestsForTicket(ticketId: string): Promise<SwapRequest[]> {
    return db.select().from(swapRequests)
      .where(and(
        eq(swapRequests.requesterTicketId, ticketId),
        eq(swapRequests.status, "pending"),
      ))
      .orderBy(desc(swapRequests.createdAt));
  }

  async getIncomingSwapRequests(branchId: string, serviceId: string, beforePosition: number): Promise<SwapRequest[]> {
    return db.select().from(swapRequests)
      .where(and(
        eq(swapRequests.branchId, branchId),
        eq(swapRequests.status, "pending"),
      ))
      .orderBy(desc(swapRequests.createdAt));
  }

  async getPendingSwapRequestsForBranch(branchId: string): Promise<SwapRequest[]> {
    return db.select().from(swapRequests)
      .where(and(
        eq(swapRequests.branchId, branchId),
        eq(swapRequests.status, "pending"),
      ))
      .orderBy(desc(swapRequests.createdAt));
  }

  async updateSwapRequest(id: string, data: Partial<InsertSwapRequest>): Promise<SwapRequest | undefined> {
    const [request] = await db.update(swapRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(swapRequests.id, id))
      .returning();
    return request;
  }

  async cancelPendingSwapRequests(ticketId: string): Promise<void> {
    await db.update(swapRequests)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(
        eq(swapRequests.requesterTicketId, ticketId),
        eq(swapRequests.status, "pending"),
      ));
  }

  async getWaitingTicketsAheadInService(branchId: string, serviceId: string, position: number): Promise<any[]> {
    return db.select().from(tickets)
      .where(and(
        eq(tickets.branchId, branchId),
        eq(tickets.serviceId, serviceId),
        eq(tickets.status, "waiting"),
        sql`${tickets.position} < ${position}`,
      ))
      .orderBy(asc(tickets.position));
  }

  // ============================================
  // ROLES & PERMISSIONS
  // ============================================
  // organizationId === null  → only system / platform roles (orgId IS NULL)
  // organizationId === string → system roles + roles owned by that org
  // organizationId === undefined → ALL roles (super admin view)
  async listRoles(opts: { organizationId?: string | null } = {}): Promise<Role[]> {
    if (opts.organizationId === undefined) {
      return db.select().from(roles).orderBy(asc(roles.name));
    }
    if (opts.organizationId === null) {
      return db.select().from(roles).where(isNull(roles.organizationId)).orderBy(asc(roles.name));
    }
    return db
      .select()
      .from(roles)
      .where(or(isNull(roles.organizationId), eq(roles.organizationId, opts.organizationId))!)
      .orderBy(asc(roles.name));
  }

  async getRoleById(id: string): Promise<Role | undefined> {
    const [r] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
    return r;
  }

  async getRoleByKey(key: string): Promise<Role | undefined> {
    const [r] = await db.select().from(roles).where(eq(roles.key, key)).limit(1);
    return r;
  }

  async createRole(data: InsertRole): Promise<Role> {
    const [r] = await db.insert(roles).values(data).returning();
    return r;
  }

  async updateRole(id: string, data: Partial<InsertRole>): Promise<Role | undefined> {
    const [r] = await db.update(roles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(roles.id, id))
      .returning();
    return r;
  }

  async deleteRole(id: string): Promise<void> {
    await db.delete(roles).where(eq(roles.id, id));
  }

  async getRolePermissions(roleId: string): Promise<string[]> {
    const rows = await db
      .select({ key: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));
    return rows.map((r) => r.key);
  }

  async getRolePermissionsByKey(roleKey: string): Promise<string[]> {
    const role = await this.getRoleByKey(roleKey);
    if (!role) return [];
    return this.getRolePermissions(role.id);
  }

  async setRolePermissions(roleId: string, keys: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
      const unique = Array.from(new Set(keys));
      if (unique.length > 0) {
        await tx.insert(rolePermissions).values(unique.map((k) => ({ roleId, permissionKey: k })));
      }
    });
  }

  async countUsersByRoleId(roleId: string): Promise<number> {
    const rows = await db
      .select({ id: orgUsers.id })
      .from(orgUsers)
      .where(eq(orgUsers.roleId, roleId));
    return rows.length;
  }

  async countUsersByRoleIdInOrg(roleId: string, organizationId: string): Promise<number> {
    const rows = await db
      .select({ id: orgUsers.id })
      .from(orgUsers)
      .where(and(eq(orgUsers.roleId, roleId), eq(orgUsers.organizationId, organizationId)));
    return rows.length;
  }

  async reassignUsersRole(fromRoleId: string, toRoleId: string, toRoleKey: string): Promise<void> {
    await db.update(orgUsers)
      .set({ roleId: toRoleId, role: toRoleKey, updatedAt: new Date() })
      .where(eq(orgUsers.roleId, fromRoleId));
  }

  // Org-scoped variant — only reassigns members of the given organization,
  // preventing accidental global writes if a roleId is somehow shared/reused.
  async reassignUsersRoleInOrg(
    fromRoleId: string,
    toRoleId: string,
    toRoleKey: string,
    organizationId: string,
  ): Promise<void> {
    await db.update(orgUsers)
      .set({ roleId: toRoleId, role: toRoleKey, updatedAt: new Date() })
      .where(and(eq(orgUsers.roleId, fromRoleId), eq(orgUsers.organizationId, organizationId)));
  }

  async setOrgUserRole(userId: string, roleId: string, roleKey: string): Promise<void> {
    await db.update(orgUsers)
      .set({ roleId, role: roleKey, updatedAt: new Date() })
      .where(eq(orgUsers.id, userId));
  }

  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> {
    const [row] = await db.insert(auditLogs).values(data).returning();
    return row;
  }

  async listAuditLogs(opts: { limit?: number; action?: string } = {}): Promise<AuditLog[]> {
    const limit = opts.limit ?? 200;
    if (opts.action) {
      return db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, opts.action))
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit);
    }
    return db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }

  // ============================================
  // SUPER ADMIN — listings & dashboard stats
  // ============================================

  async listOrganizationsForAdmin(opts: { search?: string; limit?: number } = {}): Promise<
    Array<Organization & { branchCount: number; userCount: number; subscriptionStatus: string | null; planName: string | null }>
  > {
    const limit = opts.limit ?? 200;
    const search = (opts.search ?? "").trim().toLowerCase();
    const orgs = await db.select().from(organizations).orderBy(desc(organizations.createdAt)).limit(limit);
    const filtered = search
      ? orgs.filter(
          (o) =>
            o.name.toLowerCase().includes(search) ||
            o.email.toLowerCase().includes(search) ||
            (o.city ?? "").toLowerCase().includes(search),
        )
      : orgs;
    // Enrich each org with counts and subscription status
    return Promise.all(
      filtered.map(async (o) => {
        const [branchRows, userRows, sub] = await Promise.all([
          db.select({ id: branches.id }).from(branches).where(eq(branches.organizationId, o.id)),
          db.select({ id: orgUsers.id }).from(orgUsers).where(eq(orgUsers.organizationId, o.id)),
          db
            .select({
              status: subscriptions.status,
              planName: subscriptionPlans.name,
            })
            .from(subscriptions)
            .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
            .where(eq(subscriptions.organizationId, o.id))
            .orderBy(desc(subscriptions.createdAt))
            .limit(1),
        ]);
        return {
          ...o,
          branchCount: branchRows.length,
          userCount: userRows.length,
          subscriptionStatus: sub[0]?.status ?? null,
          planName: sub[0]?.planName ?? null,
        };
      }),
    );
  }

  // Returns staff records for the super-admin Admins page. Explicitly projects
  // safe columns only — `password_hash` is NEVER included so it cannot leak
  // through the SA UI/API.
  async listAllOrgUsersForAdmin(opts: { search?: string; limit?: number } = {}): Promise<
    Array<{
      id: string;
      organizationId: string;
      organizationName: string;
      name: string;
      email: string;
      phone: string | null;
      role: string;
      roleId: string | null;
      branchId: string | null;
      profilePictureUrl: string | null;
      isActive: boolean;
      lastLoginAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>
  > {
    const limit = opts.limit ?? 200;
    const search = (opts.search ?? "").trim().toLowerCase();
    const rows = await db
      .select({
        id: orgUsers.id,
        organizationId: orgUsers.organizationId,
        name: orgUsers.name,
        email: orgUsers.email,
        phone: orgUsers.phone,
        role: orgUsers.role,
        roleId: orgUsers.roleId,
        branchId: orgUsers.branchId,
        profilePictureUrl: orgUsers.profilePictureUrl,
        isActive: orgUsers.isActive,
        lastLoginAt: orgUsers.lastLoginAt,
        createdAt: orgUsers.createdAt,
        updatedAt: orgUsers.updatedAt,
        organizationName: organizations.name,
      })
      .from(orgUsers)
      .leftJoin(organizations, eq(orgUsers.organizationId, organizations.id))
      .orderBy(desc(orgUsers.createdAt))
      .limit(limit);
    const mapped = rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      organizationName: r.organizationName ?? "",
      name: r.name,
      email: r.email,
      phone: r.phone,
      role: r.role,
      roleId: r.roleId,
      branchId: r.branchId,
      profilePictureUrl: r.profilePictureUrl,
      isActive: r.isActive,
      lastLoginAt: r.lastLoginAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    return search
      ? mapped.filter(
          (u) =>
            u.name.toLowerCase().includes(search) ||
            u.email.toLowerCase().includes(search) ||
            u.organizationName.toLowerCase().includes(search),
        )
      : mapped;
  }

  async listSubscriptionsForAdmin(opts: { search?: string; limit?: number } = {}): Promise<
    Array<{
      id: string;
      organizationId: string;
      organizationName: string;
      organizationEmail: string;
      planName: string | null;
      status: string;
      billingCycle: string;
      currentPeriodEnd: Date | null;
      trialEndDate: Date | null;
      createdAt: Date;
    }>
  > {
    const limit = opts.limit ?? 200;
    const search = (opts.search ?? "").trim().toLowerCase();
    const rows = await db
      .select({
        id: subscriptions.id,
        organizationId: subscriptions.organizationId,
        organizationName: organizations.name,
        organizationEmail: organizations.email,
        planName: subscriptionPlans.name,
        status: subscriptions.status,
        billingCycle: subscriptions.billingCycle,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        trialEndDate: subscriptions.trialEndDate,
        createdAt: subscriptions.createdAt,
      })
      .from(subscriptions)
      .leftJoin(organizations, eq(subscriptions.organizationId, organizations.id))
      .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .orderBy(desc(subscriptions.createdAt))
      .limit(limit);
    const mapped = rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      organizationName: r.organizationName ?? "",
      organizationEmail: r.organizationEmail ?? "",
      planName: r.planName,
      status: r.status,
      billingCycle: r.billingCycle,
      currentPeriodEnd: r.currentPeriodEnd,
      trialEndDate: r.trialEndDate,
      createdAt: r.createdAt,
    }));
    return search
      ? mapped.filter(
          (s) =>
            s.organizationName.toLowerCase().includes(search) ||
            s.organizationEmail.toLowerCase().includes(search) ||
            (s.planName ?? "").toLowerCase().includes(search) ||
            s.status.toLowerCase().includes(search),
        )
      : mapped;
  }

  async listPaymentsForAdmin(opts: { search?: string; limit?: number; status?: string } = {}): Promise<
    Array<{
      id: string;
      organizationId: string;
      organizationName: string;
      amount: number;
      currency: string;
      status: string;
      paymentMethod: string | null;
      invoiceNumber: string | null;
      razorpayPaymentId: string | null;
      createdAt: Date;
      paidAt: Date | null;
    }>
  > {
    const limit = opts.limit ?? 200;
    const search = (opts.search ?? "").trim().toLowerCase();
    const baseQ = db
      .select({
        id: payments.id,
        organizationId: payments.organizationId,
        organizationName: organizations.name,
        amount: payments.amount,
        currency: payments.currency,
        status: payments.status,
        paymentMethod: payments.paymentMethod,
        invoiceNumber: payments.invoiceNumber,
        razorpayPaymentId: payments.razorpayPaymentId,
        createdAt: payments.createdAt,
        paidAt: payments.paidAt,
      })
      .from(payments)
      .leftJoin(organizations, eq(payments.organizationId, organizations.id))
      .orderBy(desc(payments.createdAt))
      .limit(limit);
    const rows = opts.status
      ? await baseQ.where(eq(payments.status, opts.status))
      : await baseQ;
    const mapped = rows.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      organizationName: r.organizationName ?? "",
      amount: r.amount,
      currency: r.currency,
      status: r.status,
      paymentMethod: r.paymentMethod,
      invoiceNumber: r.invoiceNumber,
      razorpayPaymentId: r.razorpayPaymentId,
      createdAt: r.createdAt,
      paidAt: r.paidAt,
    }));
    return search
      ? mapped.filter(
          (p) =>
            p.organizationName.toLowerCase().includes(search) ||
            (p.invoiceNumber ?? "").toLowerCase().includes(search) ||
            (p.razorpayPaymentId ?? "").toLowerCase().includes(search),
        )
      : mapped;
  }

  async getPlatformStats(): Promise<{
    organizations: { total: number; active: number; verified: number; newThisMonth: number };
    users: { total: number };
    branches: { total: number };
    subscriptions: { active: number; trialing: number; cancelled: number };
    revenue: { last30Days: number; lifetime: number; currency: string };
    tickets: { last30Days: number };
  }> {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sinceMonth = new Date();
    sinceMonth.setDate(1);
    sinceMonth.setHours(0, 0, 0, 0);

    const [orgRows, userRows, branchRows, subRows, payRows30, payRowsAll, ticketRows30] = await Promise.all([
      db.select({ id: organizations.id, isActive: organizations.isActive, isVerified: organizations.isVerified, createdAt: organizations.createdAt }).from(organizations),
      db.select({ id: orgUsers.id }).from(orgUsers),
      db.select({ id: branches.id }).from(branches),
      db.select({ id: subscriptions.id, status: subscriptions.status }).from(subscriptions),
      db.select({ amount: payments.amount, currency: payments.currency }).from(payments).where(and(eq(payments.status, "completed"), gte(payments.createdAt, since30))),
      db.select({ amount: payments.amount, currency: payments.currency }).from(payments).where(eq(payments.status, "completed")),
      db.select({ id: tickets.id }).from(tickets).where(gte(tickets.createdAt, since30)),
    ]);

    const newThisMonth = orgRows.filter((o) => o.createdAt && o.createdAt >= sinceMonth).length;
    const revenueCurrency = payRowsAll[0]?.currency ?? "INR";

    return {
      organizations: {
        total: orgRows.length,
        active: orgRows.filter((o) => o.isActive).length,
        verified: orgRows.filter((o) => o.isVerified).length,
        newThisMonth,
      },
      users: { total: userRows.length },
      branches: { total: branchRows.length },
      subscriptions: {
        active: subRows.filter((s) => s.status === "active").length,
        trialing: subRows.filter((s) => s.status === "trialing").length,
        cancelled: subRows.filter((s) => s.status === "cancelled").length,
      },
      revenue: {
        last30Days: payRows30.reduce((sum, p) => sum + (p.amount ?? 0), 0),
        lifetime: payRowsAll.reduce((sum, p) => sum + (p.amount ?? 0), 0),
        currency: revenueCurrency,
      },
      tickets: { last30Days: ticketRows30.length },
    };
  }

  // ========================================
  // VISITORS — aggregated from tickets
  // ========================================
  async getVisitorReport(opts: { sinceDays?: number; limit?: number } = {}): Promise<{
    stats: {
      totalVisitors: number;
      totalVisitorsPrev: number;
      avgDaily: number;
      avgWaitSeconds: number;
      avgWaitSecondsPrev: number;
      noShowRate: number;
      noShowRatePrev: number;
    };
    rows: Array<{
      orgId: string;
      org: string;
      city: string;
      visitors: number;
      avgWaitSeconds: number;
      noShowRate: number;
    }>;
  }> {
    const sinceDays = opts.sinceDays ?? 30;
    const limit = opts.limit ?? 10;
    const now = Date.now();
    const sinceDate = new Date(now - sinceDays * 24 * 60 * 60 * 1000);
    const prevSinceDate = new Date(now - 2 * sinceDays * 24 * 60 * 60 * 1000);

    const recent = await db
      .select({
        ticketId: tickets.id,
        status: tickets.status,
        wait: tickets.actualWaitTime,
        joinedAt: tickets.joinedAt,
        orgId: branches.organizationId,
        orgName: organizations.name,
        city: branches.city,
      })
      .from(tickets)
      .innerJoin(branches, eq(tickets.branchId, branches.id))
      .innerJoin(organizations, eq(branches.organizationId, organizations.id))
      .where(gte(tickets.joinedAt, sinceDate));

    const previous = await db
      .select({
        status: tickets.status,
        wait: tickets.actualWaitTime,
      })
      .from(tickets)
      .where(and(gte(tickets.joinedAt, prevSinceDate), lte(tickets.joinedAt, sinceDate)));

    const totalVisitors = recent.length;
    const totalVisitorsPrev = previous.length;
    const noShowsRecent = recent.filter((r) => r.status === "no_show" || r.status === "cancelled").length;
    const noShowsPrev = previous.filter((r) => r.status === "no_show" || r.status === "cancelled").length;
    const waitsRecent = recent.filter((r) => typeof r.wait === "number" && r.wait! > 0).map((r) => r.wait!);
    const waitsPrev = previous.filter((r) => typeof r.wait === "number" && r.wait! > 0).map((r) => r.wait!);
    const avgWaitSeconds = waitsRecent.length ? Math.round(waitsRecent.reduce((a, b) => a + b, 0) / waitsRecent.length) : 0;
    const avgWaitSecondsPrev = waitsPrev.length ? Math.round(waitsPrev.reduce((a, b) => a + b, 0) / waitsPrev.length) : 0;
    const noShowRate = totalVisitors ? (noShowsRecent / totalVisitors) * 100 : 0;
    const noShowRatePrev = totalVisitorsPrev ? (noShowsPrev / totalVisitorsPrev) * 100 : 0;
    const avgDaily = Math.round(totalVisitors / sinceDays);

    const byOrg = new Map<string, { org: string; city: string; visitors: number; waits: number[]; noShows: number }>();
    for (const r of recent) {
      const key = r.orgId;
      const cur = byOrg.get(key) ?? { org: r.orgName, city: r.city ?? "—", visitors: 0, waits: [], noShows: 0 };
      cur.visitors += 1;
      if (typeof r.wait === "number" && r.wait > 0) cur.waits.push(r.wait);
      if (r.status === "no_show" || r.status === "cancelled") cur.noShows += 1;
      byOrg.set(key, cur);
    }
    const rows = Array.from(byOrg.entries())
      .map(([orgId, v]) => ({
        orgId,
        org: v.org,
        city: v.city,
        visitors: v.visitors,
        avgWaitSeconds: v.waits.length ? Math.round(v.waits.reduce((a, b) => a + b, 0) / v.waits.length) : 0,
        noShowRate: v.visitors ? (v.noShows / v.visitors) * 100 : 0,
      }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, limit);

    return {
      stats: { totalVisitors, totalVisitorsPrev, avgDaily, avgWaitSeconds, avgWaitSecondsPrev, noShowRate, noShowRatePrev },
      rows,
    };
  }

  // ========================================
  // SUBSCRIPTION PLANS — admin CRUD
  // ========================================
  async listSubscriptionPlansForAdmin(): Promise<SubscriptionPlan[]> {
    return db.select().from(subscriptionPlans).orderBy(asc(subscriptionPlans.sortOrder), asc(subscriptionPlans.monthlyPrice));
  }

  async createSubscriptionPlan(data: InsertSubscriptionPlan): Promise<SubscriptionPlan> {
    const [row] = await db.insert(subscriptionPlans).values(data).returning();
    return row;
  }

  async updateSubscriptionPlan(id: string, data: Partial<InsertSubscriptionPlan>): Promise<SubscriptionPlan | undefined> {
    const [row] = await db.update(subscriptionPlans).set({ ...data, updatedAt: new Date() }).where(eq(subscriptionPlans.id, id)).returning();
    return row;
  }

  async deleteSubscriptionPlan(id: string): Promise<boolean> {
    const used = await db.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.planId, id)).limit(1);
    if (used.length > 0) {
      throw new Error("Plan is in use by active subscriptions");
    }
    await db.delete(planFeatures).where(eq(planFeatures.planId, id));
    const result = await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, id)).returning();
    return result.length > 0;
  }

  // ========================================
  // PRICING FEATURES + plan ↔ feature matrix
  // ========================================
  async listPricingFeatures(): Promise<PricingFeature[]> {
    return db.select().from(pricingFeatures).orderBy(asc(pricingFeatures.sortOrder), asc(pricingFeatures.label));
  }

  async createPricingFeature(data: InsertPricingFeature): Promise<PricingFeature> {
    const [row] = await db.insert(pricingFeatures).values(data).returning();
    return row;
  }

  async updatePricingFeature(id: string, data: Partial<InsertPricingFeature>): Promise<PricingFeature | undefined> {
    const [row] = await db.update(pricingFeatures).set(data).where(eq(pricingFeatures.id, id)).returning();
    return row;
  }

  async deletePricingFeature(id: string): Promise<boolean> {
    await db.delete(planFeatures).where(eq(planFeatures.featureId, id));
    const result = await db.delete(pricingFeatures).where(eq(pricingFeatures.id, id)).returning();
    return result.length > 0;
  }

  async listPlanFeatureMatrix(): Promise<PlanFeature[]> {
    return db.select().from(planFeatures);
  }

  async setPlanFeature(planId: string, featureId: string, enabled: boolean): Promise<void> {
    if (enabled) {
      await db.insert(planFeatures).values({ planId, featureId }).onConflictDoNothing();
    } else {
      await db.delete(planFeatures).where(and(eq(planFeatures.planId, planId), eq(planFeatures.featureId, featureId)));
    }
  }

  // ========================================
  // SUPPORT TICKETS
  // ========================================
  async listSupportTickets(opts: { search?: string; status?: string; limit?: number } = {}): Promise<
    Array<SupportTicket & { orgName?: string | null }>
  > {
    const limit = opts.limit ?? 200;
    const conds: any[] = [];
    if (opts.status) conds.push(eq(supportTickets.status, opts.status));
    if (opts.search) {
      const term = `%${opts.search}%`;
      conds.push(or(sql`${supportTickets.subject} ILIKE ${term}`, sql`${supportTickets.ticketNumber} ILIKE ${term}`));
    }
    const rows = await db
      .select({
        id: supportTickets.id,
        organizationId: supportTickets.organizationId,
        ticketNumber: supportTickets.ticketNumber,
        subject: supportTickets.subject,
        description: supportTickets.description,
        priority: supportTickets.priority,
        status: supportTickets.status,
        assignee: supportTickets.assignee,
        reportedByEmail: supportTickets.reportedByEmail,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
        resolvedAt: supportTickets.resolvedAt,
        orgName: organizations.name,
      })
      .from(supportTickets)
      .leftJoin(organizations, eq(supportTickets.organizationId, organizations.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(supportTickets.updatedAt))
      .limit(limit);
    return rows as any;
  }

  async getSupportTicketStats(): Promise<{ open: number; awaitingReply: number; resolved7d: number; avgResponseMinutes: number }> {
    const all = await db.select().from(supportTickets);
    const open = all.filter((t) => t.status === "open").length;
    const awaitingReply = all.filter((t) => t.status === "awaiting_reply" || t.status === "in_progress").length;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const resolved7d = all.filter((t) => t.resolvedAt && t.resolvedAt >= sevenDaysAgo).length;
    const responseTimes = all
      .filter((t) => t.resolvedAt && t.createdAt)
      .map((t) => (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 60000);
    const avgResponseMinutes = responseTimes.length ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length) : 0;
    return { open, awaitingReply, resolved7d, avgResponseMinutes };
  }

  async createSupportTicket(data: InsertSupportTicket): Promise<SupportTicket> {
    const [row] = await db.insert(supportTickets).values(data).returning();
    return row;
  }

  async updateSupportTicket(id: string, data: Partial<InsertSupportTicket>): Promise<SupportTicket | undefined> {
    const update: any = { ...data, updatedAt: new Date() };
    if (data.status === "resolved" || data.status === "closed") {
      update.resolvedAt = new Date();
    }
    const [row] = await db.update(supportTickets).set(update).where(eq(supportTickets.id, id)).returning();
    return row;
  }

  async deleteSupportTicket(id: string): Promise<boolean> {
    const result = await db.delete(supportTickets).where(eq(supportTickets.id, id)).returning();
    return result.length > 0;
  }

  // ========================================
  // WHATSAPP OVERRIDES (mode|key|lang)
  // ========================================
  async listWhatsappOverrides(): Promise<WhatsappOverride[]> {
    return db.select().from(whatsappOverrides);
  }

  async setWhatsappOverride(mode: string, triggerKey: string, language: string, content: string, updatedBy?: string): Promise<WhatsappOverride> {
    const [row] = await db
      .insert(whatsappOverrides)
      .values({ mode, triggerKey, language, content, updatedBy })
      .onConflictDoUpdate({
        target: [whatsappOverrides.mode, whatsappOverrides.triggerKey, whatsappOverrides.language],
        set: { content, updatedBy, updatedAt: new Date() },
      })
      .returning();
    return row;
  }

  async deleteWhatsappOverride(mode: string, triggerKey: string, language: string): Promise<boolean> {
    const result = await db
      .delete(whatsappOverrides)
      .where(and(eq(whatsappOverrides.mode, mode), eq(whatsappOverrides.triggerKey, triggerKey), eq(whatsappOverrides.language, language)))
      .returning();
    return result.length > 0;
  }

  // ========================================
  // SYSTEM ERRORS
  // ========================================
  async listSystemErrors(opts: { limit?: number; level?: string } = {}): Promise<SystemError[]> {
    const limit = opts.limit ?? 200;
    if (opts.level) {
      return db.select().from(systemErrors).where(eq(systemErrors.level, opts.level)).orderBy(desc(systemErrors.createdAt)).limit(limit);
    }
    return db.select().from(systemErrors).orderBy(desc(systemErrors.createdAt)).limit(limit);
  }

  async insertSystemError(data: InsertSystemError): Promise<SystemError> {
    const [row] = await db.insert(systemErrors).values(data).returning();
    return row;
  }

  // ========================================
  // MASTER DATA — industries derived from organizations.category
  // ========================================
  async listIndustries(): Promise<Array<{ code: string; name: string; count: number }>> {
    const rows = await db
      .select({ category: organizations.category, count: sql<number>`COUNT(*)::int` })
      .from(organizations)
      .where(sql`${organizations.category} IS NOT NULL AND ${organizations.category} <> ''`)
      .groupBy(organizations.category)
      .orderBy(desc(sql`COUNT(*)`));
    return rows
      .filter((r) => !!r.category)
      .map((r) => {
        const code = String(r.category).toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24);
        const name = String(r.category)
          .split(/[\s_-]+/)
          .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
          .join(" ");
        return { code, name, count: Number(r.count ?? 0) };
      });
  }

  // ========================================
  // REPORTS — synthetic catalog derived from existing data
  // ========================================
  async listAvailableReports(): Promise<Array<{ id: string; title: string; type: string; period: string; generated: string; status: string }>> {
    const now = new Date();
    const monthName = now.toLocaleString("en-US", { month: "short" });
    const year = now.getFullYear();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthName = prevMonth.toLocaleString("en-US", { month: "short" });
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

    const [orgCount] = await db.select({ c: sql<number>`COUNT(*)::int` }).from(organizations);
    const [payCount] = await db.select({ c: sql<number>`COUNT(*)::int` }).from(payments);
    const [ticketCount] = await db.select({ c: sql<number>`COUNT(*)::int` }).from(tickets);
    const [subCount] = await db.select({ c: sql<number>`COUNT(*)::int` }).from(subscriptions);

    return [
      {
        id: "revenue",
        title: `Monthly Revenue Report — ${monthName} ${year}`,
        type: "Finance",
        period: `${monthName} ${year}`,
        generated: fmt(now),
        status: payCount.c > 0 ? "Ready" : "Empty",
      },
      {
        id: "onboarding",
        title: `Org Onboarding Summary — Q${quarter}`,
        type: "Growth",
        period: `Q${quarter} ${year}`,
        generated: fmt(now),
        status: orgCount.c > 0 ? "Ready" : "Empty",
      },
      {
        id: "visitors",
        title: `Visitor Heatmap — ${prevMonthName}`,
        type: "Analytics",
        period: `${prevMonthName} ${year}`,
        generated: fmt(now),
        status: ticketCount.c > 0 ? "Ready" : "Empty",
      },
      {
        id: "churn",
        title: `Churn Analysis — YTD`,
        type: "Retention",
        period: `${year} YTD`,
        generated: fmt(now),
        status: subCount.c > 0 ? "Ready" : "Empty",
      },
    ];
  }

  async exportReportCsv(id: string): Promise<{ filename: string; csv: string }> {
    const escape = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const toCsv = (header: string[], rows: any[][]) =>
      [header.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");

    const stamp = new Date().toISOString().slice(0, 10);

    if (id === "revenue") {
      const rows = await db
        .select({
          id: payments.id,
          orgName: organizations.name,
          amount: payments.amount,
          currency: payments.currency,
          method: payments.paymentMethod,
          status: payments.status,
          paidAt: payments.paidAt,
        })
        .from(payments)
        .leftJoin(subscriptions, eq(payments.subscriptionId, subscriptions.id))
        .leftJoin(organizations, eq(subscriptions.organizationId, organizations.id))
        .orderBy(desc(payments.paidAt));
      const csv = toCsv(
        ["payment_id", "organization", "amount", "currency", "method", "status", "paid_at"],
        rows.map((r) => [r.id, r.orgName ?? "", r.amount ?? 0, r.currency ?? "", r.method ?? "", r.status ?? "", r.paidAt?.toISOString() ?? ""])
      );
      return { filename: `revenue-report-${stamp}.csv`, csv };
    }

    if (id === "onboarding") {
      const rows = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          category: organizations.category,
          isActive: organizations.isActive,
          createdAt: organizations.createdAt,
        })
        .from(organizations)
        .orderBy(desc(organizations.createdAt));
      const csv = toCsv(
        ["org_id", "name", "slug", "category", "active", "created_at"],
        rows.map((r) => [r.id, r.name, r.slug, r.category ?? "", r.isActive ? "yes" : "no", r.createdAt?.toISOString() ?? ""])
      );
      return { filename: `onboarding-report-${stamp}.csv`, csv };
    }

    if (id === "visitors") {
      const report = await this.getVisitorReport({ sinceDays: 30, limit: 100 });
      const csv = toCsv(
        ["organization", "city", "visitors", "avg_wait_seconds", "no_show_rate_pct"],
        report.rows.map((r) => [r.org, r.city, r.visitors, r.avgWaitSeconds, r.noShowRate.toFixed(2)])
      );
      return { filename: `visitors-report-${stamp}.csv`, csv };
    }

    if (id === "churn") {
      const rows = await db
        .select({
          id: subscriptions.id,
          orgName: organizations.name,
          planName: subscriptionPlans.name,
          status: subscriptions.status,
          cancelledAt: subscriptions.cancelledAt,
          createdAt: subscriptions.createdAt,
        })
        .from(subscriptions)
        .leftJoin(organizations, eq(subscriptions.organizationId, organizations.id))
        .leftJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .orderBy(desc(subscriptions.createdAt));
      const csv = toCsv(
        ["subscription_id", "organization", "plan", "status", "cancelled_at", "created_at"],
        rows.map((r) => [r.id, r.orgName ?? "", r.planName ?? "", r.status ?? "", r.cancelledAt?.toISOString() ?? "", r.createdAt?.toISOString() ?? ""])
      );
      return { filename: `churn-report-${stamp}.csv`, csv };
    }

    return { filename: `report-${id}-${stamp}.csv`, csv: "" };
  }

  // ============================================
  // ANNOUNCEMENT DEVICES
  // ============================================
  async listAnnouncementDevices(branchId: string): Promise<AnnouncementDevice[]> {
    return await db
      .select()
      .from(announcementDevices)
      .where(eq(announcementDevices.branchId, branchId))
      .orderBy(asc(announcementDevices.createdAt));
  }

  async getAnnouncementDeviceById(id: string): Promise<AnnouncementDevice | undefined> {
    const rows = await db
      .select()
      .from(announcementDevices)
      .where(eq(announcementDevices.id, id))
      .limit(1);
    return rows[0];
  }

  async getAnnouncementDeviceByToken(token: string): Promise<AnnouncementDevice | undefined> {
    const rows = await db
      .select()
      .from(announcementDevices)
      .where(eq(announcementDevices.deviceToken, token))
      .limit(1);
    return rows[0];
  }

  async createAnnouncementDevice(data: InsertAnnouncementDevice): Promise<AnnouncementDevice> {
    const rows = await db.insert(announcementDevices).values(data).returning();
    return rows[0];
  }

  async updateAnnouncementDevice(id: string, data: Partial<InsertAnnouncementDevice>): Promise<AnnouncementDevice | undefined> {
    const rows = await db
      .update(announcementDevices)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(announcementDevices.id, id))
      .returning();
    return rows[0];
  }

  async deleteAnnouncementDevice(id: string): Promise<void> {
    await db.delete(announcementDevices).where(eq(announcementDevices.id, id));
  }

  async touchAnnouncementDeviceLastSeen(id: string): Promise<void> {
    await db
      .update(announcementDevices)
      .set({ lastSeenAt: new Date() })
      .where(eq(announcementDevices.id, id));
  }

  // ==========================================
  // NOTIFICATION SETTINGS (super admin)
  // ==========================================
  async listNotificationSettings(): Promise<NotificationSetting[]> {
    return await db.select().from(notificationSettings);
  }

  async getNotificationSetting(queueMode: string): Promise<NotificationSetting | undefined> {
    const rows = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.queueMode, queueMode))
      .limit(1);
    return rows[0];
  }

  async upsertNotificationSetting(data: InsertNotificationSetting): Promise<NotificationSetting> {
    const existing = await this.getNotificationSetting(data.queueMode);
    if (existing) {
      const rows = await db
        .update(notificationSettings)
        .set({
          alertSoundUrl: data.alertSoundUrl ?? existing.alertSoundUrl,
          templateEn: data.templateEn ?? existing.templateEn,
          templateAr: data.templateAr ?? existing.templateAr,
          templates: data.templates ?? existing.templates,
          updatedAt: new Date(),
        })
        .where(eq(notificationSettings.queueMode, data.queueMode))
        .returning();
      return rows[0];
    }
    const rows = await db
      .insert(notificationSettings)
      .values({ ...data, updatedAt: new Date() })
      .returning();
    return rows[0];
  }
}

export const storage = new DatabaseStorage();
