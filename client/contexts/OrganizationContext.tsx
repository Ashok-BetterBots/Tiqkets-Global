import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  UserRole,
  ROLE_PERMISSIONS,
  BreakTime,
  Holiday,
  DaySchedule,
  Journey,
  JourneyStage,
  CustomerStageHistory,
} from "@/types/organization";

interface OrganizationContextType {
  organization: RegisteredOrganization | null;
  currentUser: OrgUser | null;
  isOrgAuthenticated: boolean;
  isLoading: boolean;
  queue: QueueCustomer[];
  bookings: BookingSlot[];
  users: OrgUser[];
  branches: Branch[];
  selectedBookingBranchId: string | null;
  setSelectedBookingBranchId: (branchId: string | null) => void;
  loginOrganization: (email: string, password: string) => Promise<boolean>;
  registerOrganization: (data: Partial<RegisteredOrganization>) => Promise<boolean>;
  logoutOrganization: () => Promise<void>;
  updateCurrentUser: (updates: Partial<OrgUser>) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  addService: (service: Omit<OrgService, "id">) => Promise<OrgService | undefined>;
  updateService: (serviceId: string, service: Partial<OrgService>) => Promise<void>;
  deleteService: (serviceId: string) => Promise<void>;
  callNextCustomer: (serviceId?: string) => Promise<QueueCustomer | null>;
  callSpecificCustomer: (customerId: string) => Promise<void>;
  callAgainCustomer: (customerId: string) => Promise<void>;
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
  updateSettings: (settings: Partial<OrgSettings>) => Promise<void>;
  updateBranchSettings: (branchId: string, settings: Partial<OrgSettings>) => Promise<void>;
  updateBookingSlots: (slots: BookingSlot[]) => Promise<void>;
  refreshQueue: () => Promise<void>;
  refreshStats: () => Promise<void>;
  generateAPIKey: () => Promise<{ apiKey: string; apiSecret: string }>;
  addUser: (user: Omit<OrgUser, "id" | "createdAt" | "organizationId">) => Promise<OrgUser>;
  updateUser: (userId: string, updates: Partial<OrgUser>) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  addBranch: (branch: Omit<Branch, "id" | "createdAt" | "organizationId" | "services" | "settings">) => Promise<Branch>;
  updateBranch: (branchId: string, updates: Partial<Branch>) => Promise<void>;
  deleteBranch: (branchId: string) => Promise<void>;
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
  const [queue, setQueue] = useState<QueueCustomer[]>(MOCK_QUEUE);
  const [bookings, setBookings] = useState<BookingSlot[]>([]);
  const [users, setUsers] = useState<OrgUser[]>(MOCK_USERS);
  const [branches, setBranches] = useState<Branch[]>(MOCK_BRANCHES);
  const [selectedBookingBranchId, setSelectedBookingBranchId] = useState<string | null>(null);

  const isOrgAuthenticated = organization !== null;

