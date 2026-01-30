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
}

export interface NotificationPreferences {
  inApp: boolean;
  whatsApp: boolean;
  sms: boolean;
}

export interface HistoryEntry {
  id: string;
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
  toPosition: number;
  reason?: string;
  status: "pending" | "accepted" | "rejected" | "expired";
  createdAt: string;
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
