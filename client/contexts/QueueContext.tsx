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
  const activeQueueRef = useRef<QueueEntry | null>(null);
  const historyRef = useRef<HistoryEntry[]>([]);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setActiveQueueSynced = useCallback((queue: QueueEntry | null) => {
    activeQueueRef.current = queue;
    setActiveQueue(queue);
  }, []);

  const setHistorySynced = useCallback((h: HistoryEntry[]) => {
    historyRef.current = h;
    setHistory(h);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    const userId = user?.id || null;
    currentUserIdRef.current = userId;

    stopPolling();

    activeQueueRef.current = null;
    historyRef.current = [];
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
    stopPolling();
    if (activeQueue && !["completed", "cancelled", "no_show"].includes(activeQueue.status)) {
      pollingIntervalRef.current = setInterval(() => {
        refreshQueue();
      }, 5000);
    }
    return () => stopPolling();
  }, [activeQueue?.id, activeQueue?.status]);

  const loadDataForUser = async (userId: string) => {
    setIsLoading(true);
    try {
      await AsyncStorage.multiRemove(["@tiqkets_active_queue", "@tiqkets_history"]);

      const historyKey = getHistoryKey(userId);
      const storedHistory = await AsyncStorage.getItem(historyKey);

      if (currentUserIdRef.current !== userId) return;

      const finalHistory: HistoryEntry[] = storedHistory ? JSON.parse(storedHistory) : [];
      setHistorySynced(finalHistory);

      try {
        const response = await apiRequest("GET", `/api/customers/${userId}/active-ticket`);
        const data = await response.json();

        if (currentUserIdRef.current !== userId) return;

        if (data.ticket) {
          const ticket = data.ticket;
          const entry: QueueEntry = {
            id: ticket.id,
            ticketNumber: ticket.ticketNumber,
            organizationId: ticket.branchId || "",
            organizationName: ticket.organizationName || "",
            serviceId: ticket.serviceId || "",
            serviceName: ticket.serviceName || "",
            position: ticket.position || 1,
            totalInQueue: ticket.position || 1,
            estimatedWaitTime: ticket.estimatedWaitTime || ticket.estimatedWaitMinutes || 5,
            joinedAt: ticket.joinedAt,
            status: ticket.status === "called" ? "called" : ticket.status === "serving" ? "serving" : ticket.status === "hold" ? "hold" : ticket.position === 1 ? "next" : "waiting",
            priority: ticket.priority || "normal",
            notificationPreferences: { inApp: true, whatsApp: true, sms: false },
            formData: ticket.formData || {},
            snoozeCount: ticket.skipCount || 0,
            maxSnoozeAllowed: MAX_SNOOZE_PER_VISIT,
            acknowledged: !!ticket.acknowledgedAt,
            deskId: ticket.deskId || null,
            deskName: ticket.deskName || null,
          };
          await saveActiveQueue(entry);
          setActiveQueueSynced(entry);
        } else {
          await saveActiveQueue(null);
          setActiveQueueSynced(null);
        }
      } catch (error) {
        console.error("Error fetching active ticket from server:", error);
        const queueKey = getActiveQueueKey(userId);
        const storedQueue = await AsyncStorage.getItem(queueKey);
        if (currentUserIdRef.current !== userId) return;
        setActiveQueueSynced(storedQueue ? JSON.parse(storedQueue) : null);
      }
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
    const queue = activeQueueRef.current;
    if (!queue) return;

    const historyEntry: HistoryEntry = {
      id: `history_${Date.now()}`,
      ticketNumber: queue.ticketNumber,
      organizationId: queue.organizationId,
      organizationName: queue.organizationName,
      serviceId: queue.serviceId,
      serviceName: queue.serviceName,
      joinedAt: queue.joinedAt,
      completedAt: new Date().toISOString(),
      waitTime: Math.floor(
        (Date.now() - new Date(queue.joinedAt).getTime()) / 60000
      ),
      status,
      formData: queue.formData,
    };

    const newHistory = [historyEntry, ...historyRef.current];
    await Promise.all([
      saveActiveQueue(null),
      saveHistory(newHistory),
    ]);

    setActiveQueueSynced(null);
    setHistorySynced(newHistory);
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
        customerId: currentUserIdRef.current || undefined,
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
      setActiveQueueSynced(entry);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error("Error joining queue:", error);
      throw error;
    }
  };

  const leaveQueue = async () => {
    const queue = activeQueueRef.current;
    if (!queue) return;

    try {
      await apiRequest("POST", `/api/tickets/${queue.id}/cancel`);
    } catch (error) {
      console.error("Error cancelling ticket:", error);
    }

    await moveToHistory("cancelled");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const canSnooze = () => {
    const queue = activeQueueRef.current;
    if (!queue) return false;
    return queue.snoozeCount < queue.maxSnoozeAllowed;
  };

  const getRemainingSnoozes = () => {
    const queue = activeQueueRef.current;
    if (!queue) return 0;
    return queue.maxSnoozeAllowed - queue.snoozeCount;
  };

  const snooze = async (positions: number): Promise<boolean> => {
    const queue = activeQueueRef.current;
    if (!queue || !canSnooze()) return false;

    const clampedPositions = Math.min(Math.max(positions, 1), MAX_SNOOZE_POSITIONS);

    try {
      await apiRequest("POST", `/api/tickets/${queue.id}/snooze`, {
        positions: clampedPositions,
      });

      const updated: QueueEntry = {
        ...queue,
        position: queue.position + clampedPositions,
        estimatedWaitTime: queue.estimatedWaitTime + clampedPositions * 5,
        snoozeCount: queue.snoozeCount + 1,
        status: "waiting",
        acknowledged: false,
      };

      await saveActiveQueue(updated);
      setActiveQueueSynced(updated);
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
    if (!activeQueueRef.current) return;

    if (isPremium) {
      const pricing = getPremiumSwapPrice(targetPosition);
      if (pricing) {
        console.log(`Premium swap requested: $${pricing.amount} (Customer: $${pricing.customerShare}, Platform: $${pricing.platformShare})`);
      }
    }

    const newStatus: QueueEntry["status"] = targetPosition === 1 ? "next" : "waiting";

    const updated: QueueEntry = {
      ...activeQueueRef.current,
      position: targetPosition,
      estimatedWaitTime: targetPosition * 5,
      status: newStatus,
    };

    await saveActiveQueue(updated);
    setActiveQueueSynced(updated);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const changeService = async (serviceId: string, serviceName: string) => {
    if (!activeQueueRef.current) return;

    const position = Math.floor(Math.random() * 10) + 2;
    const updated: QueueEntry = {
      ...activeQueueRef.current,
      serviceId,
      serviceName,
      position,
      estimatedWaitTime: position * 5,
      status: "waiting",
    };

    await saveActiveQueue(updated);
    setActiveQueueSynced(updated);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const refreshQueue = useCallback(async () => {
    const currentQueue = activeQueueRef.current;
    if (!currentQueue) return;
    const userId = currentUserIdRef.current;
    if (!userId) return;
    
    try {
      const response = await apiRequest("GET", `/api/tickets/${currentQueue.id}`);
      const data = await response.json();

      if (currentUserIdRef.current !== userId) return;
      if (activeQueueRef.current?.id !== currentQueue.id) return;
      
      if (!data.ticket) {
        await saveActiveQueue(null);
        setActiveQueueSynced(null);
        return;
      }
      
      const ticket = data.ticket;

      if (ticket.customerId && ticket.customerId !== userId) {
        await saveActiveQueue(null);
        setActiveQueueSynced(null);
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
          ...currentQueue,
          status: "serving",
          acknowledged: true,
        };
        await saveActiveQueue(updated);
        setActiveQueueSynced(updated);
        return;
      }

      if (ticket.status === "hold") {
        notificationService.stopAlertLoop();
        const updated: QueueEntry = {
          ...currentQueue,
          status: "hold",
        };
        await saveActiveQueue(updated);
        setActiveQueueSynced(updated);
        return;
      }
      
      const newPosition = ticket.position || currentQueue.position;
      const newWaitTime = ticket.estimatedWaitTime || ticket.estimatedWaitMinutes || currentQueue.estimatedWaitTime;
      const newStatus: QueueEntry["status"] = ticket.status === "called" ? "called" : 
                        newPosition === 1 ? "next" : "waiting";
      const isAcknowledged = ticket.acknowledgedAt ? true : currentQueue.acknowledged;
      
      const updated: QueueEntry = {
        ...currentQueue,
        position: newPosition,
        estimatedWaitTime: newWaitTime,
        status: newStatus,
        acknowledged: isAcknowledged,
        deskId: ticket.deskId || currentQueue.deskId || null,
        deskName: ticket.deskName || currentQueue.deskName || null,
        snoozeCount: ticket.skipCount ?? currentQueue.snoozeCount,
      };
      
      await saveActiveQueue(updated);
      setActiveQueueSynced(updated);
      
      const positionChanged = newPosition !== currentQueue.position;
      const statusChanged = newStatus !== currentQueue.status;
      if (positionChanged || statusChanged) {
        sendQueueNotification(updated, newPosition, newWaitTime);
      }
    } catch (error) {
      console.error("Error refreshing queue:", error);
    }
  }, []);

  const acknowledgeCall = async () => {
    const queue = activeQueueRef.current;
    if (!queue || queue.status !== "called") return;

    try {
      await apiRequest("POST", `/api/tickets/${queue.id}/acknowledge`);

      const updated: QueueEntry = {
        ...queue,
        acknowledged: true,
      };

      await saveActiveQueue(updated);
      setActiveQueueSynced(updated);
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
