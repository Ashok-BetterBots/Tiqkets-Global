import * as Notifications from "expo-notifications";
import { Platform, AppState, AppStateStatus } from "react-native";
import { Audio, AVPlaybackStatus } from "expo-av";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const NOTIFICATION_PERMISSION_KEY = "@tiqkets_notification_permission";
const PUSH_TOKEN_KEY = "@tiqkets_push_token";

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data;
    const isUrgent = data?.notificationType === "your_turn";
    
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
      priority: isUrgent ? Notifications.AndroidNotificationPriority.MAX : Notifications.AndroidNotificationPriority.HIGH,
    };
  },
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
  private pushToken: string | null = null;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private notificationResponseSubscription: Notifications.Subscription | null = null;
  private notificationReceivedSubscription: Notifications.Subscription | null = null;

  private constructor() {
    this.setupNotificationListeners();
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private setupNotificationListeners(): void {
    this.notificationReceivedSubscription = Notifications.addNotificationReceivedListener(
      async (notification) => {
        const data = notification.request.content.data;
        if (data?.notificationType === "your_turn") {
          this.startAlertLoop();
        }
      }
    );

    this.notificationResponseSubscription = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        const data = response.notification.request.content.data;
        if (data?.notificationType === "your_turn") {
          this.stopAlertLoop();
        }
      }
    );

    this.appStateSubscription = AppState.addEventListener("change", this.handleAppStateChange);
  }

  private handleAppStateChange = (nextAppState: AppStateStatus): void => {
    if (nextAppState === "active" && this.lastNotificationType === "your_turn") {
      this.startAlertLoop();
    }
  };

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

        await this.setupNotificationCategories();

        await this.registerForPushNotifications();
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error("Error requesting notification permissions:", error);
      return false;
    }
  }

  private async registerForPushNotifications(): Promise<void> {
    try {
      if (Platform.OS === "web") {
        console.log("Push notifications not fully supported on web");
        return;
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      
      if (!projectId) {
        console.log("Project ID not found for push notifications");
        return;
      }

      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      this.pushToken = token.data;
      await AsyncStorage.setItem(PUSH_TOKEN_KEY, token.data);
      console.log("Push token registered:", token.data);
    } catch (error) {
      console.log("Error registering for push notifications:", error);
    }
  }

  private async setupNotificationCategories(): Promise<void> {
    await Notifications.setNotificationCategoryAsync("queue_urgent", [
      {
        identifier: "acknowledge",
        buttonTitle: "I'm Coming!",
        options: {
          opensAppToForeground: true,
        },
      },
      {
        identifier: "snooze",
        buttonTitle: "Need More Time",
        options: {
          opensAppToForeground: true,
        },
      },
    ]);

    await Notifications.setNotificationCategoryAsync("queue_notification", [
      {
        identifier: "view",
        buttonTitle: "View Queue",
        options: {
          opensAppToForeground: true,
        },
      },
    ]);
  }

  async getPushToken(): Promise<string | null> {
    if (this.pushToken) return this.pushToken;
    return await AsyncStorage.getItem(PUSH_TOKEN_KEY);
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
        data: { ...data, notificationType: "your_turn" },
        sound: "default",
        badge: 0,
        categoryIdentifier: "queue_urgent",
      },
      trigger: null,
    });

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    
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
        require("@/assets/sounds/turn_alert.wav"),
        { shouldPlay: true, volume: 1.0 }
      );
      
      this.alertSound = sound;
      this.alertPlayCount++;

      await this.triggerHapticFeedback();

      sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
        }
      });
    } catch (error) {
      console.log("Alert sound error:", error);
      await this.triggerHapticFeedback();
    }
  }

  private async triggerHapticFeedback(): Promise<void> {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await new Promise(resolve => setTimeout(resolve, 200));
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await new Promise(resolve => setTimeout(resolve, 200));
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await new Promise(resolve => setTimeout(resolve, 200));
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (error) {
      console.log("Haptic feedback error:", error);
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
