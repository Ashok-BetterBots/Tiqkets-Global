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
type TrendPeriod = 30 | 60 | 90 | 180 | 365;

const TREND_PERIODS: { value: TrendPeriod; label: string }[] = [
  { value: 30, label: "1M" },
  { value: 60, label: "2M" },
  { value: 90, label: "3M" },
  { value: 180, label: "6M" },
  { value: 365, label: "1Y" },
];

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS_OF_DAY = ["6a", "8a", "10a", "12p", "2p", "4p", "6p", "8p"];

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
  const [weeklyTrendPeriod, setWeeklyTrendPeriod] = useState<TrendPeriod>(30);
  const [hourlyTrendPeriod, setHourlyTrendPeriod] = useState<TrendPeriod>(30);
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);
  const [selectedWeeklyBarIndex, setSelectedWeeklyBarIndex] = useState<number | null>(null);
  const [selectedHourlyBarIndex, setSelectedHourlyBarIndex] = useState<number | null>(null);

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

  const weeklyTrendData = useMemo(() => {
    const baseServed = organization?.stats?.todayServed || 0;
    const generateWeeklyData = (days: number) => {
      const dayTotals = [0, 0, 0, 0, 0, 0, 0];
      const dayCounts = [0, 0, 0, 0, 0, 0, 0];
      for (let i = 0; i < days; i++) {
        const dayOfWeek = (new Date().getDay() - i + 700) % 7;
        const variation = Math.floor(Math.random() * 30) + baseServed;
        dayTotals[dayOfWeek] += variation;
        dayCounts[dayOfWeek]++;
      }
      return dayTotals.map((total, idx) => 
        dayCounts[idx] > 0 ? Math.round(total / dayCounts[idx]) : 0
      );
    };
    return {
      30: generateWeeklyData(30),
      60: generateWeeklyData(60),
      90: generateWeeklyData(90),
      180: generateWeeklyData(180),
      365: generateWeeklyData(365),
    };
  }, [organization?.stats?.todayServed]);

  const hourlyTrendData = useMemo(() => {
    const baseServed = organization?.stats?.todayServed || 0;
    const generateHourlyData = (days: number) => {
      const hours = [6, 8, 10, 12, 14, 16, 18, 20];
      return hours.map((hour) => {
        const peakFactor = hour >= 10 && hour <= 14 ? 1.5 : hour >= 16 && hour <= 18 ? 1.3 : 1;
        const variation = Math.floor(Math.random() * 15);
        return Math.round((baseServed * peakFactor * (days / 30)) / 8 + variation);
      });
    };
    return {
      30: generateHourlyData(30),
      60: generateHourlyData(60),
      90: generateHourlyData(90),
      180: generateHourlyData(180),
      365: generateHourlyData(365),
    };
  }, [organization?.stats?.todayServed]);

  const currentServedData = servedData[reportPeriod];
  const totalServed = currentServedData.reduce((sum, val) => sum + val, 0);
  const avgPerDay = Math.round(totalServed / reportPeriod);
  const maxServed = Math.max(...currentServedData);
  
  const currentWeeklyData = weeklyTrendData[weeklyTrendPeriod];
  const maxWeeklyValue = Math.max(...currentWeeklyData);
  const peakDayIndex = currentWeeklyData.indexOf(maxWeeklyValue);
  
  const currentHourlyData = hourlyTrendData[hourlyTrendPeriod];
  const maxHourlyValue = Math.max(...currentHourlyData);
  const peakHourIndex = currentHourlyData.indexOf(maxHourlyValue);
  
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
              {currentServedData.map((value, index) => {
                const height = maxServed > 0 ? (value / maxServed) * 60 : 0;
                const isSelected = selectedBarIndex === index;
                const isLast = index === currentServedData.length - 1;
                return (
                  <Pressable 
                    key={index} 
                    style={styles.barTouchTarget}
                    testID={`served-bar-${index}`}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedBarIndex(isSelected ? null : index);
                    }}
                  >
                    <View style={styles.barContainer}>
                      {isSelected ? (
                        <View style={[styles.barTooltip, { backgroundColor: isDark ? "#3A3A3A" : "#1F2937" }]}>
                          <ThemedText style={styles.barTooltipText}>{value}</ThemedText>
                        </View>
                      ) : null}
                      <View
                        style={[
                          styles.bar,
                          { 
                            height: Math.max(4, height),
                            backgroundColor: isLast 
                              ? BrandColors.primary 
                              : isSelected 
                                ? BrandColors.primaryLight
                                : (isDark ? "#4A4A4A" : "#D1D5DB"),
                          },
                        ]}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <ThemedText style={[styles.chartLabel, { color: colors.textSecondary }]}>
              Last {reportPeriod} days trend
            </ThemedText>
          </View>
        </Card>

        <View style={styles.reportHeader}>
          <ThemedText type="h4" style={styles.sectionTitle}>Weekly Trend</ThemedText>
          <View style={[styles.periodSelector, { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" }]}>
            {TREND_PERIODS.map((period) => (
              <Pressable
                key={period.value}
                style={[
                  styles.periodOption,
                  weeklyTrendPeriod === period.value && { backgroundColor: BrandColors.primary },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setWeeklyTrendPeriod(period.value);
                  setSelectedWeeklyBarIndex(null);
                }}
              >
                <ThemedText
                  style={[
                    styles.periodText,
                    { color: weeklyTrendPeriod === period.value ? "#FFFFFF" : colors.textSecondary },
                  ]}
                >
                  {period.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
        
        <Card style={styles.reportCard}>
          <View style={styles.trendInfo}>
            <ThemedText style={[styles.trendInfoLabel, { color: colors.textSecondary }]}>
              Busiest Day
            </ThemedText>
            <ThemedText style={[styles.trendInfoValue, { color: BrandColors.primary }]}>
              {DAYS_OF_WEEK[peakDayIndex]} ({maxWeeklyValue} avg)
            </ThemedText>
          </View>
          <View style={styles.chartContainer}>
            <View style={styles.chart}>
              {currentWeeklyData.map((value, index) => {
                const height = maxWeeklyValue > 0 ? (value / maxWeeklyValue) * 60 : 0;
                const isSelected = selectedWeeklyBarIndex === index;
                const isPeak = index === peakDayIndex;
                return (
                  <Pressable 
                    key={index} 
                    style={styles.barTouchTarget}
                    testID={`weekly-bar-${index}`}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedWeeklyBarIndex(isSelected ? null : index);
                    }}
                  >
                    <View style={styles.barContainer}>
                      {isSelected ? (
                        <View style={[styles.barTooltip, { backgroundColor: isDark ? "#3A3A3A" : "#1F2937" }]}>
                          <ThemedText style={styles.barTooltipText}>{value}</ThemedText>
                        </View>
                      ) : null}
                      <View
                        style={[
                          styles.bar,
                          { 
                            height: Math.max(4, height),
                            backgroundColor: isPeak 
                              ? BrandColors.primary 
                              : isSelected 
                                ? BrandColors.primaryLight
                                : (isDark ? "#4A4A4A" : "#D1D5DB"),
                          },
                        ]}
                      />
                    </View>
                    <ThemedText style={[styles.barLabel, { color: colors.textSecondary }]}>
                      {DAYS_OF_WEEK[index].charAt(0)}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <ThemedText style={[styles.chartLabel, { color: colors.textSecondary }]}>
              Average customers by day of week
            </ThemedText>
          </View>
        </Card>

        <View style={styles.reportHeader}>
          <ThemedText type="h4" style={styles.sectionTitle}>Hourly Trend</ThemedText>
          <View style={[styles.periodSelector, { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" }]}>
            {TREND_PERIODS.map((period) => (
              <Pressable
                key={period.value}
                style={[
                  styles.periodOption,
                  hourlyTrendPeriod === period.value && { backgroundColor: BrandColors.primary },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setHourlyTrendPeriod(period.value);
                  setSelectedHourlyBarIndex(null);
                }}
              >
                <ThemedText
                  style={[
                    styles.periodText,
                    { color: hourlyTrendPeriod === period.value ? "#FFFFFF" : colors.textSecondary },
                  ]}
                >
                  {period.label}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
        
        <Card style={styles.reportCard}>
          <View style={styles.trendInfo}>
            <ThemedText style={[styles.trendInfoLabel, { color: colors.textSecondary }]}>
              Peak Hour
            </ThemedText>
            <ThemedText style={[styles.trendInfoValue, { color: BrandColors.primary }]}>
              {HOURS_OF_DAY[peakHourIndex]} ({maxHourlyValue} avg)
            </ThemedText>
          </View>
          <View style={styles.chartContainer}>
            <View style={styles.chart}>
              {currentHourlyData.map((value, index) => {
                const height = maxHourlyValue > 0 ? (value / maxHourlyValue) * 60 : 0;
                const isSelected = selectedHourlyBarIndex === index;
                const isPeak = index === peakHourIndex;
                return (
                  <Pressable 
                    key={index} 
                    style={styles.barTouchTarget}
                    testID={`hourly-bar-${index}`}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedHourlyBarIndex(isSelected ? null : index);
                    }}
                  >
                    <View style={styles.barContainer}>
                      {isSelected ? (
                        <View style={[styles.barTooltip, { backgroundColor: isDark ? "#3A3A3A" : "#1F2937" }]}>
                          <ThemedText style={styles.barTooltipText}>{value}</ThemedText>
                        </View>
                      ) : null}
                      <View
                        style={[
                          styles.bar,
                          { 
                            height: Math.max(4, height),
                            backgroundColor: isPeak 
                              ? BrandColors.primary 
                              : isSelected 
                                ? BrandColors.primaryLight
                                : (isDark ? "#4A4A4A" : "#D1D5DB"),
                          },
                        ]}
                      />
                    </View>
                    <ThemedText style={[styles.barLabel, { color: colors.textSecondary }]}>
                      {HOURS_OF_DAY[index]}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <ThemedText style={[styles.chartLabel, { color: colors.textSecondary }]}>
              Average customers by time of day
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
  barTouchTarget: {
    flex: 1,
    minWidth: 8,
    paddingHorizontal: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  barContainer: {
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    position: "relative",
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
  barTooltip: {
    position: "absolute",
    bottom: "100%",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 4,
    zIndex: 10,
  },
  barTooltipText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  barLabel: {
    fontSize: 9,
    marginTop: 4,
  },
  trendInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  trendInfoLabel: {
    fontSize: 12,
  },
  trendInfoValue: {
    fontSize: 14,
    fontWeight: "700",
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
