import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet } from "react-native";
import OrgDashboardScreen from "@/screens/org/OrgDashboardScreen";
import OrgQueueScreen from "@/screens/org/OrgQueueScreen";
import OrgServicesScreen from "@/screens/org/OrgServicesScreen";
import OrgBookingsScreen from "@/screens/org/OrgBookingsScreen";
import OrgSettingsScreen from "@/screens/org/OrgSettingsScreen";
import { useTheme } from "@/hooks/useTheme";

export type OrgTabParamList = {
  OrgDashboard: undefined;
  OrgQueue: undefined;
  OrgServices: undefined;
  OrgBookings: undefined;
  OrgSettings: undefined;
};

const Tab = createBottomTabNavigator<OrgTabParamList>();

export default function OrgTabNavigator() {
  const { theme, isDark } = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="OrgDashboard"
      screenOptions={{
        tabBarActiveTintColor: theme.tabIconSelected,
        tabBarInactiveTintColor: theme.tabIconDefault,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: Platform.select({
            ios: "transparent",
            android: theme.backgroundRoot,
          }),
          borderTopWidth: 0,
          elevation: 0,
        },
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView
              intensity={100}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : null,
      }}
    >
      <Tab.Screen
        name="OrgDashboard"
        component={OrgDashboardScreen}
        options={{
          title: "Dashboard",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="OrgQueue"
        component={OrgQueueScreen}
        options={{
          title: "Queue",
          headerTitle: "Process Queue",
          tabBarIcon: ({ color, size }) => (
            <Feather name="users" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="OrgServices"
        component={OrgServicesScreen}
        options={{
          title: "Services",
          headerTitle: "Manage Services",
          tabBarIcon: ({ color, size }) => (
            <Feather name="layers" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="OrgBookings"
        component={OrgBookingsScreen}
        options={{
          title: "Bookings",
          headerTitle: "Booking Slots",
          tabBarIcon: ({ color, size }) => (
            <Feather name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="OrgSettings"
        component={OrgSettingsScreen}
        options={{
          title: "Settings",
          headerTitle: "Settings",
          tabBarIcon: ({ color, size }) => (
            <Feather name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
