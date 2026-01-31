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
  loginOrganization: (email: string, password: string) => Promise<boolean>;
  registerOrganization: (data: Partial<RegisteredOrganization>) => Promise<boolean>;
  logoutOrganization: () => Promise<void>;
  addService: (service: Omit<OrgService, "id">) => Promise<void>;
  updateService: (serviceId: string, service: Partial<OrgService>) => Promise<void>;
  deleteService: (serviceId: string) => Promise<void>;
  callNextCustomer: (serviceId?: string) => Promise<QueueCustomer | null>;
  callSpecificCustomer: (customerId: string) => Promise<void>;
  callAgainCustomer: (customerId: string) => Promise<void>;
  skipCustomer: (customerId: string) => Promise<{ isNoShow: boolean }>;
  markAsServing: (customerId: string) => Promise<void>;
  markAsComplete: (customerId: string) => Promise<void>;
  markAsNoShow: (customerId: string) => Promise<void>;
  updateSettings: (settings: Partial<OrgSettings>) => Promise<void>;
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

const defaultSettings: OrgSettings = {
  queueMode: "fifo",
  notificationMode: "all",
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
    { dayOfWeek: 0, openTime: "09:00", closeTime: "17:00", isOpen: false },
    { dayOfWeek: 1, openTime: "09:00", closeTime: "17:00", isOpen: true },
    { dayOfWeek: 2, openTime: "09:00", closeTime: "17:00", isOpen: true },
    { dayOfWeek: 3, openTime: "09:00", closeTime: "17:00", isOpen: true },
    { dayOfWeek: 4, openTime: "09:00", closeTime: "17:00", isOpen: true },
    { dayOfWeek: 5, openTime: "09:00", closeTime: "17:00", isOpen: true },
    { dayOfWeek: 6, openTime: "09:00", closeTime: "14:00", isOpen: true },
  ],
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
    services: [],
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
    services: [],
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
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(mockOrg));
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
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const addService = useCallback(async (service: Omit<OrgService, "id">) => {
    if (!organization) return;
    
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

  const canPerformAction = useCallback((action: keyof typeof ROLE_PERMISSIONS.admin): boolean => {
    if (!currentUser) return true;
    const permissions = ROLE_PERMISSIONS[currentUser.role];
    return permissions[action] ?? false;
  }, [currentUser]);

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
        loginOrganization,
        registerOrganization,
        logoutOrganization,
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
        updateSettings,
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
