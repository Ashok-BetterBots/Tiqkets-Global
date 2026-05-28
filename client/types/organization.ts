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
  queueStatus: QueueStatus;
  sortOrder: number;
}

export interface OrgService {
  id: string;
  name: string;
  description: string;
  averageWaitTime: number;
  isActive: boolean;
  queueStatus: QueueStatus;
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
  announcementsEnabled?: boolean;
  useDedicatedPlayerDevices?: boolean;
}

export interface AnnouncementDevice {
  id: string;
  branchId: string;
  deviceName: string;
  deviceToken: string;
  language: string;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  acknowledgedAt?: string;
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
  country?: string;
  // IANA timezone derived from the country (and city for multi-tz
  // countries) the owner picked at signup. Used to default any branch
  // created under this org so schedule wall-clock data is interpreted
  // in the right locale.
  timezone?: string | null;
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
  // Org-level kill-switch for the AI wait-time predictor. When false,
  // the server falls back to the legacy `service.averageWaitTime *
  // position` math everywhere a customer-facing ETA is shown
  // (in-app, WhatsApp templates, push notifications).
  aiWaitPredictionEnabled?: boolean;
}

// Built-in role keys. Custom roles created in Super Admin → Roles use
// arbitrary string keys, so anywhere we accept "the user's role" we use
// `string` (see OrgUser.role) and fall back to safe defaults when
// rendering an unknown key.
export type UserRole = "super_admin" | "admin" | "location_manager" | "floor_manager" | "front_desk";

export const BUILTIN_USER_ROLES: UserRole[] = [
  "super_admin",
  "admin",
  "location_manager",
  "floor_manager",
  "front_desk",
];

export function isBuiltinUserRole(key: string): key is UserRole {
  return (BUILTIN_USER_ROLES as string[]).includes(key);
}

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
  super_admin: {
    canCreateBranches: true,
    canCreateUsers: true,
    canManagePayments: true,
    canChangeSettings: true,
    canViewReports: true,
    canProcessQueue: true,
    canManageBranchSettings: true,
    allowedUserCreation: ["super_admin", "admin", "location_manager", "floor_manager", "front_desk"],
  },
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
  super_admin: "Super Admin",
  admin: "Admin",
  location_manager: "Location Manager",
  floor_manager: "Floor Manager",
  front_desk: "Front Desk",
};

export type QueueStatus = "active" | "paused" | "ended";

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
  queueStatus: QueueStatus;
  createdAt: string;
  services: OrgService[];
  settings: OrgSettings;
  journeys?: Journey[];
  announcerUserId?: string | null;
}

export interface OrgUser {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  phone?: string;
  // Role key is a free-form string because Super Admin can mint custom
  // role templates whose keys aren't part of the built-in UserRole union.
  // Renderers must use the safe-fallback helpers below
  // (getRoleLabel/getRoleColor/getRoleIcon) instead of indexing the
  // ROLE_LABELS/ROLE_COLORS/ROLE_ICONS records directly.
  role: UserRole | string;
  branchId?: string;
  branchName?: string;
  branchIds?: string[];
  assignedServiceIds?: string[];
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
  profilePictureUrl?: string;
}

// Safe label/color/icon lookup for arbitrary role keys (built-in or
// custom). For unknown keys we humanize the slug and use neutral
// styling so custom roles render coherently without UI crashes.
export function getRoleLabel(key: string | undefined | null): string {
  if (!key) return "—";
  if (isBuiltinUserRole(key)) return ROLE_LABELS[key];
  return key
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
