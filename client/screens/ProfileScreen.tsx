import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  Switch,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { EditProfileModal, ProfileData } from "@/components/EditProfileModal";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { useQueue } from "@/contexts/QueueContext";
import { Spacing, BorderRadius } from "@/constants/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface MenuItemProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  showArrow?: boolean;
  danger?: boolean;
}

function MenuItem({ icon, label, value, onPress, showArrow = true, danger = false }: MenuItemProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.98);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const iconColor = danger ? theme.error : theme.primary;
  const textColor = danger ? theme.error : theme.text;

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.menuItem, animatedStyle]}
    >
      <View style={[styles.menuIcon, { backgroundColor: iconColor + "15" }]}>
        <Feather name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.menuContent}>
        <ThemedText type="body" lightColor={textColor} darkColor={textColor}>
          {label}
        </ThemedText>
        {value ? (
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {value}
          </ThemedText>
        ) : null}
      </View>
      {showArrow && (
        <Feather name="chevron-right" size={20} color={theme.textSecondary} />
      )}
    </AnimatedPressable>
  );
}

interface NotificationToggleProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

function NotificationToggle({ icon, label, value, onValueChange }: NotificationToggleProps) {
  const { theme } = useTheme();

  const handleChange = (newValue: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onValueChange(newValue);
  };

  return (
    <View style={styles.menuItem}>
      <View style={[styles.menuIcon, { backgroundColor: theme.primary + "15" }]}>
        <Feather name={icon} size={18} color={theme.primary} />
      </View>
      <View style={styles.menuContent}>
        <ThemedText type="body">{label}</ThemedText>
      </View>
      <Switch
        value={value}
        onValueChange={handleChange}
        trackColor={{ false: theme.border, true: theme.primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme, themeMode, setThemeMode, isDark } = useTheme();
  const { user, logout, updateUser } = useAuth();
  const { stats } = useQueue();

  const [inAppNotif, setInAppNotif] = useState(user?.defaultNotificationPreferences.inApp ?? true);
  const [whatsAppNotif, setWhatsAppNotif] = useState(user?.defaultNotificationPreferences.whatsApp ?? false);
  const [smsNotif, setSmsNotif] = useState(user?.defaultNotificationPreferences.sms ?? false);
  const [editProfileVisible, setEditProfileVisible] = useState(false);

  const handleOpenEditProfile = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEditProfileVisible(true);
  };

  const handleSaveProfile = async (data: ProfileData) => {
    if (user) {
      await updateUser({
        name: data.name,
        email: data.email,
        phone: data.phone,
        avatarUrl: data.avatarUri,
      });
    }
  };

  const handleUpdateNotification = async (
    type: "inApp" | "whatsApp" | "sms",
    value: boolean
  ) => {
    const setters = { inApp: setInAppNotif, whatsApp: setWhatsAppNotif, sms: setSmsNotif };
    setters[type](value);
    
    if (user) {
      await updateUser({
        defaultNotificationPreferences: {
          ...user.defaultNotificationPreferences,
          [type]: value,
        },
      });
    }
  };

  const handleLogout = () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            await logout();
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: headerHeight + Spacing.xl,
          paddingBottom: tabBarHeight + Spacing.xl,
        },
      ]}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      <Animated.View entering={FadeInDown.springify()}>
        <Pressable
          style={[styles.profileCard, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}
          onPress={handleOpenEditProfile}
          testID="button-edit-profile"
        >
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
          ) : (
            <Image
              source={require("../../assets/images/avatar-placeholder.png")}
              style={styles.avatar}
            />
          )}
          <View style={styles.profileInfo}>
            <ThemedText type="h4">{user?.name || "Guest User"}</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {user?.email || user?.phone || "No contact info"}
            </ThemedText>
          </View>
          <View
            style={[styles.editButton, { backgroundColor: theme.primary + "15" }]}
          >
            <Feather name="edit-2" size={16} color={theme.primary} />
          </View>
        </Pressable>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(100).springify()}
        style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}
      >
        <ThemedText
          type="small"
          style={[styles.sectionTitle, { color: theme.textSecondary }]}
        >
          Notification Preferences
        </ThemedText>
        <NotificationToggle
          icon="bell"
          label="In-App Notifications"
          value={inAppNotif}
          onValueChange={(v) => handleUpdateNotification("inApp", v)}
        />
        <NotificationToggle
          icon="message-circle"
          label="WhatsApp Notifications"
          value={whatsAppNotif}
          onValueChange={(v) => handleUpdateNotification("whatsApp", v)}
        />
        <NotificationToggle
          icon="smartphone"
          label="SMS Notifications"
          value={smsNotif}
          onValueChange={(v) => handleUpdateNotification("sms", v)}
        />
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(150).springify()}
        style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}
      >
        <ThemedText
          type="small"
          style={[styles.sectionTitle, { color: theme.textSecondary }]}
        >
          Activity
        </ThemedText>
        <MenuItem
          icon="map-pin"
          label="Organizations Visited"
          value={`${stats.organizationsVisited} places`}
          showArrow={false}
        />
        <MenuItem
          icon="file-text"
          label="Saved Forms"
          value={`${stats.totalQueuesJoined} submissions`}
          showArrow={false}
        />
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(200).springify()}
        style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}
      >
        <ThemedText
          type="small"
          style={[styles.sectionTitle, { color: theme.textSecondary }]}
        >
          Appearance
        </ThemedText>
        <View style={styles.themeSelector}>
          <View style={[styles.menuIcon, { backgroundColor: theme.primary + "15" }]}>
            <Feather name={isDark ? "moon" : "sun"} size={18} color={theme.primary} />
          </View>
          <View style={styles.menuContent}>
            <ThemedText type="body">Theme</ThemedText>
          </View>
          <View style={styles.themePicker}>
            <Pressable
              style={[
                styles.themeOption,
                themeMode === "light" && { backgroundColor: theme.primary },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setThemeMode("light");
              }}
              testID="button-theme-light"
            >
              <Feather
                name="sun"
                size={14}
                color={themeMode === "light" ? "#FFFFFF" : theme.textSecondary}
              />
            </Pressable>
            <Pressable
              style={[
                styles.themeOption,
                themeMode === "dark" && { backgroundColor: theme.primary },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setThemeMode("dark");
              }}
              testID="button-theme-dark"
            >
              <Feather
                name="moon"
                size={14}
                color={themeMode === "dark" ? "#FFFFFF" : theme.textSecondary}
              />
            </Pressable>
            <Pressable
              style={[
                styles.themeOption,
                themeMode === "system" && { backgroundColor: theme.primary },
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setThemeMode("system");
              }}
              testID="button-theme-system"
            >
              <Feather
                name="smartphone"
                size={14}
                color={themeMode === "system" ? "#FFFFFF" : theme.textSecondary}
              />
            </Pressable>
          </View>
        </View>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(250).springify()}
        style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}
      >
        <ThemedText
          type="small"
          style={[styles.sectionTitle, { color: theme.textSecondary }]}
        >
          Account
        </ThemedText>
        <MenuItem icon="shield" label="Privacy & Security" />
        <MenuItem icon="help-circle" label="Help & Support" />
        <MenuItem icon="info" label="About TIQKETS" />
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(250).springify()}
        style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}
      >
        <MenuItem
          icon="log-out"
          label="Sign Out"
          onPress={handleLogout}
          showArrow={false}
          danger
        />
      </Animated.View>

      <ThemedText
        type="caption"
        style={[styles.version, { color: theme.textSecondary }]}
      >
        TIQKETS v1.0.0
      </ThemedText>

      <EditProfileModal
        visible={editProfileVisible}
        onClose={() => setEditProfileVisible(false)}
        onSave={handleSaveProfile}
        initialData={{
          name: user?.name || "",
          email: user?.email || "",
          phone: user?.phone || "",
          avatarUri: user?.avatarUrl,
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  profileInfo: {
    flex: 1,
    marginLeft: Spacing.lg,
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    fontWeight: "600",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  menuContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  themeSelector: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  themePicker: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  themeOption: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E5E7EB",
  },
  version: {
    textAlign: "center",
    marginTop: Spacing.lg,
  },
});
