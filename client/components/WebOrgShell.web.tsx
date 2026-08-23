import React, { useState } from "react";
import { Feather } from "@expo/vector-icons";
import {
  StyleSheet,
  View,
  Pressable,
  TextInput,
  ScrollView,
  TextStyle,
  Image,
} from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { ORG_QUEUE_NAV_PERMISSIONS, EVENTS_NAV_PERMISSIONS } from "@shared/permissions";
import { ProfileModal } from "@/components/ProfileModal";
import { getRoleLabel } from "@/types/organization";

export interface WebShellNavItem {
  name: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  group: string;
  /** Single permission required to see this nav item. */
  permission?: string;
  /** Any-of: user must have at least one of these permissions. */
  permissions?: string[];
  /** Optional role gate in addition to the permission gate. */
  roles?: string[];
  /** Only shown for classic organisation accounts. */
  orgOnly?: boolean;
  /** Only shown for event accounts. */
  eventOnly?: boolean;
  /** Label override when the signed-in account is an event account. */
  eventLabel?: string;
}

export const ORG_NAV_ITEMS: WebShellNavItem[] = [
  { name: "OrgDashboard", label: "Dashboard", icon: "grid", group: "Overview", permission: "org.dashboard.view", orgOnly: true },
  { name: "OrgEvents", label: "Dashboard", icon: "bar-chart-2", group: "Overview", permissions: EVENTS_NAV_PERMISSIONS, eventOnly: true },
  { name: "OrgEventManage", label: "Events", icon: "tag", group: "Overview", permission: "org.events.manage", eventOnly: true },
  { name: "OrgPayouts", label: "Ticket Payments", icon: "repeat", group: "Account", permission: "org.events.manage", roles: ["admin", "organizer", "super_admin"], eventOnly: true },
  { name: "OrgQueue", label: "Live Queue", icon: "users", group: "Operations", permissions: ORG_QUEUE_NAV_PERMISSIONS, orgOnly: true },
  { name: "OrgServices", label: "Branches", icon: "shopping-bag", group: "Operations", permission: "org.branches.view", orgOnly: true },
  { name: "OrgEventLocations", label: "Locations", icon: "map-pin", group: "Operations", permission: "org.events.manage", eventOnly: true },
  { name: "OrgBookings", label: "Availability", icon: "calendar", group: "Operations", permission: "org.bookings.view", orgOnly: true },
  { name: "UserManagement", label: "Team", icon: "user-check", group: "Account", permission: "org.users.view" },
  { name: "OrgSettings", label: "Settings", icon: "settings", group: "Account", permission: "org.settings.view" },
  { name: "OrgBilling", label: "Billing", eventLabel: "Subscription", icon: "credit-card", group: "Account", permission: "org.billing.view" },
  { name: "OrgSupport", label: "Tech Support", icon: "life-buoy", group: "Account" },
];

