import { OrgSettings, ServiceSettings, QueueMode, NotificationMode } from "@/types/organization";

export type SettingsLevel = "organization" | "branch" | "service";

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
