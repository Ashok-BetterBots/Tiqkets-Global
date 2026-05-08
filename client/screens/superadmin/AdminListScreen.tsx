import React from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { DataTable, StatusPill, Column } from "./_components/DataTable";
import { ThemedText } from "@/components/ThemedText";

interface AdminApi {
  id: string;
  name: string;
  email: string;
  organizationName: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface AdminRow {
  id: string;
  shortId: string;
  name: string;
  email: string;
  organization: string;
  role: string;
  status: "active" | "suspended" | "pending";
  lastLogin: string;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function roleLabel(role: string): string {
  if (!role) return "Staff";
  return role
    .split(/[_\s-]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

export default function AdminListScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError } = useQuery<{ admins: AdminApi[] }>({
    queryKey: ["/api/superadmin/admins"],
  });

  const rows: AdminRow[] = (data?.admins ?? []).map((a) => ({
    id: a.id,
    shortId: a.id.slice(0, 8).toUpperCase(),
    name: a.name,
    email: a.email,
    organization: a.organizationName || "—",
    role: roleLabel(a.role),
    status: !a.isActive ? "suspended" : a.lastLoginAt ? "active" : "pending",
    lastLogin: fmtDateTime(a.lastLoginAt),
  }));

  const cols: Column<AdminRow>[] = [
    { key: "shortId", label: "Admin ID", flex: 1 },
    {
      key: "name",
      label: "Name",
      flex: 1.4,
      render: (r) => (
        <View>
          <ThemedText style={[styles.primary, { color: theme.text }]}>{r.name}</ThemedText>
          <ThemedText style={[styles.secondary, { color: theme.mutedText }]}>{r.email}</ThemedText>
        </View>
      ),
    },
    { key: "organization", label: "Organization", flex: 1.4 },
    { key: "role", label: "Role", flex: 0.8 },
    {
      key: "status",
      label: "Status",
      flex: 0.9,
      render: (r) => (
        <StatusPill
          label={r.status}
          tone={r.status === "active" ? "success" : r.status === "pending" ? "warning" : "error"}
        />
      ),
    },
    { key: "lastLogin", label: "Last Login", flex: 1.2 },
  ];

  return (
    <View style={[styles.root, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.content}>
        <PageHeader
          title="Admin List"
          subtitle="All organization owners and admins on the TIQKETS platform"
          actions={[
            { label: "Export", icon: "download", variant: "secondary" },
            { label: "Invite Admin", icon: "user-plus" },
          ]}
        />
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.text} />
          </View>
        ) : (
          <DataTable<AdminRow>
            columns={cols}
            rows={rows}
            searchKeys={["name", "email", "organization", "role"]}
            emptyText={isError ? "Failed to load admins" : "No admins found"}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: Spacing.xl },
  content: { width: "100%", maxWidth: 1280, alignSelf: "center" },
  primary: { fontSize: 13, fontWeight: "600" },
  secondary: { fontSize: 11, marginTop: 2 },
  loading: { padding: Spacing["3xl"], alignItems: "center" },
});
