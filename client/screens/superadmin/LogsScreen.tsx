import React, { useState, useMemo } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { DataTable, StatusPill, Column } from "./_components/DataTable";
import { ThemedText } from "@/components/ThemedText";

type Tab = "system" | "audit";

interface Props {
  initialTab?: Tab;
}

interface SystemLog { id: string; timestamp: string; service: string; level: "info" | "warn" | "error"; message: string; }
interface AuditLog { id: string; timestamp: string; actor: string; action: string; target: string; ip: string; }

const SYSTEM: SystemLog[] = [
  { id: "L1001", timestamp: "2026-04-24 09:14:22", service: "queue-engine", level: "info", message: "Queue rebalanced for org Swift Bank (3 desks)" },
  { id: "L1000", timestamp: "2026-04-24 09:12:08", service: "billing", level: "warn", message: "Webhook retry attempt 2 for txn TXN-21038" },
  { id: "L0999", timestamp: "2026-04-24 09:10:55", service: "notification", level: "info", message: "Sent 412 SMS notifications in last batch" },
  { id: "L0998", timestamp: "2026-04-24 09:08:11", service: "billing", level: "error", message: "Card declined for org Dublin Cars (txn TXN-21038)" },
  { id: "L0997", timestamp: "2026-04-24 09:05:47", service: "auth", level: "info", message: "Super Admin signed in from 10.0.4.21" },
  { id: "L0996", timestamp: "2026-04-24 09:00:00", service: "scheduler", level: "info", message: "Daily aggregation job completed in 14.2s" },
  { id: "L0995", timestamp: "2026-04-24 08:58:22", service: "queue-engine", level: "warn", message: "Slow desk handover detected for branch BR-018" },
];

const AUDIT: AuditLog[] = [
  { id: "AU-441", timestamp: "2026-04-24 09:05:47", actor: "superadmin@tiqkets.com", action: "user.login", target: "session", ip: "10.0.4.21" },
  { id: "AU-440", timestamp: "2026-04-23 22:14:08", actor: "aisha@swiftbank.ae", action: "branch.create", target: "BR-202", ip: "82.14.55.21" },
  { id: "AU-439", timestamp: "2026-04-23 21:55:12", actor: "superadmin@tiqkets.com", action: "plan.update", target: "GROWTH", ip: "10.0.4.21" },
  { id: "AU-438", timestamp: "2026-04-23 18:12:46", actor: "marcus@medfirst.sg", action: "user.invite", target: "noor@medfirst.sg", ip: "203.116.4.18" },
  { id: "AU-437", timestamp: "2026-04-23 17:01:33", actor: "system", action: "subscription.renew", target: "Swift Bank", ip: "—" },
  { id: "AU-436", timestamp: "2026-04-23 14:22:01", actor: "priya@quickserve.in", action: "service.update", target: "SVC-014", ip: "117.99.21.4" },
];

export default function LogsScreen({ initialTab = "system" }: Props) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>(initialTab);

  React.useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "system", label: "System Logs" },
    { key: "audit", label: "Audit Logs" },
  ];

  const tableNode = useMemo(() => {
    if (tab === "system") {
      const cols: Column<SystemLog>[] = [
        { key: "timestamp", label: "Timestamp", flex: 1.3 },
        { key: "service", label: "Service", flex: 1 },
        { key: "level", label: "Level", flex: 0.7, render: (r) => (
          <StatusPill label={r.level} tone={r.level === "error" ? "error" : r.level === "warn" ? "warning" : "info"} />
        ) },
        { key: "message", label: "Message", flex: 3, render: (r) => (
          <ThemedText style={{ color: theme.text, fontSize: 12 }} numberOfLines={1}>{r.message}</ThemedText>
        ) },
      ];
      return <DataTable<SystemLog> columns={cols} rows={SYSTEM} searchKeys={["service", "message", "level"]} pageSize={15} />;
    }
    const cols: Column<AuditLog>[] = [
      { key: "timestamp", label: "Timestamp", flex: 1.3 },
      { key: "actor", label: "Actor", flex: 1.4 },
      { key: "action", label: "Action", flex: 1.2 },
      { key: "target", label: "Target", flex: 1.2 },
      { key: "ip", label: "IP", flex: 1 },
    ];
    return <DataTable<AuditLog> columns={cols} rows={AUDIT} searchKeys={["actor", "action", "target", "ip"]} pageSize={15} />;
  }, [tab, theme.text]);

  return (
    <View style={[styles.root, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.content}>
        <PageHeader
          title="Logs"
          subtitle="Operational and audit history"
          actions={[{ label: "Download", icon: "download", variant: "secondary" }]}
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
});
