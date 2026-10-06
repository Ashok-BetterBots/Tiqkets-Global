import { logHandledError } from "@/lib/logger";
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { User, NotificationPreferences } from "@/types/queue";
import { apiRequest, getApiUrl } from "@/lib/query-client";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (method: string, credentials?: any) => Promise<void>;
  loginWithCustomer: (customerData: any) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "@tiqkets_user";

const defaultNotificationPreferences: NotificationPreferences = {
  inApp: true,
  whatsApp: true,
  sms: false,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const storedUser = await AsyncStorage.getItem(STORAGE_KEY);
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      logHandledError("Failed to load user", error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (method: string, credentials?: any) => {
    const newUser: User = {
      id: credentials?.id || `user_${Date.now()}`,
      name: credentials?.name || "Guest User",
      email: credentials?.email,
      phone: credentials?.phone,
      avatarUrl: credentials?.profilePictureUrl || undefined,
      defaultNotificationPreferences,
      createdAt: credentials?.createdAt || new Date().toISOString(),
    };

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
    setUser(newUser);
  };

  const loginWithCustomer = async (customerData: any) => {
    const newUser: User = {
      id: customerData.id,
      name: customerData.name || "User",
      email: customerData.email || undefined,
      phone: customerData.phone,
      avatarUrl: customerData.profilePictureUrl || undefined,
      defaultNotificationPreferences,
      createdAt: customerData.createdAt || new Date().toISOString(),
    };

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
    setUser(newUser);
  };

  const logout = async () => {
    const keysToRemove = [STORAGE_KEY, "@tiqkets_active_queue", "@tiqkets_history"];
    if (user?.id) {
      keysToRemove.push(`@tiqkets_active_queue_${user.id}`, `@tiqkets_history_${user.id}`);
    }
    await AsyncStorage.multiRemove(keysToRemove);
    setUser(null);
  };

  const updateUser = async (updates: Partial<User>) => {
    if (!user) return;
    const updatedUser = { ...user, ...updates };
    const pictureChanged = updates.avatarUrl !== undefined && updates.avatarUrl !== user.avatarUrl;
    const saveLocalUser = async () => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
      setUser(updatedUser);
    };
    if (!pictureChanged) await saveLocalUser();

    if (user.id && !user.id.startsWith("user_")) {
      try {
        const updateData: Record<string, any> = {};
        if (updates.name) updateData.name = updates.name;
        if (updates.email) updateData.email = updates.email;
        if (updates.avatarUrl) updateData.profilePictureUrl = updates.avatarUrl;
        if (Object.keys(updateData).length > 0) {
          await apiRequest("PUT", `/api/auth/customer/${user.id}`, updateData);
        }
      } catch (error) {
        logHandledError("Failed to sync profile update", error);
        if (pictureChanged) throw error;
      }
    }
    if (pictureChanged) await saveLocalUser();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        loginWithCustomer,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
