import { sql, relations } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  decimal,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================
// ORGANIZATIONS
// ============================================
export const organizations = pgTable("organizations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  pincode: text("pincode"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  logoUrl: text("logo_url"),
  category: text("category"),
  description: text("description"),
  isVerified: boolean("is_verified").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("org_email_idx").on(table.email),
  index("org_city_idx").on(table.city),
  index("org_active_idx").on(table.isActive),
]);

// ============================================
// BRANCHES
// ============================================
export const branches = pgTable("branches", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  pincode: text("pincode"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  phone: text("phone"),
  isActive: boolean("is_active").default(true).notNull(),
  queueStatus: text("queue_status").default("active").notNull(),
  queueMode: text("queue_mode").default("fifo").notNull(),
  notificationMode: text("notification_mode").default("all_alerts").notNull(),
  autoCallNext: boolean("auto_call_next").default(false).notNull(),
  maxQueueSize: integer("max_queue_size").default(100).notNull(),
  defaultSlotDuration: integer("default_slot_duration").default(30).notNull(),
  defaultSlotCapacity: integer("default_slot_capacity").default(3).notNull(),
  displaySettings: jsonb("display_settings").default({}).notNull(),
  apiSettings: jsonb("api_settings").default({}).notNull(),
  announcerUserId: varchar("announcer_user_id", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("branch_org_idx").on(table.organizationId),
  index("branch_active_idx").on(table.isActive),
  index("branch_location_idx").on(table.latitude, table.longitude),
  index("branch_announcer_idx").on(table.announcerUserId),
]);

// ============================================
// SERVICES
// ============================================
export const services = pgTable("services", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  branchId: varchar("branch_id", { length: 36 }).notNull().references(() => branches.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  averageWaitTime: integer("average_wait_time").default(15).notNull(),
  estimatedDuration: integer("estimated_duration").default(20).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  queueStatus: text("queue_status").default("active").notNull(),
  maxDailyCapacity: integer("max_daily_capacity"),
  requiresInPersonRegistration: boolean("requires_in_person_registration").default(false).notNull(),
  inPersonPerimeterMeters: integer("in_person_perimeter_meters").default(100),
  inputFields: jsonb("input_fields").default([]).notNull(),
  serviceSettings: jsonb("service_settings").default({}).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("service_branch_idx").on(table.branchId),
  index("service_active_idx").on(table.isActive),
]);

// ============================================
// DESKS (Service Counters/Windows)
// ============================================
export const desks = pgTable("desks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  serviceId: varchar("service_id", { length: 36 }).notNull().references(() => services.id, { onDelete: "cascade" }),
  branchId: varchar("branch_id", { length: 36 }).notNull().references(() => branches.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  queueStatus: text("queue_status").default("active").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("desk_service_idx").on(table.serviceId),
  index("desk_branch_idx").on(table.branchId),
  index("desk_active_idx").on(table.isActive),
]);

// ============================================
// JOURNEYS (Multi-Stage Queue Configuration)
// ============================================
export const journeys = pgTable("journeys", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  branchId: varchar("branch_id", { length: 36 }).notNull().references(() => branches.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("journey_branch_idx").on(table.branchId),
  index("journey_active_idx").on(table.isActive),
]);

// ============================================
// JOURNEY STAGES
// ============================================
export const journeyStages = pgTable("journey_stages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  journeyId: varchar("journey_id", { length: 36 }).notNull().references(() => journeys.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id", { length: 36 }).references(() => services.id, { onDelete: "set null" }),
  serviceName: text("service_name").notNull(),
  stageOrder: integer("stage_order").notNull(),
  isOptional: boolean("is_optional").default(false).notNull(),
  estimatedDuration: integer("estimated_duration").default(15).notNull(),
}, (table) => [
  index("stage_journey_idx").on(table.journeyId),
  index("stage_order_idx").on(table.journeyId, table.stageOrder),
]);

// ============================================
// CUSTOMERS (End Users)
// ============================================
export const customers = pgTable("customers", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name"),
  email: text("email"),
  phone: text("phone"),
  passwordHash: text("password_hash"),
  profilePictureUrl: text("profile_picture_url"),
  pushToken: text("push_token"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("customer_email_idx").on(table.email),
  index("customer_phone_idx").on(table.phone),
]);

