import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import BookingsScreen from "@/screens/BookingsScreen";
import AppointmentsScreen from "@/screens/AppointmentsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type AppointmentsStackParamList = {
  BookingsMain: undefined;
  AppointmentsList: undefined;
};

const Stack = createNativeStackNavigator<AppointmentsStackParamList>();

export default function AppointmentsStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="BookingsMain"
        component={BookingsScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="AppointmentsList"
        component={AppointmentsScreen}
        options={{
          headerTitle: "My Bookings",
        }}
      />
    </Stack.Navigator>
  );
}
