import { OrgSettings, ServiceSettings, QueueMode, NotificationMode, DaySchedule, Holiday } from "@/types/organization";

export type SettingsLevel = "organization" | "branch" | "service";

export interface EffectiveAvailability {
  operatingHours: DaySchedule[];
  holidays: Holiday[];
  slotDuration: number;
  slotCapacity: number;
}

// Single source of truth for a service's EFFECTIVE availability: a per-service
// override (operating hours incl. breaks, holidays, slot duration/capacity
// stored inside the service settings blob) wins outright, otherwise we fall back
// to the branch value. Both the admin availability editor and any availability
// consumer must resolve through this helper so the values shown/edited never
// diverge from what customers actually get.
export function resolveAvailabilityForService(
  branchSettings: OrgSettings | undefined,
  serviceSettings: ServiceSettings | undefined
): EffectiveAvailability {
  const svcHours = serviceSettings?.operatingHours;
  const svcHolidays = serviceSettings?.holidays;
  return {
    operatingHours: Array.isArray(svcHours) ? svcHours : branchSettings?.operatingHours || [],
    holidays: Array.isArray(svcHolidays) ? svcHolidays : branchSettings?.holidays || [],
    slotDuration: serviceSettings?.defaultSlotDuration ?? branchSettings?.defaultSlotDuration ?? 30,
    slotCapacity: serviceSettings?.defaultSlotCapacity ?? branchSettings?.defaultSlotCapacity ?? 3,
  };
}

export function resolveSettingsForService(
  orgSettings: OrgSettings,
  branchSettings: OrgSettings | undefined,
  serviceSettings: ServiceSettings | undefined
): OrgSettings {
  const resolved = { ...orgSettings };

  if (branchSettings) {
    if (branchSettings.queueMode) resolved.queueMode = branchSettings.queueMode;
    if (branchSettings.notificationMode) resolved.notificationMode = branchSettings.notificationMode;
    if (branchSettings.display) resolved.display = { ...resolved.display, ...branchSettings.display };
    if (branchSettings.api) resolved.api = { ...resolved.api, ...branchSettings.api };
    if (branchSettings.autoCallNext !== undefined) resolved.autoCallNext = branchSettings.autoCallNext;
    if (branchSettings.maxQueueSize !== undefined) resolved.maxQueueSize = branchSettings.maxQueueSize;
  }

  if (serviceSettings) {
    if (serviceSettings.queueMode) resolved.queueMode = serviceSettings.queueMode;
    if (serviceSettings.notificationMode) resolved.notificationMode = serviceSettings.notificationMode;
    if (serviceSettings.display) resolved.display = { ...resolved.display, ...serviceSettings.display };
    if (serviceSettings.autoCallNext !== undefined) resolved.autoCallNext = serviceSettings.autoCallNext;
    if (serviceSettings.maxQueueSize !== undefined) resolved.maxQueueSize = serviceSettings.maxQueueSize;
  }

  return resolved;
}

export function getQueueModeForService(
  orgSettings: OrgSettings,
  branchSettings: OrgSettings | undefined,
  serviceSettings: ServiceSettings | undefined
): QueueMode {
  if (serviceSettings?.queueMode) return serviceSettings.queueMode;
  if (branchSettings?.queueMode) return branchSettings.queueMode;
  return orgSettings.queueMode;
}

export function getNotificationModeForService(
  orgSettings: OrgSettings,
  branchSettings: OrgSettings | undefined,
  serviceSettings: ServiceSettings | undefined
): NotificationMode {
  if (serviceSettings?.notificationMode) return serviceSettings.notificationMode;
  if (branchSettings?.notificationMode) return branchSettings.notificationMode;
  return orgSettings.notificationMode;
}
