import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { QueueEntry, HistoryEntry, QueueStats, NotificationPreferences, PREMIUM_SWAP_PRICING } from "@/types/queue";
import { notificationService } from "@/services/NotificationService";
import { apiRequest } from "@/lib/query-client";
import { useAuth } from "@/contexts/AuthContext";

interface QueueContextType {
  activeQueue: QueueEntry | null;
  history: HistoryEntry[];
  stats: QueueStats;
  isLoading: boolean;
  joinQueue: (params: JoinQueueParams) => Promise<void>;
  leaveQueue: () => Promise<void>;
  snooze: (positions: number) => Promise<boolean>;
  canSnooze: () => boolean;
  getRemainingSnoozes: () => number;
  requestSwap: (targetPosition: number, targetTicketNumber: string, isPremium: boolean) => Promise<void>;
  changeService: (serviceId: string, serviceName: string) => Promise<void>;
  refreshQueue: () => Promise<void>;
  getPremiumSwapPrice: (position: number) => { amount: number; customerShare: number; platformShare: number } | null;
  acknowledgeCall: () => Promise<void>;
}

interface JoinQueueParams {
  organizationId: string;
  organizationName: string;
  serviceId: string;
  serviceName: string;
  formData: Record<string, any>;
  notificationPreferences: NotificationPreferences;
  priority?: "normal" | "vip" | "emergency";
}

const QueueContext = createContext<QueueContextType | undefined>(undefined);

function getActiveQueueKey(userId: string | null) {
  return `@tiqkets_active_queue_${userId || "guest"}`;
}
function getHistoryKey(userId: string | null) {
  return `@tiqkets_history_${userId || "guest"}`;
}

const MAX_SNOOZE_PER_VISIT = 3;
const MAX_SNOOZE_POSITIONS = 3;