// ============================================
// OTP VERIFICATION
// ============================================
export const otpCodes = pgTable("otp_codes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  phone: text("phone").notNull(),
  code: text("code").notNull(),
  purpose: text("purpose").notNull().default("registration"),
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").default(false).notNull(),
  attempts: integer("attempts").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("otp_phone_idx").on(table.phone),
]);

// ============================================
// ORGANIZATION USERS (Staff)
// ============================================
export const orgUsers = pgTable("org_users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(),
  roleId: varchar("role_id", { length: 36 }),
  branchId: varchar("branch_id", { length: 36 }).references(() => branches.id, { onDelete: "set null" }),
  assignedServiceIds: jsonb("assigned_service_ids").default([]),
  profilePictureUrl: text("profile_picture_url"),
  isActive: boolean("is_active").default(true).notNull(),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("org_user_email_org_idx").on(table.email, table.organizationId),
  index("org_user_org_idx").on(table.organizationId),
  index("org_user_branch_idx").on(table.branchId),
  index("org_user_role_idx").on(table.role),
]);

// ============================================
// ORG USER BRANCHES (Many-to-Many for Location Managers)
// ============================================
export const orgUserBranches = pgTable("org_user_branches", {
  orgUserId: varchar("org_user_id", { length: 36 }).notNull().references(() => orgUsers.id, { onDelete: "cascade" }),
  branchId: varchar("branch_id", { length: 36 }).notNull().references(() => branches.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.orgUserId, table.branchId] }),
  index("oub_user_idx").on(table.orgUserId),
  index("oub_branch_idx").on(table.branchId),
]);

// ============================================
// TICKETS (Queue Entries) - Core table for high volume
// ============================================
export const tickets = pgTable("tickets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  branchId: varchar("branch_id", { length: 36 }).notNull().references(() => branches.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id", { length: 36 }).references(() => services.id, { onDelete: "set null" }),
  customerId: varchar("customer_id", { length: 36 }).references(() => customers.id, { onDelete: "set null" }),
  ticketNumber: varchar("ticket_number", { length: 20 }).notNull(),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  serviceName: text("service_name"),
  position: integer("position").default(0).notNull(),
  status: text("status").default("waiting").notNull(),
  priority: text("priority").default("normal").notNull(),
  source: text("source").default("app").notNull(),
  formData: jsonb("form_data").default({}).notNull(),
  notes: text("notes"),
  skipCount: integer("skip_count").default(0).notNull(),
  callCount: integer("call_count").default(0).notNull(),
  tableNumber: text("table_number"),
  reservationTime: timestamp("reservation_time"),
  journeyId: varchar("journey_id", { length: 36 }).references(() => journeys.id, { onDelete: "set null" }),
  currentStageIndex: integer("current_stage_index"),
  currentStageId: varchar("current_stage_id", { length: 36 }),
  stageHistory: jsonb("stage_history").default([]),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  calledAt: timestamp("called_at"),
  servedAt: timestamp("served_at"),
  completedAt: timestamp("completed_at"),
  holdAt: timestamp("hold_at"),
  arrivedAt: timestamp("arrived_at"),
  acknowledgedAt: timestamp("acknowledged_at"),
  journeyStartedAt: timestamp("journey_started_at"),
  journeyCompletedAt: timestamp("journey_completed_at"),
  estimatedWaitTime: integer("estimated_wait_time").default(0).notNull(),
  actualWaitTime: integer("actual_wait_time"),
  serviceTime: integer("service_time"),
  pushToken: text("push_token"),
  notificationsSent: jsonb("notifications_sent").default([]).notNull(),
  servedBy: varchar("served_by", { length: 36 }).references(() => orgUsers.id, { onDelete: "set null" }),
  deskId: varchar("desk_id", { length: 36 }).references(() => desks.id, { onDelete: "set null" }),
  deskName: text("desk_name"),
  whatsappRefCode: varchar("whatsapp_ref_code", { length: 10 }).unique(),
  whatsappConfirmed: boolean("whatsapp_confirmed").default(false).notNull(),
  whatsappPhone: text("whatsapp_phone"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("ticket_branch_status_idx").on(table.branchId, table.status),
  index("ticket_branch_date_idx").on(table.branchId, table.joinedAt),
  index("ticket_service_idx").on(table.serviceId),
  index("ticket_customer_idx").on(table.customerId),
  index("ticket_status_idx").on(table.status),
  index("ticket_journey_idx").on(table.journeyId),
  index("ticket_number_idx").on(table.ticketNumber),
  index("ticket_joined_at_idx").on(table.joinedAt),
  index("ticket_branch_service_status_idx").on(table.branchId, table.serviceId, table.status),
  index("ticket_whatsapp_ref_idx").on(table.whatsappRefCode),
]);