  const loginOrganization = useCallback(async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      const mockOrg: RegisteredOrganization = {
        id: generateId(),
        name: "City Medical Center",
        email,
        phone: "+1234567890",
        address: "123 Main Street",
        city: "San Francisco",
        state: "California",
        pincode: "94102",
        latitude: 37.7749,
        longitude: -122.4194,
        category: "Healthcare",
        description: "Premier healthcare services for the community",
        isVerified: true,
        isActive: true,
        createdAt: new Date().toISOString(),
        services: [
          {
            id: "s1",
            name: "General Consultation",
            description: "Regular health checkup and consultation",
            averageWaitTime: 15,
            isActive: true,
            estimatedDuration: 20,
            inputFields: [
              { id: "f1", label: "Full Name", type: "text", required: true },
              { id: "f2", label: "Phone Number", type: "phone", required: true },
              { id: "f3", label: "Reason for Visit", type: "text", required: false },
            ],
          },
          {
            id: "s2",
            name: "Document Processing",
            description: "Document verification and processing",
            averageWaitTime: 10,
            isActive: true,
            estimatedDuration: 15,
            inputFields: [
              { id: "f1", label: "Full Name", type: "text", required: true },
              { id: "f2", label: "Email", type: "email", required: true },
              { id: "f3", label: "Document Type", type: "select", required: true, options: ["ID Card", "Passport", "License", "Other"] },
            ],
          },
        ],
        settings: defaultSettings,
        stats: {
          ...defaultStats,
          todayServed: 12,
          todayWaiting: 4,
          averageWaitTime: 18,
          averageServiceTime: 12,
          peakHour: "10:00 AM",
          totalBookingsToday: 8,
          upcomingBookings: 5,
        },
      };

      setOrganization(mockOrg);
      
      const loggedInUser: OrgUser = {
        id: "u1",
        organizationId: mockOrg.id,
        name: "Admin User",
        email,
        phone: "+1234567890",
        role: "admin",
        isActive: true,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
      setCurrentUser(loggedInUser);
      
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(mockOrg));
      await AsyncStorage.setItem(`${STORAGE_KEY}_user`, JSON.stringify(loggedInUser));
      return true;
    } catch (error) {
      console.error("Login error:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const registerOrganization = useCallback(async (data: Partial<RegisteredOrganization>): Promise<boolean> => {
    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      const newOrg: RegisteredOrganization = {
        id: generateId(),
        name: data.name || "",
        email: data.email || "",
        phone: data.phone || "",
        address: data.address || "",
        city: data.city || "",
        state: data.state || "",
        pincode: data.pincode || "",
        latitude: data.latitude || 0,
        longitude: data.longitude || 0,
        category: data.category || "Other",
        description: data.description || "",
        isVerified: false,
        isActive: true,
        createdAt: new Date().toISOString(),
        services: [],
        settings: defaultSettings,
        stats: defaultStats,
      };

      setOrganization(newOrg);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newOrg));
      return true;
    } catch (error) {
      console.error("Registration error:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logoutOrganization = useCallback(async () => {
    setOrganization(null);
    setCurrentUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem(`${STORAGE_KEY}_user`);
  }, []);

  const updateCurrentUser = useCallback(async (updates: Partial<OrgUser>) => {
    if (!currentUser) return;
    
    const updatedUser = { ...currentUser, ...updates };
    setCurrentUser(updatedUser);
    await AsyncStorage.setItem(`${STORAGE_KEY}_user`, JSON.stringify(updatedUser));
    
    setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? updatedUser : u)));
  }, [currentUser]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string): Promise<boolean> => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    if (currentPassword.length < 4) {
      return false;
    }
    return true;
  }, []);

  const addService = useCallback(async (service: Omit<OrgService, "id">): Promise<OrgService | undefined> => {
    if (!organization) return undefined;
    
    const newService: OrgService = {
      ...service,
      id: generateId(),
    };

    const updatedOrg = {
      ...organization,
      services: [...organization.services, newService],
    };
    setOrganization(updatedOrg);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedOrg));
    return newService;
  }, [organization]);

  const updateService = useCallback(async (serviceId: string, updates: Partial<OrgService>) => {
    if (!organization) return;
    
    const updatedServices = organization.services.map((s) =>
      s.id === serviceId ? { ...s, ...updates } : s
    );
    const updatedOrg = { ...organization, services: updatedServices };
    setOrganization(updatedOrg);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedOrg));
  }, [organization]);

  const deleteService = useCallback(async (serviceId: string) => {
    if (!organization) return;
    
    const updatedServices = organization.services.filter((s) => s.id !== serviceId);
    const updatedOrg = { ...organization, services: updatedServices };
    setOrganization(updatedOrg);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedOrg));
  }, [organization]);

  const callNextCustomer = useCallback(async (serviceId?: string): Promise<QueueCustomer | null> => {
    const waitingQueue = queue
      .filter((c) => c.status === "waiting" && (!serviceId || c.serviceId === serviceId))
      .sort((a, b) => a.position - b.position);

    if (waitingQueue.length === 0) return null;

    const nextCustomer = waitingQueue[0];
    const updatedQueue = queue.map((c) =>
      c.id === nextCustomer.id
        ? { ...c, status: "called" as const, calledAt: new Date().toISOString() }
        : c
    );
    setQueue(updatedQueue);
    return { ...nextCustomer, status: "called", calledAt: new Date().toISOString() };
  }, [queue]);

  const callSpecificCustomer = useCallback(async (customerId: string) => {
    const updatedQueue = queue.map((c) =>
      c.id === customerId
        ? { ...c, status: "called" as const, calledAt: new Date().toISOString(), callCount: c.callCount + 1 }
        : c
    );
    setQueue(updatedQueue);
  }, [queue]);

  const callAgainCustomer = useCallback(async (customerId: string) => {
    const updatedQueue = queue.map((c) =>
      c.id === customerId
        ? { ...c, calledAt: new Date().toISOString(), callCount: c.callCount + 1 }
        : c
    );
    setQueue(updatedQueue);
  }, [queue]);

  const skipCustomer = useCallback(async (customerId: string): Promise<{ isNoShow: boolean }> => {
    const customer = queue.find((c) => c.id === customerId);
    if (!customer) return { isNoShow: false };

    const newSkipCount = customer.skipCount + 1;
    const isNoShow = newSkipCount >= 3;

    if (isNoShow) {
      const updatedQueue = queue.map((c) =>
        c.id === customerId
          ? { ...c, status: "no_show" as const, skipCount: newSkipCount }
          : c
      );
      setQueue(updatedQueue);
      
      if (organization) {
        const updatedOrg = {
          ...organization,
          stats: {
            ...organization.stats,
            todayNoShow: organization.stats.todayNoShow + 1,
            todayWaiting: Math.max(0, organization.stats.todayWaiting - 1),
          },
        };
        setOrganization(updatedOrg);
      }
      
      return { isNoShow: true };
    }

    const currentPosition = customer.position;
    const nextCustomer = queue.find(
      (c) => c.position === currentPosition + 1 && c.status === "waiting"
    );

    let updatedQueue: QueueCustomer[];
    if (nextCustomer) {
      updatedQueue = queue.map((c) => {
        if (c.id === customerId) {
          return { ...c, position: currentPosition + 1, skipCount: newSkipCount, status: "waiting" as const };
        }
        if (c.id === nextCustomer.id) {
          return { ...c, position: currentPosition };
        }
        return c;
      });
    } else {
      updatedQueue = queue.map((c) =>
        c.id === customerId
          ? { ...c, skipCount: newSkipCount, status: "waiting" as const }
          : c
      );
    }

    setQueue(updatedQueue.sort((a, b) => a.position - b.position));
    return { isNoShow: false };
  }, [queue, organization]);

  const markAsServing = useCallback(async (customerId: string) => {
    const updatedQueue = queue.map((c) =>
      c.id === customerId
        ? { ...c, status: "serving" as const, servedAt: new Date().toISOString() }
        : c
    );
    setQueue(updatedQueue);
  }, [queue]);

  const markAsComplete = useCallback(async (customerId: string) => {
    const updatedQueue = queue.map((c) =>
      c.id === customerId
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
  }, [queue, organization]);

  const markAsNoShow = useCallback(async (customerId: string) => {
    const updatedQueue = queue.map((c) =>
      c.id === customerId ? { ...c, status: "no_show" as const } : c
    );
    setQueue(updatedQueue);
    
    if (organization) {
      const updatedOrg = {
        ...organization,
        stats: {
          ...organization.stats,
          todayNoShow: organization.stats.todayNoShow + 1,
          todayWaiting: Math.max(0, organization.stats.todayWaiting - 1),
        },
      };
      setOrganization(updatedOrg);
    }
  }, [queue, organization]);

  const markAsArrived = useCallback(async (customerId: string): Promise<{ success: boolean; customer?: QueueCustomer; error?: string }> => {
    const customer = queue.find((c) => c.id === customerId);
    if (!customer) {
      return { success: false, error: "Customer not found" };
    }
    
    if (customer.status !== "called") {
      return { success: false, error: "Customer must be called first before marking as arrived" };
    }
    
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
  }, [queue]);

  const holdCustomer = useCallback(async (customerId: string) => {
    const updatedQueue = queue.map((c) =>
      c.id === customerId
        ? { ...c, status: "hold" as const, holdAt: new Date().toISOString() }
        : c
    );
    setQueue(updatedQueue);
  }, [queue]);

  const resumeCustomer = useCallback(async (customerId: string) => {
    const customer = queue.find((c) => c.id === customerId);
    if (!customer || customer.status !== "hold") return;
    
    const updatedQueue = queue.map((c) =>
      c.id === customerId
        ? { 
            ...c, 
            status: "waiting" as const, 
            tableNumber: undefined,
            calledAt: undefined,
            holdAt: undefined
          }
        : c
    );
    setQueue(updatedQueue);
  }, [queue]);

  const allocateTable = useCallback(async (customerId: string, tableNumber: string): Promise<{ success: boolean; customer?: QueueCustomer; error?: string }> => {
    const customer = queue.find((c) => c.id === customerId);
    if (!customer) {
      return { success: false, error: "Customer not found" };
    }
    
    if (!tableNumber.trim()) {
      return { success: false, error: "Table number is required" };
    }
    
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
    
    // In a real app, this would trigger a push notification to the customer
    // with message: "Your table has been allocated! Table: {tableNumber}. Please proceed to the dining area."
    
    return { success: true, customer: updatedCustomer };
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
    
    const trimmedName = customerName.trim();
    if (!trimmedName) {
      return { success: false, error: "Customer name is required" };
    }
    
    const maxTicket = queue.reduce((max, c) => {
      const num = parseInt(c.ticketNumber.replace(/\D/g, ''), 10);
      return num > max ? num : max;
    }, 0);
    
    const newTicketNumber = `T${String(maxTicket + 1).padStart(3, '0')}`;
    const maxPosition = queue.reduce((max, c) => c.position > max ? c.position : max, 0);
    
    const newCustomer: QueueCustomer = {
      id: generateId(),
      ticketNumber: newTicketNumber,
      customerName: trimmedName,
      customerPhone: "",
      status: "waiting",
      serviceId: organization.services[0]?.id || "default",
      serviceName: organization.services[0]?.name || "Counter Order",
      position: maxPosition + 1,
      joinedAt: new Date().toISOString(),
      estimatedWaitTime: queue.filter((c) => c.status === "waiting").length * 5,
      skipCount: 0,
      callCount: 0,
      priority: "normal",
      formData: {
        orderSource: "counter",
        orderId: orderId || "",
      },
      source: "manual",
    };
    
    setQueue((prev) => [...prev, newCustomer]);
    
    if (organization) {
      const updatedOrg = {
        ...organization,
        stats: {
          ...organization.stats,
          todayWaiting: organization.stats.todayWaiting + 1,
        },
      };
      setOrganization(updatedOrg);
    }
    
    return { success: true, customer: newCustomer };
  }, [queue, organization]);

  const addManualCustomer = useCallback(async (customerData: { 
    customerName: string; 
    customerPhone?: string; 
    customerEmail?: string; 
    formData?: Record<string, any>; 
    serviceId?: string; 
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
    
    const newTicketNumber = `M${String(maxTicket + 1).padStart(3, '0')}`;
    const maxPosition = queue.reduce((max, c) => c.position > max ? c.position : max, 0);
    const service = customerData.serviceId 
      ? organization.services.find(s => s.id === customerData.serviceId) 
      : organization.services[0];
    
    const newCustomer: QueueCustomer = {
      id: generateId(),
      ticketNumber: newTicketNumber,
      customerName: trimmedName,
      customerPhone: customerData.customerPhone || "",
      customerEmail: customerData.customerEmail || "",
      status: "waiting",
      serviceId: service?.id || "default",
      serviceName: service?.name || "Manual Entry",
      position: maxPosition + 1,
      joinedAt: new Date().toISOString(),
      estimatedWaitTime: queue.filter((c) => c.status === "waiting").length * 5,
      skipCount: 0,
      callCount: 0,
      priority: "normal",
      formData: customerData.formData || {},
      source: "manual",
    };
    
    setQueue((prev) => [...prev, newCustomer]);
    
    if (organization) {
      const updatedOrg = {
        ...organization,
        stats: {
          ...organization.stats,
          todayWaiting: organization.stats.todayWaiting + 1,
        },
      };
      setOrganization(updatedOrg);
    }
    
    return { success: true, customer: newCustomer };
  }, [queue, organization]);

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
    await new Promise((resolve) => setTimeout(resolve, 500));
  }, []);

  const refreshStats = useCallback(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }, []);

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
    const newBranch: Branch = {
      ...branchData,
      id: generateId(),
      organizationId: organization?.id || "",
      createdAt: new Date().toISOString(),
      services: [],
      settings: defaultSettings,
    };
    setBranches((prev) => [...prev, newBranch]);
    return newBranch;
  }, [organization]);

  const updateBranch = useCallback(async (branchId: string, updates: Partial<Branch>) => {
    setBranches((prev) => prev.map((b) => (b.id === branchId ? { ...b, ...updates } : b)));
  }, []);

  const deleteBranch = useCallback(async (branchId: string) => {
    setBranches((prev) => prev.filter((b) => b.id !== branchId));
  }, []);

  const updateBranchSettings = useCallback(async (branchId: string, settings: Partial<OrgSettings>) => {
    setBranches((prev) => prev.map((b) => 
      b.id === branchId 
        ? { ...b, settings: { ...b.settings, ...settings } } 
        : b
    ));
  }, []);

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
        updateSettings,
        updateBranchSettings,
        updateBookingSlots,
        refreshQueue,
        refreshStats,
        generateAPIKey,
        addUser,
        updateUser,
        deleteUser,
        addBranch,
        updateBranch,
        deleteBranch,
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
