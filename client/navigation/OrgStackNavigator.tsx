import React from "react";
import { Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import OrgLoginScreen from "@/screens/org/OrgLoginScreen";
import OrgTabNavigator from "@/navigation/OrgTabNavigator";
import EventTabNavigator from "@/navigation/EventTabNavigator";
import UserManagementScreen from "@/screens/org/UserManagementScreen";
import TeamRolesScreen from "@/screens/org/TeamRolesScreen";
import CheckInScannerScreen from "@/screens/org/CheckInScannerScreen";
import JourneyManagementScreen from "@/screens/org/JourneyManagementScreen";
import OrgBillingScreen from "@/screens/org/OrgBillingScreen";
import OrgSupportScreen from "@/screens/org/OrgSupportScreen";
import OrgEventsScreen from "@/screens/org/OrgEventsScreen";
import OrgEventManageScreen from "@/screens/org/OrgEventManageScreen";
import OrgEventLocationsScreen from "@/screens/org/OrgEventLocationsScreen";
import OrgPayoutsScreen from "@/screens/org/OrgPayoutsScreen";
import EventScannerScreen from "@/screens/org/EventScannerScreen";
import QueueScannerScreen from "@/screens/org/QueueScannerScreen";
import DineInScannerScreen from "@/screens/org/DineInScannerScreen";
import { EVENTS_NAV_PERMISSIONS } from "@shared/permissions";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useOrganization } from "@/contexts/OrganizationContext";
import WebOrgShell from "@/components/WebOrgShell";
import { PermissionRouteGuard } from "@/components/PermissionRouteGuard";

const GuardedUserManagement = () => (
  <PermissionRouteGuard allow="org.users.view">
    <UserManagementScreen />
  </PermissionRouteGuard>
);
const GuardedTeamRoles = () => (
  <PermissionRouteGuard allow="org.users.assign_role">
    <TeamRolesScreen />
  </PermissionRouteGuard>
);
const GuardedCheckInScanner = () => (
  <PermissionRouteGuard allow="org.qrscanner">
    <CheckInScannerScreen />
  </PermissionRouteGuard>
);
const GuardedJourneyManagement = () => (
  <PermissionRouteGuard allow="org.journeys.view">
    <JourneyManagementScreen />
  </PermissionRouteGuard>
);
const GuardedOrgBilling = () => (
  <PermissionRouteGuard allow="org.billing.view">
    <OrgBillingScreen />
  </PermissionRouteGuard>
);
const GuardedOrgEvents = () => (
  <PermissionRouteGuard allow={EVENTS_NAV_PERMISSIONS}>
    <OrgEventsScreen />
  </PermissionRouteGuard>
);
const GuardedOrgEventManage = () => (
  <PermissionRouteGuard allow="org.events.manage">
    <OrgEventManageScreen />
  </PermissionRouteGuard>
);
const GuardedOrgEventLocations = () => (
  <PermissionRouteGuard allow="org.events.manage">
    <OrgEventLocationsScreen />
  </PermissionRouteGuard>
);
const GuardedOrgPayouts = () => (
  <PermissionRouteGuard allow="org.events.manage" roles={["admin", "organizer", "super_admin"]} message="Ticket Payments is restricted to event organizers and admins.">
    <OrgPayoutsScreen />
  </PermissionRouteGuard>
);
const GuardedEventScanner = () => (
  <PermissionRouteGuard allow="org.events.security">
    <EventScannerScreen />
  </PermissionRouteGuard>
);
const GuardedQueueScanner = () => (
  <PermissionRouteGuard allow="org.queue.serve">
    <QueueScannerScreen />
  </PermissionRouteGuard>
);
const GuardedDineInScanner = () => (
  <PermissionRouteGuard allow="org.queue.hold">
    <DineInScannerScreen />
  </PermissionRouteGuard>
);

const TAB_ROUTES = new Set<string>([
  "OrgDashboard",
  "OrgQueue",
  "OrgServices",
  "OrgBookings",
  "OrgSettings",
]);

const STACK_ROUTES = new Set<string>([
  "UserManagement",
  "TeamRoles",
  "JourneyManagement",
  "OrgBilling",
  "OrgSupport",
  "OrgEvents",
  "OrgEventManage",
  "OrgEventLocations",
  "OrgPayouts",
]);

