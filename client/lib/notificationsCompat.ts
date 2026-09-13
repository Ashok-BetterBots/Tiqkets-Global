import Constants from "expo-constants";
import { Platform } from "react-native";

export type NotificationsModule = typeof import("expo-notifications");

let notifications: NotificationsModule | null = null;
let loadAttempted = false;

export function getNotificationsModule(): NotificationsModule | null {
  if (Platform.OS === "web" || Constants.appOwnership === "expo") {
    return null;
  }

  if (!loadAttempted) {
    loadAttempted = true;
    try {
      notifications = require("expo-notifications") as NotificationsModule;
      notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });
    } catch (error) {
      console.warn("Notifications are unavailable in this runtime:", error);
    }
  }

  return notifications;
}