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
  country: text("country"),
  state: text("state"),
  city: text("city"),
  pincode: text("pincode"),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  logoUrl: text("logo_url"),
  category: text("category"),
  description: text("description"),
  // IANA timezone (e.g. "Asia/Kolkata", "America/New_York") derived from the
  // country (and city for multi-TZ countries) the owner picked at signup.
  // Used as the default for any branches created under this org so that
  // working hours / breaks / holidays / booking slots are interpreted in
  // the right wall-clock locale. Branches may override this per-branch.
  // Nullable on legacy rows; falls back to "UTC" in code when missing.
  timezone: text("timezone"),
  // Account flavour chosen at For-Business signup:
  //   "organization" (default) — the classic queue/appointment product.
  //   "event"                  — event-management product: branches act as
  //                              event Locations (queueMode "events"), the
  //                              app shell shows event sections only, and
  //                              staff use the event role set (Organizer /
  //                              Security / Billing / Parking / Support).
  // Existing rows keep "organization" via the default, so legacy accounts
  // are unaffected.
  accountType: text("account_type").default("organization").notNull(),
  isVerified: boolean("is_verified").default(false).notNull(),
  // Email-verification token issued on registration. Stored as a single-use
  // opaque random string; consumed by GET /api/organizations/verify-email/:token
  // which sets is_verified = true and clears the token. Length 64 chars to
  // accommodate 32 random bytes hex-encoded.
  verificationToken: varchar("verification_token", { length: 64 }),
  verificationTokenExpiresAt: timestamp("verification_token_expires_at"),
  verificationOtpAttempts: integer("verification_otp_attempts").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  passwordHash: text("password_hash").notNull(),
  // Master switch for the AI wait-time prediction engine. When TRUE
  // (default), tickets joined under this org get a learned ETA in
  // `tickets.estimatedWaitTime` + `tickets.predictedServiceAt`, the
  // customer app + WhatsApp/push notifications surface that ETA, and
  // completed tickets feed back into `wait_time_stats` to keep the
  // predictor improving. When FALSE, the system falls back to the
  // legacy static `service.averageWaitTime * position` math and no
  // learning samples are recorded.
  aiWaitPredictionEnabled: boolean("ai_wait_prediction_enabled").default(true).notNull(),
  // Running tally of billable WhatsApp messages we have sent on behalf of
  // this organization (incremented once per successful Cloud API send). Event
  // accounts are billed on this count × the super-admin WhatsApp unit rate
  // (system_settings key "whatsapp_billing"). Legacy rows default to 0.
  whatsappMessageCount: integer("whatsapp_message_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("org_email_idx").on(table.email),
  index("org_city_idx").on(table.city),
  index("org_active_idx").on(table.isActive),
  index("org_verification_token_idx").on(table.verificationToken),
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
  // IANA timezone (e.g. "Asia/Kolkata", "America/New_York"). All
  // schedule-driven gating (working hours, breaks, holidays) is computed
  // in this timezone so the customer-facing copy matches the branch's
  // wall-clock time, not the server's UTC. Defaults to IST since the
  // primary user base is India; admins can change it from the dashboard.
  timezone: text("timezone").default("Asia/Kolkata").notNull(),
  // When true, the manually-set queueStatus above wins and the
  // working-hours / holiday / break schedule is IGNORED for accept/reject
  // decisions. When false (default), the schedule auto-closes the branch
  // outside operating hours / on holidays. Owners flip this to "force open"
  // for a one-off late evening, demo day, etc.
  scheduleOverride: boolean("schedule_override").default(false).notNull(),
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
  // Absolute timestamp the AI predictor expects this ticket to start
  // being served. NULL when the org has disabled the AI predictor or
  // no learning samples / fallback service avg are available yet.
  // Recomputed in lockstep with `estimatedWaitTime` whenever the
  // queue ahead of this ticket changes (call/serve/complete/no_show/cancel)
  // so the customer app + notifications can show a wall-clock ETA.
  predictedServiceAt: timestamp("predicted_service_at"),
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
  preferredLanguage: varchar("preferred_language", { length: 10 }).default("en"),
  qrToken: varchar("qr_token", { length: 64 }).unique(),
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
  // Scheduled plan change (downgrade): planId/billingCycle stay on the
  // current plan until pendingChangeAt arrives, at which point a lazy
  // applyPendingChangeIfDue swap moves the org onto pendingPlanId. Set to
  // currentPeriodEnd so the customer keeps everything they paid for.
  pendingPlanId: varchar("pending_plan_id", { length: 36 }).references(() => subscriptionPlans.id),
  pendingBillingCycle: text("pending_billing_cycle"),
  pendingChangeAt: timestamp("pending_change_at"),
  // Authoritative server-side pending-payment intent populated by
  // /change-plan and consumed by /verify-payment. Kept on the
  // subscription row (not echoed via the client) to prevent tampering
  // with the order id, amount, or new period dates between the two
  // endpoints. All four fields are cleared together by /verify-payment
  // (success), /cancel-pending-change, or by issuing a new /change-plan.
  pendingOrderId: text("pending_order_id"),
  pendingAmount: integer("pending_amount"),
  pendingPeriodStart: timestamp("pending_period_start"),
  pendingPeriodEnd: timestamp("pending_period_end"),
  razorpaySubscriptionId: text("razorpay_subscription_id"),
  razorpayCustomerId: text("razorpay_customer_id"),
  // Tracks the most recent expiry-reminder bucket (7, 3, or 1 days remaining)
  // already emailed for the current period, so the daily scheduler doesn't
  // double-send. Reset back to NULL whenever currentPeriodEnd / trialEndDate
  // is extended (new period starts).
  lastReminderDayBucket: integer("last_reminder_day_bucket"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("sub_org_idx").on(table.organizationId),
  index("sub_plan_idx").on(table.planId),
  index("sub_status_idx").on(table.status),
  index("sub_razorpay_idx").on(table.razorpaySubscriptionId),
  index("sub_pending_change_idx").on(table.pendingChangeAt),
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
  // ── Invoice snapshot fields (immutable per payment) ──
  // We freeze the plan/cycle/period at capture time so the invoice
  // PDF reflects what the customer actually paid for, not whatever
  // the subscription has rolled over to since. Nullable so legacy
  // rows (pre-introduction) keep working — the PDF renderer falls
  // back to current subscription/plan for those.
  planSnapshotName: text("plan_snapshot_name"),
  planSnapshotId: varchar("plan_snapshot_id", { length: 36 }),
  billingCycleSnapshot: text("billing_cycle_snapshot"),
  periodStartSnapshot: timestamp("period_start_snapshot"),
  periodEndSnapshot: timestamp("period_end_snapshot"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("payment_org_idx").on(table.organizationId),
  index("payment_sub_idx").on(table.subscriptionId),
  index("payment_status_idx").on(table.status),
  // Razorpay payment IDs are globally unique. Enforcing uniqueness here
  // makes /verify-payment idempotent at the DB layer: a replayed verify
  // call either returns the existing row or fails fast on the unique
  // violation, never produces duplicate captured invoices.
  uniqueIndex("payment_razorpay_payment_id_unique").on(table.razorpayPaymentId),
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
  // Optional service scope. NULL = device receives announcements for ALL
  // services at the branch. When set, the device only receives calls for
  // tickets belonging to that service. Lets a single branch run multiple
  // independent TV/audio displays (e.g. one per counter group).
  serviceId: varchar("service_id", { length: 36 }).references(() => services.id, { onDelete: "set null" }),
  deviceName: text("device_name").notNull(),
  deviceToken: varchar("device_token", { length: 64 }).notNull(),
  language: varchar("language", { length: 8 }).default("en").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("announce_dev_branch_idx").on(table.branchId),
  index("announce_dev_service_idx").on(table.serviceId),
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

// ============================================
// SUPPORT TICKET MESSAGES (chat thread)
// ============================================
export const supportTicketMessages = pgTable("support_ticket_messages", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id", { length: 36 }).notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  // 'org' = sent by an organisation admin/owner; 'support' = sent by a Replit super-admin (tech support).
  senderType: varchar("sender_type", { length: 16 }).notNull(),
  senderName: text("sender_name"),
  senderEmail: text("sender_email"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("support_ticket_messages_ticket_idx").on(table.ticketId),
  index("support_ticket_messages_created_idx").on(table.createdAt),
]);

export type SupportTicketMessage = typeof supportTicketMessages.$inferSelect;
export type InsertSupportTicketMessage = typeof supportTicketMessages.$inferInsert;
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
// SYSTEM SETTINGS (Super Admin — global key/value flags)
// ============================================
// Generic key/value store for platform-wide flags managed by the super admin.
// Use this for booleans / small JSON blobs that don't deserve their own table.
// Current keys:
//   - "customer_app_login_enabled" (boolean) — when false, the mobile app
//     hides the customer WhatsApp-OTP login and shows the organisation
//     login screen instead.
export const systemSettings = pgTable("system_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: jsonb("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;

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

// ============================================
// WAIT TIME STATS (AI predictor learning store)
// ============================================
// One row per (branchId, serviceId, hourOfWeek) cell. Holds an
// exponentially-weighted moving average of the *actual* service
// duration observed for that cell, plus a sample count. Updated on
// every ticket completion via `wait-prediction.ts:recordCompletion`.
// The predictor reads `avgServiceMs` for the current hour-of-week
// (with neighbor-hour fallback if the cell is empty) to compute a
// learned ETA for newly-joining tickets.
//
// hourOfWeek is 0..167 where 0 = Sunday 00:00 in the branch timezone.
// EMA alpha = 0.1, so older samples decay slowly and one bad outlier
// can't wreck the prediction.
export const waitTimeStats = pgTable("wait_time_stats", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  branchId: varchar("branch_id", { length: 36 }).notNull().references(() => branches.id, { onDelete: "cascade" }),
  serviceId: varchar("service_id", { length: 36 }).notNull().references(() => services.id, { onDelete: "cascade" }),
  hourOfWeek: integer("hour_of_week").notNull(),
  avgServiceMs: integer("avg_service_ms").notNull(),
  avgWaitMs: integer("avg_wait_ms"),
  sampleCount: integer("sample_count").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("wait_stats_cell_idx").on(table.branchId, table.serviceId, table.hourOfWeek),
  index("wait_stats_branch_service_idx").on(table.branchId, table.serviceId),
]);

export type WaitTimeStat = typeof waitTimeStats.$inferSelect;
export type InsertWaitTimeStat = typeof waitTimeStats.$inferInsert;

// ============================================
// EVENTS QUEUE MODE
// ============================================
// One row per configured event. A branch running the "events" queueMode
// owns exactly one active event at a time (organizers can still keep past
// events around for history/reporting). All customer-facing branding
// (banner/logo/gallery/venue map) and the registration fee live here, and
// are reused across the landing page, the QR ticket, the dashboard, and
// WhatsApp messages.
export const events = pgTable("events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  branchId: varchar("branch_id", { length: 36 }).notNull().references(() => branches.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  venue: text("venue"),
  googleMapsLink: text("google_maps_link"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  // Wall-clock "HH:MM" in the branch timezone — mirrors the operatingHours
  // pattern used elsewhere rather than storing per-day rows, since events
  // run the same hours every day of the event window.
  operatingHoursStart: text("operating_hours_start").default("09:00").notNull(),
  operatingHoursEnd: text("operating_hours_end").default("21:00").notNull(),
  slotDurationMinutes: integer("slot_duration_minutes").default(30).notNull(),
  maxCapacityPerSlot: integer("max_capacity_per_slot").default(50).notNull(),
  // Max total guests (the registrant + their family/friends) allowed per
  // single registration. Enforced both in the customer-facing guest stepper
  // and server-side on submission.
  maxGuestsPerRegistration: integer("max_guests_per_registration").default(10).notNull(),
  // Registration fee (advance amount) in paise, matching payments.amount.
  registrationFee: integer("registration_fee").default(0).notNull(),
  termsAndConditions: text("terms_and_conditions"),
  faqs: jsonb("faqs").$type<{ question: string; answer: string }[]>().default([]).notNull(),
  supportContact: text("support_contact"),
  bannerUrl: text("banner_url"),
  logoUrl: text("logo_url"),
  galleryUrls: jsonb("gallery_urls").$type<string[]>().default([]).notNull(),
  venueMapUrl: text("venue_map_url"),
  // Organizer-chosen branding for the public registration page. Any field
  // left null falls back to the platform default (magenta theme, Inter
  // font) in the public event shape / landing page.
  brandPrimaryColor: text("brand_primary_color"),
  brandButtonColor: text("brand_button_color"),
  brandFontFamily: text("brand_font_family"),
  // Organizer-declared WhatsApp template overrides, keyed by trigger
  // (e.g. "ticket", "reminder_day", "reminder_hour", "slot_active",
  // "thank_you_feedback"). Falls back to shared/wa-templates.ts defaults.
  messageTemplates: jsonb("message_templates").$type<Record<string, string>>().default({}).notNull(),
  // Manual parking capacity counter (no vehicle-level tracking) per the
  // Parking staff dashboard requirement.
  parkingTotalSpaces: integer("parking_total_spaces").default(0).notNull(),
  parkingOccupied: integer("parking_occupied").default(0).notNull(),
  // Per-slot capacity overrides keyed "YYYY-MM-DD|HH:MM" → capacity. A slot
  // without an entry falls back to maxCapacityPerSlot. Organizers edit these
  // from the event setup page; the public registration flow resolves the
  // effective capacity as (override ?? maxCapacityPerSlot).
  slotCapacityOverrides: jsonb("slot_capacity_overrides").$type<Record<string, number>>().default({}).notNull(),
  // draft | published | paused | ended. "paused" temporarily blocks new
  // public registrations (landing shows a paused banner) while staff
  // scanning of already-issued tickets continues to work.
  status: text("status").default("draft").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("event_branch_idx").on(table.branchId),
  index("event_org_idx").on(table.organizationId),
  index("event_status_idx").on(table.status),
]);

export type Event = typeof events.$inferSelect;
export type InsertEvent = typeof events.$inferInsert;

// One row per customer registration/ticket. `status` is the single source
// of truth for the full journey stated in the spec (registration_started
// through feedback_submitted) — every transition is additionally appended
// to eventStageLog below for a real-time, permanent audit trail.
export const eventRegistrations = pgTable("event_registrations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id", { length: 36 }).notNull().references(() => events.id, { onDelete: "cascade" }),
  // The "Location" the customer chose (a services row scoped to the event's
  // branch). Nullable for legacy rows / single-location events. Slots,
  // capacity, registration fee, and custom input fields all resolve from this
  // location (falling back to the event-level defaults when absent).
  locationId: varchar("location_id", { length: 36 }).references(() => services.id, { onDelete: "set null" }),
  // Values entered for the chosen location's custom input fields, keyed by
  // field id.
  formData: jsonb("form_data").$type<Record<string, unknown>>().default({}).notNull(),
  bookingId: varchar("booking_id", { length: 20 }),
  qrToken: varchar("qr_token", { length: 64 }),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerEmail: text("customer_email"),
  // Language the customer selected at the moment of submission (see
  // shared/languages.ts for the supported-language catalog). Drives which
  // language all downstream WhatsApp/email communications for this
  // registration are sent in, and is looked up by phone number to
  // pre-select the switcher on a future registration.
  preferredLanguage: text("preferred_language").default("en").notNull(),
  familyMembersCount: integer("family_members_count").default(0).notNull(),
  // Set when the customer requests priority access for an infant, senior
  // citizen, or pregnant visitor. Used to surface a clear, privacy-respecting
  // marker on the ticket shown at entry.
  priorityAccess: boolean("priority_access").default(false).notNull(),
  slotDate: text("slot_date").notNull(),
  slotTime: text("slot_time").notNull(),
  status: text("status").default("registration_started").notNull(),
  paymentId: varchar("payment_id", { length: 36 }).references(() => payments.id, { onDelete: "set null" }),
  amountPaid: integer("amount_paid").default(0).notNull(),
  ticketImageUrl: text("ticket_image_url"),
  arrivedAt: timestamp("arrived_at"),
  checkedInAt: timestamp("checked_in_at"),
  exitedAt: timestamp("exited_at"),
  visitDurationMinutes: integer("visit_duration_minutes"),
  invalidScanAttempts: integer("invalid_scan_attempts").default(0).notNull(),
  duplicateEntryAttempts: integer("duplicate_entry_attempts").default(0).notNull(),
  // One-shot flags so the reminder scheduler never double-sends.
  reminderDaySentAt: timestamp("reminder_day_sent_at"),
  reminderHourSentAt: timestamp("reminder_hour_sent_at"),
  slotActiveSentAt: timestamp("slot_active_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("event_reg_event_idx").on(table.eventId),
  uniqueIndex("event_reg_booking_id_unique").on(table.bookingId),
  uniqueIndex("event_reg_qr_token_unique").on(table.qrToken),
  index("event_reg_status_idx").on(table.status),
  index("event_reg_slot_idx").on(table.eventId, table.slotDate, table.slotTime),
  index("event_reg_phone_idx").on(table.customerPhone),
]);

export type EventRegistration = typeof eventRegistrations.$inferSelect;
export type InsertEventRegistration = typeof eventRegistrations.$inferInsert;

// Secure ticket stock prepared by an organizer before customer details are
// known. These rows deliberately do not create registrations or reserve slot
// capacity; an authorized desk registration atomically consumes one when it
// assigns the ticket to an attendee.
export const eventPreprintedTickets = pgTable("event_preprinted_tickets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id", { length: 36 }).notNull().references(() => events.id, { onDelete: "cascade" }),
  batchCode: varchar("batch_code", { length: 32 }).notNull(),
  bookingId: varchar("booking_id", { length: 20 }).notNull(),
  qrToken: varchar("qr_token", { length: 64 }).notNull(),
  // available | assigned | voided. The status is enforced again at assignment
  // time so one printed QR can never become two registrations.
  status: text("status").default("available").notNull(),
  assignedRegistrationId: varchar("assigned_registration_id", { length: 36 }).references(() => eventRegistrations.id, { onDelete: "set null" }),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).references(() => orgUsers.id, { onDelete: "set null" }),
  assignedByUserId: varchar("assigned_by_user_id", { length: 36 }).references(() => orgUsers.id, { onDelete: "set null" }),
  voidedByUserId: varchar("voided_by_user_id", { length: 36 }).references(() => orgUsers.id, { onDelete: "set null" }),
  printedAt: timestamp("printed_at"),
  assignedAt: timestamp("assigned_at"),
  voidedAt: timestamp("voided_at"),
  voidReason: text("void_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("event_preprinted_event_idx").on(table.eventId),
  index("event_preprinted_batch_idx").on(table.eventId, table.batchCode),
  index("event_preprinted_status_idx").on(table.eventId, table.status),
  uniqueIndex("event_preprinted_booking_unique").on(table.bookingId),
  uniqueIndex("event_preprinted_token_unique").on(table.qrToken),
]);

