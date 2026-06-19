import React from "react";
import { View, ScrollView, StyleSheet, Pressable, Modal } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { ProfileModal } from "@/components/ProfileModal";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { OrgDesign } from "@/constants/orgDesign";
import { useOrganization } from "@/contexts/OrganizationContext";

interface Props {
  organization: any;
  currentUser: any;
  queue: any[];
  waitingCount: number;
  servingCount: number;
  statusInfo: { label: string; color: string; icon: keyof typeof Feather.glyphMap; description: string };
  getSelectedLabel: () => string;
  onOpenStatusPicker: () => void;
  onOpenServicePicker: () => void;
  onOpenDeskPicker: () => void;
  selectedServiceId: string | null;
  selectedDeskId: string;
  availableDesks: any[];
  selectedService: any;
  navigation: any;
  colors: any;
  isDark: boolean;
  showServicePicker: boolean;
  showDeskPicker: boolean;
  showStatusPicker: boolean;
  setShowServicePicker: (v: boolean) => void;
  setShowDeskPicker: (v: boolean) => void;
  setShowStatusPicker: (v: boolean) => void;
  setSelectedServiceId: (v: string | null) => void;
  setSelectedDeskId: (v: string) => void;
  branchServices: any[];
  accessibleBranches: any[];
  canSelectBranch: boolean;
  activeBranch: any;
  selectedBranchId: string | null;
  showBranchPicker: boolean;
  setShowBranchPicker: (v: boolean) => void;
  setSelectedBranchId: (v: string | null) => void;
  currentQueueStatus: string;
  queueStatusConfig: Record<string, { label: string; color: string; icon: keyof typeof Feather.glyphMap; description: string }>;
  handleQueueStatusChange: (status: string) => void;
  queueStatusLoading: boolean;
  showProfileModal: boolean;
  setShowProfileModal: (v: boolean) => void;
  updateCurrentUser: any;
  changePassword: any;
  logoutOrganization: any;
}

