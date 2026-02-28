import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
} from "@expo-google-fonts/nunito";
import { Feather } from "@expo/vector-icons";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { notificationService } from "@/services/NotificationService";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import OrgStackNavigator from "@/navigation/OrgStackNavigator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { QueueProvider } from "@/contexts/QueueContext";
import { AppointmentProvider } from "@/contexts/AppointmentContext";
import { OrganizationProvider, useOrganization } from "@/contexts/OrganizationContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { useNotificationHandler } from "@/hooks/useNotificationHandler";

SplashScreen.preventAutoHideAsync();

function NotificationWrapper({ children }: { children: React.ReactNode }) {
  useNotificationHandler();
  return <>{children}</>;
}

function AppContent() {
  const { isOrgAuthenticated, orgLoginMode } = useOrganization();

  if (isOrgAuthenticated || orgLoginMode) {
    return <OrgStackNavigator />;
  }

  return <RootStackNavigator />;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    ...Feather.font,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
      notificationService.initializeChannels();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
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