// ============================================
// RESERVATIONS (Restaurant/Dine-In)
// ============================================
export const reservations = pgTable("reservations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  branchId: varchar("branch_id", { length: 36 }).notNull().references(() => branches.id, { onDelete: "cascade" }),
  customerId: varchar("customer_id", { length: 36 }).references(() => customers.id, { onDelete: "set null" }),
  confirmationCode: varchar("confirmation_code", { length: 20 }).notNull().unique(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  reservationDate: timestamp("reservation_date").notNull(),
  reservationTime: text("reservation_time").notNull(),
  partySize: integer("party_size").default(2).notNull(),
  specialRequests: text("special_requests"),
  status: text("status").default("confirmed").notNull(),
  tableNumber: text("table_number"),
  checkedInAt: timestamp("checked_in_at"),
  ticketId: varchar("ticket_id", { length: 36 }).references(() => tickets.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("reservation_branch_date_idx").on(table.branchId, table.reservationDate),
  index("reservation_customer_idx").on(table.customerId),
  index("reservation_status_idx").on(table.status),
  index("reservation_code_idx").on(table.confirmationCode),
]);

// ============================================
// APPOINTMENTS (Scheduled Bookings)
// ============================================
export const appointments = pgTable("appointments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  branchId: varchar("branch_id", { length: 36 }).notNull().references(() => branches.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id", { length: 36 }).references(() => services.id, { onDelete: "set null" }),
  customerId: varchar("customer_id", { length: 36 }).references(() => customers.id, { onDelete: "set null" }),
  ticketNumber: varchar("ticket_number", { length: 20 }).notNull(),
  confirmationCode: varchar("confirmation_code", { length: 20 }).notNull().unique(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  serviceName: text("service_name"),
  scheduledDate: timestamp("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time").notNull(),
  endTime: text("end_time").notNull(),
  notes: text("notes"),
  formData: jsonb("form_data").default({}),
  status: text("status").default("scheduled").notNull(),
  checkedInAt: timestamp("checked_in_at"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("appointment_branch_date_idx").on(table.branchId, table.scheduledDate),
  index("appointment_customer_idx").on(table.customerId),
  index("appointment_service_idx").on(table.serviceId),
  index("appointment_status_idx").on(table.status),
  index("appointment_code_idx").on(table.confirmationCode),
]);

// ============================================
// OPERATING HOURS
// ============================================
export const operatingHours = pgTable("operating_hours", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  branchId: varchar("branch_id", { length: 36 }).notNull().references(() => branches.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(),
  openTime: text("open_time").notNull(),
  closeTime: text("close_time").notNull(),
  isOpen: boolean("is_open").default(true).notNull(),
}, (table) => [
  index("hours_branch_idx").on(table.branchId),
  uniqueIndex("hours_branch_day_idx").on(table.branchId, table.dayOfWeek),
]);

// ============================================
// BREAK TIMES
// ============================================
export const breakTimes = pgTable("break_times", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  operatingHourId: varchar("operating_hour_id", { length: 36 }).notNull().references(() => operatingHours.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
}, (table) => [
  index("break_hour_idx").on(table.operatingHourId),
]);

// ============================================
// HOLIDAYS
// ============================================
export const holidays = pgTable("holidays", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  branchId: varchar("branch_id", { length: 36 }).notNull().references(() => branches.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  name: text("name").notNull(),
  isRecurring: boolean("is_recurring").default(false).notNull(),
}, (table) => [
  index("holiday_branch_idx").on(table.branchId),
  index("holiday_date_idx").on(table.date),
]);

// ============================================
// BOOKING SLOTS (Capacity Management)
// ============================================
export const bookingSlots = pgTable("booking_slots", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  branchId: varchar("branch_id", { length: 36 }).notNull().references(() => branches.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id", { length: 36 }).references(() => services.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  maxCapacity: integer("max_capacity").default(3).notNull(),
  currentBookings: integer("current_bookings").default(0).notNull(),
  isBlocked: boolean("is_blocked").default(false).notNull(),
}, (table) => [
  index("slot_branch_date_idx").on(table.branchId, table.date),
  index("slot_service_idx").on(table.serviceId),
  uniqueIndex("slot_unique_idx").on(table.branchId, table.serviceId, table.date, table.startTime),
]);

// ============================================
// TICKET COUNTERS (For sequential ticket numbers per branch)
// ============================================
export const ticketCounters = pgTable("ticket_counters", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  branchId: varchar("branch_id", { length: 36 }).notNull().references(() => branches.id, { onDelete: "cascade" }),
  prefix: varchar("prefix", { length: 5 }).notNull(),
  date: timestamp("date").notNull(),
  counter: integer("counter").default(0).notNull(),
}, (table) => [
  uniqueIndex("counter_branch_date_idx").on(table.branchId, table.prefix, table.date),
]);

