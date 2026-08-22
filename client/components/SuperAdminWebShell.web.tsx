import React, { useState } from "react";
import { Feather } from "@expo/vector-icons";
import {
  StyleSheet,
  View,
  Pressable,
  TextInput,
  ScrollView,
  TextStyle,
  Platform,
} from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Spacing, BorderRadius, Shadows, BrandColors } from "@/constants/theme";

export interface SuperAdminNavItem {
  name: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  children?: { name: string; label: string }[];
}

export const SUPER_ADMIN_NAV: SuperAdminNavItem[] = [
  { name: "SuperDashboard", label: "Dashboards", icon: "grid" },
  { name: "SuperAdminList", label: "Admin List", icon: "shield" },
  { name: "SuperOnboardList", label: "Onboarding List", icon: "user-plus" },
  { name: "SuperVisitorReport", label: "Visitor Report", icon: "clipboard" },
  { name: "SuperReports", label: "Reports", icon: "file-text" },
  { name: "SuperSubscriberList", label: "Subscribers", icon: "users" },
  { name: "SuperTransactions", label: "Transaction History", icon: "credit-card" },
  { name: "SuperRoutePayouts", label: "Event Payouts", icon: "repeat" },
  { name: "SuperPricePlan", label: "Pricing & Plans", icon: "tag" },
  { name: "SuperTechSupport", label: "Tech Support", icon: "life-buoy" },
  { name: "SuperNotificationSettings", label: "Notification Settings", icon: "bell" },
  { name: "SuperSystemSettings", label: "System Settings", icon: "sliders" },
  {
    name: "SuperMaster",
    label: "Master",
    icon: "list",
    children: [
      { name: "SuperMaster?tab=categories", label: "Categories" },
      { name: "SuperMaster?tab=plans", label: "Plan Types" },
      { name: "SuperMaster?tab=currencies", label: "Currencies" },
    ],
  },
  {
    name: "SuperLogs",
    label: "Logs",
    icon: "rotate-ccw",
    children: [
      { name: "SuperLogs?tab=system", label: "System Logs" },
      { name: "SuperLogs?tab=audit", label: "Audit Logs" },
    ],
  },
  {
    name: "SuperUserControl",
    label: "User Control",
    icon: "settings",
    children: [
      { name: "SuperUserControl?tab=roles", label: "Roles" },
      { name: "SuperUserControl?tab=permissions", label: "Permissions" },
    ],
  },
];

const SIDEBAR_BG = "#1A2541";
const SIDEBAR_BG_HOVER = "#243056";
const SIDEBAR_BG_ACTIVE = "#2C3A6B";
const SIDEBAR_TEXT = "#EAEEF7";
const SIDEBAR_TEXT_MUTED = "#8893B6";
const SIDEBAR_DIVIDER = "#22304F";

