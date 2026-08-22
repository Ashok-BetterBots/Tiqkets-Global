import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { DataTable, StatusPill, Column } from "./_components/DataTable";
import { ThemedText } from "@/components/ThemedText";
import { apiRequest, getErrorMessage, queryClient } from "@/lib/query-client";
import { formatMoney } from "./_utils/format";

type Payout = {
  id: string;
  organizationName: string;
  eventName: string;
  bookingId?: string | null;
  grossAmount: number;
  netAmount: number;
  status: string;
  settlementUtr?: string | null;
  createdAt: string;
  failureReason?: string | null;
};

function statusTone(status: string): "success" | "warning" | "error" | "info" {
  if (status === "settled" || status === "completed") return "success";
  if (status === "failed") return "error";
  if (status === "reversed") return "warning";
  return "info";
}

export default function RoutePayoutsScreen() {
  const { theme } = useTheme();
  const [selected, setSelected] = useState<Payout | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const queryKey = ["/api/super-admin/route-payouts"];
  const { data, isLoading, isError } = useQuery<{ payouts: Payout[] }>({ queryKey });
  const refundMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a payout first.");
      const amount = Math.round(Number(refundAmount) * 100);
      const response = await apiRequest("POST", `/api/super-admin/route-payouts/${selected.id}/refund`, {
        amount,
        reason: refundReason,
        idempotencyKey: `admin-refund-${selected.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setSelected(null);
      setRefundAmount("");
      setRefundReason("");
    },
  });
  const columns: Column<Payout>[] = useMemo(() => [
    { key: "organizationName", label: "Organizer", flex: 1.2 },
    { key: "eventName", label: "Event", flex: 1.1 },
    { key: "bookingId", label: "Booking", flex: 0.9, render: (row) => <ThemedText type="small">{row.bookingId || "—"}</ThemedText> },
    { key: "netAmount", label: "Payout", flex: 0.8, align: "right", render: (row) => <ThemedText style={{ fontWeight: "700" }}>{formatMoney(row.netAmount, "INR")}</ThemedText> },
    { key: "status", label: "Transfer", flex: 0.8, render: (row) => <StatusPill label={row.status} tone={statusTone(row.status)} /> },
    { key: "settlementUtr", label: "Settlement", flex: 1, render: (row) => <ThemedText type="small">{row.settlementUtr || "Pending"}</ThemedText> },
    {
      key: "id",
      label: "",
      flex: 0.65,
      align: "right",
      render: (row) => (
        <Pressable
          disabled={!["completed", "settled"].includes(row.status)}
          onPress={() => { setSelected(row); setRefundAmount((row.netAmount / 100).toFixed(2)); setRefundReason(""); }}
          style={[styles.refundButton, { borderColor: theme.error, opacity: ["completed", "settled"].includes(row.status) ? 1 : 0.35 }]}
        >
          <ThemedText type="small" style={{ color: theme.error, fontWeight: "700" }}>Refund</ThemedText>
        </Pressable>
      ),
    },
  ], [theme.error]);

  return (
    <View style={[styles.root, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.content}>
        <PageHeader
          title="Event Payouts"
          subtitle="Route transfer, settlement, and refund reconciliation across organizers"
          actions={[{ label: "Refresh", icon: "refresh-cw", onPress: () => queryClient.invalidateQueries({ queryKey }) } as any]}
        />
        {selected ? (
          <View style={[styles.refundCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
            <View style={{ flex: 1 }}>
              <ThemedText type="h4">Refund {selected.bookingId || selected.eventName}</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                This refunds the customer and requests a full Route transfer reversal. The organizer cannot initiate this action.
              </ThemedText>
              <TextInput value={refundAmount} onChangeText={setRefundAmount} keyboardType="decimal-pad" placeholder="Amount in INR" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.border }]} />
              <TextInput value={refundReason} onChangeText={setRefundReason} placeholder="Required refund reason" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.border }]} />
              {refundMutation.isError ? <ThemedText type="small" style={{ color: theme.error }}>{getErrorMessage(refundMutation.error)}</ThemedText> : null}
            </View>
            <View style={styles.refundActions}>
              <Pressable onPress={() => setSelected(null)} style={[styles.cancelButton, { borderColor: theme.border }]}><ThemedText>Cancel</ThemedText></Pressable>
              <Pressable onPress={() => refundMutation.mutate()} disabled={refundMutation.isPending || !refundReason.trim()} style={[styles.confirmButton, { backgroundColor: theme.error, opacity: refundMutation.isPending || !refundReason.trim() ? 0.55 : 1 }]}>
                {refundMutation.isPending ? <ActivityIndicator color="#fff" /> : <ThemedText style={{ color: "#fff", fontWeight: "800" }}>Issue refund</ThemedText>}
              </Pressable>
            </View>
          </View>
        ) : null}
        {isLoading ? <ActivityIndicator color={theme.primary} style={{ margin: Spacing["3xl"] }} /> : (
          <DataTable<Payout>
            columns={columns}
            rows={data?.payouts || []}
            searchKeys={["organizationName", "eventName", "bookingId", "status", "settlementUtr"]}
            emptyText={isError ? "Failed to load Route payouts" : "No Route payout allocations yet"}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: Spacing.xl },
  content: { width: "100%", maxWidth: 1280, alignSelf: "center", gap: Spacing.lg },
  refundButton: { borderWidth: 1, borderRadius: BorderRadius.sm, paddingHorizontal: 10, paddingVertical: 7, alignSelf: "flex-end" },
  refundCard: { borderWidth: 1, borderRadius: BorderRadius.lg, padding: Spacing.lg, gap: Spacing.md },
  input: { borderWidth: 1, borderRadius: BorderRadius.md, minHeight: 42, paddingHorizontal: 12, marginTop: Spacing.sm },
  refundActions: { flexDirection: "row", justifyContent: "flex-end", gap: Spacing.sm },
  cancelButton: { borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: 14, paddingVertical: 10 },
  confirmButton: { borderRadius: BorderRadius.md, paddingHorizontal: 14, paddingVertical: 10, minWidth: 120, alignItems: "center" },
});