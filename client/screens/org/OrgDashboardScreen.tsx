import { logHandledError } from "@/lib/logger";
import React, { useState, useMemo, useCallback } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, useColorScheme, Image, Dimensions, Modal, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from "react-native-svg";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { ProfileModal } from "@/components/ProfileModal";
import WebOrgDashboard from "@/screens/org/WebOrgDashboard";
import { Colors, Spacing, BorderRadius, BrandColors, Shadows } from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "@/lib/query-client";

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
const HOURS_OF_DAY = ["6AM", "8AM", "10AM", "12PM", "2PM", "4PM", "6PM", "8PM"];

interface StatCardProps {
  title: string;
  value: string | number;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  subtitle?: string;
  isDark?: boolean;
}

function StatCard({ title, value, icon, color, subtitle, isDark = false }: StatCardProps) {
  const palette = isDark ? Colors.dark : Colors.light;
  return (
    <View style={[styles.perfCard, { backgroundColor: palette.surface, borderColor: palette.borderSubtle }]}>
      <View style={[styles.perfIconContainer, { backgroundColor: color + "14" }]}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <ThemedText style={styles.perfValue}>{value}</ThemedText>
      <ThemedText style={[styles.perfTitle, { color: palette.textSecondary }]} numberOfLines={1}>{title}</ThemedText>
      {subtitle ? <ThemedText style={[styles.perfSubtitle, { color: palette.textSecondary }]} numberOfLines={1}>{subtitle}</ThemedText> : null}
    </View>
  );
}

interface QuickActionProps {
  title: string;
  subtitle?: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  color?: string;
  isDark?: boolean;
}

