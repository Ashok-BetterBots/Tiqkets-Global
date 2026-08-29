import React, { useState, useMemo } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { DataTable, StatusPill, Column } from "./_components/DataTable";
import { ThemedText } from "@/components/ThemedText";
import { getErrorMessage } from "@/lib/query-client";

type Tab = "system" | "audit";

interface Props {
  initialTab?: Tab;
}

interface SystemLog { id: string; timestamp: string; service: string; level: "info" | "warn" | "error"; message: string; }

interface AuditLogRow {
  id: string;
  createdAt: string;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  ip?: string | null;
  diff?: unknown;
}

const SYSTEM: SystemLog[] = [
  { id: "L1001", timestamp: "2026-04-24 09:14:22", service: "queue-engine", level: "info", message: "Queue rebalanced for org Swift Bank (3 desks)" },
  { id: "L1000", timestamp: "2026-04-24 09:12:08", service: "billing", level: "warn", message: "Webhook retry attempt 2 for txn TXN-21038" },
  { id: "L0999", timestamp: "2026-04-24 09:10:55", service: "notification", level: "info", message: "Sent 412 SMS notifications in last batch" },
  { id: "L0998", timestamp: "2026-04-24 09:08:11", service: "billing", level: "error", message: "Card declined for org Dublin Cars (txn TXN-21038)" },
  { id: "L0997", timestamp: "2026-04-24 09:05:47", service: "auth", level: "info", message: "Super Admin signed in from 10.0.4.21" },
  { id: "L0996", timestamp: "2026-04-24 09:00:00", service: "scheduler", level: "info", message: "Daily aggregation job completed in 14.2s" },
  { id: "L0995", timestamp: "2026-04-24 08:58:22", service: "queue-engine", level: "warn", message: "Slow desk handover detected for branch BR-018" },
];

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toISOString().slice(0, 19).replace("T", " ");
  } catch {
    return iso;
  }
}

function actorLabel(row: AuditLogRow): string {
  if (row.actorEmail) return row.actorEmail;
  if (row.actorRole === "system") return "system";
  if (row.actorRole === "super_admin") return "Super Admin";
  if (row.actorId) return `${row.actorRole || "user"}:${row.actorId.slice(0, 8)}`;
  return row.actorRole || "—";
}

function targetLabel(row: AuditLogRow): string {
  if (row.targetLabel) return row.targetLabel;
  if (row.targetId) return `${row.targetType || "entity"}:${row.targetId.slice(0, 12)}`;
  return row.targetType || "—";
}

export default function LogsScreen({ initialTab = "system" }: Props) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<Tab>(initialTab);

  React.useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const auditQuery = useQuery<{ logs: AuditLogRow[] }>({
    queryKey: ["/api/superadmin/audit-logs"],
    enabled: tab === "audit",
  });

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

    const rows = auditQuery.data?.logs ?? [];
    const cols: Column<AuditLogRow>[] = [
      { key: "createdAt", label: "Timestamp", flex: 1.4, render: (r) => (
        <ThemedText style={{ color: theme.text, fontSize: 12 }} numberOfLines={1}>{formatDate(r.createdAt)}</ThemedText>
      ) },
      { key: "actor", label: "Actor", flex: 1.6, render: (r) => (
        <View>
          <ThemedText style={{ color: theme.text, fontSize: 12, fontWeight: "600" }} numberOfLines={1}>{actorLabel(r)}</ThemedText>
          <ThemedText style={{ color: theme.mutedText, fontSize: 10 }} numberOfLines={1}>{r.actorRole || ""}</ThemedText>
        </View>
      ) },
      { key: "action", label: "Action", flex: 1.3, render: (r) => (
        <ThemedText style={{ color: theme.text, fontSize: 12, fontFamily: "Menlo, Consolas, monospace" }} numberOfLines={1}>{r.action}</ThemedText>
      ) },
      { key: "target", label: "Target", flex: 1.6, render: (r) => (
        <ThemedText style={{ color: theme.text, fontSize: 12, fontFamily: "Menlo, Consolas, monospace" }} numberOfLines={1}>{targetLabel(r)}</ThemedText>
      ) },
      { key: "ip", label: "IP", flex: 1, render: (r) => (
        <ThemedText style={{ color: theme.text, fontSize: 12 }} numberOfLines={1}>{r.ip || "—"}</ThemedText>
      ) },
    ];
    const emptyText = auditQuery.isError
      ? getErrorMessage(auditQuery.error)
      : auditQuery.isLoading
        ? "Loading audit logs…"
        : "No audit log entries yet";
    return (
      <DataTable<AuditLogRow>
        columns={cols}
        rows={rows}
        searchKeys={["actorEmail", "actorRole", "action", "targetType", "targetId", "targetLabel", "ip"]}
        pageSize={15}
        emptyText={emptyText}
      />
    );
  }, [tab, theme.text, theme.mutedText, auditQuery.data, auditQuery.isLoading, auditQuery.isError, auditQuery.error]);

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
