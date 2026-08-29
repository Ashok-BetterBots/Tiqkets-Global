import React from "react";
import { View, StyleSheet } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { DataTable, StatusPill, Column } from "./_components/DataTable";
import { ThemedText } from "@/components/ThemedText";
import { SuperCard } from "./_components/SuperCard";
import { Feather } from "@expo/vector-icons";

interface Ticket {
  id: string;
  subject: string;
  organization: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "in_progress" | "waiting" | "resolved";
  agent: string;
  createdAt: string;
}

const TICKETS: Ticket[] = [
  { id: "TKT-9012", subject: "QR scanner not detecting on iPad", organization: "Swift Bank", priority: "high", status: "in_progress", agent: "Hana", createdAt: "2026-04-24 08:11" },
  { id: "TKT-9011", subject: "Need help configuring SMS gateway", organization: "MedFirst Clinics", priority: "medium", status: "waiting", agent: "Diego", createdAt: "2026-04-24 07:33" },
  { id: "TKT-9010", subject: "Refund for duplicate subscription", organization: "Dublin Cars", priority: "urgent", status: "open", agent: "—", createdAt: "2026-04-24 06:22" },
  { id: "TKT-9009", subject: "Custom branding upload failing", organization: "London Dental", priority: "low", status: "resolved", agent: "Hana", createdAt: "2026-04-23 22:01" },
  { id: "TKT-9008", subject: "Cannot add new branch — license error", organization: "QuickServe DMV", priority: "high", status: "in_progress", agent: "Sven", createdAt: "2026-04-23 17:50" },
  { id: "TKT-9007", subject: "Webhook signature verification failing", organization: "Skyline Banking Hub", priority: "medium", status: "open", agent: "—", createdAt: "2026-04-23 14:18" },
];

const STATS = [
  { label: "Open tickets", value: "12", icon: "alert-circle" as const, tone: "#EF4444" },
  { label: "In progress", value: "8", icon: "loader" as const, tone: "#F59E0B" },
  { label: "Resolved this week", value: "47", icon: "check-circle" as const, tone: "#10B981" },
  { label: "Avg first response", value: "1h 12m", icon: "clock" as const, tone: "#3B82F6" },
];

export default function TechSupportScreen() {
  const { theme } = useTheme();

  const cols: Column<Ticket>[] = [
    { key: "id", label: "Ticket", flex: 0.9 },
    { key: "subject", label: "Subject", flex: 2, render: (r) => (
      <ThemedText style={{ color: theme.text, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>{r.subject}</ThemedText>
    ) },
    { key: "organization", label: "Organization", flex: 1.2 },
    { key: "priority", label: "Priority", flex: 0.9, render: (r) => (
      <StatusPill label={r.priority} tone={r.priority === "urgent" || r.priority === "high" ? "error" : r.priority === "medium" ? "warning" : "neutral"} />
    ) },
    { key: "status", label: "Status", flex: 1, render: (r) => (
      <StatusPill label={r.status.replace("_", " ")} tone={r.status === "resolved" ? "success" : r.status === "open" ? "error" : r.status === "in_progress" ? "info" : "warning"} />
    ) },
    { key: "agent", label: "Agent", flex: 0.8 },
    { key: "createdAt", label: "Created", flex: 1.1 },
  ];

  return (
    <View style={[styles.root, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.content}>
        <PageHeader
          title="Tech Support"
          subtitle="Customer support tickets across organizations"
          actions={[{ label: "New Ticket", icon: "plus" }]}
        />

        <View style={styles.statsRow}>
          {STATS.map((s) => (
            <SuperCard key={s.label} style={{ flex: 1, minWidth: 200 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.md }}>
                <View style={[styles.iconCircle, { backgroundColor: s.tone + "1A" }]}>
                  <Feather name={s.icon} size={18} color={s.tone} />
                </View>
                <View>
                  <ThemedText style={{ color: theme.mutedText, fontSize: 11, fontWeight: "600" }}>{s.label}</ThemedText>
                  <ThemedText style={{ color: theme.text, fontSize: 20, fontWeight: "700", marginTop: 4 }}>{s.value}</ThemedText>
                </View>
              </View>
            </SuperCard>
          ))}
        </View>

        <View style={{ height: Spacing.xl }} />

        <DataTable<Ticket>
          columns={cols}
          rows={TICKETS}
          searchKeys={["id", "subject", "organization", "agent"]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: Spacing.xl },
  content: { width: "100%", maxWidth: 1280, alignSelf: "center" },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.lg },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
