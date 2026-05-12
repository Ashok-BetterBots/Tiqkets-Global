import React, { useMemo } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import OrgDashboardScreen from "@/screens/org/OrgDashboardScreen";
import OrgQueueScreen from "@/screens/org/OrgQueueScreen";
import OrgServicesScreen from "@/screens/org/OrgServicesScreen";
import OrgBookingsScreen from "@/screens/org/OrgBookingsScreen";
import OrgSettingsScreen from "@/screens/org/OrgSettingsScreen";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { ORG_QUEUE_NAV_PERMISSIONS } from "@shared/permissions";
import { Spacing } from "@/constants/theme";

export type OrgTabParamList = {
  OrgDashboard: undefined;
  OrgQueue: undefined;
  OrgServices: undefined;
  OrgBookings: undefined;
  OrgSettings: undefined;
  OrgNoAccess: undefined;
};

const Tab = createBottomTabNavigator<OrgTabParamList>();

function NoAccessScreen() {
  const { theme } = useTheme();
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
    </ThemedView>
  );
}

export default function OrgTabNavigator() {
  const { theme, isDark } = useTheme();
  const { hasPermission, hasAnyPermission } = useOrganization();

  const tabs = useMemo(() => {
    const list: Array<{
      name: keyof OrgTabParamList;
      component: React.ComponentType<any>;
      title: string;
      headerTitle?: string;
      headerShown?: boolean;
      icon: React.ComponentProps<typeof Feather>["name"];
    }> = [];
    if (hasPermission("org.dashboard.view")) {
      list.push({
        name: "OrgDashboard",
        component: OrgDashboardScreen,
        title: "Dashboard",
        headerShown: false,
        icon: "home",
      });
    }
    if (hasAnyPermission(ORG_QUEUE_NAV_PERMISSIONS)) {
      list.push({
        name: "OrgQueue",
        component: OrgQueueScreen,
        title: "Queue",
        headerTitle: "Process Queue",
        icon: "users",
      });
    }
    if (hasPermission("org.branches.view")) {
      list.push({
        name: "OrgServices",
        component: OrgServicesScreen,
        title: "Branches",
        headerTitle: "Branch & Services",
        icon: "shopping-bag",
      });
    }
    if (hasPermission("org.bookings.view")) {
      list.push({
        name: "OrgBookings",
        component: OrgBookingsScreen,
        title: "Availability",
        headerTitle: "Availability",
        icon: "calendar",
      });
    }
    if (hasPermission("org.settings.view")) {
      list.push({
        name: "OrgSettings",
        component: OrgSettingsScreen,
        title: "Settings",
        headerTitle: "Settings",
        icon: "settings",
      });
    }
    return list;
  }, [hasPermission, hasAnyPermission]);

  const initialRouteName: keyof OrgTabParamList =
    tabs.length > 0 ? tabs[0].name : "OrgNoAccess";

  return (
    <Tab.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
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
          height: Platform.OS === "ios" ? 84 : 64,
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
                  <Feather name={t.icon} size={focused ? size : size - 1} color={color} />
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