// ============================================
// DAILY STATS (Aggregated for performance)
// ============================================
export const dailyStats = pgTable("daily_stats", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  branchId: varchar("branch_id", { length: 36 }).notNull().references(() => branches.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  totalServed: integer("total_served").default(0).notNull(),
  totalNoShow: integer("total_no_show").default(0).notNull(),
  totalCancelled: integer("total_cancelled").default(0).notNull(),
  avgWaitTime: integer("avg_wait_time").default(0).notNull(),
  avgServiceTime: integer("avg_service_time").default(0).notNull(),
  peakHour: text("peak_hour"),
  totalBookings: integer("total_bookings").default(0).notNull(),
  totalReservations: integer("total_reservations").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("stats_branch_date_idx").on(table.branchId, table.date),
  index("stats_date_idx").on(table.date),
]);

// ============================================
// SUBSCRIPTION PLANS
// ============================================
export const subscriptionPlans = pgTable("subscription_plans", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  monthlyPrice: integer("monthly_price").default(0).notNull(),
  yearlyPrice: integer("yearly_price").default(0).notNull(),
  currency: text("currency").default("INR").notNull(),
  maxBranches: integer("max_branches").default(1).notNull(),
  maxServicesPerBranch: integer("max_services_per_branch").default(5).notNull(),
  maxStaffUsers: integer("max_staff_users").default(3).notNull(),
  maxDailyTickets: integer("max_daily_tickets").default(100).notNull(),
  features: jsonb("features").default({}).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("plan_slug_idx").on(table.slug),
  index("plan_active_idx").on(table.isActive),
]);

// ============================================
// SUBSCRIPTIONS
// ============================================
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
  planId: varchar("plan_id", { length: 36 }).notNull().references(() => subscriptionPlans.id),
  status: text("status").default("trialing").notNull(),
  billingCycle: text("billing_cycle").default("monthly").notNull(),
  trialStartDate: timestamp("trial_start_date"),
  trialEndDate: timestamp("trial_end_date"),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelledAt: timestamp("cancelled_at"),
  razorpaySubscriptionId: text("razorpay_subscription_id"),
  razorpayCustomerId: text("razorpay_customer_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("sub_org_idx").on(table.organizationId),
  index("sub_plan_idx").on(table.planId),
  index("sub_status_idx").on(table.status),
  index("sub_razorpay_idx").on(table.razorpaySubscriptionId),
]);

// ============================================
// PAYMENTS
// ============================================
export const payments = pgTable("payments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
  subscriptionId: varchar("subscription_id", { length: 36 }).references(() => subscriptions.id, { onDelete: "set null" }),
  amount: integer("amount").notNull(),
  currency: text("currency").default("INR").notNull(),
  status: text("status").default("pending").notNull(),
  razorpayPaymentId: text("razorpay_payment_id"),
  razorpayOrderId: text("razorpay_order_id"),
  razorpaySignature: text("razorpay_signature"),
  paymentMethod: text("payment_method"),
  description: text("description"),
  invoiceNumber: text("invoice_number"),
  receiptUrl: text("receipt_url"),
  failureReason: text("failure_reason"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("payment_org_idx").on(table.organizationId),
  index("payment_sub_idx").on(table.subscriptionId),
  index("payment_status_idx").on(table.status),
  index("payment_razorpay_idx").on(table.razorpayPaymentId),
]);

