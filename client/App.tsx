import React, { useEffect, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Font from "expo-font";
import {
  useFonts,
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from "@expo-google-fonts/nunito";
import {
  NunitoSans_400Regular,
  NunitoSans_500Medium,
  NunitoSans_600SemiBold,
  NunitoSans_700Bold,
  NunitoSans_800ExtraBold,
} from "@expo-google-fonts/nunito-sans";
import { Feather } from "@expo/vector-icons";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { notificationService } from "@/services/NotificationService";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import OrgStackNavigator from "@/navigation/OrgStackNavigator";
import SuperAdminStackNavigator from "@/navigation/SuperAdminStackNavigator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { QueueProvider } from "@/contexts/QueueContext";
import { AppointmentProvider } from "@/contexts/AppointmentContext";
import { OrganizationProvider, useOrganization } from "@/contexts/OrganizationContext";
import { ThemeProvider, ThemeVariantProvider } from "@/contexts/ThemeContext";
import { useNotificationHandler } from "@/hooks/useNotificationHandler";

function NotificationWrapper({ children }: { children: React.ReactNode }) {
  useNotificationHandler();
  return <>{children}</>;
}

function AppContent() {
  const { isOrgAuthenticated, isSuperAdmin, orgLoginMode, isHydratingSession, customerLoginFlagHydrated } = useOrganization();
  const isMobile = Platform.OS !== "web";

  // Wait for the org context to finish hydrating from AsyncStorage +
  // validating the session cookie before rendering any navigator. Without
  // this gate, signed-in org users see a brief flash of the customer
  // login screen on cold start while /api/organizations/me is in flight.
  // We deliberately gate on `isHydratingSession` (set only during the
  // mount-time restore) and NOT on `isLoading` — the latter flips during
  // every login/register action, which would unmount the navigation tree
  // mid-submit and blank the screen.
  if (isHydratingSession) {
    return null;
  }

  // Also wait for the first /api/system-settings/public response so a
  // slow network can't briefly flash the customer login screen on cold
  // start when the super admin has disabled it. Skipped for already-
  // signed-in org / super-admin users — their navigator is independent
  // of the customer-login toggle and there's no flash to avoid.
  if (!isMobile && !customerLoginFlagHydrated && !isOrgAuthenticated && !isSuperAdmin) {
    return null;
  }

  // Mobile is organization-only. Keep the customer navigator available to
  // web, but never mount it on native platforms, including after logout or
  // when an older customer-login preference is still cached.
  if (isMobile) {
    return (
      <ThemeVariantProvider variant="eventhub">
        <OrgStackNavigator />
      </ThemeVariantProvider>
    );
  }

  if (isSuperAdmin) {
    return (
      <ThemeVariantProvider variant="eventhub">
        <SuperAdminStackNavigator />
      </ThemeVariantProvider>
    );
  }

  if (isOrgAuthenticated || orgLoginMode) {
    return (
      <ThemeVariantProvider variant="eventhub">
        <OrgStackNavigator />
      </ThemeVariantProvider>
    );
  }

  return <RootStackNavigator />;
}

export default function App() {
  const [iconFontLoaded, setIconFontLoaded] = useState(false);
  // Safety valve: if fonts haven't resolved (loaded or errored) within
  // 5 seconds in the production static build, proceed anyway so the app
  // never shows a permanent blank screen. This can happen when font TTF
  // files can't be fetched from the static server (wrong URL, 404, etc.)
  // because useFonts hangs indefinitely instead of surfacing an error.
  const [fontTimeout, setFontTimeout] = useState(false);

  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    NunitoSans_400Regular,
    NunitoSans_500Medium,
    NunitoSans_600SemiBold,
    NunitoSans_700Bold,
    NunitoSans_800ExtraBold,
  });

  useEffect(() => {
    const t = setTimeout(() => setFontTimeout(true), 5000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      if (active) {
        console.warn("Icon font load timed out; continuing without blocking startup");
        setIconFontLoaded(true);
      }
    }, 5000);

    async function loadIconFont() {
      try {
        if (!Font.isLoaded("feather")) {
          await Font.loadAsync(Feather.font);
        }
      } catch (e) {
        console.log("Icon font load error:", e);
      } finally {
        clearTimeout(timeout);
        if (active) setIconFontLoaded(true);
      }
    }
    loadIconFont();
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, []);

  const fontsReady = fontsLoaded || !!fontError || fontTimeout;

  useEffect(() => {
    if (fontsReady && iconFontLoaded) {
      SplashScreen.hideAsync().catch(() => {});
      notificationService.initializeChannels();
    }
  }, [fontsReady, iconFontLoaded]);

  if (!fontsReady || !iconFontLoaded) {
    return null;
  }

  return (
    <ThemeProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <QueueProvider>
              <AppointmentProvider>
                <OrganizationProvider>
                  <SafeAreaProvider>
                    <GestureHandlerRootView style={styles.root}>
                      <KeyboardProvider>
                        <NavigationContainer>
                          <NotificationWrapper>
                            <AppContent />
                          </NotificationWrapper>
                        </NavigationContainer>
                        <StatusBar style="auto" />
                      </KeyboardProvider>
                    </GestureHandlerRootView>
                  </SafeAreaProvider>
                </OrganizationProvider>
              </AppointmentProvider>
            </QueueProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
