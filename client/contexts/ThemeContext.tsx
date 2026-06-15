import React, { createContext, useContext, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ThemeVariant } from "@/constants/theme";

type ThemeMode = "system" | "light" | "dark";
type ColorScheme = "light" | "dark";

interface ThemeContextType {
  themeMode: ThemeMode;
  colorScheme: ColorScheme;
  setThemeMode: (mode: ThemeMode) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "@tiqkets_theme_mode";

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  // The app is locked to light mode app-wide. We keep the same context
  // shape (themeMode/colorScheme/setThemeMode/isDark) so existing call
  // sites keep compiling, but setThemeMode is a no-op and the values
  // never change. Any previously-saved preference is ignored and cleared.
  useEffect(() => {
    AsyncStorage.removeItem(THEME_STORAGE_KEY).catch(() => {});
  }, []);

  const value: ThemeContextType = {
    themeMode: "light",
    colorScheme: "light",
    setThemeMode: () => {},
    isDark: false,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useThemeContext must be used within a ThemeProvider");
  }
  return context;
}

// ---------------------------------------------------------------------------
// Theme variant scope
// ---------------------------------------------------------------------------
// Selects which palette/font set `useTheme()` resolves for a subtree. The app
// defaults to "customer" (the original consumer look). Wrap the business (org)
// and super-admin navigators in <ThemeVariantProvider variant="eventhub"> to
// give those areas the EventHub design without touching any screen code — all
// shared components read their colors from `useTheme()`.

const ThemeVariantContext = createContext<ThemeVariant>("customer");

interface ThemeVariantProviderProps {
  variant: ThemeVariant;
  children: ReactNode;
}

export function ThemeVariantProvider({
  variant,
  children,
}: ThemeVariantProviderProps) {
  return (
    <ThemeVariantContext.Provider value={variant}>
      {children}
    </ThemeVariantContext.Provider>
  );
}

export function useThemeVariant(): ThemeVariant {
  return useContext(ThemeVariantContext);
}
