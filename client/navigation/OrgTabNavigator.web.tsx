import React, { useEffect } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import OrgDashboardScreen from "@/screens/org/OrgDashboardScreen";
import OrgQueueScreen from "@/screens/org/OrgQueueScreen";
import OrgServicesScreen from "@/screens/org/OrgServicesScreen";
import OrgBookingsScreen from "@/screens/org/OrgBookingsScreen";
import OrgSettingsScreen from "@/screens/org/OrgSettingsScreen";
import { useTheme } from "@/hooks/useTheme";
import WebOrgShell, { ORG_NAV_ITEMS } from "@/components/WebOrgShell";
import { useOrganization } from "@/contexts/OrganizationContext";
import { PermissionDenied } from "@/components/RequirePermission";
import { ORG_QUEUE_NAV_PERMISSIONS } from "@shared/permissions";

type GuardedNavigation = {
  reset: (state: object) => void;
  getState?: () => { routes?: Array<{ name?: string }>; index?: number } | undefined;
};

const TAB_NAMES = new Set(["OrgDashboard", "OrgQueue", "OrgServices", "OrgBookings", "OrgSettings"]);

type PermissionGate =
  | { kind: "single"; permission: string }
  | { kind: "any"; permissions: string[] };

function withPermission<P extends object>(
  Component: React.ComponentType<P>,
  gate: PermissionGate,
  routeName: string,
): React.ComponentType<P> {
  const Wrapped: React.FC<P> = (props) => {
    const { hasPermission, hasAnyPermission } = useOrganization();
    const navigation = (props as unknown as { navigation?: GuardedNavigation }).navigation;
    const allowed =
      gate.kind === "single" ? hasPermission(gate.permission) : hasAnyPermission(gate.permissions);
    useEffect(() => {
      if (allowed || !navigation) return;
      const fallback = ORG_NAV_ITEMS.find((item) => {
        if (!TAB_NAMES.has(item.name)) return false;
        if (item.permissions && item.permissions.length > 0) return hasAnyPermission(item.permissions);
        if (item.permission) return hasPermission(item.permission);
        return true;
      });
      if (!fallback) return;
      if (fallback.name === routeName) return;
      try {
        const current = navigation.getState?.()?.routes?.[navigation.getState?.()?.index ?? 0]?.name;
        if (current === fallback.name) return;
      } catch (_) { /* noop */ }
      navigation.reset({ index: 0, routes: [{ name: fallback.name as never }] });
    }, [allowed, navigation, hasPermission, hasAnyPermission]);
    if (!allowed) return <PermissionDenied />;
    return <Component {...props} />;
  };
  Wrapped.displayName = `WithPermission(${Component.displayName || Component.name || "Component"})`;
  return Wrapped;
}

const GuardedDashboard = withPermission(OrgDashboardScreen, { kind: "single", permission: "org.dashboard.view" }, "OrgDashboard");
const GuardedQueue = withPermission(OrgQueueScreen, { kind: "any", permissions: ORG_QUEUE_NAV_PERMISSIONS }, "OrgQueue");
const GuardedServices = withPermission(OrgServicesScreen, { kind: "single", permission: "org.branches.view" }, "OrgServices");
const GuardedBookings = withPermission(OrgBookingsScreen, { kind: "single", permission: "org.bookings.view" }, "OrgBookings");
const GuardedSettings = withPermission(OrgSettingsScreen, { kind: "single", permission: "org.settings.view" }, "OrgSettings");

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
      <Tab.Screen name="OrgDashboard" component={GuardedDashboard} />
      <Tab.Screen name="OrgQueue" component={GuardedQueue} />
      <Tab.Screen name="OrgServices" component={GuardedServices} />
      <Tab.Screen name="OrgBookings" component={GuardedBookings} />
      <Tab.Screen name="OrgSettings" component={GuardedSettings} />
    </Tab.Navigator>
  );
}
