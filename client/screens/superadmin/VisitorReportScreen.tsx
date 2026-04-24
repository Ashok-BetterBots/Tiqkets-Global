import React from "react";
import { View, StyleSheet } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { DataTable, Column } from "./_components/DataTable";
import { SuperCard } from "./_components/SuperCard";
import { ThemedText } from "@/components/ThemedText";
import { Feather } from "@expo/vector-icons";

interface Row {
  id: string;
  organization: string;
  branch: string;
  visitors: number;
  served: number;
  avgWait: string;
  satisfaction: string;
}

const ROWS: Row[] = [
  { id: "V01", organization: "Swift Bank", branch: "Marina Walk", visitors: 384, served: 362, avgWait: "6m 12s", satisfaction: "94%" },
  { id: "V02", organization: "MedFirst Clinics", branch: "Orchard Road", visitors: 271, served: 268, avgWait: "11m 04s", satisfaction: "91%" },
  { id: "V03", organization: "QuickServe DMV", branch: "Bandra West", visitors: 612, served: 590, avgWait: "8m 30s", satisfaction: "88%" },
  { id: "V04", organization: "Dubai Tax Office", branch: "Deira", visitors: 902, served: 884, avgWait: "13m 22s", satisfaction: "82%" },
  { id: "V05", organization: "London Dental Group", branch: "Soho", visitors: 144, served: 142, avgWait: "4m 50s", satisfaction: "97%" },
  { id: "V06", organization: "Tokyo Wellness", branch: "Shibuya", visitors: 198, served: 191, avgWait: "5m 41s", satisfaction: "95%" },
];

const SUMMARY = [
  { label: "Visitors today", value: "12,482", icon: "users" as const, tone: "#8c1867" },
  { label: "Served today", value: "11,920", icon: "check-circle" as const, tone: "#10B981" },
  { label: "Avg wait time", value: "8m 41s", icon: "clock" as const, tone: "#F59E0B" },
  { label: "Satisfaction", value: "92%", icon: "smile" as const, tone: "#3B82F6" },
];

export default function VisitorReportScreen() {
  const { theme } = useTheme();

  const cols: Column<Row>[] = [
    { key: "organization", label: "Organization", flex: 1.4 },
    { key: "branch", label: "Branch", flex: 1.2 },
    { key: "visitors", label: "Visitors", flex: 0.8, align: "right" },
    { key: "served", label: "Served", flex: 0.8, align: "right" },
    { key: "avgWait", label: "Avg Wait", flex: 1, align: "right" },
    { key: "satisfaction", label: "Satisfaction", flex: 1, align: "right" },
  ];

  return (
    <View style={[styles.root, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.content}>
        <PageHeader
          title="Visitor Report"
          subtitle="Cross-organization visitor and service metrics"
          actions={[{ label: "Export PDF", icon: "download", variant: "secondary" }]}
        />

        <View style={styles.summaryRow}>
          {SUMMARY.map((s) => (
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

        <DataTable<Row>
          columns={cols}
          rows={ROWS}
          searchKeys={["organization", "branch"]}
        />
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
});
