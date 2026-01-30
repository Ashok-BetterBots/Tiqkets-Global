export interface Organization {
  id: string;
  name: string;
  description: string;
  logoUrl?: string;
  services: Service[];
}

export interface Service {
  id: string;
  name: string;
  description: string;
  averageWaitTime: number;
  formFields: FormField[];
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
