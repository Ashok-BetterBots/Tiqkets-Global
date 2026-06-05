import { logHandledError } from "@/lib/logger";
import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, ReactNode } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, getApiUrl, getErrorMessage, setCurrentUserIdHeader } from "@/lib/query-client";
import { AnnouncerListener } from "@/services/AnnouncerListener";
import { ALL_PERMISSION_KEYS, getBuiltinPermissions } from "@shared/permissions";
import {
  RegisteredOrganization,
  OrgService,
  QueueCustomer,
  OrgSettings,
  OrgStats,
  BookingSlot,
  InputField,
  QueueMode,
  OrgUser,
  Branch,
  Desk,
  UserRole,
  ROLE_PERMISSIONS,
  BreakTime,
  Holiday,
  DaySchedule,
  Journey,
  ServiceSettings,
  JourneyStage,
  CustomerStageHistory,
} from "@/types/organization";

interface OrganizationContextType {
  organization: RegisteredOrganization | null;
  currentUser: OrgUser | null;
  isOrgAuthenticated: boolean;
  isSuperAdmin: boolean;
  isLoading: boolean;
  isHydratingSession: boolean;
  orgLoginMode: boolean;
  setOrgLoginMode: (mode: boolean) => void;
  // Global toggle controlled by Super Admin → System Settings.
  // When false, the mobile app hides the customer WhatsApp-OTP login and
  // forces the organisation login screen instead. Defaults to true so
  // brand-new installs (and any network failure) behave like before.
  customerLoginEnabled: boolean;
  // True once the first /api/system-settings/public response has settled
  // (success OR network error). App.tsx waits on this before deciding
  // which navigator to render so a slow network can't briefly flash the
  // customer login screen on cold start when the toggle is OFF.
  customerLoginFlagHydrated: boolean;
  queue: QueueCustomer[];
  bookings: BookingSlot[];
  users: OrgUser[];
  branches: Branch[];
  selectedBookingBranchId: string | null;
  setSelectedBookingBranchId: (branchId: string | null) => void;
  // ONE shared, persisted branch + service selection used across the
  // Overview (Dashboard), Queue, Availability (Bookings) and Settings
  // screens — NOT Billing. Both are always concrete (no "All" option):
  // they default to the first accessible branch and that branch's first
  // active service, and are persisted to AsyncStorage so a reload keeps
  // the user's last choice.
  selectedBranchId: string | null;
  setSelectedBranchId: (branchId: string | null) => void;
  selectedServiceId: string | null;
  setSelectedServiceId: (serviceId: string | null) => void;
  loginOrganization: (
    email: string,
    password: string,
  ) => Promise<{
    success: boolean;
    error?: string;
    requiresEmailVerification?: boolean;
    organizationId?: string;
    pendingEmail?: string;
  }>;
  registerOrganization: (
    data: Partial<RegisteredOrganization> & { password?: string }
  ) => Promise<{
    success: boolean;
    error?: string;
    requiresEmailVerification?: boolean;
    organizationId?: string;
    email?: string;
    otpExpiresInMinutes?: number;
    emailVerificationSent?: boolean;
  }>;
  verifyEmailOtp: (
    organizationId: string,
    otp: string,
  ) => Promise<{ success: boolean; error?: string; alreadyVerified?: boolean; attemptsRemaining?: number; requiresResend?: boolean }>;
  resendEmailOtp: (
    organizationId: string,
  ) => Promise<{ success: boolean; error?: string; emailSent?: boolean; retryAfterSec?: number }>;
  logoutOrganization: () => Promise<void>;
  updateCurrentUser: (updates: Partial<OrgUser>) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  addService: (service: Omit<OrgService, "id">) => Promise<OrgService | undefined>;
  updateService: (serviceId: string, service: Partial<OrgService>) => Promise<void>;
  deleteService: (serviceId: string) => Promise<void>;
  callNextCustomer: (serviceId?: string, deskId?: string, deskName?: string, branchId?: string) => Promise<QueueCustomer | null>;
  callSpecificCustomer: (customerId: string, deskId?: string, deskName?: string) => Promise<void>;
  callAgainCustomer: (customerId: string, deskId?: string, deskName?: string) => Promise<void>;
  skipCustomer: (customerId: string) => Promise<{ isNoShow: boolean }>;
  markAsServing: (customerId: string) => Promise<void>;
  markAsComplete: (customerId: string) => Promise<void>;
  markAsNoShow: (customerId: string) => Promise<void>;
  markAsArrived: (customerId: string) => Promise<{ success: boolean; customer?: QueueCustomer; error?: string }>;
  holdCustomer: (customerId: string) => Promise<void>;
  resumeCustomer: (customerId: string) => Promise<void>;
  allocateTable: (customerId: string, tableNumber: string) => Promise<{ success: boolean; customer?: QueueCustomer; error?: string }>;
  checkInCustomer: (ticketNumber: string) => Promise<{ success: boolean; customer?: QueueCustomer; error?: string }>;
  addCounterOrder: (customerName: string, notes?: string) => Promise<{ success: boolean; customer?: QueueCustomer; error?: string }>;
  addManualCustomer: (customerData: { customerName: string; customerPhone?: string; customerEmail?: string; formData?: Record<string, any>; serviceId?: string; }) => Promise<{ success: boolean; customer?: QueueCustomer; error?: string }>;
  addReservation: (customerData: { customerName: string; customerPhone?: string; customerEmail?: string; formData?: Record<string, any>; serviceId?: string; reservationTime: string; }) => Promise<{ success: boolean; customer?: QueueCustomer; error?: string }>;
  checkInReservation: (customerId: string) => Promise<{ success: boolean; customer?: QueueCustomer; error?: string }>;
  branchReservations: any[];
  loadBranchReservations: (branchId: string) => Promise<void>;
  checkInApiReservation: (reservationId: string) => Promise<{ success: boolean; error?: string }>;
  cancelApiReservation: (reservationId: string) => Promise<{ success: boolean; error?: string }>;
  updateSettings: (settings: Partial<OrgSettings>) => Promise<void>;
  updateBranchSettings: (branchId: string, settings: Partial<OrgSettings>) => Promise<void>;
  refreshOrganizationData: () => Promise<void>;
  updateServiceSettings: (branchId: string, serviceId: string, settings: ServiceSettings) => Promise<void>;
  updateBookingSlots: (slots: BookingSlot[]) => Promise<void>;
  refreshQueue: () => Promise<void>;
  refreshQueueForBranch: (branchId: string) => Promise<void>;
  refreshStats: () => Promise<void>;
  generateAPIKey: () => Promise<{ apiKey: string; apiSecret: string }>;
  addUser: (user: Omit<OrgUser, "id" | "createdAt" | "organizationId">) => Promise<OrgUser>;
  updateUser: (userId: string, updates: Partial<OrgUser>) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  addBranch: (branch: Omit<Branch, "id" | "createdAt" | "organizationId" | "services" | "settings">) => Promise<Branch>;
  updateBranch: (branchId: string, updates: Partial<Branch>) => Promise<void>;
  deleteBranch: (branchId: string) => Promise<void>;
  addDesk: (serviceId: string, branchId: string, name: string) => Promise<Desk | undefined>;
  updateDesk: (deskId: string, updates: Partial<Desk>) => Promise<void>;
  setQueueStatusFor: (target: { type: "branch" | "service" | "desk"; id: string }, status: string) => Promise<void>;
  deleteDesk: (deskId: string, serviceId: string) => Promise<void>;
  canPerformAction: (action: keyof typeof ROLE_PERMISSIONS.admin) => boolean;
  permissions: string[];
  hasPermission: (key: string) => boolean;
  hasAnyPermission: (keys: string[]) => boolean;
  refreshPermissions: () => Promise<void>;
  getAccessibleBranches: () => Branch[];
  // Multi-stage queue journey functions
  addJourney: (branchId: string, journey: Omit<Journey, "id" | "createdAt">) => Promise<Journey>;
  updateJourney: (branchId: string, journeyId: string, updates: Partial<Journey>) => Promise<void>;
  deleteJourney: (branchId: string, journeyId: string) => Promise<void>;
  startCustomerJourney: (customerId: string, journeyId: string) => Promise<{ success: boolean; customer?: QueueCustomer; error?: string }>;
  moveToNextStage: (customerId: string) => Promise<{ success: boolean; customer?: QueueCustomer; isComplete?: boolean; error?: string }>;
  moveToStage: (customerId: string, stageIndex: number) => Promise<{ success: boolean; customer?: QueueCustomer; isComplete?: boolean; error?: string }>;
  skipStage: (customerId: string) => Promise<{ success: boolean; customer?: QueueCustomer; error?: string }>;
  completeJourney: (customerId: string) => Promise<{ success: boolean; customer?: QueueCustomer; error?: string }>;
  getCustomersAtStage: (journeyId: string, stageIndex: number) => QueueCustomer[];
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

const STORAGE_KEY = "@tiqkets_org";

const generateId = () => Math.random().toString(36).substr(2, 9);
const generateAPIKeyString = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "tiq_";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const createDefaultBreaks = (): BreakTime[] => [
  { id: "lunch", name: "Lunch Break", startTime: "12:00", endTime: "13:00", isActive: true },
];

const defaultSettings: OrgSettings = {
  queueMode: "fifo",
  notificationMode: "all_alerts",
  display: {
    enableBluetoothSpeaker: false,
    enableTVDisplay: false,
    announcementVoice: "female",
    announcementLanguage: "en",
    showQueueOnTV: true,
    showCalledTicketOnTV: true,
  },
  api: {
    apiKey: "",
    apiSecret: "",
    isEnabled: false,
    allowedOrigins: [],
    rateLimit: 100,
    createdAt: new Date().toISOString(),
  },
  autoCallNext: false,
  maxQueueSize: 100,
  operatingHours: [
    { dayOfWeek: 0, openTime: "09:00", closeTime: "17:00", isOpen: false, breaks: [] },
    { dayOfWeek: 1, openTime: "09:00", closeTime: "17:00", isOpen: true, breaks: createDefaultBreaks() },
    { dayOfWeek: 2, openTime: "09:00", closeTime: "17:00", isOpen: true, breaks: createDefaultBreaks() },
    { dayOfWeek: 3, openTime: "09:00", closeTime: "17:00", isOpen: true, breaks: createDefaultBreaks() },
    { dayOfWeek: 4, openTime: "09:00", closeTime: "17:00", isOpen: true, breaks: createDefaultBreaks() },
    { dayOfWeek: 5, openTime: "09:00", closeTime: "17:00", isOpen: true, breaks: createDefaultBreaks() },
    { dayOfWeek: 6, openTime: "09:00", closeTime: "14:00", isOpen: true, breaks: [] },
  ],
  holidays: [],
  defaultSlotDuration: 30,
  defaultSlotCapacity: 3,
};

const defaultStats: OrgStats = {
  todayServed: 0,
  todayWaiting: 0,
  todayNoShow: 0,
  averageWaitTime: 0,
  averageServiceTime: 0,
  peakHour: "",
  totalBookingsToday: 0,
  upcomingBookings: 0,
};

const MOCK_QUEUE: QueueCustomer[] = [
  {
    id: "q1",
    ticketNumber: "A001",
    customerName: "John Smith",
    customerPhone: "+1234567890",
    serviceId: "s1",
    serviceName: "General Consultation",
    position: 1,
    joinedAt: new Date(Date.now() - 30 * 60000).toISOString(),
    estimatedWaitTime: 5,
    status: "waiting",
    formData: { reason: "Follow-up visit" },
    priority: "normal",
    skipCount: 0,
    callCount: 0,
    source: "app",
  },
  {
    id: "q2",
    ticketNumber: "A002",
    customerName: "Sarah Johnson",
    customerPhone: "+1234567891",
    serviceId: "s1",
    serviceName: "General Consultation",
    position: 2,
    joinedAt: new Date(Date.now() - 25 * 60000).toISOString(),
    estimatedWaitTime: 15,
    status: "waiting",
    formData: { reason: "New patient" },
    priority: "normal",
    skipCount: 0,
    callCount: 0,
    source: "qr",
  },
  {
    id: "q3",
    ticketNumber: "A003",
    customerName: "Mike Williams",
    customerEmail: "mike@email.com",
    serviceId: "s2",
    serviceName: "Document Processing",
    position: 3,
    joinedAt: new Date(Date.now() - 20 * 60000).toISOString(),
    estimatedWaitTime: 25,
    status: "waiting",
    formData: { documentType: "Passport renewal" },
    priority: "vip",
    skipCount: 0,
    callCount: 0,
    source: "manual",
  },
  {
    id: "q4",
    ticketNumber: "A004",
    customerName: "Emily Brown",
    customerPhone: "+1234567892",
    serviceId: "s1",
    serviceName: "General Consultation",
    position: 4,
    joinedAt: new Date(Date.now() - 15 * 60000).toISOString(),
    estimatedWaitTime: 35,
    status: "waiting",
    formData: { reason: "Prescription refill" },
    priority: "normal",
    skipCount: 0,
    callCount: 0,
    source: "reservation",
  },
  {
    id: "msq1",
    ticketNumber: "MS001",
    customerName: "Alice Chen",
    customerPhone: "+1234567893",
    serviceId: "s1",
    serviceName: "Hospital Visit",
    position: 1,
    joinedAt: new Date(Date.now() - 45 * 60000).toISOString(),
    estimatedWaitTime: 10,
    status: "waiting",
    formData: { reason: "Full checkup" },
    priority: "normal",
    skipCount: 0,
    callCount: 0,
    source: "app",
    journeyId: "journey1",
    currentStageIndex: 0,
    currentStageId: "stage1",
    stageHistory: [
      { stageId: "stage1", stageIndex: 0, serviceId: "s1", serviceName: "Doctor", startedAt: new Date(Date.now() - 45 * 60000).toISOString(), skipped: false },
    ],
  },
  {
    id: "msq2",
    ticketNumber: "MS002",
    customerName: "Bob Martinez",
    customerPhone: "+1234567894",
    serviceId: "s1",
    serviceName: "Hospital Visit",
    position: 2,
    joinedAt: new Date(Date.now() - 60 * 60000).toISOString(),
    estimatedWaitTime: 15,
    status: "waiting",
    formData: { reason: "Blood work" },
    priority: "normal",
    skipCount: 0,
    callCount: 0,
    source: "qr",
    journeyId: "journey1",
    currentStageIndex: 1,
    currentStageId: "stage2",
    stageHistory: [
      { stageId: "stage1", stageIndex: 0, serviceId: "s1", serviceName: "Doctor", startedAt: new Date(Date.now() - 60 * 60000).toISOString(), completedAt: new Date(Date.now() - 50 * 60000).toISOString(), skipped: false },
      { stageId: "stage2", stageIndex: 1, serviceId: "s2", serviceName: "Lab", startedAt: new Date(Date.now() - 50 * 60000).toISOString(), skipped: false },
    ],
  },
  {
    id: "msq3",
    ticketNumber: "MS003",
    customerName: "Carol Davis",
    customerPhone: "+1234567895",
    serviceId: "s1",
    serviceName: "Hospital Visit",
    position: 3,
    joinedAt: new Date(Date.now() - 90 * 60000).toISOString(),
    estimatedWaitTime: 5,
    status: "waiting",
    formData: { reason: "Ultrasound scan" },
    priority: "vip",
    skipCount: 0,
    callCount: 0,
    source: "manual",
    journeyId: "journey1",
    currentStageIndex: 2,
    currentStageId: "stage3",
    stageHistory: [
      { stageId: "stage1", stageIndex: 0, serviceId: "s1", serviceName: "Doctor", startedAt: new Date(Date.now() - 90 * 60000).toISOString(), completedAt: new Date(Date.now() - 80 * 60000).toISOString(), skipped: false },
      { stageId: "stage2", stageIndex: 1, serviceId: "s2", serviceName: "Lab", startedAt: new Date(Date.now() - 80 * 60000).toISOString(), completedAt: new Date(Date.now() - 60 * 60000).toISOString(), skipped: false },
      { stageId: "stage3", stageIndex: 2, serviceId: "s3", serviceName: "Ultrasound", startedAt: new Date(Date.now() - 60 * 60000).toISOString(), skipped: false },
    ],
  },
  {
    id: "msq4",
    ticketNumber: "MS004",
    customerName: "David Lee",
    customerPhone: "+1234567896",
    serviceId: "s1",
    serviceName: "Hospital Visit",
    position: 4,
    joinedAt: new Date(Date.now() - 120 * 60000).toISOString(),
    estimatedWaitTime: 10,
    status: "waiting",
    formData: { reason: "Follow-up consultation" },
    priority: "normal",
    skipCount: 0,
    callCount: 0,
    source: "app",
    journeyId: "journey1",
    currentStageIndex: 3,
    currentStageId: "stage4",
    stageHistory: [
      { stageId: "stage1", stageIndex: 0, serviceId: "s1", serviceName: "Doctor", startedAt: new Date(Date.now() - 120 * 60000).toISOString(), completedAt: new Date(Date.now() - 110 * 60000).toISOString(), skipped: false },
      { stageId: "stage2", stageIndex: 1, serviceId: "s2", serviceName: "Lab", startedAt: new Date(Date.now() - 110 * 60000).toISOString(), completedAt: new Date(Date.now() - 90 * 60000).toISOString(), skipped: false },
      { stageId: "stage3", stageIndex: 2, serviceId: "s3", serviceName: "Ultrasound", startedAt: new Date(Date.now() - 90 * 60000).toISOString(), completedAt: new Date(Date.now() - 70 * 60000).toISOString(), skipped: false },
      { stageId: "stage4", stageIndex: 3, serviceId: "s4", serviceName: "Doctor Review", startedAt: new Date(Date.now() - 70 * 60000).toISOString(), skipped: false },
    ],
  },
  {
    id: "msq5",
    ticketNumber: "MS005",
    customerName: "Eva Wilson",
    customerPhone: "+1234567897",
    serviceId: "s1",
    serviceName: "Hospital Visit",
    position: 5,
    joinedAt: new Date(Date.now() - 150 * 60000).toISOString(),
    estimatedWaitTime: 5,
    status: "waiting",
    formData: { reason: "Medication pickup" },
    priority: "normal",
    skipCount: 0,
    callCount: 0,
    source: "qr",
    journeyId: "journey1",
    currentStageIndex: 4,
    currentStageId: "stage5",
    stageHistory: [
      { stageId: "stage1", stageIndex: 0, serviceId: "s1", serviceName: "Doctor", startedAt: new Date(Date.now() - 150 * 60000).toISOString(), completedAt: new Date(Date.now() - 140 * 60000).toISOString(), skipped: false },
      { stageId: "stage2", stageIndex: 1, serviceId: "s2", serviceName: "Lab", startedAt: new Date(Date.now() - 140 * 60000).toISOString(), completedAt: new Date(Date.now() - 120 * 60000).toISOString(), skipped: false },
      { stageId: "stage3", stageIndex: 2, serviceId: "s3", serviceName: "Ultrasound", startedAt: new Date(Date.now() - 120 * 60000).toISOString(), completedAt: new Date(Date.now() - 100 * 60000).toISOString(), skipped: true },
      { stageId: "stage4", stageIndex: 3, serviceId: "s4", serviceName: "Doctor Review", startedAt: new Date(Date.now() - 100 * 60000).toISOString(), completedAt: new Date(Date.now() - 80 * 60000).toISOString(), skipped: false },
      { stageId: "stage5", stageIndex: 4, serviceId: "s5", serviceName: "Pharmacy", startedAt: new Date(Date.now() - 80 * 60000).toISOString(), skipped: false },
    ],
  },
];

const MOCK_BRANCHES: Branch[] = [
  {
    id: "b1",
    organizationId: "org1",
    name: "Main Branch - Downtown",
    address: "123 Main Street",
    city: "San Francisco",
    state: "California",
    pincode: "94102",
    latitude: 37.7749,
    longitude: -122.4194,
    phone: "+1234567890",
    isActive: true,
    createdAt: new Date().toISOString(),
    services: [
      {
        id: "s1",
        name: "General Consultation",
        description: "General medical consultation and check-ups",
        averageWaitTime: 15,
        estimatedDuration: 20,
        isActive: true,
        inputFields: [
          { id: "f1", label: "Reason for Visit", type: "text", required: true },
        ],
      },
      {
        id: "s2",
        name: "Document Processing",
        description: "Process and verify official documents",
        averageWaitTime: 20,
        estimatedDuration: 30,
        isActive: true,
        inputFields: [
          { id: "f2", label: "Document Type", type: "select", required: true, options: ["Passport", "ID Card", "License"] },
        ],
      },
    ],
    settings: defaultSettings,
    journeys: [
      {
        id: "journey1",
        name: "Hospital Visit",
        description: "Complete hospital visit journey from initial consultation through pharmacy",
        isActive: true,
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        stages: [
          { id: "stage1", serviceId: "s1", serviceName: "Doctor", order: 0, isOptional: false, estimatedDuration: 15 },
          { id: "stage2", serviceId: "s2", serviceName: "Lab", order: 1, isOptional: false, estimatedDuration: 20 },
          { id: "stage3", serviceId: "s3", serviceName: "Ultrasound", order: 2, isOptional: true, estimatedDuration: 25 },
          { id: "stage4", serviceId: "s4", serviceName: "Doctor Review", order: 3, isOptional: false, estimatedDuration: 10 },
          { id: "stage5", serviceId: "s5", serviceName: "Pharmacy", order: 4, isOptional: false, estimatedDuration: 5 },
        ],
      },
    ],
  },
  {
    id: "b2",
    organizationId: "org1",
    name: "North Branch - Marina",
    address: "456 Marina Blvd",
    city: "San Francisco",
    state: "California",
    pincode: "94123",
    latitude: 37.8044,
    longitude: -122.4367,
    phone: "+1234567891",
    isActive: true,
    createdAt: new Date().toISOString(),
    services: [
      {
        id: "s3",
        name: "Walk-in Appointments",
        description: "Quick walk-in consultations",
        averageWaitTime: 10,
        estimatedDuration: 15,
        isActive: true,
        inputFields: [],
      },
    ],
    settings: defaultSettings,
  },
];

const MOCK_USERS: OrgUser[] = [
  {
    id: "u1",
    organizationId: "org1",
    name: "Admin User",
    email: "admin@citymedical.com",
    phone: "+1234567890",
    role: "admin",
    isActive: true,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  },
  {
    id: "u2",
    organizationId: "org1",
    name: "John Manager",
    email: "john.manager@citymedical.com",
    phone: "+1234567891",
    role: "location_manager",
    branchId: "b1",
    branchName: "Main Branch - Downtown",
    isActive: true,
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    lastLoginAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "u3",
    organizationId: "org1",
    name: "Sarah Floor",
    email: "sarah.floor@citymedical.com",
    role: "floor_manager",
    branchId: "b1",
    branchName: "Main Branch - Downtown",
    isActive: true,
    createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "u4",
    organizationId: "org1",
    name: "Mike Desk",
    email: "mike.desk@citymedical.com",
    role: "front_desk",
    branchId: "b1",
    branchName: "Main Branch - Downtown",
    assignedServiceIds: ["s1"],
    isActive: true,
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [organization, setOrganization] = useState<RegisteredOrganization | null>(null);
  const [currentUser, setCurrentUser] = useState<OrgUser | null>(null);
  // `isLoading` reflects in-flight login/register actions only — keeping it
  // separate from `isHydratingSession` is critical because `AppContent`
  // gates its navigator on the hydration flag. If we conflated them, the
  // entire navigation tree would unmount during a normal login, blanking
  // the screen and tearing down the org login form mid-submit.
  const [isLoading, setIsLoading] = useState(false);
  // `isHydratingSession` is true only while the mount-time AsyncStorage
  // restore + cookie validation against /api/organizations/me is running.
  // Set back to false once we know whether the user has a valid session.
  const [isHydratingSession, setIsHydratingSession] = useState(true);
  const [queue, setQueue] = useState<QueueCustomer[]>([]);
  const [branchReservations, setBranchReservations] = useState<any[]>([]);
  const [bookings, setBookings] = useState<BookingSlot[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [branches, setBranchesState] = useState<Branch[]>([]);
  // All callers go through this wrapper so `branchesRef.current` stays in
  // lockstep with the rendered state. Reads from updateBranchSettings rely
  // on this synchronous mirror to capture the previous-branch snapshot.
  const setBranches: typeof setBranchesState = useCallback((updater) => {
    setBranchesState((prev) => {
      const next = typeof updater === "function"
        ? (updater as (p: Branch[]) => Branch[])(prev)
        : updater;
      branchesRef.current = next;
      return next;
    });
  }, []);
  const [selectedBookingBranchId, setSelectedBookingBranchId] = useState<string | null>(null);

  // ----- Shared branch + service scope (Dashboard / Queue / Bookings / Settings) -----
  // Persisted to AsyncStorage so a reload restores the last selection. The
  // persisting setters write through; a defaulting effect below keeps the
  // pair valid for the accessible branches/services. Overview allows
  // "All Branches" / "All Services" (null); other pages fall back to concrete.
  const [selectedBranchId, setSelectedBranchIdState] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceIdState] = useState<string | null>(null);
  const scopeHydratedRef = useRef(false);
  const setSelectedBranchId = useCallback((id: string | null) => {
    setSelectedBranchIdState(id);
    if (id === null) {
      AsyncStorage.setItem("@tiqkets_selectedBranchId", "__all__").catch(() => {});
    } else if (id) {
      AsyncStorage.setItem("@tiqkets_selectedBranchId", id).catch(() => {});
    } else {
      AsyncStorage.removeItem("@tiqkets_selectedBranchId").catch(() => {});
    }
  }, []);
  const setSelectedServiceId = useCallback((id: string | null) => {
    setSelectedServiceIdState(id);
    if (id === null) {
      AsyncStorage.setItem("@tiqkets_selectedServiceId", "__all__").catch(() => {});
    } else if (id) {
      AsyncStorage.setItem("@tiqkets_selectedServiceId", id).catch(() => {});
    } else {
      AsyncStorage.removeItem("@tiqkets_selectedServiceId").catch(() => {});
    }
  }, []);

  const [orgLoginMode, setOrgLoginModeState] = useState(false);
  const [customerLoginEnabled, setCustomerLoginEnabled] = useState(true);
  const [customerLoginFlagHydrated, setCustomerLoginFlagHydrated] = useState(false);
  // Mirror `customerLoginEnabled` into a ref so callbacks created with
  // useCallback([], …) (notably logoutOrganization) can read the LATEST
  // value of the flag without having to be re-created — and therefore
  // without invalidating every consumer that depends on them.
  const customerLoginEnabledRef = useRef(true);
  useEffect(() => {
    customerLoginEnabledRef.current = customerLoginEnabled;
  }, [customerLoginEnabled]);
  const [permissions, setPermissions] = useState<string[]>([]);

  // Wrap the orgLoginMode setter so that, when the super admin has
  // disabled the customer mobile app login, the user can never be sent
  // back to the (now-unavailable) customer login screen — even if some
  // older code path tries to call setOrgLoginMode(false).
  const setOrgLoginMode = useCallback((mode: boolean) => {
    if (!mode && !customerLoginEnabled) return;
    setOrgLoginModeState(mode);
  }, [customerLoginEnabled]);

  // Track when the on-mount hydration has finished restoring
  // `orgLoginMode` from AsyncStorage. The persistence write-effect
  // below MUST NOT run before this flips to true — otherwise it would
  // observe the default `orgLoginMode = false` on mount and eagerly
  // call removeItem() on the persisted flag, wiping it out before the
  // async hydration can read it. The hydration block (Phase 1, below)
  // sets this to true once it has read the persisted value.
  const orgLoginModeHydratedRef = useRef(false);

  // Persist `orgLoginMode` so a page refresh during the For-Business
  // login / register / OTP flow doesn't drop the user back onto the
  // customer (WhatsApp-OTP) login screen. Only writes after hydration
  // completes — see comment on `orgLoginModeHydratedRef` above for why.
  useEffect(() => {
    if (!orgLoginModeHydratedRef.current) return;
    (async () => {
      try {
        if (orgLoginMode) {
          await AsyncStorage.setItem(`${STORAGE_KEY}_loginMode`, "1");
        } else {
          await AsyncStorage.removeItem(`${STORAGE_KEY}_loginMode`);
        }
      } catch {
        // ignore — state remains correct for the current session
      }
    })();
  }, [orgLoginMode]);

  const isOrgAuthenticated = organization !== null || currentUser?.role === "super_admin";
  const isSuperAdmin = currentUser?.role === "super_admin";

  const permissionSet = useMemo(() => new Set(permissions), [permissions]);
  const hasPermission = useCallback(
    (key: string): boolean => {
      if (!currentUser) return false;
      return permissionSet.has(key);
    },
    [currentUser, permissionSet],
  );
  const hasAnyPermission = useCallback(
    (keys: string[]): boolean => {
      if (!currentUser) return false;
      for (const k of keys) if (permissionSet.has(k)) return true;
      return false;
    },
    [currentUser, permissionSet],
  );

  // Tracks the active user id (for race-protection in refreshPermissions) and
  // an epoch counter so a stale response from a prior user/session cannot
  // overwrite the state of a newer one (e.g. user logs out mid-fetch).
  const lastHydratedUserIdRef = useRef<string | null>(null);
  const permissionsFetchEpochRef = useRef(0);
  // Bumped whenever the user's auth state is changed by an explicit action
  // (login, logout, super-admin sign-in). The mount-time hydration captures
  // this epoch and discards its results if the value changed during the
  // network round-trip — without this guard a slow /api/organizations/me
  // response could re-apply stale "logged in" state moments after the user
  // tapped logout.
  const authEpochRef = useRef(0);
  // Bumped on every refreshOrganizationData() call so a slow /me response
  // can't clobber state when a newer refresh has already completed (or the
  // user has logged out in the meantime).
  const orgRefreshEpochRef = useRef(0);
  // Stable, synchronous mirror of the latest `branches` state. Used by
  // updateBranchSettings to snapshot the previous branch BEFORE issuing
  // optimistic updates — relying on the side effect inside the functional
  // setBranches updater is unsafe under React's concurrent scheduling
  // (the updater may be deferred or replayed, leaving prevBranch null and
  // silently skipping persistence of hours/breaks/holidays).
  const branchesRef = useRef<Branch[]>([]);
  // Per-branch write queue. Settings writes for the same branch are
  // serialized: the next call awaits the previous one to complete before
  // starting. This prevents races where a quick add-then-edit of a break
  // would PUT/DELETE against a temp client id whose server-id replacement
  // hadn't landed yet.
  const branchSettingsQueueRef = useRef<Map<string, Promise<void>>>(new Map());
  const refreshPermissions = useCallback(async () => {
    if (!currentUser) return;
    const epoch = ++permissionsFetchEpochRef.current;
    const userIdAtRequest = currentUser.id;
    try {
      const res = await apiRequest("GET", `/api/org/me/permissions`);
      const data = (await res.json()) as { permissions?: string[] };
      const perms: string[] = Array.isArray(data?.permissions) ? data.permissions : [];
      // Drop the response if a newer refresh started, or the active user changed.
      if (epoch !== permissionsFetchEpochRef.current) return;
      if (lastHydratedUserIdRef.current !== userIdAtRequest) return;
      setPermissions(perms);
      await AsyncStorage.setItem(`${STORAGE_KEY}_permissions`, JSON.stringify(perms));
    } catch (error) {
      logHandledError("Error refreshing permissions", error);
    }
  }, [currentUser]);

  useEffect(() => {
    const id = currentUser?.id ?? null;
    if (id && id !== lastHydratedUserIdRef.current) {
      lastHydratedUserIdRef.current = id;
      void refreshPermissions();
    }
    if (!id) lastHydratedUserIdRef.current = null;
  }, [currentUser?.id, refreshPermissions]);

  // Subscribe to queue announcement events for any branch where this signed-in
  // user is the chosen announcer. Plays an alert tone + speaks the call-next
  // message via Web Speech API (web) or expo-speech (native).
  useEffect(() => {
    const orgId = organization?.id ?? null;
    const userId = currentUser?.id ?? null;
    if (!orgId || !userId) {
      AnnouncerListener.stop();
      return;
    }
    AnnouncerListener.start(
      orgId,
      userId,
      branches.map((b) => ({ id: b.id, announcerUserId: b.announcerUserId ?? null })),
    );
    return () => {
      // Don't stop on every render — only on unmount/logout
    };
  }, [organization?.id, currentUser?.id, branches]);

  useEffect(() => {
    return () => {
      AnnouncerListener.stop();
    };
  }, []);

  // Restore the org session on app launch. We do this in two phases so
  // that signed-in users never see the customer login flash on cold start:
  //   1. Optimistically hydrate state from AsyncStorage (synchronous-ish,
  //      independent of network). This makes isOrgAuthenticated true
  //      immediately and routes the user to OrgStackNavigator.
  //   2. Validate the HttpOnly session cookie via /api/organizations/me.
  //      On 200 we refresh state with the latest server data; on 401 we
  //      clear local state and storage so the user gets bounced to login.
  // The HttpOnly cookie itself is persisted by the platform's HTTP stack
  // (URLSession on iOS, OkHttp CookieManager on Android, browser cookie
  // jar on web) and survives app restarts as long as Max-Age hasn't
  // expired. See server/rbac.ts (30-day max age).
  useEffect(() => {
    let cancelled = false;
    // Snapshot the auth epoch at the moment hydration starts. Any explicit
    // login/logout that runs between now and the response arriving will
    // bump `authEpochRef.current`, signaling that our restored state is
    // stale and must be discarded.
    const startEpoch = authEpochRef.current;
    const isStale = () => cancelled || authEpochRef.current !== startEpoch;
    const hydrateAndValidate = async () => {
      try {
        // --- Phase 1: optimistic hydration from AsyncStorage ---
        try {
          const [storedOrg, storedUser, storedPerms, storedBranches, storedLoginMode] = await Promise.all([
            AsyncStorage.getItem(STORAGE_KEY),
            AsyncStorage.getItem(`${STORAGE_KEY}_user`),
            AsyncStorage.getItem(`${STORAGE_KEY}_permissions`),
            AsyncStorage.getItem(`${STORAGE_KEY}_branches`),
            AsyncStorage.getItem(`${STORAGE_KEY}_loginMode`),
          ]);
          if (isStale()) return;
          // Restore the "user is in the For Business area" flag so a page
          // refresh during registration / OTP verification doesn't drop
          // them back onto the customer login screen. Without this, the
          // OrgLoginScreen never remounts and any in-progress verify
          // state cannot recover. We then mark hydration complete so the
          // companion write-effect is allowed to start persisting changes
          // (it intentionally noops before this point — see the ref's
          // comment for why).
          if (storedLoginMode === "1") {
            setOrgLoginMode(true);
          }
          orgLoginModeHydratedRef.current = true;
          if (storedUser) {
            try {
              const parsedUser = JSON.parse(storedUser) as OrgUser;
              setCurrentUser(parsedUser);
            } catch {
              // ignore corrupted entry
            }
          }
          if (storedOrg) {
            try {
              const parsedOrg = JSON.parse(storedOrg) as RegisteredOrganization;
              setOrganization(parsedOrg);
            } catch {
              // ignore corrupted entry
            }
          }
          if (storedBranches) {
            try {
              const parsedBranches = JSON.parse(storedBranches) as Branch[];
              if (Array.isArray(parsedBranches)) setBranches(parsedBranches);
            } catch {
              // ignore corrupted entry
            }
          }
          if (storedPerms) {
            try {
              const parsedPerms = JSON.parse(storedPerms) as string[];
              if (Array.isArray(parsedPerms)) setPermissions(parsedPerms);
            } catch {
              // ignore corrupted entry
            }
          }
        } catch (err) {
          logHandledError("Org session hydration failed", err);
        }

        // --- Phase 2: validate cookie with the server ---
        // Don't use `apiRequest` (it throws on 401 which would surface as
        // an error in logs); call fetch directly so we can branch on status.
        let resp: Response;
        try {
          const url = new URL("/api/organizations/me", getApiUrl()).toString();
          resp = await fetch(url, { credentials: "include" });
        } catch (err) {
          // Network error — keep optimistic state and let the user retry.
          // Don't wipe stored data on transient connectivity issues.
          return;
        }

        if (isStale()) return;

        if (resp.status === 401) {
          // Cookie missing/expired — clear any stale local state so the
          // app falls back to the login screen on next render. Skip if a
          // login happened during the request (epoch advanced) so we
          // don't wipe the freshly-authenticated state.
          if (isStale()) return;
          setOrganization(null);
          setCurrentUser(null);
          setBranches([]);
          setUsers([]);
          setPermissions([]);
          setSelectedBranchIdState(null);
          setSelectedServiceIdState(null);
          scopeHydratedRef.current = false;
          await AsyncStorage.multiRemove([
            STORAGE_KEY,
            `${STORAGE_KEY}_user`,
            `${STORAGE_KEY}_permissions`,
            `${STORAGE_KEY}_branches`,
            "@tiqkets_selectedBranchId",
            "@tiqkets_selectedServiceId",
          ]);
          return;
        }

        if (!resp.ok) {
          // 5xx or other transient — keep optimistic state.
          return;
        }

        const data: any = await resp.json();
        if (isStale() || !data?.organization) return;

        const orgData = data.organization;
        const branchesData: any[] = Array.isArray(data.branches) ? data.branches : [];
        const usersData: any[] = Array.isArray(data.users) ? data.users : [];

        const refreshedOrg: RegisteredOrganization = {
          id: orgData.id,
          name: orgData.name,
          email: orgData.email,
          phone: orgData.phone || "",
          address: orgData.address || "",
          city: orgData.city || "",
          state: orgData.state || "",
          pincode: orgData.pincode || "",
          latitude: orgData.latitude || 0,
          longitude: orgData.longitude || 0,
          category: orgData.category || "Other",
          description: orgData.description || "",
          isVerified: orgData.isVerified || false,
          isActive: orgData.isActive !== false,
          createdAt: orgData.createdAt,
          logoUrl: orgData.logoUrl,
          services: branchesData[0]?.services || [],
          settings: branchesData[0]?.settings || defaultSettings,
          stats: orgData.stats || defaultStats,
        };
        setOrganization(refreshedOrg);
        setBranches(branchesData);
        setUsers(usersData);

        if (data.mode === "owner") {
          const ownerUser: OrgUser = {
            id: `owner:${refreshedOrg.id}`,
            organizationId: refreshedOrg.id,
            name: orgData.name || "Admin",
            email: orgData.email,
            phone: orgData.phone || "",
            role: "admin",
            isActive: true,
            createdAt: orgData.createdAt || new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
            profilePictureUrl: orgData.logoUrl || "",
          };
          setCurrentUser(ownerUser);
          await AsyncStorage.setItem(`${STORAGE_KEY}_user`, JSON.stringify(ownerUser));
        } else if (data.mode === "staff" && data.currentUser) {
          const serverUser = data.currentUser;
          const staffUser: OrgUser = {
            id: serverUser.id,
            organizationId: refreshedOrg.id,
            name: serverUser.name,
            email: serverUser.email ?? "",
            phone: orgData.phone || "",
            role: serverUser.role,
            isActive: true,
            createdAt: orgData.createdAt || new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
            profilePictureUrl: serverUser.profilePictureUrl || "",
            branchId: serverUser.branchId,
            branchIds: serverUser.branchIds,
            assignedServiceIds: serverUser.assignedServiceIds,
          };
          setCurrentUser(staffUser);
          await AsyncStorage.setItem(`${STORAGE_KEY}_user`, JSON.stringify(staffUser));
        }

        const refreshedPerms: string[] = Array.isArray(data.permissions)
          ? (data.permissions as string[])
          : [];
        setPermissions(refreshedPerms);

        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(refreshedOrg));
        await AsyncStorage.setItem(`${STORAGE_KEY}_branches`, JSON.stringify(branchesData));
        await AsyncStorage.setItem(`${STORAGE_KEY}_permissions`, JSON.stringify(refreshedPerms));
      } finally {
        if (!cancelled) setIsHydratingSession(false);
      }
    };
    void hydrateAndValidate();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch the public system-settings flag that controls whether the
  // customer mobile app login is enabled. This is the *unauthenticated*
  // variant of the setting — the endpoint is intentionally public because
  // the customer hasn't logged in at the moment we need to read it.
  // We refetch on app foreground / tab focus so a super-admin toggle
  // propagates without requiring users to fully restart the app.
  useEffect(() => {
    let cancelled = false;
    const fetchFlag = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/system-settings/public`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { customerAppLoginEnabled?: boolean };
        if (cancelled) return;
        const enabled = data.customerAppLoginEnabled !== false;
        setCustomerLoginEnabled(enabled);
        // If customer login was just disabled while the user is sitting on
        // the customer screen, push them into the org area immediately.
        if (!enabled) setOrgLoginModeState(true);
      } catch {
        // Fail open: keep the previous (or default true) value.
      } finally {
        // Always mark the flag as hydrated — even on error — so App.tsx
        // doesn't block forever when the network is unreachable. We
        // intentionally fail open to "enabled" in that case.
        if (!cancelled) setCustomerLoginFlagHydrated(true);
      }
    };
    void fetchFlag();

    if (Platform.OS === "web") {
      const onFocus = () => { void fetchFlag(); };
      if (typeof window !== "undefined") window.addEventListener("focus", onFocus);
      return () => {
        cancelled = true;
        if (typeof window !== "undefined") window.removeEventListener("focus", onFocus);
      };
    }
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void fetchFlag();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  // Live-refresh permissions so changes made in Super Admin propagate quickly
  // without requiring the user to log out / log in again. We refresh:
  //  - whenever the app/tab regains focus (web `focus`, native AppState active)
  //  - on a 30s polling interval while the user is signed in
  // This is critical: if Super Admin restricts Owner / Admin role permissions
  // while a user is logged in, their navigator and route guards must update.
  useEffect(() => {
    if (!currentUser?.id) return;
    // Super admin permissions are static (ALL_PERMISSION_KEYS) — no need to poll.
    if (currentUser.id === "super_admin" || currentUser.role === "super_admin") return;

    let intervalHandle: ReturnType<typeof setInterval> | null = null;
    intervalHandle = setInterval(() => {
      void refreshPermissions();
    }, 30000);

    if (Platform.OS === "web") {
      const handleFocus = () => {
        void refreshPermissions();
      };
      const handleVisibility = () => {
        if (typeof document !== "undefined" && !document.hidden) {
          void refreshPermissions();
        }
      };
      if (typeof window !== "undefined") {
        window.addEventListener("focus", handleFocus);
      }
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", handleVisibility);
      }
      return () => {
        if (intervalHandle) clearInterval(intervalHandle);
        if (typeof window !== "undefined") {
          window.removeEventListener("focus", handleFocus);
        }
        if (typeof document !== "undefined") {
          document.removeEventListener("visibilitychange", handleVisibility);
        }
      };
    }

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refreshPermissions();
      }
    });
    return () => {
      if (intervalHandle) clearInterval(intervalHandle);
      sub.remove();
    };
  }, [currentUser?.id, refreshPermissions]);

  // Pull a fresh snapshot of org/branches/users/permissions from the server.
  // Use this to reconcile local state with the DB (e.g. when another admin
  // changes queueMode on the web dashboard, mobile screens that hook this
  // into useFocusEffect will pick up the change without a relogin).
  const refreshOrganizationData = useCallback(async (): Promise<void> => {
    // Take an epoch + auth-epoch snapshot so a slow response can't overwrite
    // newer state (either a more recent refresh or a logout that already
    // tore down the session).
    const epoch = ++orgRefreshEpochRef.current;
    const startAuthEpoch = authEpochRef.current;
    const isStale = () =>
      epoch !== orgRefreshEpochRef.current ||
      authEpochRef.current !== startAuthEpoch;
    try {
      const url = new URL("/api/organizations/me", getApiUrl()).toString();
      const resp = await fetch(url, { credentials: "include" });
      if (isStale()) return;
      if (resp.status === 401) {
        // Cookie expired/invalidated server-side. Clear local session so the
        // app falls back to login on next render instead of leaving stale
        // authenticated UI visible.
        setOrganization(null);
        setCurrentUser(null);
        setBranches([]);
        setUsers([]);
        setPermissions([]);
        setSelectedBranchIdState(null);
        setSelectedServiceIdState(null);
        scopeHydratedRef.current = false;
        await AsyncStorage.multiRemove([
          STORAGE_KEY,
          `${STORAGE_KEY}_user`,
          `${STORAGE_KEY}_permissions`,
          `${STORAGE_KEY}_branches`,
          "@tiqkets_selectedBranchId",
          "@tiqkets_selectedServiceId",
        ]);
        return;
      }
      if (!resp.ok) return;
      const data: any = await resp.json();
      if (isStale() || !data?.organization) return;

      const orgData = data.organization;
      const branchesData: any[] = Array.isArray(data.branches) ? data.branches : [];
      const usersData: any[] = Array.isArray(data.users) ? data.users : [];

      const refreshedOrg: RegisteredOrganization = {
        id: orgData.id,
        name: orgData.name,
        email: orgData.email,
        phone: orgData.phone || "",
        address: orgData.address || "",
        city: orgData.city || "",
        state: orgData.state || "",
        pincode: orgData.pincode || "",
        latitude: orgData.latitude || 0,
        longitude: orgData.longitude || 0,
        category: orgData.category || "Other",
        description: orgData.description || "",
        isVerified: orgData.isVerified || false,
        isActive: orgData.isActive !== false,
        createdAt: orgData.createdAt,
        logoUrl: orgData.logoUrl,
        services: branchesData[0]?.services || [],
        settings: branchesData[0]?.settings || defaultSettings,
        stats: orgData.stats || defaultStats,
      };
      if (isStale()) return;
      setOrganization(refreshedOrg);
      setBranches(branchesData);
      setUsers(usersData);

      const refreshedPerms: string[] = Array.isArray(data.permissions)
        ? (data.permissions as string[])
        : [];
      setPermissions(refreshedPerms);

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(refreshedOrg));
      await AsyncStorage.setItem(`${STORAGE_KEY}_branches`, JSON.stringify(branchesData));
      await AsyncStorage.setItem(`${STORAGE_KEY}_permissions`, JSON.stringify(refreshedPerms));
    } catch (error) {
      logHandledError("Error refreshing organization data", error);
    }
  }, []);

  const loginOrganization = useCallback(async (email: string, password: string): Promise<{
    success: boolean;
    error?: string;
    requiresEmailVerification?: boolean;
    organizationId?: string;
    pendingEmail?: string;
  }> => {
    setIsLoading(true);
    // Bump the auth epoch so any in-flight mount-time hydration response
    // is treated as stale and discarded — otherwise a slow /me restoring
    // the *previous* session could clobber the new login state.
    authEpochRef.current += 1;
    try {
      const normalizedEmail = email.trim().toLowerCase();

      let ownerData: any = null;
      let ownerOk = false;
      // If the org-login endpoint reports the org exists but isn't verified,
      // we capture that and short-circuit BEFORE trying staff-login. We do
      // not want to silently swallow a verification gate just because a
      // staff record happens to exist with the same email.
      let ownerVerificationGate: { organizationId?: string; pendingEmail?: string; message?: string } | null = null;
      try {
        const ownerResp = await apiRequest("POST", "/api/organizations/login", { email, password });
        ownerData = await ownerResp.json();
        ownerOk = true;
      } catch (err: any) {
        ownerOk = false;
        const body = err?.body;
        if (body && typeof body === "object" && body.requiresEmailVerification) {
          ownerVerificationGate = {
            organizationId: typeof body.organizationId === "string" ? body.organizationId : undefined,
            pendingEmail: typeof body.email === "string" ? body.email : normalizedEmail,
            message: typeof body.error === "string" ? body.error : undefined,
          };
        }
      }

      if (ownerVerificationGate) {
        return {
          success: false,
          requiresEmailVerification: true,
          organizationId: ownerVerificationGate.organizationId,
          pendingEmail: ownerVerificationGate.pendingEmail,
          error: ownerVerificationGate.message || "Please verify your email address before signing in.",
        };
      }

      if (ownerOk && ownerData?.superAdmin === true) {
        const superUser: OrgUser = {
          id: "super_admin",
          organizationId: "platform",
          name: "Super Admin",
          email: normalizedEmail,
          phone: "",
          role: "super_admin",
          isActive: true,
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          profilePictureUrl: "",
        };
        setCurrentUser(superUser);
        setOrganization(null);
        setBranches([]);
        setUsers([]);
        setPermissions(ALL_PERMISSION_KEYS);
        await AsyncStorage.setItem(`${STORAGE_KEY}_user`, JSON.stringify(superUser));
        await AsyncStorage.setItem(`${STORAGE_KEY}_permissions`, JSON.stringify(ALL_PERMISSION_KEYS));
        return { success: true };
      }

      if (ownerOk && ownerData?.organization) {
        const { organization: orgData, branches: branchesData, users: usersData } = ownerData;

        const org: RegisteredOrganization = {
          id: orgData.id,
          name: orgData.name,
          email: orgData.email,
          phone: orgData.phone || "",
          address: orgData.address || "",
          city: orgData.city || "",
          state: orgData.state || "",
          pincode: orgData.pincode || "",
          latitude: orgData.latitude || 0,
          longitude: orgData.longitude || 0,
          category: orgData.category || "Other",
          description: orgData.description || "",
          isVerified: orgData.isVerified || false,
          isActive: orgData.isActive !== false,
          createdAt: orgData.createdAt,
          logoUrl: orgData.logoUrl,
          services: branchesData?.[0]?.services || [],
          settings: branchesData?.[0]?.settings || defaultSettings,
          stats: orgData.stats || defaultStats,
        };

        setOrganization(org);
        setBranches(branchesData || []);
        setUsers(usersData || []);

        const ownerUser: OrgUser = {
          id: `owner:${org.id}`,
          organizationId: org.id,
          name: orgData.name || "Admin",
          email: normalizedEmail,
          phone: orgData.phone || "",
          role: "admin",
          isActive: true,
          createdAt: orgData.createdAt || new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          profilePictureUrl: orgData.logoUrl || "",
        };
        setCurrentUser(ownerUser);

        // Trust the server's permission list as the source of truth (including
        // an explicit empty array, which means the admin role has been stripped
        // of all permissions by Super Admin). Only fall back to the built-in
        // template when the server omits the field entirely (legacy response).
        const ownerPerms: string[] = Array.isArray(ownerData?.permissions)
          ? (ownerData.permissions as string[])
          : getBuiltinPermissions("admin");
        setPermissions(ownerPerms);
        await AsyncStorage.setItem(`${STORAGE_KEY}_permissions`, JSON.stringify(ownerPerms));

        if (branchesData?.length > 0) {
          await refreshQueueForBranch(branchesData[0].id);
        }

        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(org));
        await AsyncStorage.setItem(`${STORAGE_KEY}_user`, JSON.stringify(ownerUser));
        await AsyncStorage.setItem(`${STORAGE_KEY}_branches`, JSON.stringify(branchesData || []));
        return { success: true };
      }

      const staffResp = await apiRequest("POST", "/api/organizations/staff-login", { email, password });
      const staffData = await staffResp.json();

      const { organization: orgData, branches: branchesData, users: usersData, currentUser: serverUser } = staffData;
      if (!orgData || !serverUser) {
        return { success: false, error: "Invalid credentials" };
      }

      const org: RegisteredOrganization = {
        id: orgData.id,
        name: orgData.name,
        email: orgData.email,
        phone: orgData.phone || "",
        address: orgData.address || "",
        city: orgData.city || "",
        state: orgData.state || "",
        pincode: orgData.pincode || "",
        latitude: orgData.latitude || 0,
        longitude: orgData.longitude || 0,
        category: orgData.category || "Other",
        description: orgData.description || "",
        isVerified: orgData.isVerified || false,
        isActive: orgData.isActive !== false,
        createdAt: orgData.createdAt,
        logoUrl: orgData.logoUrl,
        services: branchesData?.[0]?.services || [],
        settings: branchesData?.[0]?.settings || defaultSettings,
        stats: orgData.stats || defaultStats,
      };

      setOrganization(org);
      setBranches(branchesData || []);
      setUsers(usersData || []);

      const staffUser: OrgUser = {
        id: serverUser.id,
        organizationId: org.id,
        name: serverUser.name,
        email: serverUser.email ?? normalizedEmail,
        phone: orgData.phone || "",
        role: serverUser.role,
        isActive: true,
        createdAt: orgData.createdAt || new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        profilePictureUrl: serverUser.profilePictureUrl || "",
        branchId: serverUser.branchId,
        branchIds: serverUser.branchIds,
        assignedServiceIds: serverUser.assignedServiceIds,
      };
      setCurrentUser(staffUser);

      // Trust the server's permission list as the source of truth (including
      // an explicit empty array, which means this user's role has been stripped
      // of all permissions by the org admin or Super Admin). Only fall back to
      // the built-in template when the server omits the field entirely.
      const staffPerms: string[] = Array.isArray(staffData?.permissions)
        ? (staffData.permissions as string[])
        : getBuiltinPermissions(serverUser.role);
      setPermissions(staffPerms);
      await AsyncStorage.setItem(`${STORAGE_KEY}_permissions`, JSON.stringify(staffPerms));

      if (branchesData?.length > 0) {
        await refreshQueueForBranch(branchesData[0].id);
      }

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(org));
      await AsyncStorage.setItem(`${STORAGE_KEY}_user`, JSON.stringify(staffUser));
      await AsyncStorage.setItem(`${STORAGE_KEY}_branches`, JSON.stringify(branchesData || []));
      return { success: true };
    } catch (error) {
      logHandledError("Login error", error);
      return { success: false, error: getErrorMessage(error, "We couldn't sign you in. Please check your email and password and try again.") };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshQueueForBranch = useCallback(async (branchId: string) => {
    try {
      const response = await apiRequest("GET", `/api/branches/${branchId}/queue`);
      const data = await response.json();
      setQueue(data.queue || []);
    } catch (error) {
      logHandledError("Error refreshing queue", error);
    }
  }, []);

  const registerOrganization = useCallback(async (data: Partial<RegisteredOrganization> & { password?: string }): Promise<{
    success: boolean;
    error?: string;
    requiresEmailVerification?: boolean;
    organizationId?: string;
    email?: string;
    otpExpiresInMinutes?: number;
    emailVerificationSent?: boolean;
  }> => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/organizations/register", {
        name: data.name,
        email: data.email,
        password: data.password || "password123",
        phone: data.phone,
        address: data.address,
        country: data.country,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        category: data.category,
        description: data.description,
        // Client-derived IANA tz from the chosen country. The server
        // validates this; if it's missing/invalid the server falls back
        // to deriving from the country name.
        timezone: data.timezone,
      });
      const result = await response.json();

      if (!result.success) {
        return { success: false, error: result.error || "We couldn't complete your registration. Please review your details and try again." };
      }

      // The backend now requires email-OTP verification before issuing a
      // session. Surface that to the caller (OrgLoginScreen) so it can
      // switch into the verify-OTP step instead of trying to log in.
      // We deliberately do NOT call loginOrganization here — even if the
      // server were to accept the credentials, the dashboard relies on
      // is_verified being true to enable customer-facing features.
      return {
        success: true,
        requiresEmailVerification: result.requiresEmailVerification !== false,
        organizationId: result.organizationId,
        email: result.email || data.email,
        otpExpiresInMinutes: result.otpExpiresInMinutes,
        emailVerificationSent: result.emailVerificationSent,
      };
    } catch (error) {
      logHandledError("Registration error", error);
      return { success: false, error: getErrorMessage(error, "We couldn't complete your registration. Please review your details and try again.") };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const verifyEmailOtp = useCallback(async (
    organizationId: string,
    otp: string,
  ): Promise<{ success: boolean; error?: string; alreadyVerified?: boolean; attemptsRemaining?: number; requiresResend?: boolean }> => {
    try {
      const response = await apiRequest("POST", "/api/organizations/verify-email-otp", {
        organizationId,
        otp,
      });
      const result = await response.json();
      if (!result.success) {
        return {
          success: false,
          error: result.error || "We couldn't verify that code. Please try again.",
          attemptsRemaining: result.attemptsRemaining,
          requiresResend: result.requiresResend,
        };
      }
      return {
        success: true,
        alreadyVerified: !!result.alreadyVerified,
      };
    } catch (error) {
      logHandledError("Verify email OTP error", error);
      // apiRequest throws with a message that often includes the server's
      // error body — surface that so users see "Incorrect code. 4 attempts
      // remaining." instead of a generic network error.
      return {
        success: false,
        error: getErrorMessage(error, "We couldn't verify that code. Please try again."),
      };
    }
  }, []);

  const resendEmailOtp = useCallback(async (
    organizationId: string,
  ): Promise<{ success: boolean; error?: string; emailSent?: boolean; retryAfterSec?: number }> => {
    try {
      const response = await apiRequest("POST", "/api/organizations/resend-email-otp", {
        organizationId,
      });
      const result = await response.json();
      if (!result.success) {
        return {
          success: false,
          error: result.error || "We couldn't send a new code. Please try again in a moment.",
          retryAfterSec: result.retryAfterSec,
        };
      }
      return {
        success: true,
        emailSent: result.emailSent,
      };
    } catch (error) {
      logHandledError("Resend email OTP error", error);
      return {
        success: false,
        error: getErrorMessage(error, "We couldn't send a new code. Please try again in a moment."),
      };
    }
  }, []);

  const logoutOrganization = useCallback(async () => {
    // Bump the auth epoch BEFORE any state changes so a still-pending
    // mount-time hydration response (which captured the previous epoch)
    // will see the mismatch and discard its results, instead of racing
    // against this logout and re-restoring the old session.
    authEpochRef.current += 1;
    // Tell the backend to clear both the org-session cookie and any stale
    // Super-Admin cookie. Without this, HttpOnly cookies survive local
    // logout and the next sign-in in the same browser/app could inherit
    // elevated permissions from the leftover Super-Admin cookie.
    try {
      await apiRequest("POST", "/api/organizations/logout");
    } catch (_err) {
      // Best-effort — proceed with local cleanup regardless.
    }
    setOrganization(null);
    setCurrentUser(null);
    // If the super admin has disabled the customer mobile app login,
    // logging out of an org must NOT drop the user back onto the
    // (now-unavailable) customer login screen — keep them on the org
    // login screen instead. We bypass the wrapped guard here because
    // this useCallback was created with [] deps and captured a stale
    // wrapper closure (see customerLoginEnabledRef).
    const customerLoginOn = customerLoginEnabledRef.current;
    setOrgLoginModeState(!customerLoginOn);
    setPermissions([]);
    setBranches([]);
    setUsers([]);
    setCurrentUserIdHeader(null);
    // Clear the shared branch+service scope so the next org/user that signs
    // in doesn't inherit a stale selection. Reset the hydration guard so the
    // next authenticated session re-reads (and re-defaults) the persisted
    // scope from scratch.
    setSelectedBranchIdState(null);
    setSelectedServiceIdState(null);
    scopeHydratedRef.current = false;
    const keysToRemove = [
      STORAGE_KEY,
      `${STORAGE_KEY}_user`,
      `${STORAGE_KEY}_permissions`,
      `${STORAGE_KEY}_branches`,
      "@tiqkets_selectedBranchId",
      "@tiqkets_selectedServiceId",
    ];
    if (customerLoginOn) {
      // Clear the persisted login-mode so the next launch defaults
      // back to the customer flow as before.
      keysToRemove.push(`${STORAGE_KEY}_loginMode`);
    } else {
      // Persist the org-login mode so a hard reload right after logout
      // also lands on org login (not on the unavailable customer flow).
      try {
        await AsyncStorage.setItem(`${STORAGE_KEY}_loginMode`, "true");
      } catch (_err) {
        // Best-effort persistence — fall through to multiRemove.
      }
    }
    await AsyncStorage.multiRemove(keysToRemove);
  }, []);

  const updateCurrentUser = useCallback(async (updates: Partial<OrgUser>) => {
    if (!currentUser) return;
    
    const updatedUser = { ...currentUser, ...updates };
    setCurrentUser(updatedUser);
    await AsyncStorage.setItem(`${STORAGE_KEY}_user`, JSON.stringify(updatedUser));
    
    setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? updatedUser : u)));

    try {
      const isOrgAdmin = currentUser.role === "admin";

      if (currentUser.id && currentUser.id !== "admin") {
        const apiUpdates: any = {};
        if (updates.name !== undefined) apiUpdates.name = updates.name;
        if (updates.phone !== undefined) apiUpdates.phone = updates.phone;
        if (updates.profilePictureUrl !== undefined) apiUpdates.profilePictureUrl = updates.profilePictureUrl;
        if (Object.keys(apiUpdates).length > 0) {
          await apiRequest("PUT", `/api/dashboard/profile/${currentUser.id}`, apiUpdates);
        }
      }

      if (isOrgAdmin && organization) {
        const orgUpdates: any = {};
        if (updates.name !== undefined) orgUpdates.name = updates.name;
        if (updates.phone !== undefined) orgUpdates.phone = updates.phone;
        if (updates.profilePictureUrl !== undefined) orgUpdates.logoUrl = updates.profilePictureUrl;
        if (Object.keys(orgUpdates).length > 0) {
          await apiRequest("PUT", `/api/organizations/${organization.id}`, orgUpdates);
          if (updates.name) {
            setOrganization((prev) => prev ? { ...prev, name: updates.name! } : prev);
          }
          if (updates.profilePictureUrl) {
            setOrganization((prev) => prev ? { ...prev, logoUrl: updates.profilePictureUrl } : prev);
          }
        }
      }
    } catch (error) {
      logHandledError("Error persisting profile update", error);
    }
  }, [currentUser, organization]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string): Promise<boolean> => {
    if (!currentUser) return false;
    try {
      if (currentUser.role === "admin" && organization) {
        await apiRequest("POST", `/api/organizations/${organization.id}/password`, {
          currentPassword,
          newPassword,
        });
      } else if (currentUser.id && currentUser.id !== "admin") {
        await apiRequest("POST", `/api/dashboard/profile/${currentUser.id}/password`, {
          currentPassword,
          newPassword,
        });
      }
      return true;
    } catch (error) {
      logHandledError("Error changing password", error);
      return false;
    }
  }, [currentUser, organization]);

  const addService = useCallback(async (service: Omit<OrgService, "id">): Promise<OrgService | undefined> => {
    if (!organization) return undefined;
    try {
      const branchId = (service as any).branchId;
      const response = await apiRequest("POST", branchId ? `/api/branches/${branchId}/services` : "/api/dashboard/services", service);
      const data = await response.json();
      const newService = data.service;
      if (newService) {
        const updatedOrg = {
          ...organization,
          services: [...organization.services, newService],
        };
        setOrganization(updatedOrg);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedOrg));
        return newService;
      }
      return undefined;
    } catch (error) {
      logHandledError("Error adding service", error);
      throw error;
    }
  }, [organization]);

  const updateService = useCallback(async (serviceId: string, updates: Partial<OrgService>) => {
    if (!organization) return;
    
    const updatedServices = organization.services.map((s) =>
      s.id === serviceId ? { ...s, ...updates } : s
    );
    const updatedOrg = { ...organization, services: updatedServices };
    setOrganization(updatedOrg);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedOrg));

    setBranches(prev => prev.map(b => ({
      ...b,
      services: b.services?.map(s =>
        s.id === serviceId ? { ...s, ...updates } : s
      ),
    })));

    try {
      await apiRequest("PUT", `/api/services/${serviceId}`, updates);
    } catch (error) {
      logHandledError("Error updating service", error);
      throw error;
    }
  }, [organization]);

  const deleteService = useCallback(async (serviceId: string) => {
    if (!organization) return;
    
    const updatedServices = organization.services.filter((s) => s.id !== serviceId);
    const updatedOrg = { ...organization, services: updatedServices };
    setOrganization(updatedOrg);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedOrg));

    try {
      await apiRequest("DELETE", `/api/services/${serviceId}`);
    } catch (error) {
      logHandledError("Error deleting service", error);
    }
  }, [organization]);

  const addDesk = useCallback(async (serviceId: string, branchId: string, name: string): Promise<Desk | undefined> => {
    try {
      const response = await apiRequest("POST", `/api/dashboard/services/${serviceId}/desks`, { name, branchId });
      const data = await response.json();
      if (data.desk) {
        setBranches(prev => prev.map(b => ({
          ...b,
          services: b.services.map(s =>
            s.id === serviceId ? { ...s, desks: [...(s.desks || []), data.desk] } : s
          ),
        })));
      }
      return data.desk;
    } catch (error) {
      logHandledError("Error adding desk", error);
      return undefined;
    }
  }, []);

  const updateDesk = useCallback(async (deskId: string, updates: Partial<Desk>) => {
    try {
      const response = await apiRequest("PUT", `/api/dashboard/desks/${deskId}`, updates);
      const data = await response.json();
      if (data.desk) {
        setBranches(prev => prev.map(b => ({
          ...b,
          services: b.services.map(s => ({
            ...s,
            desks: (s.desks || []).map(d => d.id === deskId ? { ...d, ...data.desk } : d),
          })),
        })));
      }
    } catch (error) {
      logHandledError("Error updating desk", error);
    }
  }, []);

  // Toggle queue (booking) status via the dedicated /queue-status endpoints.
  // These are gated by `org.queue.mode_change`, so operational roles (Location
  // Manager, Floor Manager, Front Desk) can open/close booking WITHOUT the
  // broader branch/service/desk *edit* permissions. The mobile screens used to
  // call the full update routes (updateBranch/updateService/updateDesk), which
  // 403 for those roles — the change showed locally but never reached the DB,
  // so the web dashboard never saw it. This mirrors what dashboard.html does.
  const setQueueStatusFor = useCallback(async (
    target: { type: "branch" | "service" | "desk"; id: string },
    status: string,
  ) => {
    const endpoint =
      target.type === "branch" ? `/api/dashboard/branches/${target.id}/queue-status` :
      target.type === "service" ? `/api/dashboard/services/${target.id}/queue-status` :
      `/api/dashboard/desks/${target.id}/queue-status`;
    await apiRequest("PUT", endpoint, { queueStatus: status });
    if (target.type === "branch") {
      setBranches(prev => prev.map(b => b.id === target.id ? { ...b, queueStatus: status } as any : b));
    } else if (target.type === "service") {
      setBranches(prev => prev.map(b => ({
        ...b,
        services: b.services?.map(s => s.id === target.id ? { ...s, queueStatus: status } as any : s),
      })));
      setOrganization(prev => prev ? {
        ...prev,
        services: prev.services.map(s => s.id === target.id ? { ...s, queueStatus: status } as any : s),
      } : prev);
    } else {
      setBranches(prev => prev.map(b => ({
        ...b,
        services: b.services?.map(s => ({
          ...s,
          desks: (s.desks || []).map(d => d.id === target.id ? { ...d, queueStatus: status } as any : d),
        })),
      })));
    }
  }, []);

  const deleteDesk = useCallback(async (deskId: string, serviceId: string) => {
    try {
      await apiRequest("DELETE", `/api/dashboard/desks/${deskId}`);
      setBranches(prev => prev.map(b => ({
        ...b,
        services: b.services.map(s =>
          s.id === serviceId ? { ...s, desks: (s.desks || []).filter(d => d.id !== deskId) } : s
        ),
      })));
    } catch (error) {
      logHandledError("Error deleting desk", error);
    }
  }, []);

  const callNextCustomer = useCallback(async (serviceId?: string, deskId?: string, deskName?: string, branchId?: string): Promise<QueueCustomer | null> => {
    const targetBranchId = branchId || branches[0]?.id;
    if (!targetBranchId) return null;
    try {
      const response = await apiRequest("POST", `/api/branches/${targetBranchId}/queue/call-next`, { serviceId, deskId, deskName });
      const data = await response.json();
      if (data.ticket) {
        await refreshQueueForBranch(targetBranchId);
        return data.ticket;
      }
      return null;
    } catch (error) {
      logHandledError("Error calling next", error);
      return null;
    }
  }, [branches, refreshQueueForBranch]);

  const callSpecificCustomer = useCallback(async (customerId: string, deskId?: string, deskName?: string) => {
    try {
      await apiRequest("POST", `/api/tickets/${customerId}/call`, { deskId, deskName });
      if (branches.length > 0) {
        await refreshQueueForBranch(branches[0].id);
      }
    } catch (error) {
      logHandledError("Error calling customer", error);
    }
  }, [branches, refreshQueueForBranch]);

  const callAgainCustomer = useCallback(async (customerId: string, deskId?: string, deskName?: string) => {
    try {
      await apiRequest("POST", `/api/tickets/${customerId}/call`, { deskId, deskName });
      if (branches.length > 0) {
        await refreshQueueForBranch(branches[0].id);
      }
    } catch (error) {
      logHandledError("Error calling again", error);
    }
  }, [branches, refreshQueueForBranch]);

  const skipCustomer = useCallback(async (customerId: string): Promise<{ isNoShow: boolean }> => {
    const customer = queue.find((c) => c.id === customerId);
    if (!customer) return { isNoShow: false };

    const newSkipCount = customer.skipCount + 1;
    const isNoShow = newSkipCount >= 3;

    const previousQueue = queue;
    const previousOrganization = organization;

    if (isNoShow) {
      const optimisticQueue = queue.map((c) =>
        c.id === customerId
          ? { ...c, status: "no_show" as const, skipCount: newSkipCount }
          : c
      );
      setQueue(optimisticQueue);
      if (organization) {
        setOrganization({
          ...organization,
          stats: {
            ...organization.stats,
            todayNoShow: organization.stats.todayNoShow + 1,
            todayWaiting: Math.max(0, organization.stats.todayWaiting - 1),
          },
        });
      }

      try {
        await apiRequest("POST", `/api/tickets/${customerId}/no-show`, {});
        if (customer.branchId) {
          refreshQueueForBranch(customer.branchId).catch(() => {});
        }
        return { isNoShow: true };
      } catch (error) {
        logHandledError("Error marking no-show", error);
        setQueue(previousQueue);
        if (previousOrganization) setOrganization(previousOrganization);
        throw error;
      }
    }

    const currentPosition = customer.position;
    const nextWaiting = queue.find(
      (c) => c.position === currentPosition + 1 && c.status === "waiting"
    );

    let optimisticQueue: QueueCustomer[];
    if (nextWaiting) {
      optimisticQueue = queue.map((c) => {
        if (c.id === customerId) {
          return { ...c, position: currentPosition + 1, skipCount: newSkipCount, status: "waiting" as const };
        }
        if (c.id === nextWaiting.id) {
          return { ...c, position: currentPosition };
        }
        return c;
      });
    } else {
      optimisticQueue = queue.map((c) =>
        c.id === customerId
          ? { ...c, skipCount: newSkipCount, status: "waiting" as const }
          : c
      );
    }
    setQueue(optimisticQueue.sort((a, b) => a.position - b.position));

    try {
      await apiRequest("POST", `/api/tickets/${customerId}/snooze`, { positions: 1 });
      if (customer.branchId) {
        refreshQueueForBranch(customer.branchId).catch(() => {});
      }
      return { isNoShow: false };
    } catch (error) {
      logHandledError("Error skipping customer", error);
      setQueue(previousQueue);
      throw error;
    }
  }, [queue, organization, refreshQueueForBranch]);

  const refreshStats = useCallback(async () => {
    if (!branches.length) return;
    try {
      const response = await apiRequest("GET", `/api/branches/${branches[0].id}/stats`);
      const stats = await response.json();
      if (organization) {
        setOrganization({
          ...organization,
          stats: {
            ...organization.stats,
            ...stats,
          },
        });
      }
    } catch (error) {
      logHandledError("Error refreshing stats", error);
    }
  }, [branches, organization]);

  const markAsServing = useCallback(async (customerId: string) => {
    try {
      await apiRequest("POST", `/api/tickets/${customerId}/serve`);
      if (branches.length > 0) {
        await refreshQueueForBranch(branches[0].id);
      }
    } catch (error) {
      logHandledError("Error marking as serving", error);
    }
  }, [branches, refreshQueueForBranch]);

  const markAsComplete = useCallback(async (customerId: string) => {
    try {
      await apiRequest("POST", `/api/tickets/${customerId}/complete`);
      if (branches.length > 0) {
        await refreshQueueForBranch(branches[0].id);
        await refreshStats();
      }
    } catch (error) {
      logHandledError("Error marking as complete", error);
    }
  }, [branches, refreshQueueForBranch, refreshStats]);

  const markAsNoShow = useCallback(async (customerId: string) => {
    try {
      await apiRequest("POST", `/api/tickets/${customerId}/no-show`);
      if (branches.length > 0) {
        await refreshQueueForBranch(branches[0].id);
        await refreshStats();
      }
    } catch (error) {
      logHandledError("Error marking as no-show", error);
    }
  }, [branches, refreshQueueForBranch, refreshStats]);

  const markAsArrived = useCallback(async (customerId: string): Promise<{ success: boolean; customer?: QueueCustomer; error?: string }> => {
    const customer = queue.find((c) => c.id === customerId);
    if (!customer) {
      return { success: false, error: "Customer not found" };
    }
    
    if (customer.status !== "called") {
      return { success: false, error: "Customer must be called first before marking as arrived" };
    }
    
    try {
      const response = await apiRequest("POST", `/api/tickets/${customerId}/arrive`);
      const data = await response.json();
      
      const updatedCustomer = {
        ...customer,
        status: "arrived" as const,
        arrivedAt: new Date().toISOString(),
      };
      
      const updatedQueue = queue.map((c) =>
        c.id === customerId ? updatedCustomer : c
      );
      setQueue(updatedQueue);
      
      return { success: true, customer: updatedCustomer };
    } catch (error) {
      logHandledError("Error marking as arrived", error);
      return { success: false, error: "Failed to mark as arrived" };
    }
  }, [queue]);

  const holdCustomer = useCallback(async (customerId: string) => {
    try {
      await apiRequest("POST", `/api/tickets/${customerId}/hold`);
      if (branches.length > 0) {
        await refreshQueueForBranch(branches[0].id);
      }
    } catch (error) {
      logHandledError("Error putting on hold", error);
    }
  }, [branches, refreshQueueForBranch]);

  const resumeCustomer = useCallback(async (customerId: string) => {
    try {
      await apiRequest("POST", `/api/tickets/${customerId}/resume`);
      if (branches.length > 0) {
        await refreshQueueForBranch(branches[0].id);
      }
    } catch (error) {
      logHandledError("Error resuming", error);
    }
  }, [branches, refreshQueueForBranch]);

  const allocateTable = useCallback(async (customerId: string, tableNumber: string): Promise<{ success: boolean; customer?: QueueCustomer; error?: string }> => {
    const customer = queue.find((c) => c.id === customerId);
    if (!customer) {
      return { success: false, error: "Customer not found" };
    }
    
    if (!tableNumber.trim()) {
      return { success: false, error: "Table number is required" };
    }
    
    try {
      const response = await apiRequest("POST", `/api/tickets/${customerId}/call`, {
        tableNumber: tableNumber.trim(),
      });
      const data = await response.json();
      
      const updatedCustomer = {
        ...customer,
        status: "called" as const,
        tableNumber: tableNumber.trim(),
        calledAt: new Date().toISOString(),
        callCount: customer.callCount + 1,
      };
      
      const updatedQueue = queue.map((c) =>
        c.id === customerId ? updatedCustomer : c
      );
      setQueue(updatedQueue);
      
      return { success: true, customer: updatedCustomer };
    } catch (error) {
      logHandledError("Error allocating table", error);
      return { success: false, error: "Failed to allocate table" };
    }
  }, [queue]);

  const checkInCustomer = useCallback(async (ticketNumber: string): Promise<{ success: boolean; customer?: QueueCustomer; error?: string }> => {
    const normalizedTicket = ticketNumber.toUpperCase().trim();
    const customer = queue.find((c) => c.ticketNumber.toUpperCase() === normalizedTicket && c.status === "waiting");
    
    if (!customer) {
      const alreadyCheckedIn = queue.find((c) => c.ticketNumber.toUpperCase() === normalizedTicket && c.status === "completed");
      if (alreadyCheckedIn) {
        return { success: false, error: "This ticket has already been checked in" };
      }
      return { success: false, error: "Ticket not found or not in waiting status" };
    }
    
    const updatedQueue = queue.map((c) =>
      c.id === customer.id
        ? { ...c, status: "completed" as const, completedAt: new Date().toISOString() }
        : c
    );
    setQueue(updatedQueue);
    
    if (organization) {
      const updatedOrg = {
        ...organization,
        stats: {
          ...organization.stats,
          todayServed: organization.stats.todayServed + 1,
          todayWaiting: Math.max(0, organization.stats.todayWaiting - 1),
        },
      };
      setOrganization(updatedOrg);
    }
    
    return { success: true, customer };
  }, [queue, organization]);

  const addCounterOrder = useCallback(async (customerName: string, orderId?: string): Promise<{ success: boolean; customer?: QueueCustomer; error?: string }> => {
    if (!organization) return { success: false, error: "Organization not loaded" };
    if (!branches.length) return { success: false, error: "No branch available" };
    
    const trimmedName = customerName.trim();
    if (!trimmedName) {
      return { success: false, error: "Customer name is required" };
    }
    
    try {
      const branchId = branches[0].id;
      const serviceId = organization.services[0]?.id;
      if (!serviceId) return { success: false, error: "No service available" };
      
      const response = await apiRequest("POST", `/api/join/${branchId}`, {
        serviceId,
        customerName: trimmedName,
        customerPhone: "",
        customerEmail: "",
        formData: {
          orderSource: "counter",
          orderId: orderId || "",
        },
        source: "manual",
      });
      const data = await response.json();
      
      if (data.error) {
        return { success: false, error: data.error };
      }
      
      await refreshQueueForBranch(branchId);
      
      const newCustomer = queue.find((c: any) => c.id === data.ticket?.id) || {
        id: data.ticket?.id || generateId(),
        ticketNumber: data.ticket?.ticketNumber || "T000",
        customerName: trimmedName,
        customerPhone: "",
        status: "waiting" as const,
        serviceId,
        serviceName: organization.services[0]?.name || "Counter Order",
        position: data.ticket?.position || 0,
        joinedAt: new Date().toISOString(),
        estimatedWaitTime: 0,
        skipCount: 0,
        callCount: 0,
        priority: "normal" as const,
        formData: { orderSource: "counter", orderId: orderId || "" },
        source: "manual",
      };
      
      return { success: true, customer: newCustomer as QueueCustomer };
    } catch (error: any) {
      logHandledError("Error adding counter order", error);
      return { success: false, error: getErrorMessage(error, "We couldn't add this counter order. Please try again.") };
    }
  }, [queue, organization, branches, refreshQueueForBranch]);

  const addManualCustomer = useCallback(async (customerData: { 
    customerName: string; 
    customerPhone?: string; 
    customerEmail?: string; 
    formData?: Record<string, any>; 
    serviceId?: string; 
  }): Promise<{ success: boolean; customer?: QueueCustomer; error?: string }> => {
    if (!organization) return { success: false, error: "Organization not loaded" };
    if (!branches.length) return { success: false, error: "No branch available" };
    
    const trimmedName = customerData.customerName.trim() || "Walk-in Customer";
    
    try {
      const branchId = branches[0].id;
      const service = customerData.serviceId 
        ? organization.services.find(s => s.id === customerData.serviceId) 
        : organization.services[0];
      const serviceId = service?.id;
      if (!serviceId) return { success: false, error: "No service available" };
      
      const response = await apiRequest("POST", `/api/join/${branchId}`, {
        serviceId,
        customerName: trimmedName,
        customerPhone: customerData.customerPhone || "",
        customerEmail: customerData.customerEmail || "",
        formData: customerData.formData || {},
        source: "manual",
      });
      const data = await response.json();
      
      if (data.error) {
        return { success: false, error: data.error };
      }
      
      await refreshQueueForBranch(branchId);
      
      const newCustomer = {
        id: data.ticket?.id || generateId(),
        ticketNumber: data.ticket?.ticketNumber || "M000",
        customerName: trimmedName,
        customerPhone: customerData.customerPhone || "",
        customerEmail: customerData.customerEmail || "",
        status: "waiting" as const,
        serviceId,
        serviceName: service?.name || "Manual Entry",
        position: data.ticket?.position || 0,
        joinedAt: new Date().toISOString(),
        estimatedWaitTime: 0,
        skipCount: 0,
        callCount: 0,
        priority: "normal" as const,
        formData: customerData.formData || {},
        source: "manual",
      };
      
      return { success: true, customer: newCustomer as QueueCustomer };
    } catch (error: any) {
      logHandledError("Error adding manual customer", error);
      return { success: false, error: getErrorMessage(error, "We couldn't add this customer to the queue. Please try again.") };
    }
  }, [organization, branches, refreshQueueForBranch]);

  const addReservation = useCallback(async (customerData: { 
    customerName: string; 
    customerPhone?: string; 
    customerEmail?: string; 
    formData?: Record<string, any>; 
    serviceId?: string;
    reservationTime: string;
  }): Promise<{ success: boolean; customer?: QueueCustomer; error?: string }> => {
    if (!organization) return { success: false, error: "Organization not loaded" };
    
    const trimmedName = customerData.customerName.trim();
    if (!trimmedName) {
      return { success: false, error: "Customer name is required" };
    }
    
    const maxTicket = queue.reduce((max, c) => {
      const num = parseInt(c.ticketNumber.replace(/\D/g, ''), 10);
      return num > max ? num : max;
    }, 0);
    
    const newTicketNumber = `R${String(maxTicket + 1).padStart(3, '0')}`;
    const service = customerData.serviceId 
      ? organization.services.find(s => s.id === customerData.serviceId) 
      : organization.services[0];
    
    const newCustomer: QueueCustomer = {
      id: generateId(),
      ticketNumber: newTicketNumber,
      customerName: trimmedName,
      customerPhone: customerData.customerPhone || "",
      customerEmail: customerData.customerEmail || "",
      status: "reservation",
      serviceId: service?.id || "default",
      serviceName: service?.name || "Reservation",
      position: 0,
      joinedAt: customerData.reservationTime,
      estimatedWaitTime: 0,
      skipCount: 0,
      callCount: 0,
      priority: "normal",
      formData: customerData.formData || {},
      source: "reservation",
      reservationTime: customerData.reservationTime,
    };
    
    setQueue((prev) => [...prev, newCustomer]);
    
    return { success: true, customer: newCustomer };
  }, [queue, organization]);

  const checkInReservation = useCallback(async (customerId: string): Promise<{ success: boolean; customer?: QueueCustomer; error?: string }> => {
    const customer = queue.find((c) => c.id === customerId);
    if (!customer) {
      return { success: false, error: "Customer not found" };
    }
    
    if (customer.status !== "reservation") {
      return { success: false, error: "Customer is not a reservation" };
    }
    
    const updatedCustomer = {
      ...customer,
      status: "waiting" as const,
    };
    
    const updatedQueue = queue.map((c) =>
      c.id === customerId ? updatedCustomer : c
    );
    setQueue(updatedQueue);
    
    return { success: true, customer: updatedCustomer };
  }, [queue]);

  const loadBranchReservations = useCallback(async (branchId: string) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const response = await apiRequest("GET", `/api/branches/${branchId}/reservations?date=${today}`);
      const data = await response.json();
      setBranchReservations(data.reservations || []);
    } catch (error) {
      logHandledError("Error loading reservations", error);
    }
  }, []);

  const checkInApiReservation = useCallback(async (reservationId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await apiRequest("POST", `/api/reservations/${reservationId}/checkin`);
      const data = await response.json();
      if (data.ticket) {
        if (branches.length > 0) {
          await refreshQueueForBranch(branches[0].id);
          await loadBranchReservations(branches[0].id);
        }
        return { success: true };
      }
      return { success: false, error: data.error || "Failed to check in" };
    } catch (error: any) {
      return { success: false, error: error.message || "Failed to check in reservation" };
    }
  }, [branches, refreshQueueForBranch, loadBranchReservations]);

  const cancelApiReservation = useCallback(async (reservationId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await apiRequest("POST", `/api/reservations/${reservationId}/cancel`);
      if (branches.length > 0) {
        await loadBranchReservations(branches[0].id);
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message || "Failed to cancel reservation" };
    }
  }, [branches, loadBranchReservations]);

  const updateSettings = useCallback(async (settings: Partial<OrgSettings>) => {
    if (!organization) return;
    
    const updatedOrg = {
      ...organization,
      settings: { ...organization.settings, ...settings },
    };
    setOrganization(updatedOrg);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedOrg));
  }, [organization]);

  const updateBookingSlots = useCallback(async (slots: BookingSlot[]) => {
    setBookings(slots);
  }, []);

  const refreshQueue = useCallback(async () => {
    if (branches.length > 0) {
      await refreshQueueForBranch(branches[0].id);
    }
  }, [branches, refreshQueueForBranch]);

  const generateAPIKey = useCallback(async () => {
    const apiKey = generateAPIKeyString();
    const apiSecret = generateAPIKeyString().replace("tiq_", "tiq_secret_");
    
    if (organization) {
      const updatedOrg = {
        ...organization,
        settings: {
          ...organization.settings,
          api: {
            ...organization.settings.api,
            apiKey,
            apiSecret,
            isEnabled: true,
            createdAt: new Date().toISOString(),
          },
        },
      };
      setOrganization(updatedOrg);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedOrg));
    }
    
    return { apiKey, apiSecret };
  }, [organization]);

  const addUser = useCallback(async (userData: Omit<OrgUser, "id" | "createdAt" | "organizationId">): Promise<OrgUser> => {
    if (!organization?.id) {
      throw new Error("No organization selected");
    }
    // Hit the real backend so server-side validation (role + branch + Front
    // Desk service requirements) actually runs. Previously this only
    // updated local state, which silently bypassed every check.
    try {
      const response = await apiRequest("POST", "/api/dashboard/users", {
        ...userData,
        organizationId: organization.id,
      });
      const result = await response.json();
      const created: OrgUser = result.user as OrgUser;
      setUsers((prev) => [...prev, created]);
      return created;
    } catch (error) {
      logHandledError("Error creating org user", error);
      throw error;
    }
  }, [organization]);

  const updateUser = useCallback(async (userId: string, updates: Partial<OrgUser>) => {
    // PUT to the real backend so the same role + branch + Front Desk
    // service rules are enforced on edit. Strip client-only fields the
    // server doesn't accept (id/organizationId/createdAt).
    const { id: _omitId, organizationId: _omitOrg, createdAt: _omitCreated, ...apiUpdates } = updates as any;
    try {
      const response = await apiRequest("PUT", `/api/dashboard/users/${userId}`, apiUpdates);
      const result = await response.json();
      const updated: OrgUser | undefined = result?.user as OrgUser | undefined;
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...(updated ?? updates) } : u)));
    } catch (error) {
      logHandledError("Error updating org user", error);
      throw error;
    }
  }, []);

  const deleteUser = useCallback(async (userId: string) => {
    try {
      await apiRequest("DELETE", `/api/dashboard/users/${userId}`);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (error) {
      logHandledError("Error deleting org user", error);
      throw error;
    }
  }, []);

  const addBranch = useCallback(async (branchData: Omit<Branch, "id" | "createdAt" | "organizationId" | "services" | "settings">): Promise<Branch> => {
    try {
      const response = await apiRequest("POST", "/api/dashboard/branches", {
        ...branchData,
        orgId: organization?.id || "",
      });
      const result = await response.json();
      const createdBranch: Branch = {
        ...result.branch,
        services: [],
        settings: defaultSettings,
      };
      setBranches((prev) => [...prev, createdBranch]);
      return createdBranch;
    } catch (error) {
      logHandledError("Error creating branch", error);
      throw error;
    }
  }, [organization]);

  const updateBranch = useCallback(async (branchId: string, updates: Partial<Branch>) => {
    setBranches((prev) => prev.map((b) => (b.id === branchId ? { ...b, ...updates } : b)));
    const { services, settings, id, createdAt, updatedAt, organizationId, ...apiFields } = updates as any;
    if (Object.keys(apiFields).length > 0) {
      try {
        await apiRequest("PUT", `/api/dashboard/branches/${branchId}`, apiFields);
      } catch (error) {
        logHandledError("Error updating branch", error);
        throw error;
      }
    }
  }, []);

  const deleteBranch = useCallback(async (branchId: string) => {
    setBranches((prev) => prev.filter((b) => b.id !== branchId));
    try {
      await apiRequest("DELETE", `/api/dashboard/branches/${branchId}`);
    } catch (error) {
      logHandledError("Error deleting branch", error);
    }
  }, []);

  const updateBranchSettings = useCallback(async (branchId: string, settings: Partial<OrgSettings>) => {
    // Serialize writes per branch. If a previous save is still in flight
    // (e.g. its newly-created break/holiday rows haven't been replaced with
    // server ids yet), wait for it to finish so subsequent edits/deletes
    // address real DB rows instead of stale temp ids.
    const queue = branchSettingsQueueRef.current;
    const prior = queue.get(branchId) || Promise.resolve();
    const run = prior.then(() => doUpdateBranchSettings(branchId, settings)).catch(() => undefined);
    queue.set(branchId, run);
    try {
      await run;
    } finally {
      // Clear the slot only if no later call has chained onto it; otherwise
      // leave the latest promise in place so the next caller still waits.
      if (queue.get(branchId) === run) queue.delete(branchId);
    }
  }, []);

  const doUpdateBranchSettings = useCallback(async (branchId: string, settings: Partial<OrgSettings>) => {
    const announcerUserIdPatch = (settings as any).announcerUserId;
    const hasAnnouncerPatch = announcerUserIdPatch !== undefined;
    const { announcerUserId: _omitAnnouncer, ...settingsForMerge } = settings as any;

    // Snapshot the previous branch from the synchronous ref BEFORE issuing
    // optimistic updates. We can't trust a side effect inside setBranches's
    // updater because React may defer or replay it under concurrent
    // scheduling — that would silently leave prevBranch null and skip
    // persistence of operatingHours/breaks/holidays.
    const prevBranch: any = branchesRef.current.find((b) => b.id === branchId) || null;

    setBranches((prev) => prev.map((b) => {
      if (b.id !== branchId) return b;
      const next: any = { ...b, settings: { ...b.settings, ...settingsForMerge } };
      if (hasAnnouncerPatch) next.announcerUserId = announcerUserIdPatch;
      return next;
    }));

    // 1) Branch-level scalar settings (queueMode, slot duration, etc.)
    try {
      const payload: any = {};
      if (settings.queueMode !== undefined) payload.queueMode = settings.queueMode;
      if (settings.notificationMode !== undefined) payload.notificationMode = settings.notificationMode;
      if (settings.autoCallNext !== undefined) payload.autoCallNext = settings.autoCallNext;
      if (settings.maxQueueSize !== undefined) payload.maxQueueSize = settings.maxQueueSize;
      if (settings.defaultSlotDuration !== undefined) payload.defaultSlotDuration = settings.defaultSlotDuration;
      if (settings.defaultSlotCapacity !== undefined) payload.defaultSlotCapacity = settings.defaultSlotCapacity;
      if (settings.display !== undefined) payload.displaySettings = settings.display;
      if (settings.api !== undefined) payload.apiSettings = settings.api;
      if (hasAnnouncerPatch) payload.announcerUserId = announcerUserIdPatch;
      if (Object.keys(payload).length > 0) {
        await apiRequest("PUT", `/api/dashboard/branches/${branchId}/settings`, payload);
      }
    } catch (error) {
      logHandledError("Error persisting branch settings", error);
    }

    // 2) Operating hours (open/close/isOpen) + nested breaks. These do NOT
    // live on the branches table — they have dedicated /operating-hours and
    // /breaks endpoints, so the bulk PUT above silently dropped them. Diff
    // each row vs the previous server-known state and persist only deltas.
    if (settings.operatingHours !== undefined && prevBranch) {
      const prevHours: any[] = prevBranch.settings?.operatingHours || [];
      const newHours: any[] = settings.operatingHours as any[];
      for (const nh of newHours) {
        const oh = prevHours.find((p) => p.id === nh.id);
        if (!oh) continue; // Operating-hour rows are seeded on branch create.
        if (oh.openTime !== nh.openTime || oh.closeTime !== nh.closeTime || oh.isOpen !== nh.isOpen) {
          try {
            await apiRequest("PUT", `/api/dashboard/operating-hours/${nh.id}`, {
              openTime: nh.openTime,
              closeTime: nh.closeTime,
              isOpen: nh.isOpen,
            });
          } catch (error) {
            logHandledError("Error persisting operating hour", error);
          }
        }
        const prevBreaks: any[] = oh.breaks || [];
        const newBreaks: any[] = nh.breaks || [];
        // New + modified breaks
        for (const nb of newBreaks) {
          const ob = prevBreaks.find((p) => p.id === nb.id);
          if (!ob) {
            try {
              const resp = await apiRequest("POST", `/api/dashboard/breaks`, {
                operatingHourId: nh.id,
                name: nb.name,
                startTime: nb.startTime,
                endTime: nb.endTime,
              });
              const data = await resp.json().catch(() => null);
              const serverId = data?.break?.id || data?.breakTime?.id;
              if (serverId) {
                // Replace the locally-generated id with the server-issued one
                // so a subsequent edit/delete of the same break addresses the
                // real DB row instead of POSTing a duplicate.
                setBranches((prev) => prev.map((b) => {
                  if (b.id !== branchId) return b;
                  const updatedHours = (b.settings?.operatingHours || []).map((h: any) => {
                    if (h.id !== nh.id) return h;
                    return {
                      ...h,
                      breaks: (h.breaks || []).map((bk: any) => bk.id === nb.id ? { ...bk, id: serverId } : bk),
                    };
                  });
                  return { ...b, settings: { ...b.settings, operatingHours: updatedHours } };
                }));
              }
            } catch (error) {
              logHandledError("Error creating break", error);
            }
          } else if (ob.name !== nb.name || ob.startTime !== nb.startTime || ob.endTime !== nb.endTime || ob.isActive !== nb.isActive) {
            try {
              await apiRequest("PUT", `/api/dashboard/breaks/${nb.id}`, {
                name: nb.name,
                startTime: nb.startTime,
                endTime: nb.endTime,
                isActive: nb.isActive,
              });
            } catch (error) {
              logHandledError("Error updating break", error);
            }
          }
        }
        // Removed breaks
        for (const ob of prevBreaks) {
          if (!newBreaks.find((p) => p.id === ob.id)) {
            try {
              await apiRequest("DELETE", `/api/dashboard/breaks/${ob.id}`);
            } catch (error) {
              logHandledError("Error deleting break", error);
            }
          }
        }
      }
    }

    // 3) Holidays — same story: stored in a separate table with its own CRUD
    // endpoints. Diff vs previous and POST/PUT/DELETE accordingly.
    if (settings.holidays !== undefined && prevBranch) {
      const prevHolidays: any[] = prevBranch.settings?.holidays || [];
      const newHolidays: any[] = settings.holidays as any[];
      for (const nh of newHolidays) {
        const oh = prevHolidays.find((p) => p.id === nh.id);
        if (!oh) {
          try {
            const resp = await apiRequest("POST", `/api/dashboard/holidays`, {
              branchId,
              date: nh.date,
              name: nh.name,
              isRecurring: !!nh.isRecurring,
            });
            const data = await resp.json().catch(() => null);
            const serverId = data?.holiday?.id;
            if (serverId) {
              setBranches((prev) => prev.map((b) => {
                if (b.id !== branchId) return b;
                const updatedHolidays = (b.settings?.holidays || []).map((h: any) => h.id === nh.id ? { ...h, id: serverId } : h);
                return { ...b, settings: { ...b.settings, holidays: updatedHolidays } };
              }));
            }
          } catch (error) {
            logHandledError("Error creating holiday", error);
          }
        } else if (oh.name !== nh.name || oh.date !== nh.date || !!oh.isRecurring !== !!nh.isRecurring) {
          try {
            await apiRequest("PUT", `/api/dashboard/holidays/${nh.id}`, {
              date: nh.date,
              name: nh.name,
              isRecurring: !!nh.isRecurring,
            });
          } catch (error) {
            logHandledError("Error updating holiday", error);
          }
        }
      }
      for (const oh of prevHolidays) {
        if (!newHolidays.find((p) => p.id === oh.id)) {
          try {
            await apiRequest("DELETE", `/api/dashboard/holidays/${oh.id}`);
          } catch (error) {
            logHandledError("Error deleting holiday", error);
          }
        }
      }
    }
  }, []);

  const updateServiceSettings = useCallback(async (branchId: string, serviceId: string, serviceSettings: ServiceSettings) => {
    setBranches((prev) => prev.map((b) => {
      if (b.id !== branchId) return b;
      return {
        ...b,
        services: b.services.map((s) =>
          s.id === serviceId ? { ...s, serviceSettings: { ...(s.serviceSettings || {}), ...serviceSettings } } : s
        ),
      };
    }));
    if (organization) {
      setOrganization({
        ...organization,
        services: organization.services.map((s) =>
          s.id === serviceId ? { ...s, serviceSettings: { ...(s.serviceSettings || {}), ...serviceSettings } } : s
        ),
      });
    }
    try {
      await apiRequest("PUT", `/api/dashboard/branches/${branchId}/services/${serviceId}/settings`, serviceSettings);
    } catch (error) {
      logHandledError("Error persisting service settings", error);
    }
  }, [organization]);

  // Legacy action-permission API. Hard-fenced to defer to the server-issued
  // permission set so the static `ROLE_PERMISSIONS` enum map in
  // `client/types/organization.ts` cannot drift out of sync with the RBAC
  // matrix. New screens should call `hasPermission(key)` directly with a
  // permission key from `shared/permissions.ts`.
  const ACTION_TO_PERMISSION: Record<
    Exclude<keyof typeof ROLE_PERMISSIONS.admin, "allowedRoles">,
    string
  > = {
    canCreateBranches: "org.branches.create",
    canCreateUsers: "org.users.invite",
    canManagePayments: "org.billing.payment_method",
    canChangeSettings: "org.settings.queue.edit",
    canViewReports: "org.reports.view",
    canProcessQueue: "org.queue.call_next",
    canManageBranchSettings: "org.branches.edit",
  };
  const canPerformAction = useCallback((action: Exclude<keyof typeof ROLE_PERMISSIONS.admin, "allowedRoles">): boolean => {
    if (!currentUser) return false;
    const permKey = ACTION_TO_PERMISSION[action];
    if (!permKey) return false;
    return permissionSet.has(permKey);
  }, [currentUser, permissionSet]);

  const getAccessibleBranches = useCallback((): Branch[] => {
    if (!currentUser) return branches;
    if (currentUser.role === "admin") return branches;
    if (currentUser.role === "location_manager") {
      if (currentUser.branchIds && currentUser.branchIds.length > 0) {
        return branches.filter((b) => currentUser.branchIds?.includes(b.id));
      }
      if (currentUser.branchId) {
        return branches.filter((b) => b.id === currentUser.branchId);
      }
    }
    if (currentUser.branchId) {
      return branches.filter((b) => b.id === currentUser.branchId);
    }
    return [];
  }, [currentUser, branches]);

  // Keep the shared branch + service scope valid. On first run it hydrates the
  // saved selection from AsyncStorage. "All Branches"/"All Services" is stored
  // as the "__all__" sentinel and restored as null. When a concrete value is
  // missing or invalid, default to the first accessible branch and its first
  // active service. This effect only runs when branches or user changes.
  useEffect(() => {
    const accessible = getAccessibleBranches();
    if (accessible.length === 0) return;
    let cancelled = false;
    const run = async () => {
      let nextBranch = selectedBranchId;
      let nextService = selectedServiceId;
      if (!scopeHydratedRef.current) {
        scopeHydratedRef.current = true;
        try {
          const [savedB, savedS] = await Promise.all([
            AsyncStorage.getItem("@tiqkets_selectedBranchId"),
            AsyncStorage.getItem("@tiqkets_selectedServiceId"),
          ]);
          // "__all__" sentinel means "All Branches"/"All Services" (null)
          if (savedB === "__all__") nextBranch = null;
          else if (savedB && accessible.some((b) => b.id === savedB)) nextBranch = savedB;
          if (savedS === "__all__") nextService = null;
          else if (savedS) nextService = savedS;
        } catch {}
      }
      // Default to first accessible branch if the saved value is invalid (i.e.
      // not a real branch ID). The "__all__" sentinel (null in memory) is
      // valid — it means "All Branches" and is only restored from storage; we
      // don't default to it when storage is empty. Same for services.
      if (nextBranch !== null && (!nextBranch || !accessible.some((b) => b.id === nextBranch))) {
        nextBranch = accessible[0].id;
      }
      // When "All Branches" is selected, validate service against ALL accessible
      // services, not just the current branch's services.
      const branch = nextBranch ? accessible.find((b) => b.id === nextBranch) : null;
      const allServices = nextBranch
        ? (accessible.find((b) => b.id === nextBranch)?.services || []).filter((s) => s.isActive)
        : accessible.flatMap((b) => (b.services || []).filter((s) => s.isActive));
      if (nextService !== null && (!nextService || !allServices.some((s) => s.id === nextService))) {
        nextService = allServices[0]?.id || null;
      }
      if (cancelled) return;
      if (nextBranch !== selectedBranchId) setSelectedBranchId(nextBranch);
      if (nextService !== selectedServiceId) setSelectedServiceId(nextService);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [
    branches,
    currentUser,
    selectedBranchId,
    selectedServiceId,
    getAccessibleBranches,
    setSelectedBranchId,
    setSelectedServiceId,
  ]);

  // =============== MULTI-STAGE QUEUE JOURNEY FUNCTIONS ===============

  const addJourney = useCallback(async (branchId: string, journeyData: Omit<Journey, "id" | "createdAt">): Promise<Journey> => {
    const newJourney: Journey = {
      ...journeyData,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    setBranches((prev) => prev.map((b) => {
      if (b.id === branchId) {
        return { ...b, journeys: [...(b.journeys || []), newJourney] };
      }
      return b;
    }));
    return newJourney;
  }, []);

  const updateJourney = useCallback(async (branchId: string, journeyId: string, updates: Partial<Journey>) => {
    setBranches((prev) => prev.map((b) => {
      if (b.id === branchId) {
        return {
          ...b,
          journeys: (b.journeys || []).map((j) => (j.id === journeyId ? { ...j, ...updates } : j)),
        };
      }
      return b;
    }));
  }, []);

  const deleteJourney = useCallback(async (branchId: string, journeyId: string) => {
    setBranches((prev) => prev.map((b) => {
      if (b.id === branchId) {
        return { ...b, journeys: (b.journeys || []).filter((j) => j.id !== journeyId) };
      }
      return b;
    }));
  }, []);

  const startCustomerJourney = useCallback(async (customerId: string, journeyId: string): Promise<{ success: boolean; customer?: QueueCustomer; error?: string }> => {
    const customer = queue.find((c) => c.id === customerId);
    if (!customer) {
      return { success: false, error: "Customer not found" };
    }

    // Find the journey from branches
    let journey: Journey | undefined;
    for (const branch of branches) {
      journey = branch.journeys?.find((j) => j.id === journeyId);
      if (journey) break;
    }

    if (!journey || journey.stages.length === 0) {
      return { success: false, error: "Journey not found or has no stages" };
    }

    const firstStage = journey.stages[0];
    const now = new Date().toISOString();
    
    const updatedCustomer: QueueCustomer = {
      ...customer,
      journeyId: journey.id,
      journeyName: journey.name,
      currentStageIndex: 0,
      currentStageId: firstStage.id,
      serviceId: firstStage.serviceId,
      serviceName: firstStage.serviceName,
      journeyStartedAt: now,
      stageHistory: [{
        stageId: firstStage.id,
        stageIndex: 0,
        serviceId: firstStage.serviceId,
        serviceName: firstStage.serviceName,
        startedAt: now,
        skipped: false,
      }],
      status: "waiting",
    };

    setQueue((prev) => prev.map((c) => (c.id === customerId ? updatedCustomer : c)));
    return { success: true, customer: updatedCustomer };
  }, [queue, branches]);

  const moveToNextStage = useCallback(async (customerId: string): Promise<{ success: boolean; customer?: QueueCustomer; isComplete?: boolean; error?: string }> => {
    const customer = queue.find((c) => c.id === customerId);
    if (!customer || !customer.journeyId) {
      return { success: false, error: "Customer not in a journey" };
    }

    // Find the journey
    let journey: Journey | undefined;
    for (const branch of branches) {
      journey = branch.journeys?.find((j) => j.id === customer.journeyId);
      if (journey) break;
    }

    if (!journey) {
      return { success: false, error: "Journey not found" };
    }

    const currentIndex = customer.currentStageIndex || 0;
    const nextIndex = currentIndex + 1;
    const now = new Date().toISOString();

    // Complete current stage in history
    const updatedHistory = (customer.stageHistory || []).map((h, i) => {
      if (i === customer.stageHistory!.length - 1 && !h.completedAt) {
        return { ...h, completedAt: now };
      }
      return h;
    });

    // Check if journey is complete
    if (nextIndex >= journey.stages.length) {
      const completedCustomer: QueueCustomer = {
        ...customer,
        status: "completed",
        completedAt: now,
        journeyCompletedAt: now,
        stageHistory: updatedHistory,
      };
      setQueue((prev) => prev.map((c) => (c.id === customerId ? completedCustomer : c)));
      try {
        await apiRequest("POST", `/api/tickets/${customerId}/complete`);
        const bid = (customer as any).branchId || branches[0]?.id;
        if (bid) await refreshQueueForBranch(bid);
        await refreshStats();
      } catch (error) {
        logHandledError("Error completing journey stage", error);
        const bid = (customer as any).branchId || branches[0]?.id;
        if (bid) await refreshQueueForBranch(bid).catch(() => {});
        return { success: false, error: getErrorMessage(error) };
      }
      return { success: true, customer: completedCustomer, isComplete: true };
    }

    // Move to next stage
    const nextStage = journey.stages[nextIndex];
    const updatedCustomer: QueueCustomer = {
      ...customer,
      currentStageIndex: nextIndex,
      currentStageId: nextStage.id,
      serviceId: nextStage.serviceId,
      serviceName: nextStage.serviceName,
      status: "waiting",
      calledAt: undefined,
      servedAt: undefined,
      stageHistory: [
        ...updatedHistory,
        {
          stageId: nextStage.id,
          stageIndex: nextIndex,
          serviceId: nextStage.serviceId,
          serviceName: nextStage.serviceName,
          startedAt: now,
          skipped: false,
        },
      ],
    };

    setQueue((prev) => prev.map((c) => (c.id === customerId ? updatedCustomer : c)));
    try {
      await apiRequest("POST", `/api/tickets/${customerId}/move-stage`, {
        stageId: nextStage.id,
        stageIndex: nextIndex,
        stageName: nextStage.serviceName,
      });
      const bid = (customer as any).branchId || branches[0]?.id;
      if (bid) await refreshQueueForBranch(bid);
    } catch (error) {
      logHandledError("Error moving to next stage", error);
      const bid = (customer as any).branchId || branches[0]?.id;
      if (bid) await refreshQueueForBranch(bid).catch(() => {});
      return { success: false, error: getErrorMessage(error) };
    }
    return { success: true, customer: updatedCustomer, isComplete: false };
  }, [queue, branches, refreshQueueForBranch, refreshStats]);

  const moveToStage = useCallback(async (customerId: string, stageIndex: number): Promise<{ success: boolean; customer?: QueueCustomer; isComplete?: boolean; error?: string }> => {
    const customer = queue.find((c) => c.id === customerId);
    if (!customer || !customer.journeyId) {
      return { success: false, error: "Customer not in a journey" };
    }

    // Find the journey
    let journey: Journey | undefined;
    for (const branch of branches) {
      journey = branch.journeys?.find((j) => j.id === customer.journeyId);
      if (journey) break;
    }

    if (!journey) {
      return { success: false, error: "Journey not found" };
    }

    // Validate stageIndex
    if (stageIndex < 0 || stageIndex >= journey.stages.length) {
      return { success: false, error: "Invalid stage index" };
    }

    const now = new Date().toISOString();

    // Complete current stage in history
    const updatedHistory = (customer.stageHistory || []).map((h, i) => {
      if (i === customer.stageHistory!.length - 1 && !h.completedAt) {
        return { ...h, completedAt: now };
      }
      return h;
    });

    // Move to specified stage
    const targetStage = journey.stages[stageIndex];
    const updatedCustomer: QueueCustomer = {
      ...customer,
      currentStageIndex: stageIndex,
      currentStageId: targetStage.id,
      serviceId: targetStage.serviceId,
      serviceName: targetStage.serviceName,
      status: "waiting",
      calledAt: undefined,
      servedAt: undefined,
      stageHistory: [
        ...updatedHistory,
        {
          stageId: targetStage.id,
          stageIndex: stageIndex,
          serviceId: targetStage.serviceId,
          serviceName: targetStage.serviceName,
          startedAt: now,
          skipped: false,
        },
      ],
    };

    setQueue((prev) => prev.map((c) => (c.id === customerId ? updatedCustomer : c)));
    try {
      await apiRequest("POST", `/api/tickets/${customerId}/move-stage`, {
        stageId: targetStage.id,
        stageIndex: stageIndex,
        stageName: targetStage.serviceName,
      });
      const bid = (customer as any).branchId || branches[0]?.id;
      if (bid) await refreshQueueForBranch(bid);
    } catch (error) {
      logHandledError("Error moving to stage", error);
      const bid = (customer as any).branchId || branches[0]?.id;
      if (bid) await refreshQueueForBranch(bid).catch(() => {});
      return { success: false, error: getErrorMessage(error) };
    }
    return { success: true, customer: updatedCustomer, isComplete: false };
  }, [queue, branches, refreshQueueForBranch]);

  const skipStage = useCallback(async (customerId: string): Promise<{ success: boolean; customer?: QueueCustomer; error?: string }> => {
    const customer = queue.find((c) => c.id === customerId);
    if (!customer || !customer.journeyId) {
      return { success: false, error: "Customer not in a journey" };
    }

    // Find the journey
    let journey: Journey | undefined;
    for (const branch of branches) {
      journey = branch.journeys?.find((j) => j.id === customer.journeyId);
      if (journey) break;
    }

    if (!journey) {
      return { success: false, error: "Journey not found" };
    }

    const currentIndex = customer.currentStageIndex || 0;
    const currentStage = journey.stages[currentIndex];
    
    if (!currentStage.isOptional) {
      return { success: false, error: "This stage cannot be skipped" };
    }

    const now = new Date().toISOString();
    const nextIndex = currentIndex + 1;

    // Mark current stage as skipped
    const updatedHistory = (customer.stageHistory || []).map((h, i) => {
      if (i === customer.stageHistory!.length - 1) {
        return { ...h, completedAt: now, skipped: true };
      }
      return h;
    });

    // Check if journey is complete
    if (nextIndex >= journey.stages.length) {
      const completedCustomer: QueueCustomer = {
        ...customer,
        status: "completed",
        completedAt: now,
        journeyCompletedAt: now,
        stageHistory: updatedHistory,
      };
      setQueue((prev) => prev.map((c) => (c.id === customerId ? completedCustomer : c)));
      try {
        await apiRequest("POST", `/api/tickets/${customerId}/complete`);
        const bid = (customer as any).branchId || branches[0]?.id;
        if (bid) await refreshQueueForBranch(bid);
        await refreshStats();
      } catch (error) {
        logHandledError("Error completing skipped journey", error);
        const bid = (customer as any).branchId || branches[0]?.id;
        if (bid) await refreshQueueForBranch(bid).catch(() => {});
        return { success: false, error: getErrorMessage(error) };
      }
      return { success: true, customer: completedCustomer };
    }

    // Move to next stage
    const nextStage = journey.stages[nextIndex];
    const updatedCustomer: QueueCustomer = {
      ...customer,
      currentStageIndex: nextIndex,
      currentStageId: nextStage.id,
      serviceId: nextStage.serviceId,
      serviceName: nextStage.serviceName,
      status: "waiting",
      stageHistory: [
        ...updatedHistory,
        {
          stageId: nextStage.id,
          stageIndex: nextIndex,
          serviceId: nextStage.serviceId,
          serviceName: nextStage.serviceName,
          startedAt: now,
          skipped: false,
        },
      ],
    };

    setQueue((prev) => prev.map((c) => (c.id === customerId ? updatedCustomer : c)));
    try {
      await apiRequest("POST", `/api/tickets/${customerId}/move-stage`, {
        stageId: nextStage.id,
        stageIndex: nextIndex,
        stageName: nextStage.serviceName,
      });
      const bid = (customer as any).branchId || branches[0]?.id;
      if (bid) await refreshQueueForBranch(bid);
    } catch (error) {
      logHandledError("Error skipping stage", error);
      const bid = (customer as any).branchId || branches[0]?.id;
      if (bid) await refreshQueueForBranch(bid).catch(() => {});
      return { success: false, error: getErrorMessage(error) };
    }
    return { success: true, customer: updatedCustomer };
  }, [queue, branches, refreshQueueForBranch]);

  const completeJourney = useCallback(async (customerId: string): Promise<{ success: boolean; customer?: QueueCustomer; error?: string }> => {
    const customer = queue.find((c) => c.id === customerId);
    if (!customer) {
      return { success: false, error: "Customer not found" };
    }

    const now = new Date().toISOString();
    
    // Complete current stage in history
    const updatedHistory = (customer.stageHistory || []).map((h, i) => {
      if (i === (customer.stageHistory?.length || 0) - 1 && !h.completedAt) {
        return { ...h, completedAt: now };
      }
      return h;
    });

    const completedCustomer: QueueCustomer = {
      ...customer,
      status: "completed",
      completedAt: now,
      journeyCompletedAt: now,
      stageHistory: updatedHistory,
    };

    setQueue((prev) => prev.map((c) => (c.id === customerId ? completedCustomer : c)));
    try {
      await apiRequest("POST", `/api/tickets/${customerId}/complete`);
      const bid = (customer as any).branchId || branches[0]?.id;
      if (bid) await refreshQueueForBranch(bid);
      await refreshStats();
    } catch (error) {
      logHandledError("Error completing journey", error);
      const bid = (customer as any).branchId || branches[0]?.id;
      if (bid) await refreshQueueForBranch(bid).catch(() => {});
      return { success: false, error: getErrorMessage(error) };
    }
    return { success: true, customer: completedCustomer };
  }, [queue, branches, refreshQueueForBranch, refreshStats]);

  const getCustomersAtStage = useCallback((journeyId: string, stageIndex: number): QueueCustomer[] => {
    return queue.filter((c) => 
      c.journeyId === journeyId && 
      c.currentStageIndex === stageIndex &&
      c.status !== "completed" &&
      c.status !== "cancelled" &&
      c.status !== "no_show"
    );
  }, [queue]);

  return (
    <OrganizationContext.Provider
      value={{
        organization,
        currentUser,
        isOrgAuthenticated,
        isSuperAdmin,
        isLoading,
        isHydratingSession,
        orgLoginMode,
        setOrgLoginMode,
        customerLoginEnabled,
        customerLoginFlagHydrated,
        queue,
        bookings,
        users,
        branches,
        selectedBookingBranchId,
        setSelectedBookingBranchId,
        selectedBranchId,
        setSelectedBranchId,
        selectedServiceId,
        setSelectedServiceId,
        loginOrganization,
        registerOrganization,
        verifyEmailOtp,
        resendEmailOtp,
        logoutOrganization,
        updateCurrentUser,
        changePassword,
        addService,
        updateService,
        deleteService,
        callNextCustomer,
        callSpecificCustomer,
        callAgainCustomer,
        skipCustomer,
        markAsServing,
        markAsComplete,
        markAsNoShow,
        markAsArrived,
        holdCustomer,
        resumeCustomer,
        allocateTable,
        checkInCustomer,
        addCounterOrder,
        addManualCustomer,
        addReservation,
        checkInReservation,
        branchReservations,
        loadBranchReservations,
        checkInApiReservation,
        cancelApiReservation,
        updateSettings,
        updateBranchSettings,
        refreshOrganizationData,
        updateServiceSettings,
        updateBookingSlots,
        refreshQueue,
        refreshQueueForBranch,
        refreshStats,
        generateAPIKey,
        addUser,
        updateUser,
        deleteUser,
        addBranch,
        updateBranch,
        deleteBranch,
        addDesk,
        updateDesk,
        setQueueStatusFor,
        deleteDesk,
        canPerformAction,
        permissions,
        hasPermission,
        hasAnyPermission,
        refreshPermissions,
        getAccessibleBranches,
        addJourney,
        updateJourney,
        deleteJourney,
        startCustomerJourney,
        moveToNextStage,
        moveToStage,
        skipStage,
        completeJourney,
        getCustomersAtStage,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error("useOrganization must be used within an OrganizationProvider");
  }
  return context;
}