export default function WebOrgDashboard(props: Props) {
  const {
    organization,
    currentUser,
    queue,
    waitingCount,
    servingCount,
    statusInfo,
    getSelectedLabel,
    onOpenStatusPicker,
    onOpenServicePicker,
    onOpenDeskPicker,
    selectedServiceId,
    selectedDeskId,
    availableDesks,
    selectedService,
    navigation,
    colors,
    isDark,
    showServicePicker,
    showDeskPicker,
    showStatusPicker,
    setShowServicePicker,
    setShowDeskPicker,
    setShowStatusPicker,
    setSelectedServiceId,
    setSelectedDeskId,
    branchServices,
    accessibleBranches,
    canSelectBranch,
    activeBranch,
    selectedBranchId,
    showBranchPicker,
    setShowBranchPicker,
    setSelectedBranchId,
    currentQueueStatus,
    queueStatusConfig,
    handleQueueStatusChange,
    queueStatusLoading,
    showProfileModal,
    setShowProfileModal,
    updateCurrentUser,
    changePassword,
    logoutOrganization,
  } = props;

  const { hasPermission } = useOrganization();
  const canSeeQueueWidget = hasPermission("org.dashboard.queue_widget");
  const canSeeQuickActions = hasPermission("org.dashboard.quick_actions");
  const canSeeAnalytics = hasPermission("org.dashboard.analytics");

  const heroStats: { label: string; value: string | number; sub?: string; tone: string; icon: keyof typeof Feather.glyphMap }[] = [
    { label: "In Queue", value: waitingCount, sub: "Waiting customers", tone: BrandColors.primary, icon: "users" },
    { label: "Being Served", value: servingCount, sub: "Active sessions", tone: colors.success, icon: "activity" },
    { label: "Avg Wait", value: `${organization.stats.averageWaitTime}m`, sub: "Across all desks", tone: "#F59E0B", icon: "clock" },
    { label: "Served Today", value: organization.stats.todayServed, sub: "Completed visits", tone: "#8B5CF6", icon: "check-circle" },
  ];

  const recentActivity = [...queue]
    .sort((a, b) => {
      const aTime = new Date(a.completedAt || a.servedAt || a.calledAt || a.joinedAt || 0).getTime();
      const bTime = new Date(b.completedAt || b.servedAt || b.calledAt || b.joinedAt || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 6);

  const activityMeta = (status: string): { label: string; color: string; icon: keyof typeof Feather.glyphMap } => {
    switch (status) {
      case "waiting":
        return { label: "Waiting", color: "#F59E0B", icon: "clock" };
      case "called":
        return { label: "Called", color: BrandColors.primary, icon: "bell" };
      case "serving":
        return { label: "Serving", color: colors.success, icon: "activity" };
      case "completed":
        return { label: "Completed", color: colors.success, icon: "check-circle" };
      case "no_show":
        return { label: "No show", color: colors.error, icon: "user-x" };
      case "cancelled":
        return { label: "Cancelled", color: colors.textSecondary, icon: "x-circle" };
      case "reservation":
        return { label: "Reservation", color: "#8B5CF6", icon: "calendar" };
      case "arrived":
        return { label: "Arrived", color: BrandColors.primary, icon: "log-in" };
      default:
        return { label: status, color: colors.textSecondary, icon: "circle" };
    }
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <ThemedView style={[styles.root, !isDark && { backgroundColor: OrgDesign.pageBg }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[...OrgDesign.headerGradient]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.gradHeader}
        >
          <View style={styles.gradCircleTop} />
          <View style={styles.gradCircleBottom} />
          <View style={styles.gradTopRow}>
            <Pressable style={styles.gradIdentity} onPress={() => setShowProfileModal(true)}>
              <View style={styles.gradAvatar}>
                <ThemedText style={styles.gradAvatarText}>{getInitials(organization.name)}</ThemedText>
              </View>
              <View>
                <ThemedText style={styles.gradWelcome}>Welcome back</ThemedText>
                <ThemedText style={styles.gradOrgName}>{organization.name}</ThemedText>
              </View>
            </Pressable>
            {canSeeQuickActions ? (
              <View style={styles.gradActions}>
                <Pressable style={styles.gradGhostBtn} onPress={() => navigation.navigate("OrgBookings")}>
                  <Feather name="calendar" size={14} color="#FFFFFF" />
                  <ThemedText style={styles.gradGhostBtnText}>Availability</ThemedText>
                </Pressable>
                <Pressable style={styles.gradGhostBtn} onPress={() => navigation.navigate("OrgQueue")}>
                  <Feather name="users" size={14} color="#FFFFFF" />
                  <ThemedText style={styles.gradGhostBtnText}>Open queue</ThemedText>
                </Pressable>
              </View>
            ) : null}
          </View>
          {canSeeAnalytics ? (
            <View style={styles.gradStatsRow}>
              {heroStats.map((stat) => (
                <View key={stat.label} style={styles.gradStatCard}>
                  <ThemedText style={styles.gradStatValue}>{stat.value}</ThemedText>
                  <ThemedText style={styles.gradStatLabel}>{stat.label}</ThemedText>
                </View>
              ))}
            </View>
          ) : null}
        </LinearGradient>

        {canSeeAnalytics ? (
        <>
        <View style={styles.midRow}>
          <Card variant="outlined" style={[styles.promoCard, { borderColor: colors.borderSubtle }]}>
            <View style={styles.promoBadge}>
              <Feather name="zap" size={12} color={BrandColors.primary} />
              <ThemedText style={[styles.promoBadgeText, { color: BrandColors.primary }]}>What's new</ThemedText>
            </View>
            <ThemedText style={styles.promoTitle}>Smarter customer journeys</ThemedText>
            <ThemedText style={[styles.promoDesc, { color: colors.textSecondary }]}>
              Chain multiple services into a single guided journey. Move customers through stages without losing context.
            </ThemedText>
            <View style={styles.promoActions}>
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: BrandColors.primary }]}
                onPress={() => navigation.navigate("JourneyManagement")}
              >
                <ThemedText style={styles.primaryBtnText}>Explore journeys</ThemedText>
                <Feather name="arrow-right" size={14} color="#FFFFFF" />
              </Pressable>
              <Pressable
                style={[styles.ghostBtn, { borderColor: colors.borderSubtle }]}
                onPress={() => navigation.navigate("OrgServices")}
              >
                <ThemedText style={styles.ghostBtnText}>Manage branches</ThemedText>
              </Pressable>
            </View>
          </Card>

          <Card variant="outlined" style={[styles.sideCard, { borderColor: colors.borderSubtle }]}>
            <ThemedText style={[styles.sideCardEyebrow, { color: colors.mutedText }]}>Today</ThemedText>
            <View style={styles.sideStatRow}>
              <View style={styles.sideStat}>
                <ThemedText style={styles.sideStatValue}>{organization.stats.totalBookingsToday}</ThemedText>
                <ThemedText style={[styles.sideStatLabel, { color: colors.textSecondary }]}>Bookings</ThemedText>
              </View>
              <View style={[styles.sideStatDivider, { backgroundColor: colors.borderSubtle }]} />
              <View style={styles.sideStat}>
                <ThemedText style={styles.sideStatValue}>{organization.stats.upcomingBookings}</ThemedText>
                <ThemedText style={[styles.sideStatLabel, { color: colors.textSecondary }]}>Upcoming</ThemedText>
              </View>
            </View>
            <View style={[styles.sideStatRow, { marginTop: Spacing.lg }]}>
              <View style={styles.sideStat}>
                <ThemedText style={styles.sideStatValue}>{organization.stats.todayNoShow}</ThemedText>
                <ThemedText style={[styles.sideStatLabel, { color: colors.textSecondary }]}>No shows</ThemedText>
              </View>
              <View style={[styles.sideStatDivider, { backgroundColor: colors.borderSubtle }]} />
              <View style={styles.sideStat}>
                <ThemedText style={styles.sideStatValue}>
                  {organization.isVerified ? "Active" : "Pending"}
                </ThemedText>
                <ThemedText style={[styles.sideStatLabel, { color: colors.textSecondary }]}>Account</ThemedText>
              </View>
            </View>
          </Card>
        </View>
        </>
        ) : null}

        {canSeeQueueWidget ? (
        <Card
          variant="outlined"
          style={[
            styles.statusBanner,
            { borderColor: statusInfo.color + "55", backgroundColor: statusInfo.color + "0D" },
          ]}
        >
          <View style={styles.statusBannerLeft}>
            <View style={[styles.statusIconWrap, { backgroundColor: statusInfo.color + "1F" }]}>
              <Feather name={statusInfo.icon} size={18} color={statusInfo.color} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.statusBannerTitleRow}>
                <ThemedText style={styles.statusBannerTitle}>Queue is {statusInfo.label.toLowerCase()}</ThemedText>
                <View style={[styles.scopePill, { borderColor: colors.borderSubtle }]}>
                  <ThemedText style={[styles.scopePillText, { color: colors.textSecondary }]}>
                    {getSelectedLabel()}
                  </ThemedText>
                </View>
              </View>
              <ThemedText style={[styles.statusBannerDesc, { color: colors.textSecondary }]}>
                {statusInfo.description}
              </ThemedText>
            </View>
          </View>
          <View style={styles.statusBannerActions}>
            {canSelectBranch ? (
              <Pressable
                style={[styles.ghostBtn, { borderColor: colors.borderSubtle }]}
                onPress={() => setShowBranchPicker(true)}
              >
                <Feather name="map-pin" size={13} color={colors.text} />
                <ThemedText style={styles.ghostBtnText}>
                  {selectedBranchId ? activeBranch?.name || "Branch" : "All Branches"}
                </ThemedText>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.ghostBtn, { borderColor: colors.borderSubtle }]}
              onPress={onOpenServicePicker}
            >
              <Feather name="layers" size={13} color={colors.text} />
              <ThemedText style={styles.ghostBtnText}>
                {selectedServiceId ? selectedService?.name || "Service" : "All Services"}
              </ThemedText>
            </Pressable>
            {selectedServiceId && availableDesks.length > 0 ? (
              <Pressable
                style={[styles.ghostBtn, { borderColor: colors.borderSubtle }]}
                onPress={onOpenDeskPicker}
              >
                <Feather name="monitor" size={13} color={colors.text} />
                <ThemedText style={styles.ghostBtnText}>
                  {selectedDeskId === "all"
                    ? "All desks"
                    : availableDesks.find((d: any) => d.id === selectedDeskId)?.name || "Desk"}
                </ThemedText>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: statusInfo.color }]}
              onPress={onOpenStatusPicker}
            >
              <ThemedText style={styles.primaryBtnText}>Change status</ThemedText>
              <Feather name="chevron-down" size={14} color="#FFFFFF" />
            </Pressable>
          </View>
        </Card>
        ) : null}

        {canSeeAnalytics ? (
        <Card variant="outlined" style={[styles.feedCard, { borderColor: colors.borderSubtle }]}>
          <View style={styles.feedHeader}>
            <View>
              <ThemedText style={styles.feedTitle}>Activity feed</ThemedText>
              <ThemedText style={[styles.feedSubtitle, { color: colors.textSecondary }]}>
                Latest customers across your queue
              </ThemedText>
            </View>
            <Pressable
              style={[styles.ghostBtn, { borderColor: colors.borderSubtle }]}
              onPress={() => navigation.navigate("OrgQueue")}
            >
              <ThemedText style={styles.ghostBtnText}>View all</ThemedText>
              <Feather name="arrow-right" size={13} color={colors.text} />
            </Pressable>
          </View>

          {recentActivity.length === 0 ? (
            <View style={styles.feedEmpty}>
              <Feather name="inbox" size={22} color={colors.mutedText} />
              <ThemedText style={[styles.feedEmptyText, { color: colors.textSecondary }]}>
                Nothing in the queue yet. New visitors will appear here.
              </ThemedText>
            </View>
          ) : (
            <View>
              {recentActivity.map((c, idx) => {
                const meta = activityMeta(c.status);
                const last = idx === recentActivity.length - 1;
                return (
                  <View
                    key={c.id}
                    style={[
                      styles.feedRow,
                      !last && { borderBottomColor: colors.borderSubtle, borderBottomWidth: 1 },
                    ]}
                  >
                    <View style={[styles.feedTicket, { borderColor: colors.borderSubtle }]}>
                      <ThemedText style={styles.feedTicketText}>{c.ticketNumber}</ThemedText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={styles.feedName}>{c.customerName}</ThemedText>
                      <ThemedText style={[styles.feedService, { color: colors.textSecondary }]}>
                        {c.serviceName || "Service"}
                      </ThemedText>
                    </View>
                    <View style={[styles.feedStatus, { backgroundColor: meta.color + "14" }]}>
                      <Feather name={meta.icon} size={12} color={meta.color} />
                      <ThemedText style={[styles.feedStatusText, { color: meta.color }]}>{meta.label}</ThemedText>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Card>
        ) : null}

        {!canSeeQueueWidget && !canSeeQuickActions && !canSeeAnalytics ? (
          <Card variant="outlined" style={{ padding: Spacing["2xl"], alignItems: "center" }}>
            <Feather name="lock" size={32} color={colors.textSecondary} />
            <ThemedText style={{ marginTop: Spacing.md, color: colors.textSecondary, textAlign: "center" }}>
              Your role doesn't have access to dashboard widgets. Use the side menu to access available areas.
            </ThemedText>
          </Card>
        ) : null}
      </ScrollView>

      <Modal visible={showBranchPicker} transparent animationType="fade" onRequestClose={() => setShowBranchPicker(false)}>
        <Pressable style={modalStyles.overlay} onPress={() => setShowBranchPicker(false)}>
          <View style={[modalStyles.content, { backgroundColor: colors.surface }]}>
            <ThemedText style={modalStyles.title}>Select Branch</ThemedText>
            <Pressable
              style={[modalStyles.option, !selectedBranchId && { backgroundColor: BrandColors.primary + "12" }]}
              onPress={() => { setSelectedBranchId(null); setSelectedServiceId(null); setSelectedDeskId("all"); setShowBranchPicker(false); }}
            >
              <Feather name="layers" size={18} color={!selectedBranchId ? BrandColors.primary : colors.textSecondary} />
              <ThemedText style={[modalStyles.optionText, !selectedBranchId && { color: BrandColors.primary, fontWeight: "700" }]}>All Branches</ThemedText>
              {!selectedBranchId ? <Feather name="check" size={18} color={BrandColors.primary} /> : null}
            </Pressable>
            {accessibleBranches.map((branch: any) => (
              <Pressable
                key={branch.id}
                style={[modalStyles.option, activeBranch?.id === branch.id && { backgroundColor: BrandColors.primary + "12" }]}
                onPress={() => { setSelectedBranchId(branch.id); setSelectedServiceId(null); setSelectedDeskId("all"); setShowBranchPicker(false); }}
              >
                <Feather name="map-pin" size={18} color={activeBranch?.id === branch.id ? BrandColors.primary : colors.textSecondary} />
                <ThemedText style={[modalStyles.optionText, activeBranch?.id === branch.id && { color: BrandColors.primary, fontWeight: "700" }]}>{branch.name}</ThemedText>
                {activeBranch?.id === branch.id ? <Feather name="check" size={18} color={BrandColors.primary} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showServicePicker} transparent animationType="fade" onRequestClose={() => setShowServicePicker(false)}>
        <Pressable style={modalStyles.overlay} onPress={() => setShowServicePicker(false)}>
          <View style={[modalStyles.content, { backgroundColor: colors.surface }]}>
            <ThemedText style={modalStyles.title}>Select Service</ThemedText>
            <Pressable
              style={[modalStyles.option, !selectedServiceId && { backgroundColor: BrandColors.primary + "12" }]}
              onPress={() => { setSelectedServiceId(null); setSelectedDeskId("all"); setShowServicePicker(false); }}
            >
              <Feather name="layers" size={18} color={!selectedServiceId ? BrandColors.primary : colors.textSecondary} />
              <ThemedText style={[modalStyles.optionText, !selectedServiceId && { color: BrandColors.primary, fontWeight: "700" }]}>All Services</ThemedText>
              {!selectedServiceId ? <Feather name="check" size={18} color={BrandColors.primary} /> : null}
            </Pressable>
            {branchServices.map((svc: any) => (
              <Pressable
                key={svc.id}
                style={[modalStyles.option, selectedServiceId === svc.id && { backgroundColor: BrandColors.primary + "12" }]}
                onPress={() => { setSelectedServiceId(svc.id); setSelectedDeskId("all"); setShowServicePicker(false); }}
              >
                <Feather name="layers" size={18} color={selectedServiceId === svc.id ? BrandColors.primary : colors.textSecondary} />
                <ThemedText style={[modalStyles.optionText, selectedServiceId === svc.id && { color: BrandColors.primary, fontWeight: "700" }]}>{svc.name}</ThemedText>
                {selectedServiceId === svc.id ? <Feather name="check" size={18} color={BrandColors.primary} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showDeskPicker} transparent animationType="fade" onRequestClose={() => setShowDeskPicker(false)}>
        <Pressable style={modalStyles.overlay} onPress={() => setShowDeskPicker(false)}>
          <View style={[modalStyles.content, { backgroundColor: colors.surface }]}>
            <ThemedText style={modalStyles.title}>Select Desk</ThemedText>
            <Pressable
              style={[modalStyles.option, selectedDeskId === "all" && { backgroundColor: BrandColors.primary + "12" }]}
              onPress={() => { setSelectedDeskId("all"); setShowDeskPicker(false); }}
            >
              <Feather name="grid" size={18} color={selectedDeskId === "all" ? BrandColors.primary : colors.textSecondary} />
              <ThemedText style={[modalStyles.optionText, selectedDeskId === "all" && { color: BrandColors.primary, fontWeight: "700" }]}>All Desks</ThemedText>
              {selectedDeskId === "all" ? <Feather name="check" size={18} color={BrandColors.primary} /> : null}
            </Pressable>
            {availableDesks.map((desk: any) => (
              <Pressable
                key={desk.id}
                style={[modalStyles.option, selectedDeskId === desk.id && { backgroundColor: BrandColors.primary + "12" }]}
                onPress={() => { setSelectedDeskId(desk.id); setShowDeskPicker(false); }}
              >
                <Feather name="monitor" size={18} color={selectedDeskId === desk.id ? BrandColors.primary : colors.textSecondary} />
                <ThemedText style={[modalStyles.optionText, selectedDeskId === desk.id && { color: BrandColors.primary, fontWeight: "700" }]}>{desk.name}</ThemedText>
                {selectedDeskId === desk.id ? <Feather name="check" size={18} color={BrandColors.primary} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal visible={showStatusPicker} transparent animationType="fade" onRequestClose={() => setShowStatusPicker(false)}>
        <Pressable style={modalStyles.overlay} onPress={() => setShowStatusPicker(false)}>
          <View style={[modalStyles.content, { backgroundColor: colors.surface }]}>
            <ThemedText style={modalStyles.title}>Set Queue Status</ThemedText>
            <ThemedText style={[modalStyles.subtitle, { color: colors.textSecondary }]}>{getSelectedLabel()}</ThemedText>
            {(["active", "paused", "ended"] as const).map(status => {
              const cfg = queueStatusConfig[status];
              const isSelected = currentQueueStatus === status;
              return (
                <Pressable
                  key={status}
                  style={[modalStyles.option, isSelected && { backgroundColor: cfg.color + "12" }]}
                  onPress={() => { Haptics.selectionAsync(); handleQueueStatusChange(status); }}
                  disabled={queueStatusLoading}
                >
                  <View style={[modalStyles.dot, { backgroundColor: cfg.color }]} />
                  <View style={{ flex: 1 }}>
                    <ThemedText style={[modalStyles.optionText, isSelected && { color: cfg.color, fontWeight: "700" }]}>{cfg.label}</ThemedText>
                    <ThemedText style={[modalStyles.optionMeta, { color: colors.textSecondary }]}>{cfg.description}</ThemedText>
                  </View>
                  {isSelected ? <Feather name="check" size={18} color={cfg.color} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

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
  root: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing["3xl"],
    paddingVertical: Spacing["3xl"],
    gap: Spacing["2xl"],
    maxWidth: 1280,
    width: "100%",
    alignSelf: "center",
  },
  gradHeader: {
    borderRadius: OrgDesign.cardRadius + 4,
    paddingHorizontal: Spacing["2xl"],
    paddingVertical: Spacing["2xl"],
    overflow: "hidden",
    gap: Spacing["2xl"],
  },
  gradCircleTop: {
    position: "absolute",
    top: -50,
    right: -30,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  gradCircleBottom: {
    position: "absolute",
    bottom: -70,
    left: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  gradTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.lg,
    flexWrap: "wrap",
  },
  gradIdentity: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  gradAvatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  gradAvatarText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  gradWelcome: { color: "rgba(255,255,255,0.7)", fontSize: 13 },
  gradOrgName: { color: "#FFFFFF", fontSize: 19, fontWeight: "800", marginTop: 1 },
  gradActions: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, flexWrap: "wrap" },
  gradGhostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  gradGhostBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  gradStatsRow: { flexDirection: "row", gap: Spacing.md, flexWrap: "wrap" },
  gradStatCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 16,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    alignItems: "center",
  },
  gradStatValue: { color: "#FFFFFF", fontSize: 28, fontWeight: "800", lineHeight: 32 },
  gradStatLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 4, fontWeight: "500" },
  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  ghostBtnText: { fontSize: 13, fontWeight: "600" },
  midRow: {
    flexDirection: "row",
    gap: Spacing.lg,
    flexWrap: "wrap",
  },
  promoCard: {
    flex: 2,
    minWidth: 360,
    padding: Spacing["2xl"],
    gap: Spacing.md,
    borderRadius: OrgDesign.cardRadius,
    ...OrgDesign.cardShadow,
  },
  promoBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: BrandColors.primary + "12",
  },
  promoBadgeText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  promoTitle: { fontSize: 22, fontWeight: "700" },
  promoDesc: { fontSize: 14, lineHeight: 20 },
  promoActions: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.sm, flexWrap: "wrap" },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", gap: Spacing.xs,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.sm,
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  sideCard: {
    flex: 1,
    minWidth: 260,
    padding: Spacing["2xl"],
    gap: Spacing.md,
    borderRadius: OrgDesign.cardRadius,
    ...OrgDesign.cardShadow,
  },
  sideCardEyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  sideStatRow: { flexDirection: "row", alignItems: "center" },
  sideStat: { flex: 1 },
  sideStatValue: { fontSize: 22, fontWeight: "700" },
  sideStatLabel: { fontSize: 12, marginTop: 2 },
  sideStatDivider: { width: 1, height: 36, marginHorizontal: Spacing.md },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.lg,
    padding: Spacing.xl,
    flexWrap: "wrap",
    borderRadius: OrgDesign.cardRadius,
    ...OrgDesign.cardShadow,
  },
  statusBannerLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: Spacing.md, minWidth: 280 },
  statusIconWrap: { width: 40, height: 40, borderRadius: BorderRadius.sm, alignItems: "center", justifyContent: "center" },
  statusBannerTitleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, flexWrap: "wrap" },
  statusBannerTitle: { fontSize: 15, fontWeight: "700" },
  statusBannerDesc: { fontSize: 13, marginTop: 2 },
  scopePill: {
    borderWidth: 1,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  scopePillText: { fontSize: 11, fontWeight: "600" },
  statusBannerActions: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, flexWrap: "wrap" },
  feedCard: { padding: Spacing["2xl"], gap: Spacing.lg, borderRadius: OrgDesign.cardRadius, ...OrgDesign.cardShadow },
  feedHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  feedTitle: { fontSize: 18, fontWeight: "700" },
  feedSubtitle: { fontSize: 13, marginTop: 2 },
  feedEmpty: {
    paddingVertical: Spacing["3xl"],
    alignItems: "center",
    gap: Spacing.sm,
  },
  feedEmptyText: { fontSize: 13 },
  feedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  feedTicket: {
    minWidth: 56,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
  },
  feedTicketText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  feedName: { fontSize: 14, fontWeight: "600" },
  feedService: { fontSize: 12, marginTop: 1 },
  feedStatus: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  feedStatusText: { fontSize: 12, fontWeight: "600" },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center", justifyContent: "center", padding: Spacing.xl,
  },
  content: {
    width: "100%", maxWidth: 360, borderRadius: BorderRadius.lg, padding: Spacing.lg,
  },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: Spacing.md },
  option: {
    flexDirection: "row", alignItems: "center", gap: Spacing.sm,
    paddingVertical: 12, paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md, marginBottom: 4,
  },
  optionText: { fontSize: 15, fontWeight: "500" },
  optionMeta: { fontSize: 12, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
