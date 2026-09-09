import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import SplashScreen from "@/screens/SplashScreen";
import OnboardingScreen from "@/screens/OnboardingScreen";
import LoginScreen from "@/screens/LoginScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useAuth } from "@/contexts/AuthContext";

const getJoinQueueScreen = () => require("@/screens/JoinQueueScreen").default;
const getQueueDetailsScreen = () => require("@/screens/QueueDetailsScreen").default;
const getQRScannerScreen = () => require("@/screens/QRScannerScreen").default;
const getSwapPositionScreen = () => require("@/screens/SwapPositionScreen").default;
const getChangeServiceScreen = () => require("@/screens/ChangeServiceScreen").default;
const getBookAppointmentScreen = () => require("@/screens/BookAppointmentScreen").default;
const getAppointmentsScreen = () => require("@/screens/AppointmentsScreen").default;

export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  Login: undefined;
  Main: undefined;
  JoinQueue: { organizationId?: string; organizationName?: string; serviceId?: string; serviceName?: string; formData?: Record<string, string> } | undefined;
  QueueDetails: undefined;
  QRScanner: undefined;
  SwapPosition: undefined;
  ChangeService: undefined;
  BookAppointment: {
    modifyAppointmentId?: string;
    organizationId?: string;
    organizationName?: string;
    serviceId?: string;
    serviceName?: string;
  } | undefined;
  Appointments: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      {isAuthenticated ? (
        <>
          <Stack.Screen
            name="Main"
            component={MainTabNavigator}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="JoinQueue"
            getComponent={getJoinQueueScreen}
            options={{
              presentation: "modal",
              headerTitle: "Join Queue",
            }}
          />
          <Stack.Screen
            name="QueueDetails"
            getComponent={getQueueDetailsScreen}
            options={{
              headerTitle: "Queue Status",
            }}
          />
          <Stack.Screen
            name="QRScanner"
            getComponent={getQRScannerScreen}
            options={{
              presentation: "fullScreenModal",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="SwapPosition"
            getComponent={getSwapPositionScreen}
            options={{
              presentation: "modal",
              headerTitle: "Swap Position",
            }}
          />
          <Stack.Screen
            name="ChangeService"
            getComponent={getChangeServiceScreen}
            options={{
              presentation: "modal",
              headerTitle: "Change Service",
            }}
          />
          <Stack.Screen
            name="BookAppointment"
            getComponent={getBookAppointmentScreen}
            options={{
              presentation: "modal",
              headerTitle: "Book Appointment",
            }}
          />
          <Stack.Screen
            name="Appointments"
            getComponent={getAppointmentsScreen}
            options={{
              headerTitle: "My Appointments",
            }}
          />
        </>
      ) : (
        <>
          <Stack.Screen
            name="Splash"
            component={SplashScreen}
            options={{ headerShown: false, animation: "fade" }}
          />
          <Stack.Screen
            name="Onboarding"
            component={OnboardingScreen}
            options={{ headerShown: false, animation: "fade" }}
          />
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
