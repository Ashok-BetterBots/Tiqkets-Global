import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { Audio, AVPlaybackStatus } from "expo-av";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

const NOTIFICATION_PERMISSION_KEY = "@tiqkets_notification_permission";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type NotificationType = "approaching" | "next" | "your_turn";

interface QueueNotificationData {
  type: NotificationType;
  ticketNumber: string;
  organizationName: string;
  serviceName: string;
  position?: number;
  estimatedWaitTime?: number;
}

class NotificationService {
  private static instance: NotificationService;
  private alertSound: Audio.Sound | null = null;
  private alertPlayCount = 0;
  private maxAlertPlays = 10;
  private isPlayingAlert = false;
  private alertInterval: ReturnType<typeof setInterval> | null = null;
  private lastNotificationType: NotificationType | null = null;

  private constructor() {}

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  async requestPermissions(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      
      let finalStatus = existingStatus;
      
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus === "granted") {
        await AsyncStorage.setItem(NOTIFICATION_PERMISSION_KEY, "granted");
        
        if (Platform.OS === "android") {
          await this.setupAndroidChannel();
        }
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error("Error requesting notification permissions:", error);
      return false;
    }
  }

  private async setupAndroidChannel(): Promise<void> {
    await Notifications.setNotificationChannelAsync("queue-alerts", {
      name: "Queue Alerts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#8c1867",
      sound: "default",
      enableVibrate: true,
      showBadge: true,
    });

    await Notifications.setNotificationChannelAsync("queue-urgent", {
      name: "Your Turn",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 200, 500, 200, 500],
      lightColor: "#ffd700",
      sound: "default",
      enableVibrate: true,
      showBadge: true,
    });
  }

  async sendApproachingNotification(data: QueueNotificationData): Promise<void> {
    if (this.lastNotificationType === "approaching") return;
    this.lastNotificationType = "approaching";

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Get Ready! Your Turn is Approaching",
        body: `You're #${data.position} in line at ${data.organizationName}. Estimated wait: ${data.estimatedWaitTime} min`,
        data: { type: "queue_notification", notificationType: "approaching", ...data },
        sound: "default",
        badge: data.position,
      },
      trigger: null,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }

  async sendNextInLineNotification(data: QueueNotificationData): Promise<void> {
    if (this.lastNotificationType === "next") return;
    this.lastNotificationType = "next";

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "You're Next!",
        body: `${data.ticketNumber} - You're next in line at ${data.organizationName}. Please be ready!`,
        data: { type: "queue_notification", notificationType: "next", ...data },
        sound: "default",
        badge: 1,
      },
      trigger: null,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }

  async sendYourTurnNotification(data: QueueNotificationData): Promise<void> {
    this.lastNotificationType = "your_turn";

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "IT'S YOUR TURN!",
        body: `${data.ticketNumber} - Please proceed to ${data.serviceName} at ${data.organizationName} now!`,
        data: { type: "queue_notification", notificationType: "your_turn", ...data },
        sound: "default",
        badge: 0,
        categoryIdentifier: "urgent",
      },
      trigger: null,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
    this.startAlertLoop();
  }

  async startAlertLoop(): Promise<void> {
    if (this.isPlayingAlert) return;
    
    this.isPlayingAlert = true;
    this.alertPlayCount = 0;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });

    this.playAlertOnce();

    this.alertInterval = setInterval(() => {
      if (this.alertPlayCount < this.maxAlertPlays && this.isPlayingAlert) {
        this.playAlertOnce();
      } else {
        this.stopAlertLoop();
      }
    }, 3000);
  }

  private async playAlertOnce(): Promise<void> {
    try {
      if (this.alertSound) {
        await this.alertSound.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync(
        require("@/assets/sounds/alert.mp3"),
        { shouldPlay: true, volume: 1.0 }
      );
      
      this.alertSound = sound;
      this.alertPlayCount++;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
        }
      });
    } catch (error) {
      console.log("Alert sound not found, using haptics only");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  }

  async stopAlertLoop(): Promise<void> {
    this.isPlayingAlert = false;
    
    if (this.alertInterval) {
      clearInterval(this.alertInterval);
      this.alertInterval = null;
    }

    if (this.alertSound) {
      try {
        await this.alertSound.stopAsync();
        await this.alertSound.unloadAsync();
      } catch (error) {
        // Sound already unloaded
      }
      this.alertSound = null;
    }

    this.alertPlayCount = 0;
  }

  resetNotificationState(): void {
    this.lastNotificationType = null;
    this.stopAlertLoop();
  }

  async clearAllNotifications(): Promise<void> {
    await Notifications.dismissAllNotificationsAsync();
    await Notifications.setBadgeCountAsync(0);
  }
}

export const notificationService = NotificationService.getInstance();
