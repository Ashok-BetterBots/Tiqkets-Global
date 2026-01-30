import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { QueueEntry, HistoryEntry, QueueStats, NotificationPreferences } from "@/types/queue";

interface QueueContextType {
  activeQueue: QueueEntry | null;
  history: HistoryEntry[];
  stats: QueueStats;
  isLoading: boolean;
  joinQueue: (params: JoinQueueParams) => Promise<void>;
  leaveQueue: () => Promise<void>;
  snooze: (levels: 1 | 2 | 3) => Promise<void>;
  requestSwap: (targetPosition: number) => Promise<void>;
  changeService: (serviceId: string, serviceName: string) => Promise<void>;
  refreshQueue: () => Promise<void>;
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
    
    const entry: QueueEntry = {
      id: `queue_${Date.now()}`,
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
    };

    await AsyncStorage.setItem(ACTIVE_QUEUE_KEY, JSON.stringify(entry));
    setActiveQueue(entry);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const leaveQueue = async () => {
    if (!activeQueue) return;

    const historyEntry: HistoryEntry = {
      id: `history_${Date.now()}`,
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

  const snooze = async (levels: 1 | 2 | 3) => {
    if (!activeQueue) return;

    const updated: QueueEntry = {
      ...activeQueue,
      position: activeQueue.position + levels,
      estimatedWaitTime: activeQueue.estimatedWaitTime + levels * 5,
    };

    await AsyncStorage.setItem(ACTIVE_QUEUE_KEY, JSON.stringify(updated));
    setActiveQueue(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const requestSwap = async (targetPosition: number) => {
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
        requestSwap,
        changeService,
        refreshQueue,
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