export type EventPreprintedTicket = typeof eventPreprintedTickets.$inferSelect;
export type InsertEventPreprintedTicket = typeof eventPreprintedTickets.$inferInsert;

// The authoritative, shared namespace for every human-readable event ticket
// code. Individual registration/inventory table indexes cannot protect against
// a collision between those two tables; this primary key can.
export const eventTicketIdentifiers = pgTable("event_ticket_identifiers", {
  ticketId: varchar("ticket_id", { length: 20 }).primaryKey(),
  eventId: varchar("event_id", { length: 36 }).notNull().references(() => events.id, { onDelete: "cascade" }),
  // generated | preprinted
  ticketKind: text("ticket_kind").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("event_ticket_identifier_event_idx").on(table.eventId),
  index("event_ticket_identifier_kind_idx").on(table.ticketKind),
]);

export type EventTicketIdentifier = typeof eventTicketIdentifiers.$inferSelect;
export type InsertEventTicketIdentifier = typeof eventTicketIdentifiers.$inferInsert;

// Append-only audit log — one row per stage transition, satisfying the
// "complete audit logs" requirement independent of whatever the current
// eventRegistrations.status happens to be.
export const eventStageLog = pgTable("event_stage_log", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  registrationId: varchar("registration_id", { length: 36 }).notNull().references(() => eventRegistrations.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("event_stage_log_reg_idx").on(table.registrationId),
  index("event_stage_log_stage_idx").on(table.stage),
  index("event_stage_log_created_idx").on(table.createdAt),
]);

