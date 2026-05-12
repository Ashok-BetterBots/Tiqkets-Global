import React, { createContext, useContext, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
