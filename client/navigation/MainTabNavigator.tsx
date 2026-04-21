import React from "react";
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import HomeStackNavigator from "@/navigation/HomeStackNavigator";
import AppointmentsStackNavigator from "@/navigation/AppointmentsStackNavigator";
import HistoryStackNavigator from "@/navigation/HistoryStackNavigator";
import ProfileStackNavigator from "@/navigation/ProfileStackNavigator";
import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { Shadows, Spacing } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

export type MainTabParamList = {
  HomeTab: undefined;
  AppointmentsTab: undefined;
  HistoryTab: undefined;
  ProfileTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  HomeTab: "home",
  AppointmentsTab: "calendar",
  HistoryTab: "clock",
  ProfileTab: "user",
};

const TAB_LABELS: Record<string, string> = {
  HomeTab: "Home",
  AppointmentsTab: "Bookings",
  HistoryTab: "History",
  ProfileTab: "Profile",
};

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const rootNav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleScan = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    rootNav.navigate("QRScanner");
  };

  const renderTab = (routeName: string, index: number) => {
    const route = state.routes.find((r) => r.name === routeName);
    if (!route) return null;
    const isFocused = state.routes[state.index].name === routeName;
    const iconName = TAB_ICONS[routeName];
    const label = TAB_LABELS[routeName];
    const color = isFocused ? theme.tabIconSelected : theme.tabIconDefault;

    return (
      <Pressable
        key={routeName}
        onPress={() => {
          if (!isFocused) navigation.navigate(route.name);
        }}
        style={styles.tabItem}
        testID={`tab-${routeName}`}
      >
        <Feather name={iconName} size={22} color={color} />
        <ThemedText
          type="caption"
          style={[
            styles.tabLabel,
            { color, fontWeight: isFocused ? "600" : "500" },
          ]}
        >
          {label}
        </ThemedText>
      </Pressable>
    );
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.tabBarWrap, { paddingBottom: insets.bottom }]}
    >
      <View style={styles.floatingButtonWrap} pointerEvents="box-none">
        <Pressable
          onPress={handleScan}
          style={({ pressed }) => [
            styles.floatingButton,
            { backgroundColor: theme.primary, opacity: pressed ? 0.9 : 1 },
            Shadows.floating,
          ]}
          testID="tab-scan-floating"
        >
          <Feather name="maximize" size={26} color="#FFFFFF" />
        </Pressable>
      </View>
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: Platform.OS === "ios" ? "transparent" : theme.surface,
            borderTopColor: theme.borderSubtle ?? theme.border,
          },
        ]}
      >
        {Platform.OS === "ios" ? (
          <BlurView
            intensity={80}
            tint={isDark ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View style={styles.tabRow}>
          <View style={styles.tabSide}>
            {renderTab("HomeTab", 0)}
            {renderTab("AppointmentsTab", 1)}
          </View>
          <View style={styles.tabCenterSpacer} />
          <View style={styles.tabSide}>
            {renderTab("HistoryTab", 2)}
            {renderTab("ProfileTab", 3)}
          </View>
        </View>
      </View>
    </View>
  );
}

export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="HomeTab" component={HomeStackNavigator} />
      <Tab.Screen name="AppointmentsTab" component={AppointmentsStackNavigator} />
      <Tab.Screen name="HistoryTab" component={HistoryStackNavigator} />
      <Tab.Screen name="ProfileTab" component={ProfileStackNavigator} />
    </Tab.Navigator>
  );
}

const TAB_BAR_HEIGHT = 64;
const FAB_SIZE = 60;

const styles = StyleSheet.create({
  tabBarWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  tabBar: {
    height: TAB_BAR_HEIGHT,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  tabRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  tabSide: {
    flex: 1,
    flexDirection: "row",
  },
  tabCenterSpacer: {
    width: FAB_SIZE + 24,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  tabLabel: {
    fontSize: 11,
  },
  floatingButtonWrap: {
    position: "absolute",
    top: -FAB_SIZE / 2 - 4,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  floatingButton: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#FFFFFF",
  },
});