export type EventStageLogEntry = typeof eventStageLog.$inferSelect;
export type InsertEventStageLogEntry = typeof eventStageLog.$inferInsert;

// One feedback submission per registration (post-exit thank-you survey).
export const eventFeedback = pgTable("event_feedback", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  registrationId: varchar("registration_id", { length: 36 }).notNull().references(() => eventRegistrations.id, { onDelete: "cascade" }),
  overallRating: integer("overall_rating").notNull(),
  crowdManagementRating: integer("crowd_management_rating"),
  staffBehaviorRating: integer("staff_behavior_rating"),
  organizationRating: integer("organization_rating"),
  billingRating: integer("billing_rating"),
  suggestions: text("suggestions"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("event_feedback_reg_unique").on(table.registrationId),
]);

export type EventFeedback = typeof eventFeedback.$inferSelect;
export type InsertEventFeedback = typeof eventFeedback.$inferInsert;

// One redemption per registration — the unique index is what makes
// "prevent duplicate redemption" enforceable at the DB layer, not just in
// application logic.
export const eventBillingRedemptions = pgTable("event_billing_redemptions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  registrationId: varchar("registration_id", { length: 36 }).notNull().references(() => eventRegistrations.id, { onDelete: "cascade" }),
  invoiceAmount: integer("invoice_amount").notNull(),
  advanceRedeemed: integer("advance_redeemed").notNull(),
  finalAmountDue: integer("final_amount_due").notNull(),
  redeemedByUserId: varchar("redeemed_by_user_id", { length: 36 }).references(() => orgUsers.id, { onDelete: "set null" }),
  redeemedAt: timestamp("redeemed_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("event_billing_redemption_reg_unique").on(table.registrationId),
]);

