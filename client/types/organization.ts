export type QueueMode = "fifo" | "selective" | "checkin" | "multistage" | "dinein" | "takeaway";

export type NotificationMode = "all_alerts" | "turn_only" | "all_alerts_info" | "turn_only_info";

// Multi-Stage Queue Types
export interface JourneyStage {
  id: string;
  serviceId: string;
  serviceName: string;
  order: number;
  isOptional: boolean;
  estimatedDuration: number;
}

export interface Journey {
  id: string;
  name: string;
  description: string;
  stages: JourneyStage[];
  isActive: boolean;
  createdAt: string;
}

export interface CustomerStageHistory {
  stageId: string;
  stageIndex: number;
  serviceId: string;
  serviceName: string;
  startedAt: string;
  completedAt?: string;
  skipped: boolean;
  staffId?: string;
  notes?: string;
}

export interface InputField {
  id: string;
  label: string;
  type: "text" | "email" | "phone" | "number" | "select" | "checkbox" | "date";
  required: boolean;
  placeholder?: string;
  options?: string[];
  validation?: string;
}

export interface ServiceSettings {
  queueMode?: QueueMode;
  notificationMode?: NotificationMode;
  display?: Partial<DisplaySettings>;
  autoCallNext?: boolean;
  maxQueueSize?: number;
}

export interface Desk {
  id: string;
  serviceId: string;
  branchId: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface OrgService {
  id: string;
  name: string;
  description: string;
  averageWaitTime: number;
  isActive: boolean;
  inputFields: InputField[];
  maxDailyCapacity?: number;
  estimatedDuration: number;
  requiresInPersonRegistration?: boolean;
  inPersonPerimeterMeters?: number;
  serviceSettings?: ServiceSettings;
  desks?: Desk[];
}

export interface BookingSlot {
  id: string;
  serviceId: string;
  date: string;
  startTime: string;
  endTime: string;
  maxCapacity: number;
  currentBookings: number;
  isBlocked: boolean;
}

export interface BreakTime {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

export interface DaySchedule {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isOpen: boolean;
  breaks: BreakTime[];
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
  isRecurring: boolean;
}

export interface DisplaySettings {
  enableBluetoothSpeaker: boolean;
  bluetoothDeviceName?: string;
  enableTVDisplay: boolean;
  tvDisplayUrl?: string;
  announcementVoice: "male" | "female";
  announcementLanguage: string;
  showQueueOnTV: boolean;
  showCalledTicketOnTV: boolean;
}

export interface APISettings {
  apiKey: string;
  apiSecret: string;
  webhookUrl?: string;
  isEnabled: boolean;
  allowedOrigins: string[];
  rateLimit: number;
  createdAt: string;
}

export interface OrgSettings {
  queueMode: QueueMode;
  notificationMode: NotificationMode;
  display: DisplaySettings;
  api: APISettings;
  autoCallNext: boolean;
  maxQueueSize: number;
  operatingHours: DaySchedule[];
  holidays: Holiday[];
  defaultSlotDuration: number;
  defaultSlotCapacity: number;
}

export type CustomerSource = "app" | "qr" | "manual" | "reservation";

export interface QueueCustomer {
  id: string;
  ticketNumber: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  serviceId: string;
  serviceName: string;
  position: number;
  joinedAt: string;
  estimatedWaitTime: number;
  status: "waiting" | "called" | "serving" | "completed" | "no_show" | "cancelled" | "hold" | "arrived" | "reservation";
  formData: Record<string, any>;
  priority: "normal" | "vip" | "emergency";
  notes?: string;
  calledAt?: string;
  servedAt?: string;
  completedAt?: string;
  holdAt?: string;
  arrivedAt?: string;
  tableNumber?: string;
  skipCount: number;
  callCount: number;
  source: CustomerSource;
  reservationTime?: string;
  deskId?: string;
  deskName?: string;
  // Multi-stage queue fields
  journeyId?: string;
  journeyName?: string;
  currentStageIndex?: number;
  currentStageId?: string;
  stageHistory?: CustomerStageHistory[];
  journeyStartedAt?: string;
  journeyCompletedAt?: string;
}

export interface OrgStats {
  todayServed: number;
  todayWaiting: number;
  todayNoShow: number;
  averageWaitTime: number;
  averageServiceTime: number;
  peakHour: string;
  totalBookingsToday: number;
  upcomingBookings: number;
}

export interface RegisteredOrganization {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  latitude: number;
  longitude: number;
  logoUrl?: string;
  category: string;
  description: string;
  isVerified: boolean;
  isActive: boolean;
  createdAt: string;
  services: OrgService[];
  settings: OrgSettings;
  stats: OrgStats;
}

export type UserRole = "admin" | "location_manager" | "floor_manager" | "front_desk";

export interface UserRolePermissions {
  canCreateBranches: boolean;
  canCreateUsers: boolean;
  canManagePayments: boolean;
  canChangeSettings: boolean;
  canViewReports: boolean;
  canProcessQueue: boolean;
  canManageBranchSettings: boolean;
  allowedUserCreation: UserRole[];
}

export const ROLE_PERMISSIONS: Record<UserRole, UserRolePermissions> = {
  admin: {
    canCreateBranches: true,
    canCreateUsers: true,
    canManagePayments: true,
    canChangeSettings: true,
    canViewReports: true,
    canProcessQueue: true,
    canManageBranchSettings: true,
    allowedUserCreation: ["admin", "location_manager", "floor_manager", "front_desk"],
  },
  location_manager: {
    canCreateBranches: false,
    canCreateUsers: true,
    canManagePayments: false,
    canChangeSettings: false,
    canViewReports: true,
    canProcessQueue: true,
    canManageBranchSettings: true,
    allowedUserCreation: ["floor_manager", "front_desk"],
  },
  floor_manager: {
    canCreateBranches: false,
    canCreateUsers: false,
    canManagePayments: false,
    canChangeSettings: false,
    canViewReports: false,
    canProcessQueue: true,
    canManageBranchSettings: false,
    allowedUserCreation: [],
  },
  front_desk: {
    canCreateBranches: false,
    canCreateUsers: false,
    canManagePayments: false,
    canChangeSettings: false,
    canViewReports: false,
    canProcessQueue: true,
    canManageBranchSettings: false,
    allowedUserCreation: [],
  },
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  location_manager: "Location Manager",
  floor_manager: "Floor Manager",
  front_desk: "Front Desk",
};

export interface Branch {
  id: string;
  organizationId: string;
  name: string;
  address: string;
  city?: string;
  state?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  isActive: boolean;
  createdAt: string;
  services: OrgService[];
  settings: OrgSettings;
  journeys?: Journey[];
}

export interface OrgUser {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  branchId?: string;
  branchName?: string;
  branchIds?: string[];
  assignedServiceIds?: string[];
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
  profilePictureUrl?: string;
}
