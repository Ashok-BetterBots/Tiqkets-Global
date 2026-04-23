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
      <View style={styles.perfCardHeader}>
        <View style={[styles.perfIconContainer, { backgroundColor: color + "18" }]}>
          <Feather name={icon} size={16} color={color} />
        </View>
        <View style={[styles.perfDot, { backgroundColor: color }]} />
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
  const { organization, currentUser, queue, refreshStats, updateCurrentUser, changePassword, logoutOrganization, isLoading, branches, updateBranch, updateService, updateDesk, getAccessibleBranches } = useOrganization();
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
        {activeBranch ? (
          <Card variant="outlined" style={styles.queueControlCard}>
            <View style={styles.queueControlHeader}>
              <ThemedText style={styles.queueControlTitle}>Queue Control</ThemedText>
              <ThemedText style={[styles.queueControlSub, { color: colors.textSecondary }]}>{getSelectedLabel()}</ThemedText>
            </View>

            <View style={styles.queuePickerRow}>
              <Pressable
                style={[styles.queueDropdown, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
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
                  style={[styles.queueDropdown, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
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

        <View style={styles.sectionHeaderRow}>
          <ThemedText type="h4" style={styles.sectionTitleInline}>Quick Actions</ThemedText>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate("OrgSettings");
            }}
            hitSlop={8}
          >
            <ThemedText style={[styles.sectionLink, { color: colors.primary }]}>See all</ThemedText>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselContent}
          decelerationRate="fast"
          snapToInterval={220}
          snapToAlignment="start"
        >
          <QuickAction
            title="Process Queue"
            subtitle="Call & manage tickets"
            icon="users"
            onPress={() => navigation.navigate("OrgQueue")}
            color={colors.success}
            isDark={isDark}
          />
          <QuickAction
            title="Manage Services"
            subtitle="Branches & desks"
            icon="layers"
            onPress={() => navigation.navigate("OrgServices")}
            color={colors.primary}
            isDark={isDark}
          />
          <QuickAction
            title="Bookings"
            subtitle="Today's appointments"
            icon="calendar"
            onPress={() => navigation.navigate("OrgBookings")}
            color="#8B5CF6"
            isDark={isDark}
          />
          <QuickAction
            title="Settings"
            subtitle="Team & preferences"
            icon="sliders"
            onPress={() => navigation.navigate("OrgSettings")}
            color="#F59E0B"
            isDark={isDark}
          />
        </ScrollView>

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
    width: 144,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    justifyContent: "space-between",
    minHeight: 120,
  },
  perfCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  perfIconContainer: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.md,
    justifyContent: "center",
    alignItems: "center",
  },
  perfDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.7,
  },
  perfValue: {
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 28,
  },
  perfTitle: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
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