export type EventBillingRedemption = typeof eventBillingRedemptions.$inferSelect;
export type InsertEventBillingRedemption = typeof eventBillingRedemptions.$inferInsert;

// OTP verification gate in front of advance redemption — only required when
// the event has a registration fee configured (see events.registrationFee).
// A registration may have several rows over time (resend); the latest
// verified=true row is what the redeem route checks for.
export const eventBillingOtps = pgTable("event_billing_otps", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  registrationId: varchar("registration_id", { length: 36 }).notNull().references(() => eventRegistrations.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  verified: boolean("verified").default(false).notNull(),
  attempts: integer("attempts").default(0).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type EventBillingOtp = typeof eventBillingOtps.$inferSelect;
export type InsertEventBillingOtp = typeof eventBillingOtps.$inferInsert;

export const eventsRelations = relations(events, ({ one, many }) => ({
  branch: one(branches, {
    fields: [events.branchId],
    references: [branches.id],
  }),
  organization: one(organizations, {
    fields: [events.organizationId],
    references: [organizations.id],
  }),
  registrations: many(eventRegistrations),
  preprintedTickets: many(eventPreprintedTickets),
}));

export const eventRegistrationsRelations = relations(eventRegistrations, ({ one, many }) => ({
  event: one(events, {
    fields: [eventRegistrations.eventId],
    references: [events.id],
  }),
  payment: one(payments, {
    fields: [eventRegistrations.paymentId],
    references: [payments.id],
  }),
  stageLog: many(eventStageLog),
  feedback: many(eventFeedback),
  billingRedemption: many(eventBillingRedemptions),
  assignedPreprintedTickets: many(eventPreprintedTickets),
}));

export const eventPreprintedTicketsRelations = relations(eventPreprintedTickets, ({ one }) => ({
  event: one(events, {
    fields: [eventPreprintedTickets.eventId],
    references: [events.id],
  }),
  assignedRegistration: one(eventRegistrations, {
    fields: [eventPreprintedTickets.assignedRegistrationId],
    references: [eventRegistrations.id],
  }),
  createdBy: one(orgUsers, {
    fields: [eventPreprintedTickets.createdByUserId],
    references: [orgUsers.id],
    relationName: "event_preprinted_created_by",
  }),
  assignedBy: one(orgUsers, {
    fields: [eventPreprintedTickets.assignedByUserId],
    references: [orgUsers.id],
    relationName: "event_preprinted_assigned_by",
  }),
  voidedBy: one(orgUsers, {
    fields: [eventPreprintedTickets.voidedByUserId],
    references: [orgUsers.id],
    relationName: "event_preprinted_voided_by",
  }),
}));

export const eventStageLogRelations = relations(eventStageLog, ({ one }) => ({
  registration: one(eventRegistrations, {
    fields: [eventStageLog.registrationId],
    references: [eventRegistrations.id],
  }),
}));

export const eventFeedbackRelations = relations(eventFeedback, ({ one }) => ({
  registration: one(eventRegistrations, {
    fields: [eventFeedback.registrationId],
    references: [eventRegistrations.id],
  }),
}));

export const eventBillingRedemptionsRelations = relations(eventBillingRedemptions, ({ one }) => ({
  registration: one(eventRegistrations, {
    fields: [eventBillingRedemptions.registrationId],
    references: [eventRegistrations.id],
  }),
}));

// ── Parking logs ──────────────────────────────────────────────────────────────
export const eventParkingLogs = pgTable("event_parking_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id", { length: 36 }).notNull().references(() => events.id, { onDelete: "cascade" }),
  registrationId: varchar("registration_id", { length: 36 }).references(() => eventRegistrations.id, { onDelete: "set null" }),
  customerName: varchar("customer_name", { length: 255 }),
  bookingId: varchar("booking_id", { length: 50 }),
  customerPhone: varchar("customer_phone", { length: 50 }),
  vehicleRegNumber: varchar("vehicle_reg_number", { length: 50 }),
  action: varchar("action", { length: 20 }).notNull(), // "entry" | "exit"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdByUserId: varchar("created_by_user_id", { length: 36 }).references(() => orgUsers.id, { onDelete: "set null" }),
});
export type EventParkingLog = typeof eventParkingLogs.$inferSelect;
export type InsertEventParkingLog = typeof eventParkingLogs.$inferInsert;