function QuickAction({ title, subtitle, icon, onPress, color = Colors.light.primary, isDark = false }: QuickActionProps) {
  const palette = isDark ? Colors.dark : Colors.light;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.qaCard,
        { backgroundColor: palette.surface, borderColor: palette.borderSubtle, opacity: pressed ? 0.85 : 1 },
      ]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <View style={[styles.qaIconContainer, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={20} color={color} />
      </View>
      <View style={styles.qaContent}>
        <ThemedText style={styles.qaTitle} numberOfLines={1}>{title}</ThemedText>
        {subtitle ? (
          <ThemedText style={[styles.qaSubtitle, { color: palette.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      <View style={[styles.qaChevron, { backgroundColor: palette.surfaceMuted }]}>
        <Feather name="chevron-right" size={14} color={palette.textSecondary} />
      </View>
    </Pressable>
  );
}

export default function OrgDashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { organization, currentUser, queue, refreshStats, updateCurrentUser, changePassword, logoutOrganization, isLoading, branches, updateBranch, updateService, updateDesk, getAccessibleBranches, hasPermission } = useOrganization();
  const canSeeQueueWidget = hasPermission("org.dashboard.queue_widget");
  const canSeeQuickActions = hasPermission("org.dashboard.quick_actions");
  const canSeeAnalytics = hasPermission("org.dashboard.analytics");
  const [refreshing, setRefreshing] = React.useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [queueStatusLoading, setQueueStatusLoading] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string>("all");
  const [selectedDeskId, setSelectedDeskId] = useState<string>("all");
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [showDeskPicker, setShowDeskPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>(7);
  const [weeklyTrendPeriod, setWeeklyTrendPeriod] = useState<TrendPeriod>(30);
  const [hourlyTrendPeriod, setHourlyTrendPeriod] = useState<TrendPeriod>(30);
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);
  const [selectedWeeklyBarIndex, setSelectedWeeklyBarIndex] = useState<number | null>(null);
  const [selectedHourlyBarIndex, setSelectedHourlyBarIndex] = useState<number | null>(null);

  const waitingCount = queue.filter((c) => c.status === "waiting").length;

  // Real analytics from /api/reports/:orgId/summary. We fetch once with a
  // 365-day window which gives us the daily breakdown used for the Served
  // Report and Weekly Trend charts. The Hourly Trend uses a separate query
  // keyed by its period because the endpoint returns hourly aggregates for
  // the *whole* filter window — we need a fresh fetch when the user picks
  // a different period.
  const longRangeReportQuery = useQuery<{
    daily: { date: string; total: number; completed: number; noShow: number; cancelled: number }[];
  }>({
    queryKey: ["/api/reports", organization?.id, "summary", "long-range"],
    enabled: !!organization?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const start = new Date();
      start.setDate(start.getDate() - 365);
      const url = new URL(`/api/reports/${organization!.id}/summary`, getApiUrl());
      url.searchParams.set("startDate", start.toISOString().split("T")[0]);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load report (${res.status})`);
      return res.json();
    },
  });

  const hourlyReportQuery = useQuery<{
    hourly: { hour: number; total: number; completed: number; noShow: number }[];
  }>({
    queryKey: ["/api/reports", organization?.id, "summary", "hourly", hourlyTrendPeriod],
    enabled: !!organization?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const start = new Date();
      start.setDate(start.getDate() - hourlyTrendPeriod);
      const url = new URL(`/api/reports/${organization!.id}/summary`, getApiUrl());
      url.searchParams.set("startDate", start.toISOString().split("T")[0]);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load report (${res.status})`);
      return res.json();
    },
  });

  // Build a date -> completed-count lookup from the API response so we can
  // derive any sub-window without re-fetching.
  const dailyCompletedByDate = useMemo(() => {
    const m = new Map<string, number>();
    (longRangeReportQuery.data?.daily ?? []).forEach((d) => {
      m.set(d.date, d.completed || 0);
    });
    return m;
  }, [longRangeReportQuery.data]);

  // Last N days of "completed" counts, oldest -> newest, with zero-fill for
  // days the API didn't return (no tickets that day).
  const buildDailySeries = useCallback((days: number) => {
    const out: number[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().split("T")[0];
      out.push(dailyCompletedByDate.get(key) || 0);
    }
    return out;
  }, [dailyCompletedByDate]);

  const currentServedData = useMemo(() => buildDailySeries(reportPeriod), [buildDailySeries, reportPeriod]);
  const totalServed = currentServedData.reduce((sum, val) => sum + val, 0);
  const avgPerDay = Math.round(totalServed / reportPeriod);
  const maxServed = Math.max(0, ...currentServedData);

  // Weekly trend = average completed per weekday (Sun..Sat) across the
  // selected window.
  const currentWeeklyData = useMemo(() => {
    const days = buildDailySeries(weeklyTrendPeriod);
    const totals = [0, 0, 0, 0, 0, 0, 0];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < days.length; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - (weeklyTrendPeriod - 1 - i));
      const dow = d.getDay();
      totals[dow] += days[i];
      counts[dow] += 1;
    }
    return totals.map((t, idx) => (counts[idx] > 0 ? Math.round(t / counts[idx]) : 0));
  }, [buildDailySeries, weeklyTrendPeriod]);
  const maxWeeklyValue = Math.max(0, ...currentWeeklyData);
  const peakDayIndex = currentWeeklyData.indexOf(maxWeeklyValue);

  // Hourly trend = completed count at each of the 8 displayed hours
  // (6,8,10,12,14,16,18,20) over the selected window.
  const currentHourlyData = useMemo(() => {
    const buckets = hourlyReportQuery.data?.hourly ?? [];
    const byHour = new Map<number, number>();
    buckets.forEach((b) => byHour.set(b.hour, b.completed || 0));
    return [6, 8, 10, 12, 14, 16, 18, 20].map((h) => byHour.get(h) || 0);
  }, [hourlyReportQuery.data]);
  const maxHourlyValue = Math.max(0, ...currentHourlyData);
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

  // Subscription gate: drives the "trial expires today/tomorrow" and
  // "subscription not active" banners on the home screen. Refetched on
  // mount and when the orgId changes — short staleTime so the banner
  // appears within seconds of an admin upgrading or the trial flipping
  // to expired.
  const subscriptionQuery = useQuery<{ subscription: { status: string; trialEndDate: string | null } | null }>({
    queryKey: ["/api/billing/subscription", organization?.id],
    enabled: !!organization?.id,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const sub = subscriptionQuery.data?.subscription ?? null;
  // Calendar-day remaining (not a raw 24-hour delta) so a trial ending
  // at any time today is shown as "expires today" and a trial ending
  // any time tomorrow is shown as "expires tomorrow", regardless of
  // hour of day. Negative = past end-of-day (already expired).
  const trialDaysRemaining = React.useMemo(() => {
    if (!sub?.trialEndDate) return null;
    const end = new Date(sub.trialEndDate);
    if (isNaN(end.getTime())) return null;
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((endDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }, [sub?.trialEndDate]);
  const subInactive = sub?.status === "expired" || sub?.status === "cancelled";
  const trialEndingSoon = sub?.status === "trialing" && trialDaysRemaining !== null && trialDaysRemaining <= 1;
  const showSubBanner = subInactive || trialEndingSoon;
  const subBannerExpired = subInactive || (trialDaysRemaining !== null && trialDaysRemaining <= 0);
  const canManageBilling = hasPermission("org.billing.manage");

  const accessibleBranches = getAccessibleBranches();
  const activeBranch = accessibleBranches.length > 0 ? accessibleBranches[0] : null;
  const branchServices = activeBranch?.services?.filter(s => s.isActive) || [];
  const selectedService = branchServices.find(s => s.id === selectedServiceId);
  const availableDesks = selectedServiceId !== "all" && selectedService?.desks
    ? selectedService.desks.filter(d => d.isActive)
    : [];

  const getCurrentQueueStatus = useCallback(() => {
    if (selectedDeskId !== "all") {
      const desk = availableDesks.find(d => d.id === selectedDeskId);
      return (desk as any)?.queueStatus || "active";
    }
    if (selectedServiceId !== "all" && selectedService) {
      return (selectedService as any)?.queueStatus || "active";
    }
    return (activeBranch as any)?.queueStatus || "active";
  }, [selectedServiceId, selectedDeskId, activeBranch, selectedService, availableDesks]);

  const currentQueueStatus = getCurrentQueueStatus();

  const handleQueueStatusChange = async (newStatus: string) => {
    if (!activeBranch || queueStatusLoading) return;
    setQueueStatusLoading(true);
    try {
      if (selectedDeskId !== "all") {
        await updateDesk(selectedDeskId, { queueStatus: newStatus } as any);
      } else if (selectedServiceId !== "all") {
        await updateService(selectedServiceId, { queueStatus: newStatus } as any);
        if (selectedService?.desks) {
          for (const desk of selectedService.desks) {
            await updateDesk(desk.id, { queueStatus: newStatus } as any);
          }
        }
      } else {
        await updateBranch(activeBranch.id, { queueStatus: newStatus } as any);
        for (const svc of branchServices) {
          await updateService(svc.id, { queueStatus: newStatus } as any);
          if (svc.desks) {
            for (const desk of svc.desks) {
              await updateDesk(desk.id, { queueStatus: newStatus } as any);
            }
          }
        }
      }
      Haptics.notificationAsync(
        newStatus === "active" ? Haptics.NotificationFeedbackType.Success :
        newStatus === "paused" ? Haptics.NotificationFeedbackType.Warning :
        Haptics.NotificationFeedbackType.Error
      );
      setShowStatusPicker(false);
    } catch (error) {
      logHandledError("Error updating queue status", error);
    } finally {
      setQueueStatusLoading(false);
    }
  };

  const queueStatusConfig: Record<string, { label: string; color: string; icon: keyof typeof Feather.glyphMap; description: string }> = {
    active: { label: "Active", color: "#10B981", icon: "play-circle", description: "Accepting new customers" },
    paused: { label: "Paused", color: "#F59E0B", icon: "pause-circle", description: "Temporarily not accepting" },
    ended: { label: "Ended", color: "#EF4444", icon: "stop-circle", description: "Queue closed for the day" },
  };

  const statusInfo = queueStatusConfig[currentQueueStatus] || queueStatusConfig.active;

  const getSelectedLabel = () => {
    if (selectedDeskId !== "all") {
      const desk = availableDesks.find(d => d.id === selectedDeskId);
      return desk?.name || "Desk";
    }
    if (selectedServiceId !== "all") return selectedService?.name || "Service";
    return "All Services & Desks";
  };

  if (!organization || !currentUser) return null;

  if (Platform.OS === "web") {
    return (
      <WebOrgDashboard
        organization={organization}
        currentUser={currentUser}
        queue={queue}
        waitingCount={waitingCount}
        servingCount={servingCount}
        statusInfo={statusInfo}
        getSelectedLabel={getSelectedLabel}
        onOpenStatusPicker={() => setShowStatusPicker(true)}
        onOpenServicePicker={() => setShowServicePicker(true)}
        onOpenDeskPicker={() => setShowDeskPicker(true)}
        selectedServiceId={selectedServiceId}
        selectedDeskId={selectedDeskId}
        availableDesks={availableDesks}
        selectedService={selectedService}
        navigation={navigation}
        colors={colors}
        isDark={isDark}
        showServicePicker={showServicePicker}
        showDeskPicker={showDeskPicker}
        showStatusPicker={showStatusPicker}
        setShowServicePicker={setShowServicePicker}
        setShowDeskPicker={setShowDeskPicker}
        setShowStatusPicker={setShowStatusPicker}
        setSelectedServiceId={setSelectedServiceId}
        setSelectedDeskId={setSelectedDeskId}
        branchServices={branchServices}
        currentQueueStatus={currentQueueStatus}
        queueStatusConfig={queueStatusConfig}
        handleQueueStatusChange={handleQueueStatusChange}
        queueStatusLoading={queueStatusLoading}
        showProfileModal={showProfileModal}
        setShowProfileModal={setShowProfileModal}
        updateCurrentUser={updateCurrentUser}
        changePassword={changePassword}
        logoutOrganization={logoutOrganization}
      />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.lg, backgroundColor: colors.surface, borderBottomColor: colors.borderSubtle }]}>
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowProfileModal(true);
              }}
              style={styles.profileButton}
              testID="button-profile"
            >
              <View style={[styles.profileRing, { borderColor: BrandColors.primary + "33" }]}>
                {currentUser.profilePictureUrl ? (
                  <Image
                    source={{ uri: currentUser.profilePictureUrl }}
                    style={styles.profileAvatar}
                  />
                ) : (
                  <View style={[styles.profileAvatarPlaceholder, { backgroundColor: BrandColors.primary + "14" }]}>
                    <ThemedText style={[styles.profileInitials, { color: BrandColors.primary }]}>
                      {getInitials(organization.name || currentUser.name)}
                    </ThemedText>
                  </View>
                )}
              </View>
              {organization.isVerified ? (
                <View style={[styles.verifiedBadge, { backgroundColor: "#059669", borderColor: colors.surface }]}>
                  <Feather name="check" size={11} color="#FFFFFF" />
                </View>
              ) : null}
            </Pressable>
            <View style={styles.welcomeContainer}>
              <ThemedText style={[styles.welcomeText, { color: colors.textSecondary }]}>
                Welcome back
              </ThemedText>
              <ThemedText style={[styles.orgName, { color: colors.text }]} numberOfLines={1}>
                {organization.name}
              </ThemedText>
            </View>
          </View>
          {!organization.isVerified ? (
            <View style={[styles.headerBadge, { backgroundColor: isDark ? colors.warning + "26" : "#FEF3C7", borderColor: isDark ? "transparent" : "#FCD34D", borderWidth: isDark ? 0 : StyleSheet.hairlineWidth }]}>
              <Feather name="clock" size={12} color={isDark ? colors.warning : "#92400E"} />
              <ThemedText style={[styles.headerBadgeText, { color: isDark ? colors.warning : "#92400E" }]}>
                Pending
              </ThemedText>
            </View>
          ) : null}
        </View>

        <View style={[styles.liveStats, { backgroundColor: colors.backgroundRoot, borderColor: colors.borderSubtle }]}>
          <View style={styles.liveStat}>
            <ThemedText style={[styles.liveStatValue, { color: colors.text }]}>
              {waitingCount}
            </ThemedText>
            <ThemedText style={[styles.liveStatLabel, { color: colors.textSecondary }]}>
              In Queue
            </ThemedText>
          </View>
          <View style={[styles.liveStatDivider, { backgroundColor: colors.borderSubtle }]} />
          <View style={styles.liveStat}>
            <ThemedText style={[styles.liveStatValue, { color: colors.text }]}>
              {servingCount}
            </ThemedText>
            <ThemedText style={[styles.liveStatLabel, { color: colors.textSecondary }]}>
              Being Served
            </ThemedText>
          </View>
          <View style={[styles.liveStatDivider, { backgroundColor: colors.borderSubtle }]} />
          <View style={styles.liveStat}>
            <ThemedText style={[styles.liveStatValue, { color: colors.text }]}>
              {organization.stats.averageWaitTime}m
            </ThemedText>
            <ThemedText style={[styles.liveStatLabel, { color: colors.textSecondary }]}>
              Avg Wait
            </ThemedText>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {showSubBanner ? (
          <Card
            variant="outlined"
            style={[
              styles.subBanner,
              {
                backgroundColor: subBannerExpired ? "#EF444412" : "#F59E0B12",
                borderColor: subBannerExpired ? "#EF444455" : "#F59E0B66",
              },
            ]}
            testID={subBannerExpired ? "banner-subscription-expired" : "banner-trial-ending"}
          >
            <View style={styles.subBannerRow}>
              <View
                style={[
                  styles.subBannerIcon,
                  { backgroundColor: subBannerExpired ? "#EF444422" : "#F59E0B22" },
                ]}
              >
                <Feather
                  name="alert-triangle"
                  size={18}
                  color={subBannerExpired ? "#EF4444" : "#F59E0B"}
                />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText
                  style={[styles.subBannerTitle, { color: subBannerExpired ? "#EF4444" : "#B45309" }]}
                >
                  {subInactive
                    ? "Your subscription is not active"
                    : trialDaysRemaining !== null && trialDaysRemaining <= 0
                      ? "Your free trial expires today"
                      : "Your free trial expires tomorrow"}
                </ThemedText>
                <ThemedText style={[styles.subBannerSub, { color: colors.textSecondary }]}>
                  {subInactive
                    ? "New customers can't join the queue and staff can't process tickets until you choose a plan."
                    : `Subscribe before ${sub?.trialEndDate ? new Date(sub.trialEndDate).toLocaleDateString() : "your trial ends"} to keep adding customers and processing the queue.`}
                </ThemedText>
              </View>
              {canManageBilling ? (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    navigation.navigate("OrgBilling" as never);
                  }}
                  style={[styles.subBannerCta, { backgroundColor: BrandColors.primary }]}
                  testID="button-banner-choose-plan"
                >
                  <ThemedText style={styles.subBannerCtaText}>Choose plan</ThemedText>
                </Pressable>
              ) : null}
            </View>
          </Card>
        ) : null}

        {activeBranch && canSeeQueueWidget ? (
          <Card variant="outlined" style={styles.queueControlCard}>
            <View style={styles.queueControlHeader}>
              <ThemedText style={styles.queueControlTitle}>Queue Control</ThemedText>
              <ThemedText style={[styles.queueControlSub, { color: colors.textSecondary }]}>{getSelectedLabel()}</ThemedText>
            </View>

            <View style={styles.queuePickerRow}>
              <Pressable
                style={[styles.queueDropdown, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}
                onPress={() => setShowServicePicker(true)}
                testID="dropdown-service"
              >
                <Feather name="layers" size={14} color={colors.textSecondary} />
                <ThemedText style={styles.queueDropdownText} numberOfLines={1}>
                  {selectedServiceId === "all" ? "All Services" : (selectedService?.name || "Service")}
                </ThemedText>
                <Feather name="chevron-down" size={14} color={colors.textSecondary} />
              </Pressable>

              {selectedServiceId !== "all" && availableDesks.length > 0 ? (
                <Pressable
                  style={[styles.queueDropdown, { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle }]}
                  onPress={() => setShowDeskPicker(true)}
                  testID="dropdown-desk"
                >
                  <Feather name="monitor" size={14} color={colors.textSecondary} />
                  <ThemedText style={styles.queueDropdownText} numberOfLines={1}>
                    {selectedDeskId === "all" ? "All Desks" : (availableDesks.find(d => d.id === selectedDeskId)?.name || "Desk")}
                  </ThemedText>
                  <Feather name="chevron-down" size={14} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>

            <Pressable
              style={[styles.statusDropdown, { borderColor: statusInfo.color, backgroundColor: statusInfo.color + "12" }]}
              onPress={() => setShowStatusPicker(true)}
              testID="dropdown-queue-status"
            >
              <View style={[styles.queueStatusDot, { backgroundColor: statusInfo.color }]} />
              <ThemedText style={[styles.statusDropdownLabel, { color: statusInfo.color }]}>{statusInfo.label}</ThemedText>
              <ThemedText style={[styles.statusDropdownDesc, { color: colors.textSecondary }]}>{statusInfo.description}</ThemedText>
              <Feather name="chevron-down" size={16} color={statusInfo.color} />
            </Pressable>

            <Modal visible={showServicePicker} transparent animationType="fade" onRequestClose={() => setShowServicePicker(false)}>
              <Pressable style={styles.modalOverlay} onPress={() => setShowServicePicker(false)}>
                <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                  <ThemedText style={styles.modalTitle}>Select Service</ThemedText>
                  <Pressable
                    style={[styles.modalOption, selectedServiceId === "all" && { backgroundColor: BrandColors.primary + "12" }]}
                    onPress={() => { setSelectedServiceId("all"); setSelectedDeskId("all"); setShowServicePicker(false); }}
                  >
                    <Feather name="grid" size={18} color={selectedServiceId === "all" ? BrandColors.primary : colors.textSecondary} />
                    <ThemedText style={[styles.modalOptionText, selectedServiceId === "all" && { color: BrandColors.primary, fontWeight: "700" }]}>All Services</ThemedText>
                    {selectedServiceId === "all" ? <Feather name="check" size={18} color={BrandColors.primary} /> : null}
                  </Pressable>
                  {branchServices.map(svc => (
                    <Pressable
                      key={svc.id}
                      style={[styles.modalOption, selectedServiceId === svc.id && { backgroundColor: BrandColors.primary + "12" }]}
                      onPress={() => { setSelectedServiceId(svc.id); setSelectedDeskId("all"); setShowServicePicker(false); }}
                    >
                      <Feather name="layers" size={18} color={selectedServiceId === svc.id ? BrandColors.primary : colors.textSecondary} />
                      <View style={{ flex: 1 }}>
                        <ThemedText style={[styles.modalOptionText, selectedServiceId === svc.id && { color: BrandColors.primary, fontWeight: "700" }]}>{svc.name}</ThemedText>
                        {svc.desks && svc.desks.length > 0 ? (
                          <ThemedText style={[styles.modalOptionMeta, { color: colors.textSecondary }]}>{svc.desks.filter(d => d.isActive).length} desks</ThemedText>
                        ) : null}
                      </View>
                      {selectedServiceId === svc.id ? <Feather name="check" size={18} color={BrandColors.primary} /> : null}
                    </Pressable>
                  ))}
                </View>
              </Pressable>
            </Modal>

            <Modal visible={showDeskPicker} transparent animationType="fade" onRequestClose={() => setShowDeskPicker(false)}>
              <Pressable style={styles.modalOverlay} onPress={() => setShowDeskPicker(false)}>
                <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                  <ThemedText style={styles.modalTitle}>Select Desk</ThemedText>
                  <Pressable
                    style={[styles.modalOption, selectedDeskId === "all" && { backgroundColor: BrandColors.primary + "12" }]}
                    onPress={() => { setSelectedDeskId("all"); setShowDeskPicker(false); }}
                  >
                    <Feather name="grid" size={18} color={selectedDeskId === "all" ? BrandColors.primary : colors.textSecondary} />
                    <ThemedText style={[styles.modalOptionText, selectedDeskId === "all" && { color: BrandColors.primary, fontWeight: "700" }]}>All Desks</ThemedText>
                    {selectedDeskId === "all" ? <Feather name="check" size={18} color={BrandColors.primary} /> : null}
                  </Pressable>
                  {availableDesks.map(desk => (
                    <Pressable
                      key={desk.id}
                      style={[styles.modalOption, selectedDeskId === desk.id && { backgroundColor: BrandColors.primary + "12" }]}
                      onPress={() => { setSelectedDeskId(desk.id); setShowDeskPicker(false); }}
                    >
                      <Feather name="monitor" size={18} color={selectedDeskId === desk.id ? BrandColors.primary : colors.textSecondary} />
                      <ThemedText style={[styles.modalOptionText, selectedDeskId === desk.id && { color: BrandColors.primary, fontWeight: "700" }]}>{desk.name}</ThemedText>
                      {selectedDeskId === desk.id ? <Feather name="check" size={18} color={BrandColors.primary} /> : null}
                    </Pressable>
                  ))}
                </View>
              </Pressable>
            </Modal>

            <Modal visible={showStatusPicker} transparent animationType="fade" onRequestClose={() => setShowStatusPicker(false)}>
              <Pressable style={styles.modalOverlay} onPress={() => setShowStatusPicker(false)}>
                <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                  <ThemedText style={styles.modalTitle}>Set Queue Status</ThemedText>
                  <ThemedText style={[styles.modalSubtitle, { color: colors.textSecondary }]}>{getSelectedLabel()}</ThemedText>
                  {(["active", "paused", "ended"] as const).map(status => {
                    const cfg = queueStatusConfig[status];
                    const isSelected = currentQueueStatus === status;
                    return (
                      <Pressable
                        key={status}
                        style={[styles.modalOption, isSelected && { backgroundColor: cfg.color + "12" }]}
                        onPress={() => handleQueueStatusChange(status)}
                        disabled={queueStatusLoading}
                      >
                        <View style={[styles.statusOptionDot, { backgroundColor: cfg.color }]} />
                        <View style={{ flex: 1 }}>
                          <ThemedText style={[styles.modalOptionText, isSelected && { color: cfg.color, fontWeight: "700" }]}>{cfg.label}</ThemedText>
                          <ThemedText style={[styles.modalOptionMeta, { color: colors.textSecondary }]}>{cfg.description}</ThemedText>
                        </View>
                        {isSelected ? <Feather name="check" size={18} color={cfg.color} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </Pressable>
            </Modal>
          </Card>
        ) : null}

        {canSeeAnalytics ? (
        <>
        <View style={styles.sectionHeaderRow}>
          <ThemedText type="h4" style={styles.sectionTitleInline}>Today's Performance</ThemedText>
          <ThemedText style={[styles.sectionLink, { color: colors.textSecondary }]}>Live</ThemedText>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselContent}
          decelerationRate="fast"
          snapToInterval={156}
          snapToAlignment="start"
        >
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
          <StatCard
            title="Avg Wait"
            value={`${organization.stats.averageWaitTime}m`}
            icon="trending-up"
            color={colors.primary}
            isDark={isDark}
          />
        </ScrollView>

        <View style={styles.reportHeader}>
          <ThemedText type="h4" style={styles.sectionTitle}>Served Report</ThemedText>
          <View style={[styles.periodSelector, { backgroundColor: colors.surfaceMuted }]}>
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
        
        <Card variant="outlined" style={styles.reportCard}>
          <View style={styles.reportStats}>
            <View style={styles.reportStatItem}>
              <ThemedText style={[styles.reportStatValue, { color: BrandColors.primary }]}>{totalServed}</ThemedText>
              <ThemedText style={[styles.reportStatLabel, { color: colors.textSecondary }]}>Total Served</ThemedText>
            </View>
            <View style={[styles.reportStatDivider, { backgroundColor: colors.border }]} />
            <View style={styles.reportStatItem}>
              <ThemedText style={[styles.reportStatValue, { color: colors.success }]}>{avgPerDay}</ThemedText>
              <ThemedText style={[styles.reportStatLabel, { color: colors.textSecondary }]}>Avg/Day</ThemedText>
            </View>
            <View style={[styles.reportStatDivider, { backgroundColor: colors.border }]} />
            <View style={styles.reportStatItem}>
              <ThemedText style={[styles.reportStatValue, { color: "#F59E0B" }]}>{maxServed}</ThemedText>
              <ThemedText style={[styles.reportStatLabel, { color: colors.textSecondary }]}>Peak Day</ThemedText>
            </View>
          </View>
          
          <View style={styles.chartContainer}>
            {reportPeriod === 30 ? (
              <View style={styles.lineChartContainer}>
                <Svg width="100%" height={80} viewBox={`0 0 ${currentServedData.length * 10} 80`} preserveAspectRatio="none">
                  <Defs>
                    <SvgLinearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0%" stopColor={BrandColors.primary} stopOpacity="0.3" />
                      <Stop offset="100%" stopColor={BrandColors.primary} stopOpacity="0" />
                    </SvgLinearGradient>
                  </Defs>
                  {maxServed > 0 ? (
                    <>
                      <Path
                        d={`M0,${70 - (currentServedData[0] / maxServed) * 60} ${currentServedData.map((value, index) => {
                          const x = (index / (currentServedData.length - 1)) * (currentServedData.length * 10);
                          const y = 70 - (value / maxServed) * 60;
                          return `L${x},${y}`;
                        }).join(' ')} L${currentServedData.length * 10},70 L0,70 Z`}
                        fill="url(#lineGradient)"
                      />
                      <Path
                        d={`M0,${70 - (currentServedData[0] / maxServed) * 60} ${currentServedData.map((value, index) => {
                          const x = (index / (currentServedData.length - 1)) * (currentServedData.length * 10);
                          const y = 70 - (value / maxServed) * 60;
                          return `L${x},${y}`;
                        }).join(' ')}`}
                        stroke={BrandColors.primary}
                        strokeWidth="2"
                        fill="none"
                      />
                      {currentServedData.map((value, index) => {
                        const x = (index / (currentServedData.length - 1)) * (currentServedData.length * 10);
                        const y = 70 - (value / maxServed) * 60;
                        const isSelected = selectedBarIndex === index;
                        return (
                          <Circle
                            key={index}
                            cx={x}
                            cy={y}
                            r={isSelected ? 5 : 3}
                            fill={isSelected ? BrandColors.primary : (colors.border)}
                            stroke={isSelected ? "#FFFFFF" : "none"}
                            strokeWidth={isSelected ? 2 : 0}
                          />
                        );
                      })}
                    </>
                  ) : null}
                </Svg>
                <View style={styles.lineChartTouchLayer}>
                  {currentServedData.map((value, index) => {
                    const isSelected = selectedBarIndex === index;
                    return (
                      <Pressable
                        key={index}
                        style={styles.lineChartTouchPoint}
                        testID={`served-bar-${index}`}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSelectedBarIndex(isSelected ? null : index);
                        }}
                      >
                        {isSelected ? (
                          <View 
                            style={[
                              styles.lineChartTooltip, 
                              { 
                                backgroundColor: isDark ? "#3A3A3A" : "#1F2937",
                                bottom: maxServed > 0 ? 10 + (value / maxServed) * 60 : 20,
                              }
                            ]}
                          >
                            <ThemedText style={styles.barTooltipText}>{value}</ThemedText>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : (
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
                                  : (colors.border),
                            },
                          ]}
                        />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <ThemedText style={[styles.chartLabel, { color: colors.textSecondary }]}>
              Last {reportPeriod} days trend
            </ThemedText>
          </View>
        </Card>

        <View style={styles.reportHeader}>
          <ThemedText type="h4" style={styles.sectionTitle}>Weekly Trend</ThemedText>
          <View style={[styles.periodSelector, { backgroundColor: colors.surfaceMuted }]}>
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
        
        <Card variant="outlined" style={styles.reportCard}>
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
                                : (colors.border),
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
          <View style={[styles.periodSelector, { backgroundColor: colors.surfaceMuted }]}>
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
        
        <Card variant="outlined" style={styles.reportCard}>
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
                                : (colors.border),
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
            <Card variant="outlined" style={styles.apiCard}>
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
        </>
        ) : null}

        {!canSeeQueueWidget && !canSeeQuickActions && !canSeeAnalytics ? (
          <Card variant="outlined" style={styles.queueControlCard}>
            <View style={{ alignItems: "center", paddingVertical: Spacing.xl }}>
              <Feather name="lock" size={32} color={colors.textSecondary} />
              <ThemedText style={{ marginTop: Spacing.md, color: colors.textSecondary, textAlign: "center" }}>
                Your role doesn't have access to dashboard widgets. Use the menu to access available areas.
              </ThemedText>
            </View>
          </Card>
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
    paddingBottom: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  profileButton: {
    marginRight: Spacing.md,
    position: "relative",
  },
  profileRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 2,
  },
  profileAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
  },
  profileAvatarPlaceholder: {
    width: "100%",
    height: "100%",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  profileInitials: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    letterSpacing: 0.3,
  },
  verifiedBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  welcomeContainer: {
    flex: 1,
  },
  welcomeText: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  orgName: {
    fontSize: 20,
    fontWeight: "700",
    marginTop: 2,
    letterSpacing: -0.3,
  },
  userName: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 2,
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  liveStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  liveStat: {
    alignItems: "center",
    flex: 1,
  },
  liveStatValue: {
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  liveStatLabel: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  liveStatDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginVertical: 4,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  subBanner: {
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
  },
  subBannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  subBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  subBannerTitle: {
    fontSize: 13,
    fontWeight: "800",
  },
  subBannerSub: {
    fontSize: 11,
    marginTop: 2,
  },
  subBannerCta: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  subBannerCtaText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  queueControlCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
  },
  queueControlHeader: {
    marginBottom: Spacing.sm,
  },
  queueControlTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  queueControlSub: {
    fontSize: 12,
    marginTop: 2,
  },
  queuePickerRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  queueDropdown: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  queueDropdownText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
  },
  statusDropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
  },
  statusDropdownLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  statusDropdownDesc: {
    flex: 1,
    fontSize: 12,
  },
  queueStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusOptionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  modalContent: {
    width: "100%",
    maxWidth: 360,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    ...Shadows.large,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    marginBottom: Spacing.md,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: 4,
  },
  modalOptionText: {
    fontSize: 15,
    fontWeight: "500",
  },
  modalOptionMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  sectionTitleInline: {
    fontSize: 18,
    fontWeight: "700",
  },
  sectionLink: {
    fontSize: 13,
    fontWeight: "600",
  },
  carouselContent: {
    gap: Spacing.md,
    paddingRight: Spacing.lg,
    paddingVertical: 2,
  },
  qaCard: {
    width: 208,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  qaIconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  qaContent: {
    flex: 1,
  },
  qaTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  qaSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  qaChevron: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  perfCard: {
    width: 140,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "space-between",
    minHeight: 116,
  },
  perfIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  perfValue: {
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  perfTitle: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 4,
    letterSpacing: 0.1,
  },
  perfSubtitle: {
    fontSize: 10,
    marginTop: 1,
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
    paddingTop: Spacing.xl,
    borderTopWidth: 1,
    borderTopColor: "transparent",
    overflow: "visible",
  },
  chart: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    height: 60,
    gap: Spacing.sm,
    overflow: "visible",
  },
  barTouchTarget: {
    flex: 1,
    minWidth: 8,
    paddingHorizontal: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "visible",
  },
  barContainer: {
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    position: "relative",
    overflow: "visible",
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
  lineChartContainer: {
    position: "relative",
    height: 80,
    overflow: "visible",
  },
  lineChartTouchLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    overflow: "visible",
  },
  lineChartTouchPoint: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    overflow: "visible",
  },
  lineChartTooltip: {
    position: "absolute",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 100,
    width: 50,
    alignItems: "center",
    justifyContent: "center",
    ...Shadows.medium,
  },
  barTooltip: {
    position: "absolute",
    bottom: "100%",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 6,
    zIndex: 100,
    width: 50,
    alignItems: "center",
    justifyContent: "center",
    ...Shadows.medium,
  },
  barTooltipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
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
