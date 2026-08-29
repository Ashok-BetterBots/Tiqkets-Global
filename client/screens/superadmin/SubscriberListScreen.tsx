import React from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { DataTable, StatusPill, Column } from "./_components/DataTable";
import { ThemedText } from "@/components/ThemedText";

interface SubscriberApi {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationEmail: string;
  planName: string | null;
  status: string;
  billingCycle: string;
  currentPeriodEnd: string | null;
  trialEndDate: string | null;
  createdAt: string;
}

interface OrgApi {
  id: string;
  branchCount: number;
}

interface Row {
  id: string;
  organization: string;
  plan: string;
  branches: number;
  cycle: string;
  renewsOn: string;
  status: string;
  statusTone: "success" | "warning" | "error" | "neutral";
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function statusTone(s: string): Row["statusTone"] {
  switch (s) {
    case "active":
      return "success";
    case "trialing":
      return "warning";
    case "past_due":
    case "expired":
      return "error";
    case "cancelled":
      return "neutral";
    default:
      return "neutral";
  }
}

export default function SubscriberListScreen() {
  const { theme } = useTheme();
  const { data: subsData, isLoading, isError } = useQuery<{ subscribers: SubscriberApi[] }>({
    queryKey: ["/api/superadmin/subscribers"],
  });
  const { data: orgsData } = useQuery<{ organizations: OrgApi[] }>({
    queryKey: ["/api/superadmin/organizations"],
  });

  const branchCountByOrg = new Map<string, number>(
    (orgsData?.organizations ?? []).map((o) => [o.id, o.branchCount]),
  );

  const rows: Row[] = (subsData?.subscribers ?? []).map((s) => {
    const renewIso = s.status === "trialing" ? s.trialEndDate : s.currentPeriodEnd;
    const statusLabel = s.status.replace(/_/g, " ");
    return {
      id: s.id,
      organization: s.organizationName || s.organizationEmail || "—",
      plan: s.planName || "—",
      branches: branchCountByOrg.get(s.organizationId) ?? 0,
      cycle: s.billingCycle,
      renewsOn: fmtDate(renewIso),
      status: statusLabel,
      statusTone: statusTone(s.status),
    };
  });

  const cols: Column<Row>[] = [
    { key: "organization", label: "Organization", flex: 1.4 },
    {
      key: "plan",
      label: "Plan",
      flex: 1,
      render: (r) => <StatusPill label={r.plan} tone={r.plan === "—" ? "neutral" : "info"} />,
    },
    { key: "branches", label: "Branches", flex: 0.7, align: "right" },
    {
      key: "cycle",
      label: "Cycle",
      flex: 0.8,
      render: (r) => (
        <ThemedText style={{ color: theme.text, fontSize: 13 }}>{r.cycle || "—"}</ThemedText>
      ),
    },
    { key: "renewsOn", label: "Renews", flex: 1 },
    {
      key: "status",
      label: "Status",
      flex: 0.9,
      render: (r) => <StatusPill label={r.status} tone={r.statusTone} />,
    },
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
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.text} />
          </View>
        ) : (
          <DataTable<Row>
            columns={cols}
            rows={rows}
            searchKeys={["organization", "plan"]}
            emptyText={isError ? "Failed to load subscribers" : "No subscriptions yet"}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: Spacing.xl },
  content: { width: "100%", maxWidth: 1280, alignSelf: "center" },
  loading: { padding: Spacing["3xl"], alignItems: "center" },
});
