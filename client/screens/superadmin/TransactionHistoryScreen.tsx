import React from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { DataTable, StatusPill, Column } from "./_components/DataTable";
import { ThemedText } from "@/components/ThemedText";
import { formatMoney } from "./_utils/format";

interface TxnApi {
  id: string;
  organizationId: string;
  organizationName: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string | null;
  invoiceNumber: string | null;
  razorpayPaymentId: string | null;
  createdAt: string;
  paidAt: string | null;
}

interface Row {
  id: string;
  shortId: string;
  date: string;
  organization: string;
  description: string;
  method: string;
  amount: string;
  rawAmount: number;
  status: "completed" | "refunded" | "failed" | "pending";
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function methodLabel(m: string | null): string {
  if (!m) return "—";
  return m
    .split(/[_\s-]+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

function txnStatus(s: string): Row["status"] {
  if (s === "completed" || s === "succeeded" || s === "paid" || s === "captured") return "completed";
  if (s === "refunded" || s === "partially_refunded") return "refunded";
  if (s === "failed") return "failed";
  return "pending";
}

export default function TransactionHistoryScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError } = useQuery<{ transactions: TxnApi[] }>({
    queryKey: ["/api/superadmin/transactions"],
  });

  const rows: Row[] = (data?.transactions ?? []).map((t) => {
    const status = txnStatus(t.status);
    const sign = status === "refunded" ? -1 : 1;
    return {
      id: t.id,
      shortId: t.invoiceNumber || `TXN-${t.id.slice(0, 8).toUpperCase()}`,
      date: fmtDateTime(t.paidAt || t.createdAt),
      organization: t.organizationName || "—",
      description: t.invoiceNumber ? `Invoice ${t.invoiceNumber}` : "Subscription payment",
      method: methodLabel(t.paymentMethod),
      amount: `${sign < 0 ? "-" : ""}${formatMoney(Math.abs(t.amount), t.currency)}`,
      rawAmount: sign * t.amount,
      status,
    };
  });

  const cols: Column<Row>[] = [
    { key: "shortId", label: "Txn ID", flex: 1.1 },
    { key: "date", label: "Date", flex: 1.1 },
    { key: "organization", label: "Organization", flex: 1.3 },
    { key: "description", label: "Description", flex: 1.4 },
    { key: "method", label: "Method", flex: 1 },
    {
      key: "amount",
      label: "Amount",
      flex: 0.9,
      align: "right",
      render: (r) => (
        <ThemedText
          style={{
            color: r.amount.startsWith("-") ? "#EF4444" : theme.text,
            fontSize: 13,
            fontWeight: "700",
          }}
        >
          {r.amount}
        </ThemedText>
      ),
    },
    {
      key: "status",
      label: "Status",
      flex: 0.9,
      render: (r) => (
        <StatusPill
          label={r.status}
          tone={
            r.status === "completed"
              ? "success"
              : r.status === "refunded"
              ? "warning"
              : r.status === "pending"
              ? "info"
              : "error"
          }
        />
      ),
    },
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
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.text} />
          </View>
        ) : (
          <DataTable<Row>
            columns={cols}
            rows={rows}
            searchKeys={["shortId", "organization", "description", "method"]}
            emptyText={isError ? "Failed to load transactions" : "No transactions yet"}
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
