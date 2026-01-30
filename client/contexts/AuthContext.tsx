import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { User, NotificationPreferences } from "@/types/queue";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (method: string, credentials?: any) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = "@tiqkets_user";

const defaultNotificationPreferences: NotificationPreferences = {
  inApp: true,
  whatsApp: false,
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
      console.error("Failed to load user:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (method: string, credentials?: any) => {
    const newUser: User = {
      id: `user_${Date.now()}`,
      name: credentials?.name || "Guest User",
      email: credentials?.email,
      phone: credentials?.phone,
      avatarUrl: undefined,
      defaultNotificationPreferences,
      createdAt: new Date().toISOString(),
    };

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
    setUser(newUser);
  };

  const logout = async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  const updateUser = async (updates: Partial<User>) => {
    if (!user) return;
    const updatedUser = { ...user, ...updates };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
    setUser(updatedUser);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
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
