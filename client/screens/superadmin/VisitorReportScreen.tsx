import React from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { DataTable, Column } from "./_components/DataTable";
import { SuperCard } from "./_components/SuperCard";
import { ThemedText } from "@/components/ThemedText";
import { Feather } from "@expo/vector-icons";
import { formatWaitSeconds } from "./_utils/format";

interface VisitorRow {
  orgId: string;
  org: string;
  city: string;
  visitors: number;
  avgWaitSeconds: number;
  noShowRate: number;
}
interface VisitorApi {
  stats: {
    totalVisitors: number;
    totalVisitorsPrev: number;
    avgDaily: number;
    avgWaitSeconds: number;
    avgWaitSecondsPrev: number;
    noShowRate: number;
    noShowRatePrev: number;
  };
  rows: VisitorRow[];
}

interface Row {
  id: string;
  organization: string;
  city: string;
  visitors: number;
  avgWait: string;
  noShowRate: string;
}

export default function VisitorReportScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError } = useQuery<VisitorApi>({
    queryKey: ["/api/superadmin/visitors"],
  });

  const stats = data?.stats;
  const rows: Row[] = (data?.rows ?? []).map((r) => ({
    id: r.orgId,
    organization: r.org,
    city: r.city || "—",
    visitors: r.visitors,
    avgWait: formatWaitSeconds(r.avgWaitSeconds),
    noShowRate: `${r.noShowRate.toFixed(1)}%`,
  }));

  const summary = [
    {
      label: "Visitors (30d)",
      value: stats ? stats.totalVisitors.toLocaleString() : "—",
      icon: "users" as const,
      tone: "#8c1867",
    },
    {
      label: "Avg per day",
      value: stats ? stats.avgDaily.toLocaleString() : "—",
      icon: "trending-up" as const,
      tone: "#10B981",
    },
    {
      label: "Avg wait time",
      value: stats ? formatWaitSeconds(stats.avgWaitSeconds) : "—",
      icon: "clock" as const,
      tone: "#F59E0B",
    },
    {
      label: "No-show rate",
      value: stats ? `${stats.noShowRate.toFixed(1)}%` : "—",
      icon: "user-x" as const,
      tone: "#3B82F6",
    },
  ];

  const cols: Column<Row>[] = [
    { key: "organization", label: "Organization", flex: 1.4 },
    { key: "city", label: "City", flex: 1 },
    { key: "visitors", label: "Visitors", flex: 0.8, align: "right" },
    { key: "avgWait", label: "Avg Wait", flex: 1, align: "right" },
    { key: "noShowRate", label: "No-show", flex: 1, align: "right" },
  ];

  return (
    <View style={[styles.root, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.content}>
        <PageHeader
          title="Visitor Report"
          subtitle="Cross-organization visitor and service metrics — last 30 days"
          actions={[{ label: "Export PDF", icon: "download", variant: "secondary" }]}
        />

        <View style={styles.summaryRow}>
          {summary.map((s) => (
            <SuperCard key={s.label} style={{ flex: 1, minWidth: 200 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.md }}>
                <View style={[styles.iconCircle, { backgroundColor: s.tone + "1A" }]}>
                  <Feather name={s.icon} size={18} color={s.tone} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={[styles.sumLabel, { color: theme.mutedText }]}>{s.label}</ThemedText>
                  <ThemedText style={[styles.sumValue, { color: theme.text }]}>{s.value}</ThemedText>
                </View>
              </View>
            </SuperCard>
          ))}
        </View>

        <View style={{ height: Spacing.xl }} />

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.text} />
          </View>
        ) : (
          <DataTable<Row>
            columns={cols}
            rows={rows}
            searchKeys={["organization", "city"]}
            emptyText={isError ? "Failed to load visitor report" : "No visitor activity yet"}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: Spacing.xl },
  content: { width: "100%", maxWidth: 1280, alignSelf: "center" },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.lg },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  sumLabel: { fontSize: 11, fontWeight: "600" },
  sumValue: { fontSize: 20, fontWeight: "700", marginTop: 4 },
  loading: { padding: Spacing["3xl"], alignItems: "center" },
});
