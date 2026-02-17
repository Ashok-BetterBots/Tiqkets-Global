export interface Location {
  latitude: number;
  longitude: number;
  address: string;
  radius: number; // meters for geofencing
}

export interface Organization {
  id: string;
  name: string;
  description: string;
  logoUrl?: string;
  services: Service[];
  location?: Location;
  operatingHours?: OperatingHours[];
}

export interface OperatingHours {
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  openTime: string; // "09:00"
  closeTime: string; // "17:00"
  slotDuration: number; // minutes per slot
}

export interface Service {
  id: string;
  name: string;
  description: string;
  averageWaitTime: number;
  formFields: FormField[];
  requiresInPersonRegistration?: boolean;
  inPersonPerimeterMeters?: number;
}

export interface FormField {
  id: string;
  label: string;
  type: "text" | "email" | "phone" | "select" | "checkbox";
  required: boolean;
  options?: string[];
}

export interface QueueEntry {
  id: string;
  ticketNumber: string;
  organizationId: string;
  organizationName: string;
  serviceId: string;
  serviceName: string;
  position: number;
  totalInQueue: number;
  estimatedWaitTime: number;
  joinedAt: string;
  status: "waiting" | "next" | "called" | "completed" | "cancelled";
  priority: "normal" | "vip" | "emergency";
  notificationPreferences: NotificationPreferences;
  formData: Record<string, any>;
  snoozeCount: number;
  maxSnoozeAllowed: number;
  deskId?: string | null;
  deskName?: string | null;
}

export interface NotificationPreferences {
  inApp: boolean;
  whatsApp: boolean;
  sms: boolean;
}

export interface HistoryEntry {
  id: string;
  ticketNumber: string;
  organizationId: string;
  organizationName: string;
  serviceId: string;
  serviceName: string;
  joinedAt: string;
  completedAt: string;
  waitTime: number;
  status: "completed" | "cancelled" | "no_show";
  formData: Record<string, any>;
}

export interface SwapRequest {
  id: string;
  fromUserId: string;
  fromPosition: number;
  fromTicketNumber: string;
  toPosition: number;
  toTicketNumber: string;
  reason?: string;
  isPremium: boolean;
  premiumAmount?: number;
  status: "pending" | "accepted" | "rejected" | "expired";
  createdAt: string;
}

export interface PremiumSwapPricing {
  position: number;
  amount: number;
  customerShare: number;
  platformShare: number;
}

export interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  defaultNotificationPreferences: NotificationPreferences;
  createdAt: string;
}

export interface QueueStats {
  totalQueuesJoined: number;
  averageWaitTime: number;
  organizationsVisited: number;
}

export const PREMIUM_SWAP_PRICING: PremiumSwapPricing[] = [
  { position: 1, amount: 10.00, customerShare: 8.00, platformShare: 2.00 },
  { position: 2, amount: 7.50, customerShare: 6.00, platformShare: 1.50 },
  { position: 3, amount: 5.00, customerShare: 4.00, platformShare: 1.00 },
];

export interface TimeSlot {
  id: string;
  startTime: string; // ISO date string
  endTime: string;
  available: boolean;
  maxCapacity: number;
  currentBookings: number;
}

export interface Appointment {
  id: string;
  userId: string;
  organizationId: string;
  organizationName: string;
  serviceId: string;
  serviceName: string;
  scheduledDate: string; // ISO date string
  scheduledTime: string; // "09:00"
  endTime: string; // "09:30"
  status: "upcoming" | "checked_in" | "completed" | "cancelled" | "no_show";
  ticketNumber?: string;
  queuePosition?: number;
  checkInTime?: string;
  arrivalDetected?: boolean;
  createdAt: string;
  notes?: string;
  formData: Record<string, any>;
}

export interface Reservation {
  id: string;
  userId: string;
  organizationId: string;
  organizationName: string;
  serviceId: string;
  serviceName: string;
  reservationType: "table" | "service" | "consultation" | "other";
  scheduledDate: string;
  scheduledTime: string;
  duration: number; // minutes
  partySize?: number;
  status: "confirmed" | "pending" | "cancelled" | "completed";
  confirmationCode: string;
  specialRequests?: string;
  createdAt: string;
}
