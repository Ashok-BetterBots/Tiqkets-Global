import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, getApiUrl, getErrorMessage } from "@/lib/query-client";
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
  isLoading: boolean;
  orgLoginMode: boolean;
  setOrgLoginMode: (mode: boolean) => void;
  queue: QueueCustomer[];
  bookings: BookingSlot[];
  users: OrgUser[];
  branches: Branch[];
  selectedBookingBranchId: string | null;
  setSelectedBookingBranchId: (branchId: string | null) => void;
  loginOrganization: (email: string, password: string) => Promise<boolean>;
  registerOrganization: (data: Partial<RegisteredOrganization> & { password?: string }) => Promise<boolean>;
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
  deleteDesk: (deskId: string, serviceId: string) => Promise<void>;
  canPerformAction: (action: keyof typeof ROLE_PERMISSIONS.admin) => boolean;
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
  const [isLoading, setIsLoading] = useState(false);
  const [queue, setQueue] = useState<QueueCustomer[]>([]);
  const [branchReservations, setBranchReservations] = useState<any[]>([]);
  const [bookings, setBookings] = useState<BookingSlot[]>([]);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBookingBranchId, setSelectedBookingBranchId] = useState<string | null>(null);
  const [orgLoginMode, setOrgLoginMode] = useState(false);

  const isOrgAuthenticated = organization !== null;

  const loginOrganization = useCallback(async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/organizations/login", { email, password });
      const data = await response.json();
      
      const { organization: orgData, branches: branchesData, users: usersData } = data;
      
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
      
      const loggedInUser: OrgUser = {
        id: usersData?.[0]?.id || "admin",
        organizationId: org.id,
        name: orgData.name || "Admin",
        email,
        phone: orgData.phone || "",
        role: "admin",
        isActive: true,
        createdAt: orgData.createdAt || new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        profilePictureUrl: orgData.logoUrl || "",
      };
      setCurrentUser(loggedInUser);
      
      if (branchesData?.length > 0) {
        await refreshQueueForBranch(branchesData[0].id);
      }
      
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(org));
      await AsyncStorage.setItem(`${STORAGE_KEY}_user`, JSON.stringify(loggedInUser));
      await AsyncStorage.setItem(`${STORAGE_KEY}_branches`, JSON.stringify(branchesData || []));
      return true;
    } catch (error) {
      console.error("Login error:", error);
      return false;
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
      console.error("Error refreshing queue:", error);
    }
  }, []);

  const registerOrganization = useCallback(async (data: Partial<RegisteredOrganization> & { password?: string }): Promise<boolean> => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/organizations/register", {
        name: data.name,
        email: data.email,
        password: data.password || "password123",
        phone: data.phone,
        address: data.address,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        category: data.category,
        description: data.description,
      });
      const result = await response.json();
      
      if (!result.success) {
        return false;
      }
      
      return await loginOrganization(data.email || "", data.password || "password123");
    } catch (error) {
      console.error("Registration error:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [loginOrganization]);

  const logoutOrganization = useCallback(async () => {
    setOrganization(null);
    setCurrentUser(null);
    setOrgLoginMode(false);
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem(`${STORAGE_KEY}_user`);
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
      console.error("Error persisting profile update:", error);
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
      console.error("Error changing password:", error);
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
      console.error("Error adding service:", error);
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
      console.error("Error updating service:", error);
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
      console.error("Error deleting service:", error);
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
      console.error("Error adding desk:", error);
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
      console.error("Error updating desk:", error);
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
      console.error("Error deleting desk:", error);
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
      console.error("Error calling next:", error);
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
      console.error("Error calling customer:", error);
    }
  }, [branches, refreshQueueForBranch]);

  const callAgainCustomer = useCallback(async (customerId: string, deskId?: string, deskName?: string) => {
    try {
      await apiRequest("POST", `/api/tickets/${customerId}/call`, { deskId, deskName });
      if (branches.length > 0) {
        await refreshQueueForBranch(branches[0].id);
      }
    } catch (error) {
      console.error("Error calling again:", error);
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
        console.error("Error marking no-show:", error);
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
      console.error("Error skipping customer:", error);
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
      console.error("Error refreshing stats:", error);
    }
  }, [branches, organization]);

  const markAsServing = useCallback(async (customerId: string) => {
    try {
      await apiRequest("POST", `/api/tickets/${customerId}/serve`);
      if (branches.length > 0) {
        await refreshQueueForBranch(branches[0].id);
      }
    } catch (error) {
      console.error("Error marking as serving:", error);
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
      console.error("Error marking as complete:", error);
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
      console.error("Error marking as no-show:", error);
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
      console.error("Error marking as arrived:", error);
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
      console.error("Error putting on hold:", error);
    }
  }, [branches, refreshQueueForBranch]);

  const resumeCustomer = useCallback(async (customerId: string) => {
    try {
      await apiRequest("POST", `/api/tickets/${customerId}/resume`);
      if (branches.length > 0) {
        await refreshQueueForBranch(branches[0].id);
      }
    } catch (error) {
      console.error("Error resuming:", error);
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
      console.error("Error allocating table:", error);
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
      console.error("Error adding counter order:", error);
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
      console.error("Error adding manual customer:", error);
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
      console.error("Error loading reservations:", error);
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
    const newUser: OrgUser = {
      ...userData,
      id: generateId(),
      organizationId: organization?.id || "",
      createdAt: new Date().toISOString(),
    };
    setUsers((prev) => [...prev, newUser]);
    return newUser;
  }, [organization]);

  const updateUser = useCallback(async (userId: string, updates: Partial<OrgUser>) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updates } : u)));
  }, []);

  const deleteUser = useCallback(async (userId: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== userId));
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
      console.error("Error creating branch:", error);
      const fallbackBranch: Branch = {
        ...branchData,
        id: generateId(),
        organizationId: organization?.id || "",
        createdAt: new Date().toISOString(),
        services: [],
        settings: defaultSettings,
      };
      setBranches((prev) => [...prev, fallbackBranch]);
      return fallbackBranch;
    }
  }, [organization]);

  const updateBranch = useCallback(async (branchId: string, updates: Partial<Branch>) => {
    setBranches((prev) => prev.map((b) => (b.id === branchId ? { ...b, ...updates } : b)));
    const { services, settings, id, createdAt, updatedAt, organizationId, ...apiFields } = updates as any;
    if (Object.keys(apiFields).length > 0) {
      try {
        await apiRequest("PUT", `/api/dashboard/branches/${branchId}`, apiFields);
      } catch (error) {
        console.error("Error updating branch:", error);
        throw error;
      }
    }
  }, []);

  const deleteBranch = useCallback(async (branchId: string) => {
    setBranches((prev) => prev.filter((b) => b.id !== branchId));
    try {
      await apiRequest("DELETE", `/api/dashboard/branches/${branchId}`);
    } catch (error) {
      console.error("Error deleting branch:", error);
    }
  }, []);

  const updateBranchSettings = useCallback(async (branchId: string, settings: Partial<OrgSettings>) => {
    setBranches((prev) => prev.map((b) => 
      b.id === branchId 
        ? { ...b, settings: { ...b.settings, ...settings } } 
        : b
    ));
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
      if (Object.keys(payload).length > 0) {
        await apiRequest("PUT", `/api/dashboard/branches/${branchId}/settings`, payload);
      }
    } catch (error) {
      console.error("Error persisting branch settings:", error);
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
      console.error("Error persisting service settings:", error);
    }
  }, [organization]);

  const canPerformAction = useCallback((action: Exclude<keyof typeof ROLE_PERMISSIONS.admin, "allowedRoles">): boolean => {
    if (!currentUser) return true;
    const permissions = ROLE_PERMISSIONS[currentUser.role];
    const value = permissions[action];
    return typeof value === "boolean" ? value : false;
  }, [currentUser]);

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
    return { success: true, customer: updatedCustomer, isComplete: false };
  }, [queue, branches]);

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
    return { success: true, customer: updatedCustomer, isComplete: false };
  }, [queue, branches]);

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
    return { success: true, customer: updatedCustomer };
  }, [queue, branches]);

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
    return { success: true, customer: completedCustomer };
  }, [queue]);

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
        isLoading,
        orgLoginMode,
        setOrgLoginMode,
        queue,
        bookings,
        users,
        branches,
        selectedBookingBranchId,
        setSelectedBookingBranchId,
        loginOrganization,
        registerOrganization,
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
        deleteDesk,
        canPerformAction,
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
