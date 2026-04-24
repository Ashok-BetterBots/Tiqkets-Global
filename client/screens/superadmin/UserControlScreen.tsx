import React, { useState, useMemo } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { DataTable, StatusPill, Column } from "./_components/DataTable";
import { ThemedText } from "@/components/ThemedText";

type Tab = "roles" | "permissions";

interface Props {
  initialTab?: Tab;
}

interface Role { id: string; name: string; description: string; users: number; level: "platform" | "organization"; }
interface Permission { id: string; key: string; resource: string; action: string; assignedTo: string[]; }

const ROLES: Role[] = [
  { id: "r1", name: "Super Admin", description: "Full platform control across all organizations", users: 2, level: "platform" },
  { id: "r2", name: "Platform Support", description: "Read-only access to all organization data plus support actions", users: 6, level: "platform" },
  { id: "r3", name: "Owner", description: "Full control of a single organization", users: 248, level: "organization" },
  { id: "r4", name: "Admin", description: "Manages branches, services, and team within an organization", users: 412, level: "organization" },
  { id: "r5", name: "Counter Staff", description: "Calls customers from the queue at a service desk", users: 1820, level: "organization" },
];

const PERMISSIONS: Permission[] = [
  { id: "p1", key: "org.create", resource: "Organization", action: "Create", assignedTo: ["Super Admin"] },
  { id: "p2", key: "org.suspend", resource: "Organization", action: "Suspend", assignedTo: ["Super Admin"] },
  { id: "p3", key: "branch.manage", resource: "Branch", action: "Manage", assignedTo: ["Owner", "Admin"] },
  { id: "p4", key: "queue.serve", resource: "Queue", action: "Call & Serve", assignedTo: ["Owner", "Admin", "Counter Staff"] },
  { id: "p5", key: "billing.view", resource: "Billing", action: "View invoices", assignedTo: ["Owner", "Super Admin"] },
  { id: "p6", key: "report.export", resource: "Reports", action: "Export", assignedTo: ["Owner", "Admin", "Super Admin"] },
  { id: "p7", key: "user.invite", resource: "User", action: "Invite", assignedTo: ["Owner", "Admin", "Super Admin"] },
];

export default function UserControlScreen({ initialTab = "roles" }: Props) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>(initialTab);

  React.useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "roles", label: "Roles" },
    { key: "permissions", label: "Permissions" },
  ];

  const tableNode = useMemo(() => {
    if (tab === "roles") {
      const cols: Column<Role>[] = [
        { key: "name", label: "Role", flex: 1.2, render: (r) => (
          <View>
            <ThemedText style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>{r.name}</ThemedText>
            <ThemedText style={{ color: theme.mutedText, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{r.description}</ThemedText>
          </View>
        ) },
        { key: "level", label: "Scope", flex: 0.9, render: (r) => (
          <StatusPill label={r.level} tone={r.level === "platform" ? "info" : "neutral"} />
        ) },
        { key: "users", label: "Users", flex: 0.8, align: "right", render: (r) => (
          <ThemedText style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>{r.users.toLocaleString()}</ThemedText>
        ) },
        { key: "actions", label: "", flex: 0.8, align: "right", render: () => (
          <Pressable style={[styles.iconBtn, { borderColor: theme.borderSubtle }]}>
            <Feather name="edit-2" size={13} color={theme.text} />
          </Pressable>
        ) },
      ];
      return <DataTable<Role> columns={cols} rows={ROLES} searchKeys={["name", "description"]} />;
    }
    const cols: Column<Permission>[] = [
      { key: "key", label: "Permission", flex: 1.2, render: (r) => (
        <ThemedText style={{ color: theme.text, fontSize: 12, fontFamily: "Menlo, Consolas, monospace" }}>{r.key}</ThemedText>
      ) },
      { key: "resource", label: "Resource", flex: 1 },
      { key: "action", label: "Action", flex: 1.2 },
      { key: "assignedTo", label: "Assigned to", flex: 2, render: (r) => (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
          {r.assignedTo.map((a) => <StatusPill key={a} label={a} tone="info" />)}
        </View>
      ) },
    ];
    return <DataTable<Permission> columns={cols} rows={PERMISSIONS} searchKeys={["key", "resource", "action"]} pageSize={15} />;
  }, [tab, theme]);

  return (
    <View style={[styles.root, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.content}>
        <PageHeader
          title="User Control"
          subtitle="Roles and permissions across the platform"
          actions={[{ label: "New Role", icon: "plus" }]}
        />

        <View style={[styles.tabBar, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
          {tabs.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[
                  styles.tabBtn,
                  active && { backgroundColor: BrandColors.primary + "15" },
                ]}
              >
                <ThemedText
                  style={{
                    color: active ? BrandColors.primary : theme.textSecondary,
                    fontSize: 13,
                    fontWeight: active ? "700" : "500",
                  }}
                >
                  {t.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <View style={{ height: Spacing.lg }} />
        {tableNode}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: Spacing.xl },
  content: { width: "100%", maxWidth: 1280, alignSelf: "center" },
  tabBar: {
    flexDirection: "row",
    alignSelf: "flex-start",
    padding: 4,
    gap: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  tabBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 8,
    borderRadius: BorderRadius.xs,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
});