// ============================================
// RELATIONS
// ============================================
export const organizationsRelations = relations(organizations, ({ many }) => ({
  branches: many(branches),
  orgUsers: many(orgUsers),
  subscriptions: many(subscriptions),
  payments: many(payments),
}));

export const branchesRelations = relations(branches, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [branches.organizationId],
    references: [organizations.id],
  }),
  services: many(services),
  journeys: many(journeys),
  tickets: many(tickets),
  reservations: many(reservations),
  appointments: many(appointments),
  operatingHours: many(operatingHours),
  holidays: many(holidays),
  bookingSlots: many(bookingSlots),
  dailyStats: many(dailyStats),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  branch: one(branches, {
    fields: [services.branchId],
    references: [branches.id],
  }),
  desks: many(desks),
  tickets: many(tickets),
  appointments: many(appointments),
}));

export const desksRelations = relations(desks, ({ one }) => ({
  service: one(services, {
    fields: [desks.serviceId],
    references: [services.id],
  }),
  branch: one(branches, {
    fields: [desks.branchId],
    references: [branches.id],
  }),
}));

export const journeysRelations = relations(journeys, ({ one, many }) => ({
  branch: one(branches, {
    fields: [journeys.branchId],
    references: [branches.id],
  }),
  stages: many(journeyStages),
  tickets: many(tickets),
}));

export const journeyStagesRelations = relations(journeyStages, ({ one }) => ({
  journey: one(journeys, {
    fields: [journeyStages.journeyId],
    references: [journeys.id],
  }),
  service: one(services, {
    fields: [journeyStages.serviceId],
    references: [services.id],
  }),
}));

export const orgUsersRelations = relations(orgUsers, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [orgUsers.organizationId],
    references: [organizations.id],
  }),
  branch: one(branches, {
    fields: [orgUsers.branchId],
    references: [branches.id],
  }),
  assignedBranches: many(orgUserBranches),
}));

export const ticketsRelations = relations(tickets, ({ one }) => ({
  branch: one(branches, {
    fields: [tickets.branchId],
    references: [branches.id],
  }),
  service: one(services, {
    fields: [tickets.serviceId],
    references: [services.id],
  }),
  customer: one(customers, {
    fields: [tickets.customerId],
    references: [customers.id],
  }),
  journey: one(journeys, {
    fields: [tickets.journeyId],
    references: [journeys.id],
  }),
  servedByUser: one(orgUsers, {
    fields: [tickets.servedBy],
    references: [orgUsers.id],
  }),
}));

export const reservationsRelations = relations(reservations, ({ one }) => ({
  branch: one(branches, {
    fields: [reservations.branchId],
    references: [branches.id],
  }),
  customer: one(customers, {
    fields: [reservations.customerId],
    references: [customers.id],
  }),
  ticket: one(tickets, {
    fields: [reservations.ticketId],
    references: [tickets.id],
  }),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  branch: one(branches, {
    fields: [appointments.branchId],
    references: [branches.id],
  }),
  service: one(services, {
    fields: [appointments.serviceId],
    references: [services.id],
  }),
  customer: one(customers, {
    fields: [appointments.customerId],
    references: [customers.id],
  }),
}));

export const subscriptionPlansRelations = relations(subscriptionPlans, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [subscriptions.organizationId],
    references: [organizations.id],
  }),
  plan: one(subscriptionPlans, {
    fields: [subscriptions.planId],
    references: [subscriptionPlans.id],
  }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  organization: one(organizations, {
    fields: [payments.organizationId],
    references: [organizations.id],
  }),
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id],
  }),
}));

