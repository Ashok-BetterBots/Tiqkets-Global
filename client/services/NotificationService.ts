import { logHandledError } from "@/lib/logger";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { Audio, AVPlaybackStatus } from "expo-av";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

const NOTIFICATION_PERMISSION_KEY = "@tiqkets_notification_permission";
const PUSH_TOKEN_KEY = "@tiqkets_push_token";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
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

  async initializeChannels(): Promise<void> {
    if (Platform.OS === "android") {
      await this.setupAndroidChannel();
    }
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
      logHandledError("Error requesting notification permissions", error);
      return false;
    }
  }

  async getExpoPushToken(): Promise<string | null> {
    try {
      if (Platform.OS === "web") {
        return null;
      }

      const cached = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
      if (cached) return cached;

      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return null;

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        (Constants as any).easConfig?.projectId;

      if (!projectId) {
        return null;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      
      const token = tokenData.data;
      await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
      return token;
    } catch (error) {
      return null;
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
        data: { ...data, category: "queue_notification", notificationType: "approaching" },
        sound: "default",
        badge: data.position,
        ...(Platform.OS === "android" ? { channelId: "queue-alerts" } : {}),
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
        data: { ...data, category: "queue_notification", notificationType: "next" },
        sound: "default",
        badge: 1,
        ...(Platform.OS === "android" ? { channelId: "queue-urgent" } : {}),
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
        data: { ...data, category: "queue_notification", notificationType: "your_turn" },
        sound: "default",
        badge: 0,
        categoryIdentifier: "urgent",
        ...(Platform.OS === "android" ? { channelId: "queue-urgent" } : {}),
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

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
    } catch (err) {
      console.log("Audio mode setup error (non-fatal):", err);
    }

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
    this.alertPlayCount++;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 200);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 400);

    try {
      if (this.alertSound) {
        await this.alertSound.unloadAsync();
        this.alertSound = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        require("../assets/sounds/alert.mp3"),
        { shouldPlay: true, volume: 1.0 }
      );
      
      this.alertSound = sound;

      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
        }
      });
    } catch (error) {
      console.log("Alert sound playback error:", error);
      if (Platform.OS === "android") {
        Notifications.scheduleNotificationAsync({
          content: {
            title: "IT'S YOUR TURN!",
            body: "Please proceed now!",
            sound: "default",
            channelId: "queue-urgent",
            priority: Notifications.AndroidNotificationPriority.MAX,
          },
          trigger: null,
        }).catch(() => {});
      }
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
    try {
      await Notifications.dismissAllNotificationsAsync();
      await Notifications.setBadgeCountAsync(0);
    } catch {
    }
  }
}

export const notificationService = NotificationService.getInstance();
