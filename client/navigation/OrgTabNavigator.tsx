import React, { useMemo } from "react";
import { ActivityIndicator } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";

type FeatherIconName = React.ComponentProps<typeof Feather>["name"];
type MciIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
type TabIcon =
  | { family: "feather"; name: FeatherIconName }
  | { family: "mci"; name: MciIconName };
import { BlurView } from "expo-blur";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import OrgDashboardScreen from "@/screens/org/OrgDashboardScreen";
import OrgQueueScreen from "@/screens/org/OrgQueueScreen";
import OrgServicesScreen from "@/screens/org/OrgServicesScreen";
import OrgBookingsScreen from "@/screens/org/OrgBookingsScreen";
import OrgSettingsScreen from "@/screens/org/OrgSettingsScreen";
import OrgEventsScreen from "@/screens/org/OrgEventsScreen";
import OrgEventManageScreen from "@/screens/org/OrgEventManageScreen";
import OrgEventLocationsScreen from "@/screens/org/OrgEventLocationsScreen";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  ORG_QUEUE_NAV_PERMISSIONS,
  EVENTS_NAV_PERMISSIONS,
} from "@shared/permissions";
import { Spacing } from "@/constants/theme";
import { getQueueModeForService } from "@/utils/settingsHierarchy";

export type OrgTabParamList = {
  OrgDashboard: undefined;
  OrgQueue: undefined;
  OrgServices: undefined;
  OrgBookings: undefined;
  OrgSettings: undefined;
  OrgEventsTab: undefined;
  OrgEventManageTab: undefined;
  OrgEventLocationsTab: undefined;
  OrgNoAccess: undefined;
};

const Tab = createBottomTabNavigator<OrgTabParamList>();

