import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, useColorScheme, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { ProfileModal } from "@/components/ProfileModal";
import { Colors, Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  subtitle?: string;
  isDark?: boolean;
}

function StatCard({ title, value, icon, color, subtitle, isDark = false }: StatCardProps) {
  const textSecondary = isDark ? Colors.dark.textSecondary : Colors.light.textSecondary;
  return (
    <Card style={styles.statCard}>
      <View style={[styles.statIconContainer, { backgroundColor: color + "15" }]}>
        <Feather name={icon} size={20} color={color} />
      </View>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
      <ThemedText style={[styles.statTitle, { color: textSecondary }]}>{title}</ThemedText>
      {subtitle ? <ThemedText style={[styles.statSubtitle, { color: textSecondary }]}>{subtitle}</ThemedText> : null}
    </Card>
  );
}

interface QuickActionProps {
  title: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  color?: string;
}

function QuickAction({ title, icon, onPress, color = Colors.light.primary, isDark = false }: QuickActionProps & { isDark?: boolean }) {
  return (
    <Pressable
      style={[styles.quickAction, { backgroundColor: isDark ? "#2A2A2A" : "#F8FAFC" }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <View style={[styles.quickActionIcon, { backgroundColor: color + "15" }]}>
        <Feather name={icon} size={22} color={color} />
      </View>
      <ThemedText style={styles.quickActionText}>{title}</ThemedText>
    </Pressable>
  );
}

export default function OrgDashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { organization, currentUser, queue, refreshStats, updateCurrentUser, changePassword, logoutOrganization, isLoading } = useOrganization();
  const [refreshing, setRefreshing] = React.useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  const waitingCount = queue.filter((c) => c.status === "waiting").length;
  const servingCount = queue.filter((c) => c.status === "serving" || c.status === "called").length;

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshStats();
    setRefreshing(false);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (!organization || !currentUser) return null;

  return (
    <ThemedView style={styles.container}>
      <LinearGradient
        colors={isDark ? [BrandColors.primaryLight, BrandColors.primary] : [BrandColors.primary, BrandColors.primaryDark]}
        style={[styles.header, { paddingTop: insets.top + Spacing.md }]}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowProfileModal(true);
              }}
              style={styles.profileButton}
            >
              {currentUser.profilePictureUrl ? (
                <Image
                  source={{ uri: currentUser.profilePictureUrl }}
                  style={styles.profileAvatar}
                />
              ) : (
                <View style={styles.profileAvatarPlaceholder}>
                  <ThemedText style={styles.profileInitials}>
                    {getInitials(currentUser.name)}
                  </ThemedText>
                </View>
              )}
            </Pressable>
            <View style={styles.welcomeContainer}>
              <ThemedText style={styles.welcomeText} lightColor="rgba(255,255,255,0.8)" darkColor="rgba(255,255,255,0.8)">
                Welcome back,
              </ThemedText>
              <ThemedText style={styles.userName} lightColor="#FFFFFF" darkColor="#FFFFFF">
                {currentUser.name}
              </ThemedText>
            </View>
          </View>
          <View style={styles.headerBadge}>
            <Feather
              name={organization.isVerified ? "check-circle" : "clock"}
              size={14}
              color="#FFFFFF"
            />
            <ThemedText style={styles.headerBadgeText} lightColor="#FFFFFF" darkColor="#FFFFFF">
              {organization.isVerified ? "Verified" : "Pending"}
            </ThemedText>
          </View>
        </View>

        <View style={styles.liveStats}>
          <View style={styles.liveStat}>
            <ThemedText style={styles.liveStatValue} lightColor="#FFFFFF" darkColor="#FFFFFF">
              {waitingCount}
            </ThemedText>
            <ThemedText style={styles.liveStatLabel} lightColor="rgba(255,255,255,0.8)" darkColor="rgba(255,255,255,0.8)">
              In Queue
            </ThemedText>
          </View>
          <View style={styles.liveStatDivider} />
          <View style={styles.liveStat}>
            <ThemedText style={styles.liveStatValue} lightColor="#FFFFFF" darkColor="#FFFFFF">
              {servingCount}
            </ThemedText>
            <ThemedText style={styles.liveStatLabel} lightColor="rgba(255,255,255,0.8)" darkColor="rgba(255,255,255,0.8)">
              Being Served
            </ThemedText>
          </View>
          <View style={styles.liveStatDivider} />
          <View style={styles.liveStat}>
            <ThemedText style={styles.liveStatValue} lightColor="#FFFFFF" darkColor="#FFFFFF">
              {organization.stats.averageWaitTime}m
            </ThemedText>
            <ThemedText style={styles.liveStatLabel} lightColor="rgba(255,255,255,0.8)" darkColor="rgba(255,255,255,0.8)">
              Avg Wait
            </ThemedText>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <ThemedText type="h4" style={styles.sectionTitle}>Quick Actions</ThemedText>
        <View style={styles.quickActionsGrid}>
          <QuickAction
            title="Process Queue"
            icon="users"
            onPress={() => navigation.navigate("OrgQueue")}
            color={colors.success}
            isDark={isDark}
          />
          <QuickAction
            title="Manage Services"
            icon="settings"
            onPress={() => navigation.navigate("OrgServices")}
            isDark={isDark}
          />
          <QuickAction
            title="Bookings"
            icon="calendar"
            onPress={() => navigation.navigate("OrgBookings")}
            color="#8B5CF6"
            isDark={isDark}
          />
          <QuickAction
            title="Settings"
            icon="sliders"
            onPress={() => navigation.navigate("OrgSettings")}
            color="#F59E0B"
            isDark={isDark}
          />
        </View>

        <ThemedText type="h4" style={styles.sectionTitle}>Today's Performance</ThemedText>
        <View style={styles.statsGrid}>
          <StatCard
            title="Served"
            value={organization.stats.todayServed}
            icon="check-circle"
            color={colors.success}
            isDark={isDark}
          />
          <StatCard
            title="No Shows"
            value={organization.stats.todayNoShow}
            icon="user-x"
            color={colors.accent}
            isDark={isDark}
          />
          <StatCard
            title="Bookings"
            value={organization.stats.totalBookingsToday}
            icon="calendar"
            color="#8B5CF6"
            isDark={isDark}
          />
          <StatCard
            title="Upcoming"
            value={organization.stats.upcomingBookings}
            icon="clock"
            color="#F59E0B"
            isDark={isDark}
          />
        </View>

        <ThemedText type="h4" style={styles.sectionTitle}>Queue Mode</ThemedText>
        <Card style={styles.modeCard}>
          <View style={styles.modeContent}>
            <View style={[styles.modeIcon, { backgroundColor: colors.primary + "15" }]}>
              <Feather
                name={organization.settings.queueMode === "fifo" ? "arrow-down" : "target"}
                size={24}
                color={colors.primary}
              />
            </View>
            <View style={styles.modeInfo}>
              <ThemedText type="body" style={styles.modeName}>
                {organization.settings.queueMode === "fifo" ? "FIFO Mode" : "Selective Mode"}
              </ThemedText>
              <ThemedText style={[styles.modeDescription, { color: colors.textSecondary }]}>
                {organization.settings.queueMode === "fifo"
                  ? "First come, first served. Customers are called in order."
                  : "You choose who to call next. Customers notified only when called."}
              </ThemedText>
            </View>
          </View>
          <Pressable
            style={[styles.modeButton, { borderTopColor: isDark ? "#3A3A3A" : "#F1F5F9" }]}
            onPress={() => navigation.navigate("OrgSettings")}
          >
            <ThemedText style={[styles.modeButtonText, { color: colors.primary }]}>Change Mode</ThemedText>
            <Feather name="chevron-right" size={16} color={colors.primary} />
          </Pressable>
        </Card>

        {organization.settings.api.isEnabled ? (
          <>
            <ThemedText type="h4" style={styles.sectionTitle}>API Status</ThemedText>
            <Card style={styles.apiCard}>
              <View style={styles.apiStatus}>
                <View style={[styles.apiIndicator, { backgroundColor: colors.success }]} />
                <ThemedText style={styles.apiText}>API Active</ThemedText>
              </View>
              <ThemedText style={[styles.apiKey, { color: colors.textSecondary }]}>
                Key: {organization.settings.api.apiKey.substring(0, 12)}...
              </ThemedText>
            </Card>
          </>
        ) : null}
      </ScrollView>

      <ProfileModal
        visible={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        user={currentUser}
        onUpdateUser={updateCurrentUser}
        onChangePassword={changePassword}
        onLogout={logoutOrganization}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  profileButton: {
    marginRight: Spacing.md,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
  },
  profileAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
  },
  profileInitials: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  welcomeContainer: {
    flex: 1,
  },
  welcomeText: {
    fontSize: 14,
  },
  userName: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 2,
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  headerBadgeText: {
    fontSize: 12,
    marginLeft: Spacing.xs,
  },
  liveStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: Spacing.xl,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
  },
  liveStat: {
    alignItems: "center",
    flex: 1,
  },
  liveStatValue: {
    fontSize: 28,
    fontWeight: "700",
  },
  liveStatLabel: {
    fontSize: 12,
    marginTop: Spacing.xs,
  },
  liveStatDivider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },
  quickActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  quickAction: {
    flex: 1,
    minWidth: "45%",
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: "center",
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: "600",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    padding: Spacing.md,
    alignItems: "center",
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
  },
  statTitle: {
    fontSize: 12,
    marginTop: Spacing.xs,
  },
  statSubtitle: {
    fontSize: 10,
  },
  modeCard: {
    padding: Spacing.lg,
  },
  modeContent: {
    flexDirection: "row",
  },
  modeIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  modeInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  modeName: {
    fontWeight: "600",
  },
  modeDescription: {
    fontSize: 13,
    marginTop: Spacing.xs,
  },
  modeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  apiCard: {
    padding: Spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  apiStatus: {
    flexDirection: "row",
    alignItems: "center",
  },
  apiIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
  },
  apiText: {
    fontWeight: "600",
  },
  apiKey: {
    fontSize: 12,
  },
});
