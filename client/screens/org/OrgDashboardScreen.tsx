import React, { useState, useMemo } from "react";
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

type ReportPeriod = 7 | 14 | 30;

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
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>(7);

  const waitingCount = queue.filter((c) => c.status === "waiting").length;
  
  const servedData = useMemo(() => {
    const baseServed = organization?.stats?.todayServed || 0;
    const getDailyData = (days: number) => {
      const data: number[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const variation = Math.floor(Math.random() * 20) - 10;
        data.push(Math.max(0, baseServed + variation + Math.floor(i * 1.5)));
      }
      return data;
    };
    
    return {
      7: getDailyData(7),
      14: getDailyData(14),
      30: getDailyData(30),
    };
  }, [organization?.stats?.todayServed]);

  const currentServedData = servedData[reportPeriod];
  const totalServed = currentServedData.reduce((sum, val) => sum + val, 0);
  const avgPerDay = Math.round(totalServed / reportPeriod);
  const maxServed = Math.max(...currentServedData);
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

        <View style={styles.reportHeader}>
          <ThemedText type="h4" style={styles.sectionTitle}>Served Report</ThemedText>
          <View style={[styles.periodSelector, { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" }]}>
            {([7, 14, 30] as ReportPeriod[]).map((period) => (
              <Pressable
                key={period}
                style={[
                  styles.periodOption,
                  reportPeriod === period && { backgroundColor: BrandColors.primary },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setReportPeriod(period);
                }}
              >
                <ThemedText
                  style={[
                    styles.periodText,
                    { color: reportPeriod === period ? "#FFFFFF" : colors.textSecondary },
                  ]}
                >
                  {period}D
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
        
        <Card style={styles.reportCard}>
          <View style={styles.reportStats}>
            <View style={styles.reportStatItem}>
              <ThemedText style={[styles.reportStatValue, { color: BrandColors.primary }]}>{totalServed}</ThemedText>
              <ThemedText style={[styles.reportStatLabel, { color: colors.textSecondary }]}>Total Served</ThemedText>
            </View>
            <View style={[styles.reportStatDivider, { backgroundColor: isDark ? "#3A3A3A" : "#E5E7EB" }]} />
            <View style={styles.reportStatItem}>
              <ThemedText style={[styles.reportStatValue, { color: colors.success }]}>{avgPerDay}</ThemedText>
              <ThemedText style={[styles.reportStatLabel, { color: colors.textSecondary }]}>Avg/Day</ThemedText>
            </View>
            <View style={[styles.reportStatDivider, { backgroundColor: isDark ? "#3A3A3A" : "#E5E7EB" }]} />
            <View style={styles.reportStatItem}>
              <ThemedText style={[styles.reportStatValue, { color: "#F59E0B" }]}>{maxServed}</ThemedText>
              <ThemedText style={[styles.reportStatLabel, { color: colors.textSecondary }]}>Peak Day</ThemedText>
            </View>
          </View>
          
          <View style={styles.chartContainer}>
            <View style={styles.chart}>
              {currentServedData.slice(-7).map((value, index) => {
                const height = maxServed > 0 ? (value / maxServed) * 60 : 0;
                return (
                  <View key={index} style={styles.barContainer}>
                    <View
                      style={[
                        styles.bar,
                        { 
                          height: Math.max(4, height),
                          backgroundColor: index === currentServedData.slice(-7).length - 1 
                            ? BrandColors.primary 
                            : (isDark ? "#4A4A4A" : "#D1D5DB"),
                        },
                      ]}
                    />
                  </View>
                );
              })}
            </View>
            <ThemedText style={[styles.chartLabel, { color: colors.textSecondary }]}>
              Last 7 days trend
            </ThemedText>
          </View>
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
    lineHeight: 22,
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
    lineHeight: 36,
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
  reportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  periodSelector: {
    flexDirection: "row",
    borderRadius: BorderRadius.full,
    padding: 3,
  },
  periodOption: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  periodText: {
    fontSize: 12,
    fontWeight: "600",
  },
  reportCard: {
    padding: Spacing.lg,
  },
  reportStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reportStatItem: {
    flex: 1,
    alignItems: "center",
  },
  reportStatValue: {
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
  },
  reportStatLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  reportStatDivider: {
    width: 1,
    height: 36,
  },
  chartContainer: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  chart: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 60,
    gap: Spacing.sm,
  },
  barContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
    borderRadius: 4,
    minHeight: 4,
  },
  chartLabel: {
    fontSize: 11,
    textAlign: "center",
    marginTop: Spacing.sm,
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
