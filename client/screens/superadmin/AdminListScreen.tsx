import React from "react";
import { View, StyleSheet } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { DataTable, StatusPill, Column } from "./_components/DataTable";
import { ThemedText } from "@/components/ThemedText";

interface AdminRow {
  id: string;
  name: string;
  email: string;
  organization: string;
  role: string;
  status: "active" | "suspended" | "pending";
  lastLogin: string;
}

const ROWS: AdminRow[] = [
  { id: "A001", name: "Aisha Khan", email: "aisha@swiftbank.ae", organization: "Swift Bank", role: "Owner", status: "active", lastLogin: "2026-04-23 14:22" },
  { id: "A002", name: "Marcus Chen", email: "marcus@medfirst.sg", organization: "MedFirst Clinics", role: "Owner", status: "active", lastLogin: "2026-04-24 09:11" },
  { id: "A003", name: "Priya Sharma", email: "priya@quickserve.in", organization: "QuickServe DMV", role: "Admin", status: "active", lastLogin: "2026-04-22 18:45" },
  { id: "A004", name: "Liam O'Connor", email: "liam@dublincars.ie", organization: "Dublin Cars", role: "Admin", status: "suspended", lastLogin: "2026-04-12 10:08" },
  { id: "A005", name: "Sara Yamamoto", email: "sara@tokyowellness.jp", organization: "Tokyo Wellness", role: "Owner", status: "active", lastLogin: "2026-04-24 07:50" },
  { id: "A006", name: "David Müller", email: "david@berlinpost.de", organization: "Berlin Post Hub", role: "Admin", status: "pending", lastLogin: "—" },
  { id: "A007", name: "Fatima Al-Mansouri", email: "fatima@dubaitax.ae", organization: "Dubai Tax Office", role: "Owner", status: "active", lastLogin: "2026-04-23 22:01" },
  { id: "A008", name: "James Wilson", email: "james@londondental.uk", organization: "London Dental Group", role: "Admin", status: "active", lastLogin: "2026-04-21 11:34" },
];

export default function AdminListScreen() {
  const { theme } = useTheme();
  const cols: Column<AdminRow>[] = [
    { key: "id", label: "Admin ID", flex: 1 },
    { key: "name", label: "Name", flex: 1.4, render: (r) => (
      <View>
        <ThemedText style={[styles.primary, { color: theme.text }]}>{r.name}</ThemedText>
        <ThemedText style={[styles.secondary, { color: theme.mutedText }]}>{r.email}</ThemedText>
      </View>
    ) },
    { key: "organization", label: "Organization", flex: 1.4 },
    { key: "role", label: "Role", flex: 0.8 },
    { key: "status", label: "Status", flex: 0.9, render: (r) => (
      <StatusPill
        label={r.status}
        tone={r.status === "active" ? "success" : r.status === "pending" ? "warning" : "error"}
      />
    ) },
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
        <DataTable<AdminRow>
          columns={cols}
          rows={ROWS}
          searchKeys={["name", "email", "organization", "role"]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: Spacing.xl },
  content: { width: "100%", maxWidth: 1280, alignSelf: "center" },
  primary: { fontSize: 13, fontWeight: "600" },
  secondary: { fontSize: 11, marginTop: 2 },
});