// ============================================
// ROLES (Platform-wide role templates)
// ============================================
export const roles = pgTable("roles", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").default(false).notNull(),
  scope: text("scope").default("organization").notNull(),
  // Null for system / platform-wide roles. Set for custom roles created by
  // an organization owner so each org's custom roles are isolated.
  organizationId: varchar("organization_id", { length: 36 }).references(() => organizations.id, { onDelete: "cascade" }),
  // Hierarchy rank — higher number = more privileges. A caller can only
  // create / edit / delete / view roles AND users with a strictly LOWER rank.
  // System defaults: super_admin=1000, owner=100, admin=80, location_manager=60,
  // floor_manager=40, front_desk=20. Custom roles default to 30.
  rank: integer("rank").default(30).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("role_key_idx").on(table.key),
  index("role_org_idx").on(table.organizationId),
]);

// ============================================
// ROLE PERMISSIONS (assigned permission keys per role)
// ============================================
export const rolePermissions = pgTable("role_permissions", {
  roleId: varchar("role_id", { length: 36 }).notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionKey: text("permission_key").notNull(),
}, (table) => [
  primaryKey({ columns: [table.roleId, table.permissionKey] }),
  index("role_perms_role_idx").on(table.roleId),
]);

// ============================================
// AUDIT LOGS (Super Admin actions, role changes, etc.)
// ============================================
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  actorId: text("actor_id"),
  actorEmail: text("actor_email"),
  actorRole: text("actor_role"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  targetLabel: text("target_label"),
  diff: jsonb("diff"),
  ip: text("ip"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("audit_action_idx").on(table.action),
  index("audit_created_idx").on(table.createdAt),
]);

export const rolesRelations = relations(roles, ({ many }) => ({
  permissions: many(rolePermissions),
  users: many(orgUsers),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePermissions.roleId],
    references: [roles.id],
  }),
}));