function getInitials(name?: string) {
  if (!name) return "SA";
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface Props {
  currentRouteName: string;
  currentTab?: string;
  onNavigate: (name: string, tab?: string) => void;
  onLogout?: () => void;
  children: React.ReactNode;
}

export default function SuperAdminWebShell({
  currentRouteName,
  currentTab,
  onNavigate,
  onLogout,
  children,
}: Props) {
  const { theme } = useTheme();
  const { currentUser, logoutOrganization } = useOrganization();
  const [hovered, setHovered] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    SuperMaster: false,
    SuperLogs: false,
    SuperUserControl: false,
  });
  const [searchFocused, setSearchFocused] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const currentItem = SUPER_ADMIN_NAV.find(
    (i) =>
      i.name === currentRouteName ||
      i.children?.some((c) => c.name.startsWith(currentRouteName)),
  );

  const handleLogout = async () => {
    setProfileOpen(false);
    if (onLogout) {
      onLogout();
    } else {
      await logoutOrganization();
    }
  };

  return (
    <View style={[styles.shellRoot, { backgroundColor: theme.backgroundRoot }]}>
      {/* Sidebar */}
      <View style={[styles.sidebar, { backgroundColor: SIDEBAR_BG }]}>
        {/* Brand */}
        <View style={styles.brandBlock}>
          <View
            style={[styles.brandMark, { backgroundColor: BrandColors.primary }]}
          >
            <ThemedText
              lightColor="#FFFFFF"
              darkColor="#FFFFFF"
              style={styles.brandMarkText}
            >
              T
            </ThemedText>
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText
              lightColor={SIDEBAR_TEXT}
              darkColor={SIDEBAR_TEXT}
              style={styles.brandName}
            >
              TIQKETS
            </ThemedText>
            <ThemedText
              lightColor={SIDEBAR_TEXT_MUTED}
              darkColor={SIDEBAR_TEXT_MUTED}
              style={styles.brandSub}
              numberOfLines={1}
            >
              Super Admin Console
            </ThemedText>
          </View>
        </View>

        <ThemedText
          lightColor={SIDEBAR_TEXT_MUTED}
          darkColor={SIDEBAR_TEXT_MUTED}
          style={styles.menuLabel}
        >
          MENU
        </ThemedText>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.sidebarContent}
          showsVerticalScrollIndicator={false}
        >
          {SUPER_ADMIN_NAV.map((item) => {
            const isActive =
              item.name === currentRouteName ||
              item.children?.some((c) =>
                c.name.startsWith(currentRouteName),
              );
            const isHovered = hovered === item.name;
            const hasChildren = !!item.children?.length;
            const isExpanded = expanded[item.name];

            return (
              <View key={item.name}>
                <Pressable
                  onPress={() => {
                    if (hasChildren) {
                      setExpanded((prev) => ({
                        ...prev,
                        [item.name]: !prev[item.name],
                      }));
                    } else {
                      onNavigate(item.name);
                    }
                  }}
                  onHoverIn={() => setHovered(item.name)}
                  onHoverOut={() => setHovered(null)}
                  style={[
                    styles.sidebarItem,
                    isHovered &&
                      !isActive && { backgroundColor: SIDEBAR_BG_HOVER },
                    isActive && { backgroundColor: SIDEBAR_BG_ACTIVE },
                  ]}
                >
                  <Feather
                    name={item.icon}
                    size={16}
                    color={isActive ? "#FFFFFF" : SIDEBAR_TEXT}
                  />
                  <ThemedText
                    lightColor={isActive ? "#FFFFFF" : SIDEBAR_TEXT}
                    darkColor={isActive ? "#FFFFFF" : SIDEBAR_TEXT}
                    style={[
                      styles.sidebarItemLabel,
                      { fontWeight: isActive ? "600" : "500" },
                    ]}
                  >
                    {item.label}
                  </ThemedText>
                  {hasChildren ? (
                    <Feather
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={14}
                      color={SIDEBAR_TEXT_MUTED}
                    />
                  ) : null}
                </Pressable>

                {hasChildren && isExpanded ? (
                  <View style={styles.subItemContainer}>
                    {item.children!.map((c) => {
                      const [base, queryString] = c.name.split("?");
                      const tabPart = queryString?.split("=")[1];
                      const childActive =
                        currentRouteName === base &&
                        (!tabPart || currentTab === tabPart);
                      const childHovered = hovered === c.name;
                      return (
                        <Pressable
                          key={c.name}
                          onPress={() => onNavigate(base, tabPart)}
                          onHoverIn={() => setHovered(c.name)}
                          onHoverOut={() => setHovered(null)}
                          style={[
                            styles.subItem,
                            childHovered &&
                              !childActive && {
                                backgroundColor: SIDEBAR_BG_HOVER,
                              },
                            childActive && {
                              backgroundColor: SIDEBAR_BG_ACTIVE,
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.subItemDot,
                              {
                                backgroundColor: childActive
                                  ? BrandColors.primary
                                  : SIDEBAR_TEXT_MUTED,
                              },
                            ]}
                          />
                          <ThemedText
                            lightColor={childActive ? "#FFFFFF" : SIDEBAR_TEXT}
                            darkColor={childActive ? "#FFFFFF" : SIDEBAR_TEXT}
                            style={styles.subItemLabel}
                          >
                            {c.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>

        <View
          style={[styles.sidebarFooter, { borderTopColor: SIDEBAR_DIVIDER }]}
        >
          <ThemedText
            lightColor={SIDEBAR_TEXT_MUTED}
            darkColor={SIDEBAR_TEXT_MUTED}
            style={styles.footerText}
          >
            v1.0 · Super Admin
          </ThemedText>
        </View>
      </View>

      {/* Main column */}
      <View style={styles.mainColumn}>
        {/* Top bar */}
        <View
          style={[
            styles.topBar,
            {
              backgroundColor: theme.surface,
              borderBottomColor: theme.borderSubtle,
            },
          ]}
        >
          <View style={styles.crumbs}>
            <ThemedText style={[styles.crumbMuted, { color: theme.mutedText }]}>
              Super Admin
            </ThemedText>
            <Feather
              name="chevron-right"
              size={14}
              color={theme.mutedText}
              style={{ marginHorizontal: 4 }}
            />
            <ThemedText style={[styles.crumbCurrent, { color: theme.text }]}>
              {currentItem?.label || "Dashboard"}
            </ThemedText>
          </View>

          <View style={styles.topBarRight}>
            <View
              style={[
                styles.searchBar,
                {
                  backgroundColor: theme.surfaceMuted,
                  borderColor: searchFocused
                    ? theme.primary
                    : theme.borderSubtle,
                },
              ]}
            >
              <Feather name="search" size={14} color={theme.mutedText} />
              <TextInput
                placeholder="Search organizations, admins, plans..."
                placeholderTextColor={theme.mutedText}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                style={
                  [
                    styles.searchInput,
                    { color: theme.text, outlineWidth: 0 },
                  ] as TextStyle[]
                }
              />
            </View>

            <Pressable
              style={[styles.iconBtn, { borderColor: theme.borderSubtle }]}
            >
              <Feather name="bell" size={15} color={theme.textSecondary} />
              <View
                style={[styles.notifDot, { backgroundColor: theme.primary }]}
              />
            </Pressable>

            <Pressable
              onPress={() => setProfileOpen((v) => !v)}
              style={[
                styles.profileChip,
                { borderColor: theme.borderSubtle },
              ]}
            >
              <View
                style={[
                  styles.profileAvatar,
                  { backgroundColor: BrandColors.primary },
                ]}
              >
                <ThemedText
                  lightColor="#FFFFFF"
                  darkColor="#FFFFFF"
                  style={styles.profileAvatarText}
                >
                  {getInitials(currentUser?.name)}
                </ThemedText>
              </View>
              <View style={{ marginLeft: Spacing.sm }}>
                <ThemedText
                  style={[styles.profileName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {currentUser?.name || "Super Admin"}
                </ThemedText>
                <ThemedText
                  style={[styles.profileRole, { color: theme.mutedText }]}
                  numberOfLines={1}
                >
                  Platform Owner
                </ThemedText>
              </View>
              <Feather
                name="chevron-down"
                size={14}
                color={theme.mutedText}
                style={{ marginLeft: Spacing.sm }}
              />
            </Pressable>

            {profileOpen ? (
              <View
                style={[
                  styles.profileMenu,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.borderSubtle,
                    ...(Platform.OS === "web" ? Shadows.medium : Shadows.card),
                  },
                ]}
              >
                <Pressable
                  onPress={handleLogout}
                  style={styles.profileMenuItem}
                >
                  <Feather name="log-out" size={15} color={theme.text} />
                  <ThemedText
                    style={{
                      color: theme.text,
                      fontWeight: "500",
                      marginLeft: Spacing.sm,
                    }}
                  >
                    Sign Out
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>

        <ScrollView
          style={styles.contentArea}
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

const SIDEBAR_WIDTH = 240;
const TOP_BAR_HEIGHT = 64;

const styles = StyleSheet.create({
  shellRoot: { flex: 1, flexDirection: "row" },
  sidebar: {
    width: SIDEBAR_WIDTH,
    flexDirection: "column",
  },
  brandBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  brandMarkText: { fontWeight: "800", fontSize: 16 },
  brandName: { fontWeight: "800", letterSpacing: 1.2, fontSize: 14 },
  brandSub: { fontSize: 11, marginTop: 1 },
  menuLabel: {
    fontWeight: "700",
    letterSpacing: 1,
    fontSize: 10,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sidebarContent: {
    paddingHorizontal: Spacing.sm,
    paddingTop: 4,
    paddingBottom: Spacing.xl,
  },
  sidebarItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    borderRadius: BorderRadius.sm,
    marginBottom: 2,
  },
  sidebarItemLabel: { flex: 1, fontSize: 13 },
  subItemContainer: { paddingLeft: Spacing.lg, marginBottom: 2 },
  subItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.xs,
    marginBottom: 1,
    gap: Spacing.sm,
  },
  subItemDot: { width: 5, height: 5, borderRadius: 3 },
  subItemLabel: { fontSize: 12 },
  sidebarFooter: {
    padding: Spacing.md,
    borderTopWidth: 1,
    alignItems: "center",
  },
  footerText: { fontSize: 11, fontWeight: "500" },
  mainColumn: { flex: 1, flexDirection: "column" },
  topBar: {
    height: TOP_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing["2xl"],
    borderBottomWidth: 1,
    position: "relative",
    zIndex: 10,
  },
  crumbs: { flexDirection: "row", alignItems: "center" },
  crumbMuted: { fontSize: 13, fontWeight: "500" },
  crumbCurrent: { fontSize: 13, fontWeight: "600" },
  topBarRight: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    height: 38,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
    minWidth: 320,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 13, height: "100%" },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    position: "relative",
  },
  notifDot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  profileChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  profileAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  profileAvatarText: { fontWeight: "700", fontSize: 11 },
  profileName: { fontSize: 12, fontWeight: "600" },
  profileRole: { fontSize: 10, marginTop: 1 },
  profileMenu: {
    position: "absolute",
    top: TOP_BAR_HEIGHT + 4,
    right: Spacing["2xl"],
    minWidth: 180,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    paddingVertical: 4,
  },
  profileMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  contentArea: { flex: 1 },
});
