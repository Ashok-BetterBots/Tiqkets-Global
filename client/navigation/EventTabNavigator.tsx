import React, { useMemo } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { EVENTS_NAV_PERMISSIONS } from "@shared/permissions";
import { Spacing, BrandColors } from "@/constants/theme";
import { EventSelectionProvider, useEventSelection } from "@/contexts/EventSelectionContext";
import EventDashboardScreen from "@/screens/event/EventDashboardScreen";
import EventCheckInScreen from "@/screens/event/EventCheckInScreen";
import EventBillingScreen from "@/screens/event/EventBillingScreen";
import EventParkingScreen from "@/screens/event/EventParkingScreen";
import EventSupportScreen from "@/screens/event/EventSupportScreen";
import EventCheckOutScreen from "@/screens/event/EventCheckOutScreen";

const BRAND = BrandColors.primary;

type FeatherIconName = React.ComponentProps<typeof Feather>["name"];
type MciIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
type TabIcon =
  | { family: "feather"; name: FeatherIconName }
  | { family: "mci"; name: MciIconName };

export type EventTabParamList = {
  EventDashboard: undefined;
  EventCheckIn: undefined;
  EventBilling: undefined;
  EventParking: undefined;
  EventSupport: undefined;
  EventCheckOut: undefined;
  EventNoAccess: undefined;
};

const Tab = createBottomTabNavigator<EventTabParamList>();

function NoAccessScreen() {
  const { theme } = useTheme();
  const { permissionsReady, logoutOrganization } = useOrganization();
  if (!permissionsReady) {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={theme.textSecondary} />
      </ThemedView>
    );
  }
  return (
    <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: Spacing.xl }}>
      <Feather name="lock" size={48} color={theme.textSecondary} />
      <ThemedText type="h4" style={{ marginTop: Spacing.lg, textAlign: "center" }}>
        No accessible sections
      </ThemedText>
      <ThemedText type="body" style={{ marginTop: Spacing.sm, color: theme.textSecondary, textAlign: "center" }}>
        Your role does not have permission to view any sections. Please contact your administrator.
      </ThemedText>
      <Pressable
        onPress={logoutOrganization}
        testID="button-event-noaccess-signout"
        style={{
          marginTop: Spacing.xl,
          flexDirection: "row",
          alignItems: "center",
          gap: Spacing.sm,
          paddingVertical: 12,
          paddingHorizontal: 24,
          borderRadius: 12,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: BRAND,
        }}
      >
        <Feather name="log-out" size={18} color={BRAND} />
        <ThemedText type="body" style={{ color: BRAND, fontWeight: "600" }}>Sign Out</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

function EventTabNavigatorContent() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { currentUser, hasPermission, hasAnyPermission } = useOrganization();
  const { events } = useEventSelection();
  const parkingEnabled = events.length === 0 || events.some((event) => event.parkingEnabled !== false);

  const tabs = useMemo(() => {
    const list: Array<{
      name: keyof EventTabParamList;
      component: React.ComponentType<any>;
      title: string;
      headerShown?: boolean;
      icon: TabIcon;
    }> = [];

    if (hasAnyPermission(EVENTS_NAV_PERMISSIONS)) {
      list.push({
        name: "EventDashboard",
        component: EventDashboardScreen,
        title: "Dashboard",
        icon: { family: "feather", name: "layout" },
      });
    }
    if (hasPermission("org.events.security")) {
      list.push({
        name: "EventCheckIn",
        component: EventCheckInScreen,
        title: "Check-In",
        icon: { family: "feather", name: "log-in" },
      });
    }
    if (hasPermission("org.events.billing")) {
      list.push({
        name: "EventBilling",
        component: EventBillingScreen,
        title: "Billing",
        icon: { family: "feather", name: "credit-card" },
      });
    }
    if (hasPermission("org.events.parking") && parkingEnabled) {
      list.push({
        name: "EventParking",
        component: EventParkingScreen,
        title: "Parking",
        icon: { family: "mci", name: "car-outline" },
      });
    }
    if (hasAnyPermission(EVENTS_NAV_PERMISSIONS)) {
      list.push({
        name: "EventSupport",
        component: EventSupportScreen,
        title: "Support",
        icon: { family: "feather", name: "headphones" },
      });
    }
    if (hasPermission("org.events.security")) {
      list.push({
        name: "EventCheckOut",
        component: EventCheckOutScreen,
        title: "Check-Out",
        icon: { family: "feather", name: "log-out" },
      });
    }
    return list;
  }, [currentUser?.role, hasPermission, hasAnyPermission, parkingEnabled]);

  const initialRouteName: keyof EventTabParamList =
    tabs.length > 0 ? tabs[0].name : "EventNoAccess";

  return (
    <Tab.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerStyle: { backgroundColor: theme.backgroundRoot },
        headerShadowVisible: false,
        headerTintColor: theme.text,
        headerTitleAlign: "center",
        tabBarActiveTintColor: BRAND,
        tabBarInactiveTintColor: theme.tabIconDefault,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
          letterSpacing: 0.3,
          marginTop: 2,
        },
        tabBarItemStyle: { paddingTop: 8, paddingBottom: 4 },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: Platform.select({ ios: "transparent", android: theme.surface }),
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.borderSubtle,
          elevation: 0,
           height: 64 + insets.bottom,
           paddingBottom: insets.bottom,
        },
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView intensity={100} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
          ) : null,
      }}
    >
      {tabs.length === 0 ? (
        <Tab.Screen
          name="EventNoAccess"
          component={NoAccessScreen}
          options={{
            title: "No Access",
            tabBarIcon: ({ color, size }) => <Feather name="lock" size={size} color={color} />,
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
              headerTitle: t.title,
              headerShown: t.headerShown,
              tabBarIcon: ({ color, size, focused }) =>
                t.icon.family === "mci" ? (
                  <MaterialCommunityIcons
                    name={t.icon.name}
                    size={focused ? size + 2 : size + 1}
                    color={color}
                  />
                ) : (
                  <Feather name={t.icon.name} size={focused ? size : size - 1} color={color} />
                ),
              tabBarLabel: ({ color, focused }) => (
                <View style={{ alignItems: "center" }}>
                  <ThemedText style={{ fontSize: 10, fontWeight: "600", letterSpacing: 0.3, color }}>
                    {t.title}
                  </ThemedText>
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

export default function EventTabNavigator() {
  return (
    <EventSelectionProvider>
      <EventTabNavigatorContent />
    </EventSelectionProvider>
  );
}
