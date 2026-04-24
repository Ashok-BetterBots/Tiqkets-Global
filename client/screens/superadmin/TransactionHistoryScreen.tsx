import React from "react";
import { View, StyleSheet } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { DataTable, StatusPill, Column } from "./_components/DataTable";
import { ThemedText } from "@/components/ThemedText";

interface Row {
  id: string;
  date: string;
  organization: string;
  description: string;
  method: string;
  amount: string;
  status: "completed" | "refunded" | "failed";
}

const ROWS: Row[] = [
  { id: "TXN-21041", date: "2026-04-24 09:12", organization: "Swift Bank", description: "Enterprise plan renewal", method: "Credit Card", amount: "$2,400.00", status: "completed" },
  { id: "TXN-21040", date: "2026-04-23 22:30", organization: "MedFirst Clinics", description: "Growth plan renewal", method: "Bank Transfer", amount: "$840.00", status: "completed" },
  { id: "TXN-21039", date: "2026-04-23 18:01", organization: "QuickServe DMV", description: "Add-on: Extra branches", method: "Credit Card", amount: "$240.00", status: "completed" },
  { id: "TXN-21038", date: "2026-04-23 14:55", organization: "Dublin Cars", description: "Starter plan renewal", method: "Credit Card", amount: "$49.00", status: "failed" },
  { id: "TXN-21037", date: "2026-04-22 11:40", organization: "London Dental", description: "Growth plan renewal", method: "PayPal", amount: "$840.00", status: "completed" },
  { id: "TXN-21036", date: "2026-04-22 09:14", organization: "Tokyo Wellness", description: "Refund — partial", method: "Credit Card", amount: "-$120.00", status: "refunded" },
  { id: "TXN-21035", date: "2026-04-21 16:22", organization: "Berlin Post Hub", description: "Growth plan renewal", method: "Bank Transfer", amount: "$1,120.00", status: "completed" },
];

export default function TransactionHistoryScreen() {
  const { theme } = useTheme();

  const cols: Column<Row>[] = [
    { key: "id", label: "Txn ID", flex: 1 },
    { key: "date", label: "Date", flex: 1.1 },
    { key: "organization", label: "Organization", flex: 1.3 },
    { key: "description", label: "Description", flex: 1.4 },
    { key: "method", label: "Method", flex: 1 },
    { key: "amount", label: "Amount", flex: 0.9, align: "right", render: (r) => (
      <ThemedText
        style={{
          color: r.amount.startsWith("-") ? "#EF4444" : theme.text,
          fontSize: 13,
          fontWeight: "700",
        }}
      >
        {r.amount}
      </ThemedText>
    ) },
    { key: "status", label: "Status", flex: 0.9, render: (r) => (
      <StatusPill
        label={r.status}
        tone={r.status === "completed" ? "success" : r.status === "refunded" ? "warning" : "error"}
      />
    ) },
  ];

  return (
    <View style={[styles.root, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.content}>
        <PageHeader
          title="Transaction History"
          subtitle="All payment activity across the platform"
          actions={[
            { label: "Export CSV", icon: "download", variant: "secondary" },
            { label: "Reconcile", icon: "check-square" },
          ]}
        />
        <DataTable<Row>
          columns={cols}
          rows={ROWS}
          searchKeys={["id", "organization", "description", "method"]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: Spacing.xl },
  content: { width: "100%", maxWidth: 1280, alignSelf: "center" },
});
