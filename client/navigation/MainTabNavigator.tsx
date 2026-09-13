import React from "react";
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Platform, StyleSheet, View, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HomeStackNavigator from "@/navigation/HomeStackNavigator";
import AppointmentsStackNavigator from "@/navigation/AppointmentsStackNavigator";
import HistoryStackNavigator from "@/navigation/HistoryStackNavigator";
import ProfileStackNavigator from "@/navigation/ProfileStackNavigator";
import { ThemedText } from "@/components/ThemedText";
import { AuroraColors, BorderRadius, Spacing } from "@/constants/theme";

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
  AppointmentsTab: "Reservations",
  HistoryTab: "History",
  ProfileTab: "Profile",
};

const TAB_BAR_HEIGHT = 64;
const TAB_BAR_HORIZONTAL_MARGIN = Spacing.lg;
const TAB_BAR_BOTTOM_GAP = Spacing.md;

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const renderTab = (routeName: string) => {
    const route = state.routes.find((r) => r.name === routeName);
    if (!route) return null;
    const isFocused = state.routes[state.index].name === routeName;
    const iconName = TAB_ICONS[routeName];
    const label = TAB_LABELS[routeName];
    const color = isFocused ? AuroraColors.text : AuroraColors.textFaint;

    return (
      <Pressable
        key={routeName}
        onPress={() => {
          if (!isFocused) navigation.navigate(route.name);
        }}
        style={styles.tabItem}
        testID={`tab-${routeName}`}
      >
        {isFocused ? (
          <View style={styles.activeIndicatorWrap} pointerEvents="none">
            <LinearGradient
              colors={[AuroraColors.magenta, AuroraColors.violet]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.activeIndicator}
            />
          </View>
        ) : null}
        <Feather name={iconName} size={20} color={color} />
        <ThemedText
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={[
            styles.tabLabel,
            { color, fontWeight: isFocused ? "700" : "500" },
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
      style={[
        styles.tabBarWrap,
        { paddingBottom: insets.bottom + TAB_BAR_BOTTOM_GAP },
      ]}
    >
      {/* Soft outer glow */}
      <View pointerEvents="none" style={styles.glow} />

      <View style={styles.tabBar}>
        {Platform.OS === "ios" ? (
          <BlurView
            intensity={60}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={styles.androidFill} />
        )}
        <View style={styles.tabRow}>
          {renderTab("HomeTab")}
          {renderTab("AppointmentsTab")}
          {renderTab("HistoryTab")}
          {renderTab("ProfileTab")}
        </View>
      </View>
    </View>
  );
}

export default function MainTabNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          // Reserve the full rendered footprint of the floating dock,
          // including bottom safe-area inset, so useBottomTabBarHeight()
          // matches what's actually drawn.
          height: TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_GAP + insets.bottom,
          backgroundColor: "transparent",
          borderTopWidth: 0,
        },
      }}
    >
      <Tab.Screen name="HomeTab" component={HomeStackNavigator} />
      <Tab.Screen name="AppointmentsTab" component={AppointmentsStackNavigator} />
      <Tab.Screen name="HistoryTab" component={HistoryStackNavigator} />
      <Tab.Screen name="ProfileTab" component={ProfileStackNavigator} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBarWrap: {
    position: "absolute",
    left: TAB_BAR_HORIZONTAL_MARGIN,
    right: TAB_BAR_HORIZONTAL_MARGIN,
    bottom: 0,
  },
  glow: {
    position: "absolute",
    left: 8,
    right: 8,
    top: 4,
    height: TAB_BAR_HEIGHT,
    borderRadius: BorderRadius.lg,
    backgroundColor: AuroraColors.glowViolet,
    opacity: 0.4,
  },
  tabBar: {
    height: TAB_BAR_HEIGHT,
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: AuroraColors.borderStrong,
    backgroundColor:
      Platform.OS === "ios" ? "transparent" : "rgba(20,20,28,0.92)",
  },
  androidFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(20,20,28,0.92)",
  },
  tabRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: 4,
    position: "relative",
  },
  activeIndicatorWrap: {
    position: "absolute",
    top: 0,
    width: 28,
    height: 3,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    overflow: "hidden",
  },
  activeIndicator: {
    flex: 1,
  },
  tabLabel: {
    fontSize: 10,
    maxWidth: "100%",
    textAlign: "center",
  },
});
