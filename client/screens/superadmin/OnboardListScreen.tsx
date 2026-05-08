import React from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { DataTable, StatusPill, Column } from "./_components/DataTable";

interface OrgApi {
  id: string;
  name: string;
  email: string;
  category: string | null;
  city: string | null;
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
  branchCount: number;
  userCount: number;
  subscriptionStatus: string | null;
  planName: string | null;
}

interface Row {
  id: string;
  applicationId: string;
  organization: string;
  contact: string;
  industry: string;
  appliedOn: string;
  stage: "Submitted" | "Verifying" | "Approved" | "Suspended";
}

function industryLabel(c: string | null): string {
  if (!c) return "—";
  return c
    .split(/[_\s-]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

export default function OnboardListScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError } = useQuery<{ organizations: OrgApi[] }>({
    queryKey: ["/api/superadmin/organizations"],
  });

  const rows: Row[] = (data?.organizations ?? []).map((o) => {
    const stage: Row["stage"] = !o.isActive
      ? "Suspended"
      : o.isVerified && o.subscriptionStatus
      ? "Approved"
      : o.isVerified
      ? "Verifying"
      : "Submitted";
    return {
      id: o.id,
      applicationId: `ON-${o.id.slice(0, 6).toUpperCase()}`,
      organization: o.name,
      contact: o.email,
      industry: industryLabel(o.category),
      appliedOn: fmtDate(o.createdAt),
      stage,
    };
  });

  const cols: Column<Row>[] = [
    { key: "applicationId", label: "Application", flex: 1 },
    { key: "organization", label: "Organization", flex: 1.6 },
    { key: "contact", label: "Contact", flex: 1.4 },
    { key: "industry", label: "Industry", flex: 1 },
    { key: "appliedOn", label: "Applied", flex: 1 },
    {
      key: "stage",
      label: "Stage",
      flex: 1,
      render: (r) => (
        <StatusPill
          label={r.stage}
          tone={
            r.stage === "Approved"
              ? "success"
              : r.stage === "Verifying"
              ? "info"
              : r.stage === "Suspended"
              ? "error"
              : "warning"
          }
        />
      ),
    },
  ];

  return (
    <View style={[styles.root, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.content}>
        <PageHeader
          title="Onboarding List"
          subtitle="Organizations applying to join TIQKETS"
          actions={[
            { label: "Filter", icon: "filter", variant: "secondary" },
            { label: "Approve Pending", icon: "check-circle" },
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
            searchKeys={["organization", "contact", "industry"]}
            emptyText={isError ? "Failed to load organizations" : "No organizations yet"}
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