function NoAccessScreen() {
  const { theme } = useTheme();
  const { permissionsReady, logoutOrganization } = useOrganization();
  // Only show the "No accessible sections" message once permissions have
  // *definitively* loaded for the signed-in user. An empty permission set is
  // otherwise a transient state — during logout teardown (the session is
  // cleared in one batch before this subtree unmounts) or while permissions
  // are still loading right after login — and showing the message then causes
  // a false / flashing / sticking "No accessible sections" page. While not
  // ready we render a spinner; the navigator unmounts this screen as soon as
  // real tabs (or the login screen) appear.
  if (!permissionsReady) {
    return (
      <ThemedView
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      >
        <ActivityIndicator size="large" color={theme.textSecondary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: Spacing.xl,
      }}
    >
      <Feather name="lock" size={48} color={theme.textSecondary} />
      <ThemedText type="h4" style={{ marginTop: Spacing.lg, textAlign: "center" }}>
        No accessible sections
      </ThemedText>
      <ThemedText
        type="body"
        style={{
          marginTop: Spacing.sm,
          color: theme.textSecondary,
          textAlign: "center",
        }}
      >
        Your role does not have permission to view any of the main sections.
        Please contact your administrator.
      </ThemedText>
      {/* Always give a way out of this screen. Without it a user whose
          permissions changed (or who has no accessible sections) is stuck
          here with no tabs and no header action, and has to force-quit the
          app. Signing out returns them to the For-Business sign-in page. */}
      <Pressable
        onPress={() => {
          logoutOrganization();
        }}
        testID="button-noaccess-signout"
        style={{
          marginTop: Spacing.xl,
          flexDirection: "row",
          alignItems: "center",
          gap: Spacing.sm,
          paddingVertical: 12,
          paddingHorizontal: 24,
          borderRadius: 12,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: theme.primary,
        }}
      >
        <Feather name="log-out" size={18} color={theme.primary} />
        <ThemedText type="body" style={{ color: theme.primary, fontWeight: "600" }}>
          Sign Out
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

export default function OrgTabNavigator() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    hasPermission, hasAnyPermission, organization,
    selectedBranchId, selectedServiceId, getAccessibleBranches, getAccessibleServices,
  } = useOrganization();
  const accessibleBranches = getAccessibleBranches();
  const availabilityBranch = accessibleBranches.find(branch => branch.id === selectedBranchId) || accessibleBranches[0];
  const availabilityServices = availabilityBranch ? getAccessibleServices(availabilityBranch.id) : [];
  const availabilityService = availabilityServices.find(service => service.id === selectedServiceId) || availabilityServices[0];
  const availabilityMode = organization ? getQueueModeForService(
    organization.settings, availabilityBranch?.settings, availabilityService?.serviceSettings || undefined,
  ) : "fifo";
  const normalizedAvailabilityMode = String(availabilityMode).toLowerCase().replace(/[\s_-]/g, "");
  const hideMobileAvailability = Platform.OS !== "web"
    && (normalizedAvailabilityMode === "dinein" || normalizedAvailabilityMode === "takeaway");
  // Event accounts get the event-only app shell: Event console, Locations
  // and Settings — no queue / availability / dine-in tabs. Organisation
  // accounts keep the classic tab set untouched.
  const isEventAccount = organization?.accountType === "event";

  const tabs = useMemo(() => {
    const list: Array<{
      name: keyof OrgTabParamList;
      component: React.ComponentType<any>;
      title: string;
      headerTitle?: string;
      headerShown?: boolean;
      icon: TabIcon;
    }> = [];
    if (isEventAccount) {
      if (hasAnyPermission(EVENTS_NAV_PERMISSIONS)) {
        list.push({
          name: "OrgEventsTab",
          component: OrgEventsScreen,
          title: "Dashboard",
          headerTitle: "Dashboard",
          icon: { family: "feather", name: "bar-chart-2" },
        });
      }
      if (hasPermission("org.events.manage")) {
        list.push({
          name: "OrgEventManageTab",
          component: OrgEventManageScreen,
          title: "Events",
          headerTitle: "Events",
          icon: { family: "mci", name: "ticket-outline" },
        });
        list.push({
          name: "OrgEventLocationsTab",
          component: OrgEventLocationsScreen,
          title: "Locations",
          headerTitle: "Locations",
          icon: { family: "feather", name: "map-pin" },
        });
      }
      if (hasPermission("org.settings.view")) {
        list.push({
          name: "OrgSettings",
          component: OrgSettingsScreen,
          title: "Settings",
          headerTitle: "Settings",
          icon: { family: "feather", name: "settings" },
        });
      }
      return list;
    }
    if (hasPermission("org.dashboard.view")) {
      list.push({
        name: "OrgDashboard",
        component: OrgDashboardScreen,
        title: "Home",
        headerShown: false,
        icon: { family: "feather", name: "home" },
      });
    }
    if (hasAnyPermission(ORG_QUEUE_NAV_PERMISSIONS)) {
      list.push({
        name: "OrgQueue",
        component: OrgQueueScreen,
        title: "Queue",
        headerTitle: "Process Queue",
        icon: { family: "feather", name: "users" },
      });
    }
    if (hasPermission("org.branches.view")) {
      list.push({
        name: "OrgServices",
        component: OrgServicesScreen,
        title: "Branches",
        headerTitle: "Branch & Services",
        icon: { family: "mci", name: "storefront-outline" },
      });
    }
    if (hasPermission("org.bookings.view") && !hideMobileAvailability) {
      list.push({
        name: "OrgBookings",
        component: OrgBookingsScreen,
        title: "Availability",
        headerTitle: "Availability",
        icon: { family: "feather", name: "calendar" },
      });
    }
    if (hasPermission("org.settings.view")) {
      list.push({
        name: "OrgSettings",
        component: OrgSettingsScreen,
        title: "Settings",
        headerTitle: "Settings",
        icon: { family: "feather", name: "settings" },
      });
    }
    return list;
  }, [hasPermission, hasAnyPermission, isEventAccount, hideMobileAvailability]);

  const initialRouteName: keyof OrgTabParamList =
    tabs.length > 0 ? tabs[0].name : "OrgNoAccess";

  return (
    <Tab.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        // Plain header title with no white band/banner: paint the header with
        // the page background and drop the shadow so it blends into the page.
        headerStyle: { backgroundColor: theme.backgroundRoot },
        headerShadowVisible: false,
        headerTintColor: theme.text,
        headerTitleAlign: "center",
        tabBarActiveTintColor: theme.tabIconSelected,
        tabBarInactiveTintColor: theme.tabIconDefault,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          letterSpacing: 0.3,
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingTop: 8,
          paddingBottom: 4,
        },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: Platform.select({
            ios: "transparent",
            android: theme.surface,
          }),
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.borderSubtle,
          elevation: 0,
           height: 64 + insets.bottom,
           paddingBottom: insets.bottom,
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
      {tabs.length === 0 ? (
        <Tab.Screen
          name="OrgNoAccess"
          component={NoAccessScreen}
          options={{
            title: "No Access",
            tabBarIcon: ({ color, size }) => (
              <Feather name="lock" size={size} color={color} />
            ),
          }}
        />
      ) : (
        tabs.map((t) => (
          <Tab.Screen
            key={t.name}
            name={t.name}
            component={t.component}
            options={{
              title: t.title,
              headerTitle: t.headerTitle ?? t.title,
              headerShown: t.headerShown,
              tabBarIcon: ({ color, size, focused }) => (
                <View style={{ alignItems: "center", justifyContent: "center" }}>
                  {t.icon.family === "mci" ? (
                    <MaterialCommunityIcons
                      name={t.icon.name}
                      size={focused ? size + 2 : size + 1}
                      color={color}
                    />
                  ) : (
                    <Feather
                      name={t.icon.name}
                      size={focused ? size : size - 1}
                      color={color}
                    />
                  )}
                  <View
                    style={{
                      marginTop: 4,
                      width: focused ? 4 : 0,
                      height: focused ? 4 : 0,
                      borderRadius: 2,
                      backgroundColor: focused ? color : "transparent",
                    }}
                  />
                </View>
              ),
            }}
          />
        ))
      )}
    </Tab.Navigator>
  );
}