function getInitials(name?: string) {
  if (!name) return "OR";
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

interface Props {
  currentRouteName: string;
  onNavigate: (name: string) => void;
  children: React.ReactNode;
}

export default function WebOrgShell({
  currentRouteName,
  onNavigate,
  children,
}: Props) {
  const { theme } = useTheme();
  const { organization, currentUser, hasPermission, hasAnyPermission, updateCurrentUser, changePassword, logoutOrganization } = useOrganization();
  const [hovered, setHovered] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Event accounts get the event-only shell: event nav items, "Locations"
  // instead of "Branches", and no queue/availability sections. Classic
  // organisation accounts are untouched.
  const isEventAccount = organization?.accountType === "event";

  const visibleNav = React.useMemo(
    () =>
      ORG_NAV_ITEMS.filter((item) => {
        if (isEventAccount && item.orgOnly) return false;
        if (!isEventAccount && item.eventOnly) return false;
        if (item.roles && !item.roles.includes(String(currentUser?.role || "").toLowerCase())) return false;
        if (item.permissions && item.permissions.length > 0) {
          return hasAnyPermission(item.permissions);
        }
        if (item.permission) return hasPermission(item.permission);
        return true;
      }).map((item) =>
        isEventAccount && item.eventLabel
          ? { ...item, label: item.eventLabel }
          : item,
      ),
    [currentUser?.role, hasPermission, hasAnyPermission, isEventAccount],
  );

  const groups = visibleNav.reduce<Record<string, WebShellNavItem[]>>(
    (acc, item) => {
      if (!acc[item.group]) acc[item.group] = [];
      acc[item.group].push(item);
      return acc;
    },
    {}
  );

  const currentItem =
    visibleNav.find((i) => i.name === currentRouteName) ||
    ORG_NAV_ITEMS.find((i) => i.name === currentRouteName);

  return (
    <View style={[styles.shellRoot, { backgroundColor: theme.backgroundRoot }]}>
      {/* Sidebar */}
      <View
        style={[
          styles.sidebar,
          {
            backgroundColor: theme.surface,
            borderRightColor: theme.borderSubtle,
          },
        ]}
      >
        {/* Brand */}
        <View style={styles.brandBlock}>
          <View style={[styles.brandMark, { backgroundColor: theme.primary }]}>
            <ThemedText
              lightColor="#FFFFFF"
              darkColor="#FFFFFF"
              style={styles.brandMarkText}
            >
              T
            </ThemedText>
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={[styles.brandName, { color: theme.text }]}>
              TIQKETS
            </ThemedText>
            <ThemedText
              style={[styles.brandSub, { color: theme.mutedText }]}
              numberOfLines={1}
            >
              {organization?.name || "Organization"}
            </ThemedText>
          </View>
        </View>

        {/* Nav */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.sidebarContent}
          showsVerticalScrollIndicator={false}
        >
          {Object.entries(groups).map(([group, items]) => (
            <View key={group} style={styles.sidebarGroup}>
              <ThemedText
                style={[styles.sidebarGroupLabel, { color: theme.mutedText }]}
              >
                {group.toUpperCase()}
              </ThemedText>
              {items.map((item) => {
                const active = item.name === currentRouteName;
                const isHovered = hovered === item.name;
                return (
                  <Pressable
                    key={item.name}
                    onPress={() => onNavigate(item.name)}
                    onHoverIn={() => setHovered(item.name)}
                    onHoverOut={() => setHovered(null)}
                    style={[
                      styles.sidebarItem,
                      isHovered &&
                        !active && {
                          backgroundColor: theme.surfaceMuted,
                        },
                      active && {
                        backgroundColor: theme.primary + "1A",
                      },
                    ]}
                  >
                    {active ? (
                      <View
                        style={[
                          styles.activeIndicator,
                          { backgroundColor: theme.primary },
                        ]}
                      />
                    ) : null}
                    <Feather
                      name={item.icon}
                      size={17}
                      color={active ? theme.primary : theme.textSecondary}
                    />
                    <ThemedText
                      style={{
                        color: active ? theme.primary : theme.text,
                        fontWeight: active ? "600" : "500",
                        marginLeft: Spacing.md,
                        fontSize: 14,
                      }}
                    >
                      {item.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>

        {/* User card — tapping opens Profile panel */}
        <View
          style={[
            styles.sidebarFooter,
            { borderTopColor: theme.borderSubtle },
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.userCard,
              {
                backgroundColor: pressed ? theme.surfaceHover ?? theme.primary + "18" : theme.surfaceMuted,
                borderColor: theme.borderSubtle,
              },
            ]}
            onPress={() => setShowProfileModal(true)}
          >
            {currentUser?.profilePictureUrl ? (
              <Image
                source={{ uri: currentUser.profilePictureUrl }}
                style={styles.userAvatar}
              />
            ) : (
              <View
                style={[
                  styles.userAvatar,
                  { backgroundColor: theme.primary },
                ]}
              >
                <ThemedText
                  lightColor="#FFFFFF"
                  darkColor="#FFFFFF"
                  style={styles.userAvatarText}
                >
                  {getInitials(currentUser?.name || organization?.name)}
                </ThemedText>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: Spacing.sm }}>
              <ThemedText
                style={[styles.userName, { color: theme.text }]}
                numberOfLines={1}
              >
                {currentUser?.name || "Admin"}
              </ThemedText>
              <ThemedText
                style={[styles.userRole, { color: theme.mutedText }]}
                numberOfLines={1}
              >
                {getRoleLabel(currentUser?.role)}
              </ThemedText>
            </View>
            <Feather name="chevron-right" size={14} color={theme.mutedText} />
          </Pressable>
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
              {currentItem?.group || "Overview"}
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
                placeholder="Search customers, services, bookings..."
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
              <View
                style={[
                  styles.kbdHint,
                  { borderColor: theme.borderSubtle },
                ]}
              >
                <ThemedText
                  style={[styles.kbdText, { color: theme.mutedText }]}
                >
                  ⌘K
                </ThemedText>
              </View>
            </View>

            <Pressable
              style={[
                styles.iconBtn,
                { borderColor: theme.borderSubtle },
              ]}
              onHoverIn={() => setHovered("notif")}
              onHoverOut={() => setHovered(null)}
            >
              <Feather name="bell" size={15} color={theme.textSecondary} />
              <View
                style={[styles.notifDot, { backgroundColor: theme.primary }]}
              />
            </Pressable>

            <Pressable
              style={[styles.iconBtn, { borderColor: theme.borderSubtle }]}
            >
              <Feather
                name="help-circle"
                size={15}
                color={theme.textSecondary}
              />
            </Pressable>

            {/* Profile chip in top bar */}
            <Pressable
              style={({ pressed }) => [
                styles.profileTopBtn,
                {
                  borderColor: showProfileModal ? theme.primary : theme.borderSubtle,
                  backgroundColor: pressed || showProfileModal ? theme.primary + "18" : theme.surfaceMuted,
                },
              ]}
              onPress={() => setShowProfileModal(true)}
            >
              {currentUser?.profilePictureUrl ? (
                <Image
                  source={{ uri: currentUser.profilePictureUrl }}
                  style={styles.profileTopAvatar}
                />
              ) : (
                <View style={[styles.profileTopAvatar, { backgroundColor: theme.primary }]}>
                  <ThemedText
                    lightColor="#FFFFFF"
                    darkColor="#FFFFFF"
                    style={styles.profileTopInitials}
                  >
                    {getInitials(currentUser?.name || organization?.name)}
                  </ThemedText>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <ThemedText
                  style={[styles.profileTopName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {currentUser?.name || "Admin"}
                </ThemedText>
                <ThemedText
                  style={[styles.profileTopRole, { color: theme.mutedText }]}
                  numberOfLines={1}
                >
                  {getRoleLabel(currentUser?.role)}
                </ThemedText>
              </View>
              <Feather name="chevron-down" size={12} color={theme.mutedText} />
            </Pressable>
          </View>
        </View>

        <View style={styles.contentArea}>{children}</View>
      </View>

      {currentUser ? (
        <ProfileModal
          visible={showProfileModal}
          onClose={() => setShowProfileModal(false)}
          user={currentUser}
          onUpdateUser={updateCurrentUser}
          onChangePassword={changePassword}
          onLogout={logoutOrganization}
        />
      ) : null}
    </View>
  );
}

const SIDEBAR_WIDTH = 248;
const TOP_BAR_HEIGHT = 60;

const styles = StyleSheet.create({
  shellRoot: { flex: 1, flexDirection: "row" },
  /* Sidebar */
  sidebar: {
    width: SIDEBAR_WIDTH,
    borderRightWidth: 1,
    flexDirection: "column",
  },
  brandBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
  },
  brandMark: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    ...Shadows.subtle,
  },
  brandMarkText: { fontWeight: "800", fontSize: 16 },
  brandName: { fontWeight: "800", letterSpacing: 1.2, fontSize: 14 },
  brandSub: { fontSize: 11, marginTop: 1 },
  sidebarContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  sidebarGroup: { marginBottom: Spacing.lg },
  sidebarGroupLabel: {
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    fontSize: 10,
  },
  sidebarItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: BorderRadius.sm,
    marginBottom: 3,
    position: "relative",
  },
  activeIndicator: {
    position: "absolute",
    left: -Spacing.sm,
    top: 6,
    bottom: 6,
    width: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  sidebarFooter: {
    padding: Spacing.md,
    borderTopWidth: 1,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.sm,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarText: { fontWeight: "700", fontSize: 12 },
  userName: { fontSize: 13, fontWeight: "600" },
  userRole: { fontSize: 11, marginTop: 1 },
  /* Main */
  mainColumn: { flex: 1, flexDirection: "column" },
  topBar: {
    height: TOP_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing["2xl"],
    borderBottomWidth: 1,
  },
  crumbs: { flexDirection: "row", alignItems: "center" },
  crumbMuted: { fontSize: 13, fontWeight: "500" },
  crumbCurrent: { fontSize: 13, fontWeight: "600" },
  topBarRight: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: Spacing.md,
    paddingRight: 6,
    height: 36,
    borderRadius: BorderRadius.xs,
    gap: Spacing.sm,
    minWidth: 320,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 13, height: "100%" },
  kbdHint: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  kbdText: { fontSize: 10, fontWeight: "600" },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.xs,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    position: "relative",
  },
  notifDot: {
    position: "absolute",
    top: 8,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  profileTopBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.xs,
    borderWidth: 1,
    maxWidth: 180,
    minWidth: 110,
  },
  profileTopAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  profileTopInitials: { fontWeight: "700", fontSize: 10 },
  profileTopName: { fontSize: 12, fontWeight: "600" },
  profileTopRole: { fontSize: 10, marginTop: 1 },
  contentArea: { flex: 1, overflow: "hidden" },
});