export const insertRoleSchema = createInsertSchema(roles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Role = typeof roles.$inferSelect;
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// ============================================
// SWAP REQUESTS
// ============================================
export const swapRequests = pgTable("swap_requests", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  requesterTicketId: varchar("requester_ticket_id", { length: 36 }).notNull().references(() => tickets.id, { onDelete: "cascade" }),
  targetTicketId: varchar("target_ticket_id", { length: 36 }).references(() => tickets.id, { onDelete: "cascade" }),
  branchId: varchar("branch_id", { length: 36 }).notNull().references(() => branches.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id", { length: 36 }).references(() => services.id, { onDelete: "set null" }),
  requesterPosition: integer("requester_position").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  isPremium: boolean("is_premium").default(false).notNull(),
  premiumAmount: decimal("premium_amount", { precision: 10, scale: 2 }),
  acceptedByTicketId: varchar("accepted_by_ticket_id", { length: 36 }).references(() => tickets.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"),
}, (table) => [
  index("swap_requester_idx").on(table.requesterTicketId),
  index("swap_branch_idx").on(table.branchId),
  index("swap_status_idx").on(table.status),
]);

export const swapRequestsRelations = relations(swapRequests, ({ one }) => ({
  requesterTicket: one(tickets, {
    fields: [swapRequests.requesterTicketId],
    references: [tickets.id],
    relationName: "requesterSwaps",
  }),
  targetTicket: one(tickets, {
    fields: [swapRequests.targetTicketId],
    references: [tickets.id],
    relationName: "targetSwaps",
  }),
  acceptedByTicket: one(tickets, {
    fields: [swapRequests.acceptedByTicketId],
    references: [tickets.id],
    relationName: "acceptedSwaps",
  }),
  branch: one(branches, {
    fields: [swapRequests.branchId],
    references: [branches.id],
  }),
  service: one(services, {
    fields: [swapRequests.serviceId],
    references: [services.id],
  }),
}));

export const insertSwapRequestSchema = createInsertSchema(swapRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ============================================
// SCHEMAS FOR VALIDATION
// ============================================
export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBranchSchema = createInsertSchema(branches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertServiceSchema = createInsertSchema(services).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTicketSchema = createInsertSchema(tickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReservationSchema = createInsertSchema(reservations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDeskSchema = createInsertSchema(desks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAppointmentSchema = createInsertSchema(appointments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOrgUserSchema = createInsertSchema(orgUsers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ============================================
// TYPE EXPORTS
// ============================================
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;

export type Branch = typeof branches.$inferSelect;
export type InsertBranch = z.infer<typeof insertBranchSchema>;

export type Service = typeof services.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;

export type Journey = typeof journeys.$inferSelect;
export type JourneyStage = typeof journeyStages.$inferSelect;

export type Ticket = typeof tickets.$inferSelect;
export type InsertTicket = z.infer<typeof insertTicketSchema>;

export type Reservation = typeof reservations.$inferSelect;
export type InsertReservation = z.infer<typeof insertReservationSchema>;

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;

export type OrgUser = typeof orgUsers.$inferSelect;
export type InsertOrgUser = z.infer<typeof insertOrgUserSchema>;

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type Desk = typeof desks.$inferSelect;
export type InsertDesk = z.infer<typeof insertDeskSchema>;

export type OperatingHour = typeof operatingHours.$inferSelect;
export type BreakTime = typeof breakTimes.$inferSelect;
export type Holiday = typeof holidays.$inferSelect;
export type BookingSlot = typeof bookingSlots.$inferSelect;
export type DailyStat = typeof dailyStats.$inferSelect;

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;

export type SwapRequest = typeof swapRequests.$inferSelect;
export type InsertSwapRequest = z.infer<typeof insertSwapRequestSchema>;

// ============================================
// ANNOUNCEMENT DEVICES (Branch reception speakers)
// ============================================
export const announcementDevices = pgTable("announcement_devices", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  branchId: varchar("branch_id", { length: 36 }).notNull().references(() => branches.id, { onDelete: "cascade" }),
  deviceName: text("device_name").notNull(),
  deviceToken: varchar("device_token", { length: 64 }).notNull().unique(),
  language: varchar("language", { length: 8 }).default("en").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("announce_dev_branch_idx").on(table.branchId),
  uniqueIndex("announce_dev_token_idx").on(table.deviceToken),
]);

export type AnnouncementDevice = typeof announcementDevices.$inferSelect;
export type InsertAnnouncementDevice = typeof announcementDevices.$inferInsert;

// ============================================
// SUPPORT TICKETS (SA support queue)
// ============================================
export const supportTickets = pgTable("support_tickets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id", { length: 36 }).references(() => organizations.id, { onDelete: "set null" }),
  ticketNumber: text("ticket_number").notNull().unique(),
  subject: text("subject").notNull(),
  description: text("description"),
  priority: text("priority").default("medium").notNull(),
  status: text("status").default("open").notNull(),
  assignee: text("assignee"),
  reportedByEmail: text("reported_by_email"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => [
  index("support_tickets_org_idx").on(table.organizationId),
  index("support_tickets_status_idx").on(table.status),
  index("support_tickets_priority_idx").on(table.priority),
]);

// ============================================
// WHATSAPP TEMPLATE OVERRIDES
// ============================================
export const whatsappOverrides = pgTable("whatsapp_overrides", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  mode: varchar("mode", { length: 32 }).notNull(),
  triggerKey: varchar("trigger_key", { length: 64 }).notNull(),
  language: varchar("language", { length: 8 }).default("en").notNull(),
  content: text("content").notNull(),
  updatedBy: varchar("updated_by", { length: 36 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("whatsapp_overrides_unique").on(table.mode, table.triggerKey, table.language),
]);

// ============================================
// SYSTEM ERRORS (captured by error handler)
// ============================================
export const systemErrors = pgTable("system_errors", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  level: text("level").default("ERROR").notNull(),
  source: text("source").notNull(),
  message: text("message").notNull(),
  stack: text("stack"),
  context: jsonb("context").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("system_errors_created_idx").on(table.createdAt),
]);

// ============================================
// PRICING FEATURES (matrix of features that plans may unlock)
// ============================================
export const pricingFeatures = pgTable("pricing_features", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  label: text("label").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const planFeatures = pgTable("plan_features", {
  planId: varchar("plan_id", { length: 36 }).notNull().references(() => subscriptionPlans.id, { onDelete: "cascade" }),
  featureId: varchar("feature_id", { length: 36 }).notNull().references(() => pricingFeatures.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.planId, table.featureId] }),
  index("plan_features_feature_idx").on(table.featureId),
]);

export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = typeof supportTickets.$inferInsert;
export type WhatsappOverride = typeof whatsappOverrides.$inferSelect;
export type InsertWhatsappOverride = typeof whatsappOverrides.$inferInsert;
export type SystemError = typeof systemErrors.$inferSelect;
export type InsertSystemError = typeof systemErrors.$inferInsert;
export type PricingFeature = typeof pricingFeatures.$inferSelect;
export type InsertPricingFeature = typeof pricingFeatures.$inferInsert;
export type PlanFeature = typeof planFeatures.$inferSelect;

// ============================================
// NOTIFICATION SETTINGS (Super Admin — per queue type)
// ============================================
export const notificationSettings = pgTable("notification_settings", {
  queueMode: varchar("queue_mode", { length: 32 }).primaryKey(),
  alertSoundUrl: text("alert_sound_url"),
  templateEn: text("template_en"),
  templateAr: text("template_ar"),
  // Per-language announcement templates keyed by language code (e.g. {en, ar, fr, es, ...}).
  // The legacy templateEn/templateAr columns are kept for backward compat — when the JSON
  // map has no entry for "en"/"ar" we fall back to those columns.
  templates: jsonb("templates").$type<Record<string, string>>(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type NotificationSetting = typeof notificationSettings.$inferSelect;
export type InsertNotificationSetting = typeof notificationSettings.$inferInsert;

// ============================================
// BRANCH OPERATIONS ALERTS (WhatsApp alerts to org staff)
// ============================================
export const branchAlertRecipients = pgTable("branch_alert_recipients", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
  branchId: varchar("branch_id", { length: 36 }).notNull().references(() => branches.id, { onDelete: "cascade" }),
  // Optional link to an org user — required if sendViaPush is true (push goes to this user's mobile devices).
  userId: varchar("user_id", { length: 36 }).references(() => orgUsers.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  phoneNumber: text("phone_number"),
  // Channels
  sendViaWhatsapp: boolean("send_via_whatsapp").default(true).notNull(),
  sendViaPush: boolean("send_via_push").default(false).notNull(),
  // Per-trigger toggles
  alertOnQueueOpenClose: boolean("alert_on_queue_open_close").default(true).notNull(),
  alertOnWaitingCountMax: boolean("alert_on_waiting_count_max").default(true).notNull(),
  alertOnAvgWaitTimeMax: boolean("alert_on_avg_wait_time_max").default(true).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("alert_rcpt_branch_idx").on(table.branchId),
  index("alert_rcpt_org_idx").on(table.organizationId),
  index("alert_rcpt_user_idx").on(table.userId),
]);

export type BranchAlertRecipient = typeof branchAlertRecipients.$inferSelect;
export type InsertBranchAlertRecipient = typeof branchAlertRecipients.$inferInsert;

// Hysteresis state per (branch, triggerKind, scopeId).
// triggerKind: "waiting_count" | "avg_wait_time" | "queue_status"
// scopeId: serviceId for queue_status (per-service); empty string ("") for branch-wide triggers.
export const branchAlertState = pgTable("branch_alert_state", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  branchId: varchar("branch_id", { length: 36 }).notNull().references(() => branches.id, { onDelete: "cascade" }),
  triggerKind: varchar("trigger_kind", { length: 32 }).notNull(),
  scopeId: varchar("scope_id", { length: 36 }).default("").notNull(),
  isTriggered: boolean("is_triggered").default(false).notNull(),
  lastValue: integer("last_value"),
  lastTriggeredAt: timestamp("last_triggered_at"),
  lastClearedAt: timestamp("last_cleared_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("alert_state_unique_idx").on(table.branchId, table.triggerKind, table.scopeId),
  index("alert_state_branch_idx").on(table.branchId),
]);

export type BranchAlertState = typeof branchAlertState.$inferSelect;
export type InsertBranchAlertState = typeof branchAlertState.$inferInsert;

// Push tokens registered by org users (mobile dashboard / notifications app).
export const orgUserPushTokens = pgTable("org_user_push_tokens", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => orgUsers.id, { onDelete: "cascade" }),
  pushToken: text("push_token").notNull(),
  deviceLabel: text("device_label"),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("org_user_push_token_unique_idx").on(table.pushToken),
  index("org_user_push_token_user_idx").on(table.userId),
]);

export type OrgUserPushToken = typeof orgUserPushTokens.$inferSelect;
export type InsertOrgUserPushToken = typeof orgUserPushTokens.$inferInsert;