export const eventParkingLogsRelations = relations(eventParkingLogs, ({ one }) => ({
  event: one(events, {
    fields: [eventParkingLogs.eventId],
    references: [events.id],
  }),
  registration: one(eventRegistrations, {
    fields: [eventParkingLogs.registrationId],
    references: [eventRegistrations.id],
  }),
}));

// ── Support edit OTPs ──────────────────────────────────────────────────────────
export const eventSupportOtps = pgTable("event_support_otps", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  registrationId: varchar("registration_id", { length: 36 }).notNull().references(() => eventRegistrations.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 10 }).notNull(),
  editType: varchar("edit_type", { length: 50 }).notNull(),
  editPayload: jsonb("edit_payload").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").default(false).notNull(),
  attempts: integer("attempts").default(0).notNull(),
});
export type EventSupportOtp = typeof eventSupportOtps.$inferSelect;

// ── Registration-time phone verification ───────────────────────────────────
// Sent when the customer enters their WhatsApp number during online
// registration. They must enter the code before proceeding to slot selection,
// proving their WhatsApp is active so the billing advance-redemption OTP is
// guaranteed to reach them at the event.
export const eventPhoneVerifications = pgTable("event_phone_verifications", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id", { length: 36 }).notNull().references(() => events.id, { onDelete: "cascade" }),
  phone: varchar("phone", { length: 20 }).notNull(),
  code: text("code").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  verifiedAt: timestamp("verified_at"),
  verificationToken: varchar("verification_token", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type EventPhoneVerification = typeof eventPhoneVerifications.$inferSelect;

// ── Billing advance-redemption OTP overrides ───────────────────────────────
// Logged whenever billing staff bypass the advance-redemption OTP because the
// customer's phone is unavailable on event day (lost, switched off, etc.).
// Provides a full audit trail for every override.
export const eventBillingOverrides = pgTable("event_billing_overrides", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  registrationId: varchar("registration_id", { length: 36 }).notNull().references(() => eventRegistrations.id, { onDelete: "cascade" }),
  overriddenBy: varchar("overridden_by", { length: 36 }).references(() => orgUsers.id, { onDelete: "set null" }),
  reason: varchar("reason", { length: 50 }).notNull(), // "lost_phone" | "phone_off" | "other"
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type EventBillingOverride = typeof eventBillingOverrides.$inferSelect;

// ── WhatsApp Delivery Queue ──────────────────────────────────────────────────
// Persistent job queue for all outbound WhatsApp ticket confirmations.
// Jobs are written to this table atomically at registration / queue-join time
// so no message can be lost if the server restarts before the send completes.
// A background worker (server/wa-queue-worker.ts) polls every 30 s and also
// fires immediately when a new job is enqueued, delivering messages as fast
// as possible while retrying failed sends with exponential backoff.
//
// Job types:
//   event_ticket    — event boarding-pass template (Playwright + Object Storage)
//   queue_ticket    — queue-join WA (dine-in template or free-form image/text)
//   takeaway_ticket — takeaway "order confirmed" approved template
export const waQueue = pgTable(
  "wa_queue",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // When the job is next eligible for processing (used for retry backoff).
    scheduledAt: timestamp("scheduled_at").defaultNow().notNull(),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    // pending → in-flight → sent (terminal) or failed (terminal after maxAttempts)
    status: text("status").default("pending").notNull(),
    sentAt: timestamp("sent_at"),
    lastError: text("last_error"),
    // Recipient hint (optional — worker re-loads from DB for send logic).
    phone: text("phone"),
    orgId: varchar("org_id", { length: 36 }),
    // Job descriptor.
    jobType: text("job_type").notNull(),
    refId: varchar("ref_id", { length: 36 }),     // registrationId or ticketId
    metadata: jsonb("metadata"),                   // extra per-jobType data
    // Prevents the same logical send from being enqueued twice.
    // Always provided; unique index below enforces deduplication.
    dedupeKey: text("dedupe_key"),
  },
  (t) => ({
    dedupeKeyIdx: uniqueIndex("wa_queue_dedupe_key_idx").on(t.dedupeKey),
    pendingScheduledIdx: index("wa_queue_pending_scheduled_idx").on(
      t.status,
      t.scheduledAt,
    ),
  }),
);
export type WaQueueJob = typeof waQueue.$inferSelect;

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEventRegistrationSchema = createInsertSchema(eventRegistrations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEventFeedbackSchema = createInsertSchema(eventFeedback).omit({
  id: true,
  createdAt: true,
});
