import React from "react";
import { View, StyleSheet } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { DataTable, StatusPill, Column } from "./_components/DataTable";
import { ThemedText } from "@/components/ThemedText";

interface Row {
  id: string;
  organization: string;
  plan: "Starter" | "Growth" | "Enterprise" | "Trial";
  branches: number;
  mrr: string;
  renewsOn: string;
  status: "active" | "past_due" | "trial" | "cancelled";
}

const ROWS: Row[] = [
  { id: "S001", organization: "Swift Bank", plan: "Enterprise", branches: 18, mrr: "$2,400", renewsOn: "2026-05-12", status: "active" },
  { id: "S002", organization: "MedFirst Clinics", plan: "Growth", branches: 6, mrr: "$840", renewsOn: "2026-05-04", status: "active" },
  { id: "S003", organization: "QuickServe DMV", plan: "Enterprise", branches: 32, mrr: "$3,600", renewsOn: "2026-05-22", status: "active" },
  { id: "S004", organization: "Dublin Cars", plan: "Starter", branches: 1, mrr: "$49", renewsOn: "2026-05-01", status: "past_due" },
  { id: "S005", organization: "Tokyo Wellness", plan: "Growth", branches: 4, mrr: "$560", renewsOn: "2026-05-19", status: "active" },
  { id: "S006", organization: "BrightSmile Dental", plan: "Trial", branches: 1, mrr: "$0", renewsOn: "2026-05-03", status: "trial" },
  { id: "S007", organization: "Berlin Post Hub", plan: "Growth", branches: 8, mrr: "$1,120", renewsOn: "2026-05-08", status: "active" },
  { id: "S008", organization: "Vela Auto Workshop", plan: "Starter", branches: 1, mrr: "$49", renewsOn: "2026-04-30", status: "cancelled" },
];

export default function SubscriberListScreen() {
  const { theme } = useTheme();

  const cols: Column<Row>[] = [
    { key: "organization", label: "Organization", flex: 1.4 },
    { key: "plan", label: "Plan", flex: 0.9, render: (r) => (
      <StatusPill label={r.plan} tone={r.plan === "Enterprise" ? "info" : r.plan === "Growth" ? "success" : r.plan === "Trial" ? "warning" : "neutral"} />
    ) },
    { key: "branches", label: "Branches", flex: 0.7, align: "right" },
    { key: "mrr", label: "MRR", flex: 0.8, align: "right", render: (r) => (
      <ThemedText style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>{r.mrr}</ThemedText>
    ) },
    { key: "renewsOn", label: "Renews", flex: 1 },
    { key: "status", label: "Status", flex: 0.9, render: (r) => (
      <StatusPill
        label={r.status.replace("_", " ")}
        tone={r.status === "active" ? "success" : r.status === "past_due" ? "error" : r.status === "trial" ? "warning" : "neutral"}
      />
    ) },
  ];

  return (
    <View style={[styles.root, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.content}>
        <PageHeader
          title="Subscribers"
          subtitle="All paying and trial organizations"
          actions={[
            { label: "Export", icon: "download", variant: "secondary" },
            { label: "Add Subscription", icon: "plus" },
          ]}
        />
        <DataTable<Row>
          columns={cols}
          rows={ROWS}
          searchKeys={["organization", "plan"]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: Spacing.xl },
  content: { width: "100%", maxWidth: 1280, alignSelf: "center" },
});
