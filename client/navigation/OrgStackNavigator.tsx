import React from "react";
import { Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import OrgLoginScreen from "@/screens/org/OrgLoginScreen";
import OrgTabNavigator from "@/navigation/OrgTabNavigator";
import UserManagementScreen from "@/screens/org/UserManagementScreen";
import CheckInScannerScreen from "@/screens/org/CheckInScannerScreen";
import JourneyManagementScreen from "@/screens/org/JourneyManagementScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useOrganization } from "@/contexts/OrganizationContext";
import WebOrgShell from "@/components/WebOrgShell";

const TAB_ROUTES = new Set<string>([
  "OrgDashboard",
  "OrgQueue",
  "OrgServices",
  "OrgBookings",
  "OrgSettings",
]);

const STACK_ROUTES = new Set<string>([
  "UserManagement",
  "JourneyManagement",
]);

export type OrgStackParamList = {
  OrgLogin: undefined;
  OrgMain: undefined;
  UserManagement: undefined;
  CheckInScanner: undefined;
  JourneyManagement: undefined;
};

const Stack = createNativeStackNavigator<OrgStackParamList>();

export default function OrgStackNavigator() {
  const screenOptions = useScreenOptions();
  const { isOrgAuthenticated, isLoading } = useOrganization();

  if (isLoading) {
    return null;
  }

  const isWeb = Platform.OS === "web";

  const shellLayout = isWeb
    ? ({
        navigation,
        children,
        route,
      }: {
        navigation: {
          navigate: (name: string, params?: object) => void;
          goBack: () => void;
        };
        children: React.ReactNode;
        route: { name: string };
      }) => (
        <WebOrgShell
          currentRouteName={route.name}
          onNavigate={(name) => {
            if (name === route.name) return;
            if (TAB_ROUTES.has(name)) {
              navigation.navigate("OrgMain", { screen: name });
            } else if (STACK_ROUTES.has(name)) {
              navigation.navigate(name);
            }
          }}
        >
          {children}
        </WebOrgShell>
      )
    : undefined;

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      {isOrgAuthenticated ? (
        <>
          <Stack.Screen
            name="OrgMain"
            component={OrgTabNavigator}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="UserManagement"
            component={UserManagementScreen}
            options={{
              headerTitle: "User Management",
              headerShown: !isWeb,
            }}
            {...(shellLayout ? { layout: shellLayout } : {})}
          />
          <Stack.Screen
            name="CheckInScanner"
            component={CheckInScannerScreen}
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="JourneyManagement"
            component={JourneyManagementScreen}
            options={{
              headerTitle: "Customer Journeys",
              headerShown: !isWeb,
            }}
            {...(shellLayout ? { layout: shellLayout } : {})}
          />
        </>
      ) : (
        <Stack.Screen
          name="OrgLogin"
          component={OrgLoginScreen}
          options={{ headerShown: false }}
        />
      )}
    </Stack.Navigator>
  );
}
