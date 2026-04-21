import React from "react";
import { Feather } from "@expo/vector-icons";
import {
  StyleSheet,
  View,
  Pressable,
  TextInput,
  ScrollView,
  TextStyle,
} from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Spacing, BorderRadius } from "@/constants/theme";

export interface WebShellNavItem {
  name: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  group: string;
}

export const ORG_NAV_ITEMS: WebShellNavItem[] = [
  { name: "OrgDashboard", label: "Dashboard", icon: "grid", group: "Overview" },
  { name: "OrgQueue", label: "Queue", icon: "users", group: "Operations" },
  { name: "OrgServices", label: "Branches", icon: "git-branch", group: "Operations" },
  { name: "OrgBookings", label: "Bookings", icon: "calendar", group: "Operations" },
  { name: "JourneyManagement", label: "Journeys", icon: "map", group: "Operations" },
  { name: "UserManagement", label: "Team", icon: "user-check", group: "Account" },
  { name: "OrgSettings", label: "Settings", icon: "settings", group: "Account" },
];

const TOP_NAV = ["Operations", "Insights", "Customers", "Reports"];

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
  const { organization, currentUser } = useOrganization();

  const groups = ORG_NAV_ITEMS.reduce<Record<string, WebShellNavItem[]>>(
    (acc, item) => {
      if (!acc[item.group]) acc[item.group] = [];
      acc[item.group].push(item);
      return acc;
    },
    {}
  );

  return (
    <View style={[styles.shellRoot, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.topBar, { backgroundColor: theme.topBarBg }]}>
        <View style={styles.topBarLeft}>
          <View style={[styles.brandMark, { backgroundColor: theme.primary }]}>
            <ThemedText
              type="body"
              lightColor="#FFFFFF"
              darkColor="#FFFFFF"
              style={styles.brandText}
            >
              T
            </ThemedText>
          </View>
          <ThemedText
            type="h4"
            lightColor={theme.topBarText}
            darkColor={theme.topBarText}
            style={styles.brandName}
          >
            TIQKETS
          </ThemedText>
          <View style={styles.brandDivider} />
          <View style={styles.topNavItems}>
            {TOP_NAV.map((item, i) => (
              <Pressable key={item} style={styles.topNavItem}>
                <ThemedText
                  type="small"
                  lightColor={i === 0 ? theme.topBarText : theme.topBarMuted}
                  darkColor={i === 0 ? theme.topBarText : theme.topBarMuted}
                  style={{ fontWeight: i === 0 ? "600" : "500" }}
                >
                  {item}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.topBarRight}>
          <View style={styles.topSearchBar}>
            <Feather name="search" size={14} color={theme.topBarMuted} />
            <TextInput
              placeholder="Search"
              placeholderTextColor={theme.topBarMuted}
              style={
                [
                  styles.topSearchInput,
                  { color: theme.topBarText, outlineWidth: 0 },
                ] as TextStyle[]
              }
            />
          </View>
          <Pressable
            style={[styles.createBtn, { backgroundColor: theme.primary }]}
          >
            <Feather name="plus" size={14} color="#FFFFFF" />
            <ThemedText
              type="small"
              lightColor="#FFFFFF"
              darkColor="#FFFFFF"
              style={{ fontWeight: "600" }}
            >
              Create New
            </ThemedText>
          </Pressable>
          <View style={styles.topAvatar}>
            <ThemedText
              type="small"
              lightColor="#FFFFFF"
              darkColor="#FFFFFF"
              style={{ fontWeight: "700" }}
            >
              {getInitials(currentUser?.name || organization?.name)}
            </ThemedText>
          </View>
        </View>
      </View>

      <View style={styles.bodyRow}>
        <View
          style={[
            styles.sidebar,
            {
              backgroundColor: theme.sidebarBg,
              borderRightColor: theme.sidebarBorder,
            },
          ]}
        >
          <ScrollView contentContainerStyle={styles.sidebarContent}>
            {Object.entries(groups).map(([group, items]) => (
              <View key={group} style={styles.sidebarGroup}>
                <ThemedText
                  type="caption"
                  style={[styles.sidebarGroupLabel, { color: theme.mutedText }]}
                >
                  {group.toUpperCase()}
                </ThemedText>
                {items.map((item) => {
                  const active = item.name === currentRouteName;
                  return (
                    <Pressable
                      key={item.name}
                      onPress={() => onNavigate(item.name)}
                      style={[
                        styles.sidebarItem,
                        active && {
                          backgroundColor: theme.sidebarItemActiveBg,
                        },
                      ]}
                    >
                      <Feather
                        name={item.icon}
                        size={16}
                        color={
                          active
                            ? theme.sidebarItemActiveText
                            : theme.textSecondary
                        }
                      />
                      <ThemedText
                        type="small"
                        style={{
                          color: active
                            ? theme.sidebarItemActiveText
                            : theme.text,
                          fontWeight: active ? "600" : "500",
                          marginLeft: Spacing.md,
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
          <View
            style={[
              styles.sidebarFooter,
              { borderTopColor: theme.sidebarBorder },
            ]}
          >
            <ThemedText type="caption" style={{ color: theme.mutedText }}>
              {organization?.name || "Organization"}
            </ThemedText>
          </View>
        </View>
        <View style={styles.contentArea}>{children}</View>
      </View>
    </View>
  );
}

const SIDEBAR_WIDTH = 240;
const TOP_BAR_HEIGHT = 56;

const styles = StyleSheet.create({
  shellRoot: { flex: 1, flexDirection: "column" },
  topBar: {
    height: TOP_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    zIndex: 10,
  },
  topBarLeft: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  brandMark: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: { fontWeight: "800" },
  brandName: { fontWeight: "700", letterSpacing: 1 },
  brandDivider: {
    width: 1,
    height: 24,
    backgroundColor: "rgba(255,255,255,0.1)",
    marginHorizontal: Spacing.md,
  },
  topNavItems: { flexDirection: "row", gap: Spacing.xl },
  topNavItem: { paddingVertical: Spacing.sm },
  topBarRight: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  topSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.xs,
    gap: Spacing.sm,
    minWidth: 220,
  },
  topSearchInput: { flex: 1, fontSize: 13 },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.xs,
  },
  topAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
  },
  bodyRow: { flex: 1, flexDirection: "row" },
  sidebar: { width: SIDEBAR_WIDTH, borderRightWidth: 1 },
  sidebarContent: { paddingVertical: Spacing.lg, paddingHorizontal: Spacing.md },
  sidebarGroup: { marginBottom: Spacing.lg },
  sidebarGroupLabel: {
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  sidebarItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.xs,
  },
  sidebarFooter: { padding: Spacing.lg, borderTopWidth: 1 },
  contentArea: { flex: 1, overflow: "hidden" },
});
