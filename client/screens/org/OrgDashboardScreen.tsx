import { logHandledError } from "@/lib/logger";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl, useColorScheme, Image, Modal, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { ProfileModal } from "@/components/ProfileModal";
import { Colors, Spacing, BorderRadius, BrandColors, Shadows } from "@/constants/theme";
import { OrgDesign } from "@/constants/orgDesign";
import { useOrganization } from "@/contexts/OrganizationContext";
import { getRoleLabel } from "@/types/organization";
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

// Weekday short labels (Sun..Sat), matching currentWeeklyData's index order.
const WEEK_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
// 15 hourly buckets 9AM..11PM; only every other hour is labelled to stay legible.
const HOUR_VALUES = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
const HOUR_LABELS = ["9A", "", "11A", "", "1P", "", "3P", "", "5P", "", "7P", "", "9P", "", "11P"];

const formatHour = (h: number) => {
  const ampm = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${ampm}`;
};

// Binary on/off switch styled to match the raspberry reference. ON maps to an
// open queue ("active"), OFF maps to a closed queue ("ended").
function Toggle({ value, onValueChange, disabled }: { value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={() => { if (!disabled) onValueChange(!value); }}
      style={[styles.toggleTrack, { backgroundColor: value ? OrgDesign.primary : "#D1D5DB", opacity: disabled ? 0.6 : 1 }]}
      testID="toggle-booking"
      hitSlop={8}
    >
      <View style={[styles.toggleKnob, { alignSelf: value ? "flex-end" : "flex-start" }]} />
    </Pressable>
  );
}

// A single chart bar with tap-to-reveal tooltip. The most recent bar is filled
// with the raspberry gradient; a tapped bar turns solid raspberry; the rest are
// neutral grey.
function ChartBar({
  value,
  max,
  isLast,
  isSelected,
  label,
  heightMax,
  radius,
  onPress,
  testID,
}: {
  value: number;
  max: number;
  isLast: boolean;
  isSelected: boolean;
  label: string;
  heightMax: number;
  radius: number;
  onPress: () => void;
  testID?: string;
}) {
  const h = max > 0 ? Math.max(6, (value / max) * heightMax) : 6;
  return (
    <Pressable style={styles.barTouchTarget} onPress={onPress} testID={testID}>
      <View style={[styles.barContainer, { height: heightMax }]}>
        {isSelected ? (
          <View style={styles.barTooltip}>
            <ThemedText style={styles.barTooltipText}>{value}</ThemedText>
          </View>
        ) : null}
        {isLast ? (
          <LinearGradient
            colors={[OrgDesign.primaryMid, OrgDesign.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.bar, { height: h, borderTopLeftRadius: radius, borderTopRightRadius: radius }]}
          />
        ) : (
          <View
            style={[
              styles.bar,
              { height: h, borderTopLeftRadius: radius, borderTopRightRadius: radius, backgroundColor: isSelected ? OrgDesign.primary : "#D1D5DB" },
            ]}
          />
        )}
      </View>
      <ThemedText style={styles.barLabel} numberOfLines={1}>{label}</ThemedText>
    </Pressable>
  );
}

export default function OrgDashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const { organization, currentUser, queue, refreshStats, refreshQueueForBranch, updateCurrentUser, changePassword, logoutOrganization, isLoading, branches, setQueueStatusFor, getAccessibleBranches, getAccessibleServices, hasPermission, selectedBranchId, setSelectedBranchId, selectedServiceId, setSelectedServiceId } = useOrganization();
  const canSeeQueueWidget = hasPermission("org.dashboard.queue_widget");
  const canSeeQuickActions = hasPermission("org.dashboard.quick_actions");
  const canSeeAnalytics = hasPermission("org.dashboard.analytics");
  const [refreshing, setRefreshing] = React.useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [queueStatusLoading, setQueueStatusLoading] = useState(false);
  const [selectedDeskId, setSelectedDeskId] = useState<string>("all");
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [showDeskPicker, setShowDeskPicker] = useState(false);
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>(7);
  const [weeklyTrendPeriod, setWeeklyTrendPeriod] = useState<TrendPeriod>(30);
  const [hourlyTrendPeriod] = useState<TrendPeriod>(30);
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);
  const [selectedWeeklyBarIndex, setSelectedWeeklyBarIndex] = useState<number | null>(null);
  const [selectedHourlyBarIndex, setSelectedHourlyBarIndex] = useState<number | null>(null);

  const waitingCount = queue.filter((c) => c.status === "waiting").length;

  const accessibleBranches = getAccessibleBranches();
  const canSelectBranch = accessibleBranches.length > 1;
  const activeBranch = accessibleBranches.find(b => b.id === selectedBranchId)
    || (accessibleBranches.length > 0 ? accessibleBranches[0] : null);
  const branchServices = activeBranch ? getAccessibleServices(activeBranch.id) : [];
  const pickerServices = branchServices;
  const selectedService = branchServices.find(s => s.id === selectedServiceId);
  const availableDesks = selectedServiceId && selectedService?.desks
    ? selectedService.desks.filter(d => d.isActive)
    : [];
  // Don't fetch with the previous branch's service during a scope switch.
  const analyticsServiceId = selectedService?.id;
  const analyticsScopeReady = !!organization?.id && !!activeBranch?.id && !!analyticsServiceId;

  // Home-only data: shared organisation stats and other screens stay unchanged.
  const todayReportQuery = useQuery<{
    summary: { totalTickets: number; completed: number; noShows: number; avgWaitTime: number; maxWaitTime: number };
  }>({
    queryKey: ["/api/reports", organization?.id, "summary", "today-peak-wait", activeBranch?.id, analyticsServiceId],
    enabled: analyticsScopeReady,
    staleTime: 15_000,
    refetchInterval: 8_000,
    queryFn: async ({ signal }) => {
      const today = new Date().toISOString().split("T")[0];
      const url = new URL(`/api/reports/${organization!.id}/summary`, getApiUrl());
      url.searchParams.set("startDate", today);
      url.searchParams.set("endDate", today);
      url.searchParams.set("branchId", activeBranch!.id);
      url.searchParams.set("serviceId", analyticsServiceId!);
      const res = await fetch(url.toString(), { credentials: "include", signal });
      if (!res.ok) throw new Error(`Failed to load today's performance (${res.status})`);
      return res.json();
    },
  });
  const peakWaitMinutes = Math.round(todayReportQuery.data?.summary?.maxWaitTime ?? 0);

  // Real analytics from /api/reports/:orgId/summary. We fetch once with a
  // 365-day window which gives us the daily breakdown used for the Served
  // Report and Weekly Trend charts. The Hourly Trend uses a separate query
  // keyed by its period because the endpoint returns hourly aggregates for
  // the *whole* filter window — we need a fresh fetch when the user picks
  // a different period.
  const longRangeReportQuery = useQuery<{
    daily: { date: string; total: number; completed: number; noShow: number; cancelled: number }[];
  }>({
    queryKey: ["/api/reports", organization?.id, "summary", "long-range", activeBranch?.id, analyticsServiceId],
    enabled: analyticsScopeReady,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async ({ signal }) => {
      const start = new Date();
      start.setDate(start.getDate() - 365);
      const url = new URL(`/api/reports/${organization!.id}/summary`, getApiUrl());
      url.searchParams.set("startDate", start.toISOString().split("T")[0]);
      url.searchParams.set("branchId", activeBranch!.id);
      url.searchParams.set("serviceId", analyticsServiceId!);
      const res = await fetch(url.toString(), { credentials: "include", signal });
      if (!res.ok) throw new Error(`Failed to load report (${res.status})`);
      return res.json();
    },
  });

  const hourlyReportQuery = useQuery<{
    hourly: { hour: number; total: number; completed: number; noShow: number }[];
  }>({
    queryKey: ["/api/reports", organization?.id, "summary", "hourly", hourlyTrendPeriod, activeBranch?.id, analyticsServiceId],
    enabled: analyticsScopeReady,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async ({ signal }) => {
      const start = new Date();
      start.setDate(start.getDate() - hourlyTrendPeriod);
      const url = new URL(`/api/reports/${organization!.id}/summary`, getApiUrl());
      url.searchParams.set("startDate", start.toISOString().split("T")[0]);
      url.searchParams.set("branchId", activeBranch!.id);
      url.searchParams.set("serviceId", analyticsServiceId!);
      const res = await fetch(url.toString(), { credentials: "include", signal });
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

  // Week-level aggregates for the Weekly Trend stat row.
  const weeklyAggregates = useMemo(() => {
    const days = buildDailySeries(weeklyTrendPeriod);
    const total = days.reduce((a, b) => a + b, 0);
    const numWeeks = Math.max(1, Math.round(weeklyTrendPeriod / 7));
    let peak = 0;
    for (let i = 0; i < days.length; i += 7) {
      const wk = days.slice(i, i + 7).reduce((a, b) => a + b, 0);
      if (wk > peak) peak = wk;
    }
    return { total, avgPerWeek: Math.round(total / numWeeks), peakWeek: peak };
  }, [buildDailySeries, weeklyTrendPeriod]);

  // Hourly trend = completed count at each of the 15 displayed hours
  // (9AM..11PM) over the selected window.
  const currentHourlyData = useMemo(() => {
    const buckets = hourlyReportQuery.data?.hourly ?? [];
    const byHour = new Map<number, number>();
    buckets.forEach((b) => byHour.set(b.hour, b.completed || 0));
    return HOUR_VALUES.map((h) => byHour.get(h) || 0);
  }, [hourlyReportQuery.data]);
  const maxHourlyValue = Math.max(0, ...currentHourlyData);
  const peakHourIndex = currentHourlyData.indexOf(maxHourlyValue);
  const totalHourly = currentHourlyData.reduce((a, b) => a + b, 0);
  const avgPerHour = Math.round(totalHourly / HOUR_VALUES.length);
  const peakHourLabel = totalHourly > 0 ? formatHour(HOUR_VALUES[peakHourIndex]) : "—";

  const servingCount = queue.filter((c) => c.status === "serving" || c.status === "called").length;

  const refreshHomeAnalytics = useCallback(async () => {
    if (!analyticsScopeReady) return;
    await Promise.all([
      longRangeReportQuery.refetch(),
      hourlyReportQuery.refetch(),
      todayReportQuery.refetch(),
    ]);
  }, [analyticsScopeReady, activeBranch?.id, analyticsServiceId, longRangeReportQuery.refetch, hourlyReportQuery.refetch, todayReportQuery.refetch]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      refreshStats(),
      refreshHomeAnalytics(),
    ]);
    setRefreshing(false);
  };

  // Pull fresh "Today's Performance" stats and the report-driven charts
  // every time the Home tab regains focus, so numbers reflect tickets that
  // were just processed on the Queue tab (refetch() bypasses staleTime).
  useFocusEffect(
    useCallback(() => {
      void refreshStats();
      void refreshHomeAnalytics();
    }, [organization?.id, hourlyTrendPeriod, refreshStats, refreshHomeAnalytics])
  );

  // Live auto-refresh of the queue widget while the Home tab is focused, so the
  // waiting/serving counts update the moment a customer joins (mobile, QR scan,
  // or manual add) or a ticket's stage/status changes — without a manual pull.
  const pollBranchId = getAccessibleBranches()[0]?.id;
  useFocusEffect(
    useCallback(() => {
      const interval = setInterval(() => {
        void refreshStats();
        if (pollBranchId) void refreshQueueForBranch(pollBranchId);
      }, 8000);
      return () => clearInterval(interval);
    }, [pollBranchId, refreshStats, refreshQueueForBranch])
  );

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

  // Queue Control auto-selects the first service whenever the current service
  // is empty or invalid for the active branch. The branch is always concrete.
  const branchServiceIdsKey = branchServices.map(s => s.id).join(",");
  useEffect(() => {
    if (branchServices.length === 0) {
      if (selectedServiceId !== null) {
        setSelectedServiceId(null);
        setSelectedDeskId("all");
      }
      return;
    }
    const validIds = branchServices.map(s => s.id);
    if (!selectedServiceId || !validIds.includes(selectedServiceId)) {
      setSelectedServiceId(branchServices[0].id);
      setSelectedDeskId("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBranch?.id, selectedServiceId, branchServiceIdsKey]);

  const getCurrentQueueStatus = useCallback(() => {
    if (selectedDeskId !== "all") {
      const desk = availableDesks.find(d => d.id === selectedDeskId);
      return (desk as any)?.queueStatus || "active";
    }
    if (selectedServiceId && selectedService) {
      return (selectedService as any)?.queueStatus || "active";
    }
    return (activeBranch as any)?.queueStatus || "active";
  }, [selectedServiceId, selectedDeskId, activeBranch, selectedService, availableDesks]);

  const currentQueueStatus = getCurrentQueueStatus();
  const bookingOpen = currentQueueStatus === "active";

  const handleQueueStatusChange = async (newStatus: string) => {
    if (!activeBranch || queueStatusLoading) return;
    setQueueStatusLoading(true);
    try {
      if (selectedDeskId !== "all") {
        await setQueueStatusFor({ type: "desk", id: selectedDeskId }, newStatus);
      } else if (selectedServiceId && selectedService) {
        await setQueueStatusFor({ type: "service", id: selectedService.id }, newStatus);
        if (selectedService?.desks) {
          for (const desk of selectedService.desks) {
            await setQueueStatusFor({ type: "desk", id: desk.id }, newStatus);
          }
        }
      } else {
        await setQueueStatusFor({ type: "branch", id: activeBranch.id }, newStatus);
        for (const svc of branchServices) {
          await setQueueStatusFor({ type: "service", id: svc.id }, newStatus);
          if (svc.desks) {
            for (const desk of svc.desks) {
              await setQueueStatusFor({ type: "desk", id: desk.id }, newStatus);
            }
          }
        }
      }
      Haptics.notificationAsync(
        newStatus === "active" ? Haptics.NotificationFeedbackType.Success :
        newStatus === "paused" ? Haptics.NotificationFeedbackType.Warning :
        Haptics.NotificationFeedbackType.Error
      );
    } catch (error) {
      logHandledError("Error updating queue status", error);
    } finally {
      setQueueStatusLoading(false);
    }
  };

  if (!organization || !currentUser) return null;

  const cardStyle = [styles.cardBase, { backgroundColor: isDark ? colors.surface : "#FFFFFF" }];
  const dropdownStyle = { backgroundColor: isDark ? colors.surfaceMuted : "#FAFAFC", borderColor: isDark ? colors.border : "rgba(0,0,0,0.06)" };

  const perfCards: { label: string; value: string | number; icon: keyof typeof Feather.glyphMap; color: string; bg: string }[] = [
    { label: "Bookings", value: todayReportQuery.data?.summary?.totalTickets ?? 0, icon: "calendar", color: "#6366F1", bg: "#EEF2FF" },
    { label: "Served", value: todayReportQuery.data?.summary?.completed ?? 0, icon: "check-circle", color: "#16A34A", bg: "#DCFCE7" },
    { label: "No Shows", value: todayReportQuery.data?.summary?.noShows ?? 0, icon: "x-circle", color: "#D97706", bg: "#FEF3C7" },
    { label: "Avg Wait", value: `${todayReportQuery.data?.summary?.avgWaitTime ?? 0}m`, icon: "clock", color: "#0891B2", bg: "#ECFEFF" },
    { label: "Peak Wait", value: `${peakWaitMinutes}m`, icon: "trending-up", color: "#E11D48", bg: "#FFF1F2" },
  ];

  const renderPeriodPills = (
    options: { value: number; label: string }[],
    current: number,
    onSelect: (v: any) => void,
  ) => (
    <View style={styles.periodSelector}>
      {options.map((opt) => {
        const active = current === opt.value;
        return (
          <Pressable
            key={opt.value}
            style={[styles.periodPill, { backgroundColor: active ? OrgDesign.primary : (isDark ? colors.surfaceMuted : "#F3F4F6") }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(opt.value);
            }}
          >
            <ThemedText style={[styles.periodPillText, { color: active ? "#FFFFFF" : colors.textSecondary }]}>{opt.label}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <ThemedView style={[styles.container, !isDark && { backgroundColor: OrgDesign.pageBg }]}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={OrgDesign.primary} />
        }
      >
        <View style={styles.phoneColumn}>
        <LinearGradient
          colors={[...OrgDesign.headerGradient]}
          locations={[0, 0.4, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.gradHeader, { paddingTop: insets.top + 12 }]}
        >
          <View style={styles.gradCircleTop} pointerEvents="none" />
          <View style={styles.gradCircleBottom} pointerEvents="none" />

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
                <View style={styles.profileRingGlass}>
                  {currentUser.profilePictureUrl ? (
                    <Image
                      source={{ uri: currentUser.profilePictureUrl }}
                      style={styles.profileAvatar}
                    />
                  ) : (
                    <ThemedText style={styles.profileInitialsGlass}>
                      {getInitials(organization.name || currentUser.name)}
                    </ThemedText>
                  )}
                </View>
                {organization.isVerified ? (
                  <View style={[styles.verifiedBadge, { backgroundColor: "#059669", borderColor: OrgDesign.primaryDark }]}>
                    <Feather name="check" size={11} color="#FFFFFF" />
                  </View>
                ) : null}
              </Pressable>
              <View style={styles.welcomeContainer}>
                <ThemedText style={styles.welcomeTextGlass}>
                  Welcome back
                </ThemedText>
                <ThemedText style={styles.orgNameGlass} numberOfLines={1}>
                  {organization.name}
                </ThemedText>
              </View>
            </View>
            <View style={styles.headerActions}>
              {!organization.isVerified ? (
                <View style={styles.headerBadgeGlass}>
                  <Feather name="clock" size={12} color="#FFFFFF" />
                  <ThemedText style={styles.headerBadgeTextGlass}>
                    Pending
                  </ThemedText>
                </View>
              ) : null}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onRefresh();
                }}
                disabled={refreshing}
                style={({ pressed }) => [styles.refreshButtonGlass, { opacity: pressed || refreshing ? 0.6 : 1 }]}
                testID="button-refresh-dashboard"
                hitSlop={8}
              >
                {refreshing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Feather name="refresh-cw" size={16} color="#FFFFFF" />
                )}
              </Pressable>
            </View>
          </View>

          <View style={styles.headerStatsRow}>
            <View style={styles.headerStatCard}>
              <ThemedText style={styles.headerStatValue}>{waitingCount}</ThemedText>
              <ThemedText style={styles.headerStatLabel}>In Queue</ThemedText>
            </View>
            <View style={styles.headerStatCard}>
              <ThemedText style={styles.headerStatValue}>{servingCount}</ThemedText>
              <ThemedText style={styles.headerStatLabel}>Being Served</ThemedText>
            </View>
            <View style={styles.headerStatCard}>
              <ThemedText style={styles.headerStatValue}>{organization.stats.averageWaitTime}m</ThemedText>
              <ThemedText style={styles.headerStatLabel}>Avg Wait</ThemedText>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.body}>

        {/* ── Profile chip (mobile only — web has the shell top-bar chip) ── */}
        {Platform.OS !== "web" ? (
          <Pressable
            style={({ pressed }) => [
              styles.profileChip,
              { backgroundColor: isDark ? colors.surface : "#FFFFFF", opacity: pressed ? 0.82 : 1 },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowProfileModal(true);
            }}
            testID="button-profile-chip"
          >
            <View style={[styles.profileChipAvatar, { backgroundColor: OrgDesign.primary + "18" }]}>
              {currentUser.profilePictureUrl ? (
                <Image
                  source={{ uri: currentUser.profilePictureUrl }}
                  style={styles.profileChipAvatarImg}
                />
              ) : (
                <ThemedText style={[styles.profileChipInitials, { color: OrgDesign.primary }]}>
                  {getInitials(currentUser.name)}
                </ThemedText>
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <ThemedText style={[styles.profileChipName, { color: colors.text }]} numberOfLines={1}>
                {currentUser.name}
              </ThemedText>
              <View style={[styles.profileChipRoleBadge, { backgroundColor: OrgDesign.primary + "12" }]}>
                <ThemedText style={[styles.profileChipRoleText, { color: OrgDesign.primary }]}>
                  {getRoleLabel(currentUser.role)}
                </ThemedText>
              </View>
            </View>
            <View style={[styles.profileChipAction, { backgroundColor: isDark ? colors.surfaceMuted : "#F5F3FF" }]}>
              <Feather name="user" size={14} color={OrgDesign.primary} />
            </View>
          </Pressable>
        ) : null}

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
          <View style={[cardStyle, styles.queueControlCard]}>
            <ThemedText style={styles.queueControlTitle}>Queue Control</ThemedText>

            <View style={styles.queuePickerRow}>
              {canSelectBranch ? (
                <Pressable
                  style={[styles.queueDropdown, dropdownStyle]}
                  onPress={() => setShowBranchPicker(true)}
                  testID="dropdown-branch"
                >
                  <Feather name="map-pin" size={14} color={colors.textSecondary} />
                  <ThemedText style={[styles.queueDropdownText, { color: colors.text }]} numberOfLines={1}>
                    {activeBranch?.name || "Branch"}
                  </ThemedText>
                  <Feather name="chevron-down" size={14} color={colors.textSecondary} />
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.queueDropdown, styles.queueDropdownWide, dropdownStyle]}
                onPress={() => setShowServicePicker(true)}
                testID="dropdown-service"
              >
                <View style={styles.serviceIconBox}>
                  <View style={styles.serviceIconDot} />
                </View>
                <ThemedText style={[styles.queueDropdownText, { color: colors.text }]} numberOfLines={1}>
                  {selectedService?.name || "Service"}
                </ThemedText>
                <Feather name="chevron-down" size={14} color={colors.textSecondary} />
              </Pressable>

              {selectedServiceId && availableDesks.length > 0 ? (
                <Pressable
                  style={[styles.queueDropdown, dropdownStyle]}
                  onPress={() => setShowDeskPicker(true)}
                  testID="dropdown-desk"
                >
                  <Feather name="monitor" size={14} color={colors.textSecondary} />
                  <ThemedText style={[styles.queueDropdownText, { color: colors.text }]} numberOfLines={1}>
                    {selectedDeskId === "all" ? "All Desks" : (availableDesks.find(d => d.id === selectedDeskId)?.name || "Desk")}
                  </ThemedText>
                  <Feather name="chevron-down" size={14} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>

            <View
              style={[
                styles.bookingBox,
                bookingOpen
                  ? { backgroundColor: isDark ? "#10331F" : "#F0FDF4", borderColor: isDark ? "#1F7A45" : "#BBF7D0" }
                  : { backgroundColor: isDark ? colors.surfaceMuted : "#F9FAFB", borderColor: isDark ? colors.border : "rgba(0,0,0,0.08)" },
              ]}
            >
              <View style={{ flex: 1 }}>
                <ThemedText style={[styles.bookingLabel, { color: colors.text }]}>Booking</ThemedText>
                <ThemedText style={[styles.bookingStatus, { color: bookingOpen ? "#15803D" : "#6B7280" }]}>
                  {bookingOpen ? "Open · Accepting new customers" : "Closed · No booking accepted"}
                </ThemedText>
              </View>
              {queueStatusLoading ? (
                <ActivityIndicator size="small" color={OrgDesign.primary} style={{ marginRight: 4 }} />
              ) : null}
              <Toggle
                value={bookingOpen}
                disabled={queueStatusLoading}
                onValueChange={(v) => handleQueueStatusChange(v ? "active" : "ended")}
              />
            </View>

            <Modal visible={showBranchPicker} transparent animationType="fade" onRequestClose={() => setShowBranchPicker(false)}>
              <Pressable style={styles.modalOverlay} onPress={() => setShowBranchPicker(false)}>
                <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                  <ThemedText style={styles.modalTitle}>Select Branch</ThemedText>
                  {accessibleBranches.map(branch => (
                    <Pressable
                      key={branch.id}
                      style={[styles.modalOption, selectedBranchId === branch.id && { backgroundColor: BrandColors.primary + "12" }]}
                      onPress={() => { setSelectedBranchId(branch.id); setSelectedServiceId(null); setSelectedDeskId("all"); setShowBranchPicker(false); }}
                    >
                      <Feather name="map-pin" size={18} color={selectedBranchId === branch.id ? BrandColors.primary : colors.textSecondary} />
                      <View style={{ flex: 1 }}>
                        <ThemedText style={[styles.modalOptionText, selectedBranchId === branch.id && { color: BrandColors.primary }]}>{branch.name}</ThemedText>
                        {branch.services && branch.services.length > 0 ? (
                          <ThemedText style={[styles.modalOptionMeta, { color: colors.textSecondary }]}>{branch.services.filter(s => s.isActive).length} services</ThemedText>
                        ) : null}
                      </View>
                      {selectedBranchId === branch.id ? <Feather name="check" size={18} color={BrandColors.primary} /> : null}
                    </Pressable>
                  ))}
                </View>
              </Pressable>
            </Modal>

            <Modal visible={showServicePicker} transparent animationType="fade" onRequestClose={() => setShowServicePicker(false)}>
              <Pressable style={styles.modalOverlay} onPress={() => setShowServicePicker(false)}>
                <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                  <ThemedText style={styles.modalTitle}>Select Service</ThemedText>
                  {pickerServices.map(svc => (
                    <Pressable
                      key={svc.id}
                      style={[styles.modalOption, selectedServiceId === svc.id && { backgroundColor: BrandColors.primary + "12" }]}
                      onPress={() => { setSelectedServiceId(svc.id); setSelectedDeskId("all"); setShowServicePicker(false); }}
                    >
                      <Feather name="layers" size={18} color={selectedServiceId === svc.id ? BrandColors.primary : colors.textSecondary} />
                      <View style={{ flex: 1 }}>
                        <ThemedText style={[styles.modalOptionText, selectedServiceId === svc.id && { color: BrandColors.primary }]}>{svc.name}</ThemedText>
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
                    <ThemedText style={[styles.modalOptionText, selectedDeskId === "all" && { color: BrandColors.primary }]}>All Desks</ThemedText>
                    {selectedDeskId === "all" ? <Feather name="check" size={18} color={BrandColors.primary} /> : null}
                  </Pressable>
                  {availableDesks.map(desk => (
                    <Pressable
                      key={desk.id}
                      style={[styles.modalOption, selectedDeskId === desk.id && { backgroundColor: BrandColors.primary + "12" }]}
                      onPress={() => { setSelectedDeskId(desk.id); setShowDeskPicker(false); }}
                    >
                      <Feather name="monitor" size={18} color={selectedDeskId === desk.id ? BrandColors.primary : colors.textSecondary} />
                      <ThemedText style={[styles.modalOptionText, selectedDeskId === desk.id && { color: BrandColors.primary }]}>{desk.name}</ThemedText>
                      {selectedDeskId === desk.id ? <Feather name="check" size={18} color={BrandColors.primary} /> : null}
                    </Pressable>
                  ))}
                </View>
              </Pressable>
            </Modal>
          </View>
        ) : null}

        {canSeeAnalytics ? (
        <>
        <View style={styles.sectionHeaderRow}>
          <ThemedText style={styles.sectionTitleInline}>Today's Performance</ThemedText>
          <View style={styles.livePill}>
            <ThemedText style={styles.livePillText}>Live</ThemedText>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselContent}
          decelerationRate="fast"
        >
          {perfCards.map((c) => (
            <View key={c.label} style={[cardStyle, styles.perfCard]} testID={`perf-${c.label}`}>
              <View style={[styles.perfIconBox, { backgroundColor: c.bg }]}>
                <Feather name={c.icon} size={18} color={c.color} />
              </View>
              <ThemedText style={[styles.perfValue, { color: colors.text }]}>{c.value}</ThemedText>
              <ThemedText style={[styles.perfLabel, { color: colors.textSecondary }]} numberOfLines={1}>{c.label}</ThemedText>
            </View>
          ))}
        </ScrollView>

        <View style={[cardStyle, styles.reportCard]}>
          <View style={styles.reportHeader}>
            <ThemedText style={styles.cardTitle}>Served Report</ThemedText>
            {renderPeriodPills(
              [{ value: 7, label: "7D" }, { value: 14, label: "14D" }, { value: 30, label: "30D" }],
              reportPeriod,
              (v) => { setReportPeriod(v); setSelectedBarIndex(null); },
            )}
          </View>
          <View style={styles.statGrid}>
            <View style={styles.statCol}>
              <ThemedText style={[styles.statValue, { color: OrgDesign.primary }]}>{totalServed}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>Total Served</ThemedText>
            </View>
            <View style={styles.statCol}>
              <ThemedText style={[styles.statValue, { color: OrgDesign.success }]}>{avgPerDay}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>Avg/Day</ThemedText>
            </View>
            <View style={styles.statCol}>
              <ThemedText style={[styles.statValue, { color: OrgDesign.warning }]}>{maxServed}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>Peak Day</ThemedText>
            </View>
          </View>
          <View style={styles.chartRow}>
            {currentServedData.map((value, index) => (
              <ChartBar
                key={index}
                value={value}
                max={maxServed}
                isLast={index === currentServedData.length - 1}
                isSelected={selectedBarIndex === index}
                label=""
                heightMax={72}
                radius={5}
                testID={`served-bar-${index}`}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedBarIndex(selectedBarIndex === index ? null : index);
                }}
              />
            ))}
          </View>
          <ThemedText style={[styles.chartCaption, { color: colors.textSecondary }]}>Last {reportPeriod} days trend</ThemedText>
        </View>

        <View style={[cardStyle, styles.reportCard]}>
          <View style={styles.reportHeader}>
            <ThemedText style={styles.cardTitle}>Weekly Trend</ThemedText>
            {renderPeriodPills(
              TREND_PERIODS,
              weeklyTrendPeriod,
              (v) => { setWeeklyTrendPeriod(v); setSelectedWeeklyBarIndex(null); },
            )}
          </View>
          <View style={styles.statGrid}>
            <View style={styles.statCol}>
              <ThemedText style={[styles.statValue, { color: OrgDesign.primary }]}>{weeklyAggregates.total}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>Total Served</ThemedText>
            </View>
            <View style={styles.statCol}>
              <ThemedText style={[styles.statValue, { color: OrgDesign.success }]}>{weeklyAggregates.avgPerWeek}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>Avg/Week</ThemedText>
            </View>
            <View style={styles.statCol}>
              <ThemedText style={[styles.statValue, { color: OrgDesign.warning }]}>{weeklyAggregates.peakWeek}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>Peak Week</ThemedText>
            </View>
          </View>
          <View style={styles.chartRow}>
            {currentWeeklyData.map((value, index) => (
              <ChartBar
                key={index}
                value={value}
                max={maxWeeklyValue}
                isLast={index === currentWeeklyData.length - 1}
                isSelected={selectedWeeklyBarIndex === index}
                label={WEEK_LABELS[index]}
                heightMax={72}
                radius={5}
                testID={`weekly-bar-${index}`}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedWeeklyBarIndex(selectedWeeklyBarIndex === index ? null : index);
                }}
              />
            ))}
          </View>
        </View>

        <View style={[cardStyle, styles.reportCard]}>
          <View style={styles.reportHeader}>
            <ThemedText style={styles.cardTitle}>Hourly Trend</ThemedText>
            <ThemedText style={[styles.todayLabel, { color: colors.textSecondary }]}>Today</ThemedText>
          </View>
          <View style={styles.statGrid}>
            <View style={styles.statCol}>
              <ThemedText style={[styles.statValue, { color: OrgDesign.primary }]}>{totalHourly}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>Total Served</ThemedText>
            </View>
            <View style={styles.statCol}>
              <ThemedText style={[styles.statValue, { color: OrgDesign.success }]}>{avgPerHour}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>Avg/Hour</ThemedText>
            </View>
            <View style={styles.statCol}>
              <ThemedText style={[styles.statValue, { color: OrgDesign.warning }]}>{peakHourLabel}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>Peak Hour</ThemedText>
            </View>
          </View>
          <View style={styles.chartRow}>
            {currentHourlyData.map((value, index) => (
              <ChartBar
                key={index}
                value={value}
                max={maxHourlyValue}
                isLast={index === currentHourlyData.length - 1}
                isSelected={selectedHourlyBarIndex === index}
                label={HOUR_LABELS[index]}
                heightMax={72}
                radius={4}
                testID={`hourly-bar-${index}`}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedHourlyBarIndex(selectedHourlyBarIndex === index ? null : index);
                }}
              />
            ))}
          </View>
        </View>
        </>
        ) : null}

        {!canSeeQueueWidget && !canSeeQuickActions && !canSeeAnalytics ? (
          <View style={[cardStyle, styles.queueControlCard]}>
            <View style={{ alignItems: "center", paddingVertical: Spacing.xl }}>
              <Feather name="lock" size={32} color={colors.textSecondary} />
              <ThemedText style={{ marginTop: Spacing.md, color: colors.textSecondary, textAlign: "center" }}>
                Your role doesn't have access to dashboard widgets. Use the menu to access available areas.
              </ThemedText>
            </View>
          </View>
        ) : null}
        </View>
        </View>
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
  phoneColumn: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
  },
  content: {
    flex: 1,
  },
  // ---- Header ----
  gradHeader: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    overflow: "hidden",
    position: "relative",
  },
  gradCircleTop: {
    position: "absolute",
    top: -40,
    right: -30,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  gradCircleBottom: {
    position: "absolute",
    bottom: -60,
    left: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.05)",
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
  profileRingGlass: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.3)",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  profileAvatar: {
    width: "100%",
    height: "100%",
    borderRadius: 14,
  },
  profileInitialsGlass: {
    fontSize: 14,
    fontFamily: OrgDesign.fonts.heavy,
    color: "#FFFFFF",
    lineHeight: 20,
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
  welcomeTextGlass: {
    fontSize: 12,
    fontFamily: OrgDesign.fonts.regular,
    color: "rgba(255,255,255,0.65)",
  },
  orgNameGlass: {
    fontSize: 17,
    fontFamily: OrgDesign.fonts.heavy,
    marginTop: 2,
    color: "#FFFFFF",
    lineHeight: 21,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  refreshButtonGlass: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
  },
  headerBadgeGlass: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  headerBadgeTextGlass: {
    fontSize: 11,
    fontFamily: OrgDesign.fonts.bold,
    color: "#FFFFFF",
  },
  headerStatsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  headerStatCard: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  headerStatValue: {
    fontSize: 26,
    fontFamily: OrgDesign.fonts.heavy,
    lineHeight: 30,
    color: "#FFFFFF",
  },
  headerStatLabel: {
    fontSize: 11,
    marginTop: 4,
    fontFamily: OrgDesign.fonts.regular,
    color: "rgba(255,255,255,0.65)",
  },
  // ---- Body ----
  body: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  // ---- Profile chip ----
  profileChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: OrgDesign.cardRadius,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
    ...OrgDesign.cardShadow,
  },
  profileChipAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  profileChipAvatarImg: {
    width: "100%",
    height: "100%",
    borderRadius: 14,
  },
  profileChipInitials: {
    fontSize: 15,
    fontFamily: OrgDesign.fonts.heavy,
    lineHeight: 19,
  },
  profileChipName: {
    fontSize: 14,
    fontFamily: OrgDesign.fonts.bold,
    marginBottom: 4,
  },
  profileChipRoleBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  profileChipRoleText: {
    fontSize: 11,
    fontFamily: OrgDesign.fonts.semibold,
  },
  profileChipAction: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  cardBase: {
    borderRadius: OrgDesign.cardRadius,
    ...OrgDesign.cardShadow,
  },
  // ---- Subscription banner ----
  subBanner: {
    marginBottom: 16,
    padding: Spacing.sm,
    borderRadius: OrgDesign.cardRadius,
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
    fontFamily: OrgDesign.fonts.heavy,
  },
  subBannerSub: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: OrgDesign.fonts.regular,
  },
  subBannerCta: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  subBannerCtaText: {
    fontSize: 11,
    fontFamily: OrgDesign.fonts.bold,
    color: "#FFFFFF",
  },
  // ---- Queue Control ----
  queueControlCard: {
    marginBottom: 16,
    padding: 16,
  },
  queueControlTitle: {
    fontSize: 15,
    fontFamily: OrgDesign.fonts.heavy,
    color: OrgDesign.text,
    marginBottom: 12,
  },
  queuePickerRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  queueDropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  queueDropdownWide: {
    flex: 1,
  },
  queueDropdownText: {
    flex: 1,
    fontSize: 13,
    fontFamily: OrgDesign.fonts.semibold,
  },
  serviceIconBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: OrgDesign.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  serviceIconDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: OrgDesign.primary,
  },
  bookingBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  bookingLabel: {
    fontSize: 14,
    fontFamily: OrgDesign.fonts.bold,
  },
  bookingStatus: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: OrgDesign.fonts.medium,
  },
  toggleTrack: {
    width: 46,
    height: 26,
    borderRadius: 13,
    padding: 3,
    justifyContent: "center",
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  // ---- Modals ----
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
    fontFamily: OrgDesign.fonts.bold,
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
    fontFamily: OrgDesign.fonts.semibold,
  },
  modalOptionMeta: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: OrgDesign.fonts.regular,
  },
  // ---- Section headers ----
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitleInline: {
    fontSize: 17,
    fontFamily: OrgDesign.fonts.heavy,
    color: OrgDesign.text,
  },
  livePill: {
    backgroundColor: "#DCFCE7",
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  livePillText: {
    fontSize: 11,
    fontFamily: OrgDesign.fonts.bold,
    color: "#16A34A",
  },
  // ---- Today's Performance cards ----
  carouselContent: {
    gap: 12,
    paddingRight: 16,
    paddingVertical: 2,
    marginBottom: 16,
  },
  perfCard: {
    width: 112,
    padding: 14,
  },
  perfIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  perfValue: {
    fontSize: 24,
    fontFamily: OrgDesign.fonts.heavy,
    lineHeight: 28,
  },
  perfLabel: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: OrgDesign.fonts.medium,
  },
  // ---- Report cards ----
  reportCard: {
    padding: 16,
    marginBottom: 16,
  },
  reportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: OrgDesign.fonts.heavy,
    color: OrgDesign.text,
  },
  todayLabel: {
    fontSize: 11,
    fontFamily: OrgDesign.fonts.medium,
  },
  periodSelector: {
    flexDirection: "row",
    gap: 6,
  },
  periodPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  periodPillText: {
    fontSize: 11,
    fontFamily: OrgDesign.fonts.bold,
  },
  statGrid: {
    flexDirection: "row",
    marginTop: 16,
  },
  statCol: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 22,
    fontFamily: OrgDesign.fonts.heavy,
    lineHeight: 26,
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: OrgDesign.fonts.medium,
  },
  // ---- Bar charts ----
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    marginTop: 16,
  },
  barTouchTarget: {
    flex: 1,
    minWidth: 6,
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
    minHeight: 6,
  },
  barLabel: {
    fontSize: 9,
    height: 13,
    lineHeight: 13,
    marginTop: 6,
    width: "100%",
    textAlign: "center",
    fontFamily: OrgDesign.fonts.medium,
    color: OrgDesign.muted,
  },
  barTooltip: {
    position: "absolute",
    bottom: "100%",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 6,
    zIndex: 100,
    minWidth: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1F2937",
    ...Shadows.medium,
  },
  barTooltipText: {
    fontSize: 12,
    fontFamily: OrgDesign.fonts.bold,
    color: "#FFFFFF",
    textAlign: "center",
  },
  chartCaption: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 10,
    fontFamily: OrgDesign.fonts.medium,
  },
});
