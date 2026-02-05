import React, { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { QueueEntry, HistoryEntry, QueueStats, NotificationPreferences, PREMIUM_SWAP_PRICING } from "@/types/queue";
import { notificationService } from "@/services/NotificationService";
import { apiRequest } from "@/lib/query-client";

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
  acknowledgeCall: () => void;
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

const ACTIVE_QUEUE_KEY = "@tiqkets_active_queue";
const HISTORY_KEY = "@tiqkets_history";
const MAX_SNOOZE_PER_VISIT = 3;

function generateTicketNumber(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const letter1 = letters[Math.floor(Math.random() * letters.length)];
  const letter2 = letters[Math.floor(Math.random() * letters.length)];
  const number = Math.floor(Math.random() * 900) + 100;
  return `${letter1}${letter2}${number}`;
}

export function QueueProvider({ children }: { children: ReactNode }) {
  const [activeQueue, setActiveQueue] = useState<QueueEntry | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const lastNotifiedPosition = useRef<number | null>(null);
  const notificationsSent = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadData();
    notificationService.requestPermissions();
  }, []);

  useEffect(() => {
    if (activeQueue && activeQueue.status !== "called") {
      const interval = setInterval(() => {
        simulateQueueProgress();
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [activeQueue]);

  const loadData = async () => {
    try {
      const [storedQueue, storedHistory] = await Promise.all([
        AsyncStorage.getItem(ACTIVE_QUEUE_KEY),
        AsyncStorage.getItem(HISTORY_KEY),
      ]);

      if (storedQueue) {
        setActiveQueue(JSON.parse(storedQueue));
      }
      if (storedHistory) {
        setHistory(JSON.parse(storedHistory));
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

    if (position === 0 && !notificationsSent.current.has("your_turn")) {
      notificationsSent.current.add("your_turn");
      notificationService.sendYourTurnNotification({ ...notificationData, type: "your_turn" });
    } else if (position === 1 && !notificationsSent.current.has("next")) {
      notificationsSent.current.add("next");
      notificationService.sendNextInLineNotification({ ...notificationData, type: "next" });
    } else if ((position <= 3 || waitTime <= 10) && position > 1 && !notificationsSent.current.has("approaching")) {
      notificationsSent.current.add("approaching");
      notificationService.sendApproachingNotification({ ...notificationData, type: "approaching" });
    }
  };

  const resetNotificationState = () => {
    notificationsSent.current.clear();
    notificationService.resetNotificationState();
  };

  const simulateQueueProgress = () => {
    setActiveQueue((current) => {
      if (!current || current.position <= 0 || current.status === "called") return current;
      
      const shouldAdvance = Math.random() > 0.5;
      if (!shouldAdvance) return current;

      const newPosition = current.position - 1;
      const newWaitTime = Math.max(0, current.estimatedWaitTime - 5);
      
      let newStatus: QueueEntry["status"] = "waiting";
      if (newPosition === 0) {
        newStatus = "called";
      } else if (newPosition === 1) {
        newStatus = "next";
      }
      
      const updated: QueueEntry = {
        ...current,
        position: Math.max(0, newPosition),
        estimatedWaitTime: newWaitTime,
        status: newStatus,
      };

      AsyncStorage.setItem(ACTIVE_QUEUE_KEY, JSON.stringify(updated));
      
      sendQueueNotification(updated, newPosition, newWaitTime);
      
      if (newPosition <= 3 && newPosition > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (newPosition === 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      return updated;
    });
  };

  const joinQueue = async (params: JoinQueueParams) => {
    try {
      const response = await apiRequest("POST", `/api/join/${params.organizationId}`, {
        serviceId: params.serviceId,
        customerName: params.formData.name || "Guest",
        customerPhone: params.formData.phone || "",
        customerEmail: params.formData.email || "",
        notes: params.formData.notes || "",
        priority: params.priority || "normal",
        source: "app",
        formData: params.formData,
      });
      const data = await response.json();
      
      if (!data.ticket) {
        throw new Error("Failed to join queue");
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
        estimatedWaitTime: data.ticket.estimatedWaitMinutes || data.ticket.position * 5,
        joinedAt: data.ticket.joinedAt,
        status: "waiting",
        priority: params.priority || "normal",
        notificationPreferences: params.notificationPreferences,
        formData: params.formData,
        snoozeCount: 0,
        maxSnoozeAllowed: MAX_SNOOZE_PER_VISIT,
      };

      await AsyncStorage.setItem(ACTIVE_QUEUE_KEY, JSON.stringify(entry));
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
      status: activeQueue.status === "called" ? "completed" : "cancelled",
      formData: activeQueue.formData,
    };

    const newHistory = [historyEntry, ...history];
    await Promise.all([
      AsyncStorage.removeItem(ACTIVE_QUEUE_KEY),
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory)),
    ]);

    setActiveQueue(null);
    setHistory(newHistory);
    resetNotificationState();
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

    const updated: QueueEntry = {
      ...activeQueue,
      position: activeQueue.position + positions,
      estimatedWaitTime: activeQueue.estimatedWaitTime + positions * 5,
      snoozeCount: activeQueue.snoozeCount + 1,
      status: "waiting",
    };

    await AsyncStorage.setItem(ACTIVE_QUEUE_KEY, JSON.stringify(updated));
    setActiveQueue(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    return true;
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

    await AsyncStorage.setItem(ACTIVE_QUEUE_KEY, JSON.stringify(updated));
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

    await AsyncStorage.setItem(ACTIVE_QUEUE_KEY, JSON.stringify(updated));
    setActiveQueue(updated);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const refreshQueue = async () => {
    if (!activeQueue) return;
    
    try {
      const response = await apiRequest("GET", `/api/tickets/${activeQueue.id}`);
      const data = await response.json();
      
      if (!data.ticket) {
        await AsyncStorage.removeItem(ACTIVE_QUEUE_KEY);
        setActiveQueue(null);
        return;
      }
      
      const ticket = data.ticket;
      const newStatus = ticket.status === "called" ? "called" : 
                        ticket.position === 1 ? "next" : "waiting";
      
      const updated: QueueEntry = {
        ...activeQueue,
        position: ticket.position || activeQueue.position,
        estimatedWaitTime: ticket.estimatedWaitMinutes || activeQueue.estimatedWaitTime,
        status: newStatus,
      };
      
      await AsyncStorage.setItem(ACTIVE_QUEUE_KEY, JSON.stringify(updated));
      setActiveQueue(updated);
      
      if (newStatus !== activeQueue.status) {
        sendQueueNotification(updated, updated.position, updated.estimatedWaitTime);
      }
    } catch (error) {
      console.error("Error refreshing queue:", error);
    }
  };

  const acknowledgeCall = async () => {
    if (!activeQueue || activeQueue.status !== "called") return;

    // Complete the queue visit
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
      status: "completed",
      formData: activeQueue.formData,
    };

    const newHistory = [historyEntry, ...history];
    await Promise.all([
      AsyncStorage.removeItem(ACTIVE_QUEUE_KEY),
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory)),
    ]);

    setActiveQueue(null);
    setHistory(newHistory);
    resetNotificationState();
    notificationService.clearAllNotifications();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
