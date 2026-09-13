import { useEffect, useRef } from "react";
import { Platform, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { QueueEntry } from "@/types/queue";
import { getNotificationsModule } from "@/lib/notificationsCompat";

export function useQueueNotifications(activeQueue: QueueEntry | null) {
  const lastNotifiedPosition = useRef<number | null>(null);
  const lastNotifiedStatus = useRef<string | null>(null);

  useEffect(() => {
    if (!activeQueue) {
      lastNotifiedPosition.current = null;
      lastNotifiedStatus.current = null;
      return;
    }

    const { position, estimatedWaitTime, status } = activeQueue;

    // "Your Turn" notification
    if (status === "called" && lastNotifiedStatus.current !== "called") {
      sendNotification(
        "It's Your Turn!",
        `Your ticket ${activeQueue.ticketNumber} has been called. Please proceed to the counter.`
      );
      lastNotifiedStatus.current = "called";
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }

    // Position 1 - "Next" notification
    if (position === 1 && lastNotifiedPosition.current !== 1) {
      sendNotification(
        "You're Next!",
        `You're next in line at ${activeQueue.organizationName}. Get ready!`
      );
      lastNotifiedPosition.current = 1;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    // Position 2 - "Only one ahead" notification
    if (position === 2 && lastNotifiedPosition.current !== 2) {
      sendNotification(
        "Almost There!",
        `Only one person ahead of you at ${activeQueue.organizationName}.`
      );
      lastNotifiedPosition.current = 2;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    }

    // Position 3 OR EWT <= 15 mins - "Get Ready" notification
    if (
      (position === 3 || estimatedWaitTime <= 15) &&
      lastNotifiedPosition.current !== 3 &&
      position > 2
    ) {
      sendNotification(
        "Your Turn is Approaching",
        `Estimated wait: ${estimatedWaitTime} minutes at ${activeQueue.organizationName}. Get ready!`
      );
      lastNotifiedPosition.current = 3;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
  }, [activeQueue?.position, activeQueue?.estimatedWaitTime, activeQueue?.status]);

  return null;
}

async function sendNotification(title: string, body: string) {
  if (Platform.OS === "web") {
    // On web, just show an alert for now
    console.log(`Notification: ${title} - ${body}`);
    return;
  }

  try {
    const Notifications = getNotificationsModule();
    if (!Notifications) return;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Notification permission not granted");
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null,
    });
  } catch (error) {
    console.log("Could not send notification:", error);
  }
}
