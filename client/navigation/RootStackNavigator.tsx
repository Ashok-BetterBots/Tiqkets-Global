import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import LoginScreen from "@/screens/LoginScreen";
import JoinQueueScreen from "@/screens/JoinQueueScreen";
import QueueDetailsScreen from "@/screens/QueueDetailsScreen";
import QRScannerScreen from "@/screens/QRScannerScreen";
import SwapPositionScreen from "@/screens/SwapPositionScreen";
import ChangeServiceScreen from "@/screens/ChangeServiceScreen";
import BookAppointmentScreen from "@/screens/BookAppointmentScreen";
import AppointmentsScreen from "@/screens/AppointmentsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useAuth } from "@/contexts/AuthContext";

export type RootStackParamList = {
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
            component={JoinQueueScreen}
            options={{
              presentation: "modal",
              headerTitle: "Join Queue",
            }}
          />
          <Stack.Screen
            name="QueueDetails"
            component={QueueDetailsScreen}
            options={{
              headerTitle: "Queue Status",
            }}
          />
          <Stack.Screen
            name="QRScanner"
            component={QRScannerScreen}
            options={{
              presentation: "fullScreenModal",
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="SwapPosition"
            component={SwapPositionScreen}
            options={{
              presentation: "modal",
              headerTitle: "Swap Position",
            }}
          />
          <Stack.Screen
            name="ChangeService"
            component={ChangeServiceScreen}
            options={{
              presentation: "modal",
              headerTitle: "Change Service",
            }}
          />
          <Stack.Screen
            name="BookAppointment"
            component={BookAppointmentScreen}
            options={{
              presentation: "modal",
              headerTitle: "Book Appointment",
            }}
          />
          <Stack.Screen
            name="Appointments"
            component={AppointmentsScreen}
            options={{
              headerTitle: "My Appointments",
            }}
          />
        </>
      ) : (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      )}
    </Stack.Navigator>
  );
}