export function QueueProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [activeQueue, setActiveQueue] = useState<QueueEntry | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const notificationsSent = useRef<Set<string>>(new Set());
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.id || null;
    const prevUserId = currentUserIdRef.current;
    currentUserIdRef.current = userId;

    setActiveQueue(null);
    setHistory([]);
    resetNotificationState();
    notificationService.clearAllNotifications();

    if (userId) {
      loadDataForUser(userId);
    } else {
      setIsLoading(false);
    }

    notificationService.requestPermissions();
  }, [user?.id]);

  useEffect(() => {
    if (activeQueue && !["completed", "cancelled", "no_show"].includes(activeQueue.status)) {
      const interval = setInterval(() => {
        refreshQueue();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [activeQueue?.id, activeQueue?.status]);

  const loadDataForUser = async (userId: string) => {
    setIsLoading(true);
    try {
      const queueKey = getActiveQueueKey(userId);
      const historyKey = getHistoryKey(userId);

      const oldQueueKey = "@tiqkets_active_queue";
      const oldHistoryKey = "@tiqkets_history";
      const [storedQueue, storedHistory, legacyQueue, legacyHistory] = await Promise.all([
        AsyncStorage.getItem(queueKey),
        AsyncStorage.getItem(historyKey),
        AsyncStorage.getItem(oldQueueKey),
        AsyncStorage.getItem(oldHistoryKey),
      ]);

      if (currentUserIdRef.current !== userId) return;

      let finalQueue = storedQueue ? JSON.parse(storedQueue) : null;
      let finalHistory: HistoryEntry[] = storedHistory ? JSON.parse(storedHistory) : [];

      if (!finalQueue && legacyQueue) {
        const parsed = JSON.parse(legacyQueue);
        finalQueue = parsed;
        await AsyncStorage.setItem(queueKey, legacyQueue);
        await AsyncStorage.removeItem(oldQueueKey);
      }
      if (finalHistory.length === 0 && legacyHistory) {
        finalHistory = JSON.parse(legacyHistory);
        await AsyncStorage.setItem(historyKey, legacyHistory);
        await AsyncStorage.removeItem(oldHistoryKey);
      }

      if (currentUserIdRef.current !== userId) return;

      setActiveQueue(finalQueue);
      setHistory(finalHistory);
    } catch (error) {
      console.error("Failed to load queue data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const sendQueueNotification = (queue: QueueEntry, position: number, waitTime: number) => {
    const notificationData = {
      ticketNumber: queue.ticketNumber,
      organizationName: queue.organizationName,
      serviceName: queue.serviceName,
      position,
      estimatedWaitTime: waitTime,
    };

    if ((queue.status === "called" || position === 0) && !notificationsSent.current.has("your_turn")) {
      notificationsSent.current.add("your_turn");
      notificationService.sendYourTurnNotification({ ...notificationData, type: "your_turn" });
    } else if (position === 1 && !notificationsSent.current.has("next")) {
      notificationsSent.current.add("next");
      notificationService.sendNextInLineNotification({ ...notificationData, type: "next" });
    } else if (position === 2 && !notificationsSent.current.has("position_2")) {
      notificationsSent.current.add("position_2");
      notificationService.sendNextInLineNotification({ ...notificationData, type: "next" });
    } else if ((position <= 3 || waitTime <= 15) && position > 2 && !notificationsSent.current.has("approaching")) {
      notificationsSent.current.add("approaching");
      notificationService.sendApproachingNotification({ ...notificationData, type: "approaching" });
    }
  };

  const resetNotificationState = () => {
    notificationsSent.current.clear();
    notificationService.resetNotificationState();
  };

  const saveActiveQueue = async (entry: QueueEntry | null) => {
    const userId = currentUserIdRef.current;
    const key = getActiveQueueKey(userId);
    if (entry) {
      await AsyncStorage.setItem(key, JSON.stringify(entry));
    } else {
      await AsyncStorage.removeItem(key);
    }
  };

  const saveHistory = async (entries: HistoryEntry[]) => {
    const userId = currentUserIdRef.current;
    const key = getHistoryKey(userId);
    await AsyncStorage.setItem(key, JSON.stringify(entries));
  };

  const moveToHistory = async (status: "completed" | "cancelled" | "no_show") => {
    if (!activeQueue) return;

    const historyEntry: HistoryEntry = {
      id: `history_${Date.now()}`,
      ticketNumber: activeQueue.ticketNumber,
      organizationId: activeQueue.organizationId,
      organizationName: activeQueue.organizationName,
      serviceId: activeQueue.serviceId,
      serviceName: activeQueue.serviceName,
      joinedAt: activeQueue.joinedAt,
      completedAt: new Date().toISOString(),
      waitTime: Math.floor(
        (Date.now() - new Date(activeQueue.joinedAt).getTime()) / 60000
      ),
      status,
      formData: activeQueue.formData,
    };

    const newHistory = [historyEntry, ...history];
    await Promise.all([
      saveActiveQueue(null),
      saveHistory(newHistory),
    ]);

    setActiveQueue(null);
    setHistory(newHistory);
    resetNotificationState();
    notificationService.clearAllNotifications();
  };

  const joinQueue = async (params: JoinQueueParams) => {
    try {
      const pushToken = await notificationService.getExpoPushToken();
      
      const response = await apiRequest("POST", `/api/join/${params.organizationId}`, {
        serviceId: params.serviceId,
        customerName: params.formData.name || "Guest",
        customerPhone: params.formData.phone || "",
        customerEmail: params.formData.email || "",
        notes: params.formData.notes || "",
        priority: params.priority || "normal",
        source: "app",
        formData: params.formData,
        pushToken,
      });
      const data = await response.json();
      
      if (!data.ticket) {
        throw new Error("Failed to join queue");
      }
      
      if (pushToken && data.ticket.id) {
        apiRequest("POST", `/api/tickets/${data.ticket.id}/push-token`, { pushToken }).catch(console.error);
      }
      
      const entry: QueueEntry = {
        id: data.ticket.id,
        ticketNumber: data.ticket.ticketNumber,
        organizationId: params.organizationId,
        organizationName: params.organizationName,
        serviceId: params.serviceId,
        serviceName: params.serviceName,
        position: data.ticket.position,
        totalInQueue: data.ticket.position,
        estimatedWaitTime: data.ticket.estimatedWaitTime || data.ticket.estimatedWaitMinutes || data.ticket.position * 5,
        joinedAt: data.ticket.joinedAt,
        status: "waiting",
        priority: params.priority || "normal",
        notificationPreferences: params.notificationPreferences,
        formData: params.formData,
        snoozeCount: 0,
        maxSnoozeAllowed: MAX_SNOOZE_PER_VISIT,
        acknowledged: false,
      };

      await saveActiveQueue(entry);
      setActiveQueue(entry);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Error joining queue:", error);
      throw error;
    }
  };

  const leaveQueue = async () => {
    if (!activeQueue) return;

    try {
      await apiRequest("POST", `/api/tickets/${activeQueue.id}/cancel`);
    } catch (error) {
      console.error("Error cancelling ticket:", error);
    }

    await moveToHistory("cancelled");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const canSnooze = () => {
    if (!activeQueue) return false;
    return activeQueue.snoozeCount < activeQueue.maxSnoozeAllowed;
  };

  const getRemainingSnoozes = () => {
    if (!activeQueue) return 0;
    return activeQueue.maxSnoozeAllowed - activeQueue.snoozeCount;
  };

  const snooze = async (positions: number): Promise<boolean> => {
    if (!activeQueue || !canSnooze()) return false;

    const clampedPositions = Math.min(Math.max(positions, 1), MAX_SNOOZE_POSITIONS);

    try {
      await apiRequest("POST", `/api/tickets/${activeQueue.id}/snooze`, {
        positions: clampedPositions,
      });

      const updated: QueueEntry = {
        ...activeQueue,
        position: activeQueue.position + clampedPositions,
        estimatedWaitTime: activeQueue.estimatedWaitTime + clampedPositions * 5,
        snoozeCount: activeQueue.snoozeCount + 1,
        status: "waiting",
        acknowledged: false,
      };

      await saveActiveQueue(updated);
      setActiveQueue(updated);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return true;
    } catch (error) {
      console.error("Error snoozing on server:", error);
      await refreshQueue();
      return false;
    }
  };

  const getPremiumSwapPrice = (position: number) => {
    const pricing = PREMIUM_SWAP_PRICING.find(p => p.position === position);
    if (!pricing) return null;
    return {
      amount: pricing.amount,
      customerShare: pricing.customerShare,
      platformShare: pricing.platformShare,
    };
  };

  const requestSwap = async (targetPosition: number, targetTicketNumber: string, isPremium: boolean) => {
    if (!activeQueue) return;

    if (isPremium) {
      const pricing = getPremiumSwapPrice(targetPosition);
      if (pricing) {
        console.log(`Premium swap requested: $${pricing.amount} (Customer: $${pricing.customerShare}, Platform: $${pricing.platformShare})`);
      }
    }

    const newStatus: QueueEntry["status"] = targetPosition === 1 ? "next" : "waiting";

    const updated: QueueEntry = {
      ...activeQueue,
      position: targetPosition,
      estimatedWaitTime: targetPosition * 5,
      status: newStatus,
    };

    await saveActiveQueue(updated);
    setActiveQueue(updated);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const changeService = async (serviceId: string, serviceName: string) => {
    if (!activeQueue) return;

    const position = Math.floor(Math.random() * 10) + 2;
    const updated: QueueEntry = {
      ...activeQueue,
      serviceId,
      serviceName,
      position,
      estimatedWaitTime: position * 5,
      status: "waiting",
    };

    await saveActiveQueue(updated);
    setActiveQueue(updated);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const refreshQueue = useCallback(async () => {
    if (!activeQueue) return;
    const userId = currentUserIdRef.current;
    if (!userId) return;
    
    try {
      const response = await apiRequest("GET", `/api/tickets/${activeQueue.id}`);
      const data = await response.json();

      if (currentUserIdRef.current !== userId) return;
      
      if (!data.ticket) {
        await saveActiveQueue(null);
        setActiveQueue(null);
        return;
      }
      
      const ticket = data.ticket;

      if (ticket.customerId && ticket.customerId !== userId) {
        await saveActiveQueue(null);
        setActiveQueue(null);
        return;
      }

      if (["completed", "cancelled", "no_show"].includes(ticket.status)) {
        notificationService.stopAlertLoop();
        await moveToHistory(ticket.status as "completed" | "cancelled" | "no_show");
        return;
      }

      if (ticket.status === "serving") {
        notificationService.stopAlertLoop();
        const updated: QueueEntry = {
          ...activeQueue,
          status: "serving",
          acknowledged: true,
        };
        await saveActiveQueue(updated);
        setActiveQueue(updated);
        return;
      }

      if (ticket.status === "hold") {
        notificationService.stopAlertLoop();
        const updated: QueueEntry = {
          ...activeQueue,
          status: "hold",
        };
        await saveActiveQueue(updated);
        setActiveQueue(updated);
        return;
      }
      
      const newPosition = ticket.position || activeQueue.position;
      const newWaitTime = ticket.estimatedWaitTime || ticket.estimatedWaitMinutes || activeQueue.estimatedWaitTime;
      const newStatus: QueueEntry["status"] = ticket.status === "called" ? "called" : 
                        newPosition === 1 ? "next" : "waiting";
      const isAcknowledged = ticket.acknowledgedAt ? true : activeQueue.acknowledged;
      
      const updated: QueueEntry = {
        ...activeQueue,
        position: newPosition,
        estimatedWaitTime: newWaitTime,
        status: newStatus,
        acknowledged: isAcknowledged,
        deskId: ticket.deskId || activeQueue.deskId || null,
        deskName: ticket.deskName || activeQueue.deskName || null,
        snoozeCount: ticket.skipCount ?? activeQueue.snoozeCount,
      };
      
      await saveActiveQueue(updated);
      setActiveQueue(updated);
      
      const positionChanged = newPosition !== activeQueue.position;
      const statusChanged = newStatus !== activeQueue.status;
      if (positionChanged || statusChanged) {
        sendQueueNotification(updated, newPosition, newWaitTime);
      }
    } catch (error) {
      console.error("Error refreshing queue:", error);
    }
  }, [activeQueue, history]);

  const acknowledgeCall = async () => {
    if (!activeQueue || activeQueue.status !== "called") return;

    try {
      await apiRequest("POST", `/api/tickets/${activeQueue.id}/acknowledge`);

      const updated: QueueEntry = {
        ...activeQueue,
        acknowledged: true,
      };

      await saveActiveQueue(updated);
      setActiveQueue(updated);
      notificationService.stopAlertLoop();
      notificationService.clearAllNotifications();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Error acknowledging on server:", error);
      await refreshQueue();
    }
  };

  const stats: QueueStats = {
    totalQueuesJoined: history.length,
    averageWaitTime: history.length > 0
      ? Math.round(history.reduce((acc, h) => acc + h.waitTime, 0) / history.length)
      : 0,
    organizationsVisited: new Set(history.map((h) => h.organizationId)).size,
  };

  return (
    <QueueContext.Provider
      value={{
        activeQueue,
        history,
        stats,
        isLoading,
        joinQueue,
        leaveQueue,
        snooze,
        canSnooze,
        getRemainingSnoozes,
        requestSwap,
        changeService,
        refreshQueue,
        getPremiumSwapPrice,
        acknowledgeCall,
      }}
    >
      {children}
    </QueueContext.Provider>
  );
}

export function useQueue() {
  const context = useContext(QueueContext);
  if (!context) {
    throw new Error("useQueue must be used within a QueueProvider");
  }
  return context;
}
