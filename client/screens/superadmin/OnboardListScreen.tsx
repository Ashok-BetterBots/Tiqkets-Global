import React from "react";
import { View, StyleSheet } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { DataTable, StatusPill, Column } from "./_components/DataTable";

interface Row {
  id: string;
  organization: string;
  contact: string;
  industry: string;
  appliedOn: string;
  stage: "Submitted" | "Verifying" | "Approved" | "Rejected";
}

const ROWS: Row[] = [
  { id: "ON-2041", organization: "Helix Medical Center", contact: "ops@helixmed.com", industry: "Healthcare", appliedOn: "2026-04-22", stage: "Verifying" },
  { id: "ON-2042", organization: "Pacific Visa Services", contact: "hello@pacvisa.com", industry: "Government", appliedOn: "2026-04-22", stage: "Approved" },
  { id: "ON-2043", organization: "Vela Auto Workshop", contact: "team@velaauto.com", industry: "Automotive", appliedOn: "2026-04-21", stage: "Submitted" },
  { id: "ON-2044", organization: "BrightSmile Dental", contact: "front@brightsmile.io", industry: "Healthcare", appliedOn: "2026-04-21", stage: "Approved" },
  { id: "ON-2045", organization: "Northstar Notary", contact: "ops@northstar.law", industry: "Legal", appliedOn: "2026-04-20", stage: "Rejected" },
  { id: "ON-2046", organization: "Coastal Coffee Co", contact: "owner@coastalcoffee.cc", industry: "F&B", appliedOn: "2026-04-19", stage: "Verifying" },
  { id: "ON-2047", organization: "Skyline Banking Hub", contact: "bizops@skyline.bank", industry: "Banking", appliedOn: "2026-04-18", stage: "Approved" },
];

export default function OnboardListScreen() {
  const { theme } = useTheme();
  const cols: Column<Row>[] = [
    { key: "id", label: "Application", flex: 1 },
    { key: "organization", label: "Organization", flex: 1.6 },
    { key: "contact", label: "Contact", flex: 1.4 },
    { key: "industry", label: "Industry", flex: 1 },
    { key: "appliedOn", label: "Applied", flex: 1 },
    { key: "stage", label: "Stage", flex: 1, render: (r) => (
      <StatusPill
        label={r.stage}
        tone={r.stage === "Approved" ? "success" : r.stage === "Verifying" ? "info" : r.stage === "Rejected" ? "error" : "warning"}
      />
    ) },
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
        <DataTable<Row>
          columns={cols}
          rows={ROWS}
          searchKeys={["organization", "contact", "industry"]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: Spacing.xl },
  content: { width: "100%", maxWidth: 1280, alignSelf: "center" },
});
