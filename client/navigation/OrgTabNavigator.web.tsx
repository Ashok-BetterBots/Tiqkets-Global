import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import OrgDashboardScreen from "@/screens/org/OrgDashboardScreen";
import OrgQueueScreen from "@/screens/org/OrgQueueScreen";
import OrgServicesScreen from "@/screens/org/OrgServicesScreen";
import OrgBookingsScreen from "@/screens/org/OrgBookingsScreen";
import OrgSettingsScreen from "@/screens/org/OrgSettingsScreen";
import { useTheme } from "@/hooks/useTheme";
import WebOrgShell from "@/components/WebOrgShell";

export type OrgTabParamList = {
  OrgDashboard: undefined;
  OrgQueue: undefined;
  OrgServices: undefined;
  OrgBookings: undefined;
  OrgSettings: undefined;
};

const Tab = createBottomTabNavigator<OrgTabParamList>();

const TAB_ROUTES = new Set<string>([
  "OrgDashboard",
  "OrgQueue",
  "OrgServices",
  "OrgBookings",
  "OrgSettings",
]);

export default function OrgTabNavigator() {
  const { theme } = useTheme();
  return (
    <Tab.Navigator
      initialRouteName="OrgDashboard"
      tabBar={() => null}
      screenLayout={({ navigation, children, route }) => (
        <WebOrgShell
          currentRouteName={route.name}
          onNavigate={(name) => {
            if (TAB_ROUTES.has(name)) {
              navigation.navigate(name as keyof OrgTabParamList);
            } else {
              navigation.getParent()?.navigate(name);
            }
          }}
        >
          {children}
        </WebOrgShell>
      )}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
        sceneStyle: { backgroundColor: theme.backgroundRoot },
      }}
    >
      <Tab.Screen name="OrgDashboard" component={OrgDashboardScreen} />
      <Tab.Screen name="OrgQueue" component={OrgQueueScreen} />
      <Tab.Screen name="OrgServices" component={OrgServicesScreen} />
      <Tab.Screen name="OrgBookings" component={OrgBookingsScreen} />
      <Tab.Screen name="OrgSettings" component={OrgSettingsScreen} />
    </Tab.Navigator>
  );
}
