import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { QueueEntry, HistoryEntry, QueueStats, NotificationPreferences, PREMIUM_SWAP_PRICING } from "@/types/queue";

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

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeQueue) {
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

  const simulateQueueProgress = () => {
    setActiveQueue((current) => {
      if (!current || current.position <= 1) return current;
      
      const shouldAdvance = Math.random() > 0.5;
      if (!shouldAdvance) return current;

      const newPosition = current.position - 1;
      const newWaitTime = Math.max(0, current.estimatedWaitTime - 5);
      
      const updated: QueueEntry = {
        ...current,
        position: newPosition,
        estimatedWaitTime: newWaitTime,
        status: newPosition === 1 ? "next" : "waiting",
      };

      AsyncStorage.setItem(ACTIVE_QUEUE_KEY, JSON.stringify(updated));
      
      if (newPosition <= 3) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }

      return updated;
    });
  };

  const joinQueue = async (params: JoinQueueParams) => {
    const position = Math.floor(Math.random() * 15) + 3;
    const totalInQueue = position + Math.floor(Math.random() * 10);
    const ticketNumber = generateTicketNumber();
    
    const entry: QueueEntry = {
      id: `queue_${Date.now()}`,
      ticketNumber,
      organizationId: params.organizationId,
      organizationName: params.organizationName,
      serviceId: params.serviceId,
      serviceName: params.serviceName,
      position,
      totalInQueue,
      estimatedWaitTime: position * 5,
      joinedAt: new Date().toISOString(),
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
  };

  const leaveQueue = async () => {
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
      status: "cancelled",
      formData: activeQueue.formData,
    };

    const newHistory = [historyEntry, ...history];
    await Promise.all([
      AsyncStorage.removeItem(ACTIVE_QUEUE_KEY),
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory)),
    ]);

    setActiveQueue(null);
    setHistory(newHistory);
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

    const updated: QueueEntry = {
      ...activeQueue,
      position: targetPosition,
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
    };

    await AsyncStorage.setItem(ACTIVE_QUEUE_KEY, JSON.stringify(updated));
    setActiveQueue(updated);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const refreshQueue = async () => {
    if (!activeQueue) return;
    
    const shouldAdvance = Math.random() > 0.3;
    if (shouldAdvance && activeQueue.position > 1) {
      const updated: QueueEntry = {
        ...activeQueue,
        position: activeQueue.position - 1,
        estimatedWaitTime: Math.max(0, activeQueue.estimatedWaitTime - 5),
      };
      await AsyncStorage.setItem(ACTIVE_QUEUE_KEY, JSON.stringify(updated));
      setActiveQueue(updated);
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