export type OrgStackParamList = {
  OrgLogin: undefined;
  OrgMain: undefined;
  UserManagement: undefined;
  TeamRoles: undefined;
  CheckInScanner: undefined;
  JourneyManagement: undefined;
  OrgBilling: undefined;
  OrgSupport: undefined;
  OrgEvents: undefined;
  OrgEventManage: undefined;
  OrgEventLocations: undefined;
  OrgPayouts: undefined;
  EventScanner: { action?: "checkin" | "exit" } | undefined;
  QueueScanner: undefined;
  DineInScanner: undefined;
};

const Stack = createNativeStackNavigator<OrgStackParamList>();

export default function OrgStackNavigator() {
  const screenOptions = useScreenOptions();
  const { isOrgAuthenticated, organization } = useOrganization();
  const isEventAccount = organization?.accountType === "event";

  // We deliberately do NOT short-circuit on isLoading here. The previous
  // "if (isLoading) return null" caused OrgLoginScreen to be unmounted
  // mid-action (e.g. during registerOrganization), which wiped local state
  // such as mode="verify" and pending OTP fields. Each screen renders its
  // own loading indicators (button spinners, etc.) so this gate isn't
  // needed for UX and was actively breaking the email-verification flow.
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
            component={isEventAccount ? EventTabNavigator : OrgTabNavigator}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="UserManagement"
            component={GuardedUserManagement}
            options={{
              headerTitle: "User Management",
              headerBackTitle: "Back",
              headerShown: !isWeb,
            }}
            {...(shellLayout ? { layout: shellLayout } : {})}
          />
          <Stack.Screen
            name="TeamRoles"
            component={GuardedTeamRoles}
            options={{
              headerTitle: "Roles & Permissions",
              headerBackTitle: "Back",
              headerShown: !isWeb,
            }}
            {...(shellLayout ? { layout: shellLayout } : {})}
          />
          <Stack.Screen
            name="CheckInScanner"
            component={GuardedCheckInScanner}
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="JourneyManagement"
            component={GuardedJourneyManagement}
            options={{
              headerTitle: "Customer Journeys",
              headerBackTitle: "Back",
              headerShown: !isWeb,
            }}
            {...(shellLayout ? { layout: shellLayout } : {})}
          />
          <Stack.Screen
            name="OrgBilling"
            component={GuardedOrgBilling}
            options={{
              headerTitle: isEventAccount ? "Subscription" : "Billing",
              headerBackTitle: "Back",
              headerShown: !isWeb,
            }}
            {...(shellLayout ? { layout: shellLayout } : {})}
          />
          <Stack.Screen
            name="OrgSupport"
            component={OrgSupportScreen}
            options={{
              headerTitle: "Tech Support",
              headerBackTitle: "Back",
              headerShown: !isWeb,
            }}
            {...(shellLayout ? { layout: shellLayout } : {})}
          />
          <Stack.Screen
            name="OrgEvents"
            component={GuardedOrgEvents}
            options={{
              headerTitle: "Events",
              headerBackTitle: "Back",
              headerShown: !isWeb,
            }}
            {...(shellLayout ? { layout: shellLayout } : {})}
          />
          <Stack.Screen
            name="OrgEventManage"
            component={GuardedOrgEventManage}
            options={{
              headerTitle: "Events",
              headerBackTitle: "Back",
              headerShown: !isWeb,
            }}
            {...(shellLayout ? { layout: shellLayout } : {})}
          />
          <Stack.Screen
            name="OrgEventLocations"
            component={GuardedOrgEventLocations}
            options={{
              headerTitle: "Locations",
              headerBackTitle: "Back",
              headerShown: !isWeb,
            }}
            {...(shellLayout ? { layout: shellLayout } : {})}
          />
          <Stack.Screen
            name="OrgPayouts"
            component={GuardedOrgPayouts}
            options={{ headerTitle: "Ticket Payments", headerBackTitle: "Back", headerShown: !isWeb }}
            {...(shellLayout ? { layout: shellLayout } : {})}
          />
          <Stack.Screen
            name="EventScanner"
            component={GuardedEventScanner}
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="QueueScanner"
            component={GuardedQueueScanner}
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="DineInScanner"
            component={GuardedDineInScanner}
            options={{ headerShown: false, presentation: "fullScreenModal" }}
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
