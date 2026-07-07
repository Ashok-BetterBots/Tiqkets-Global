import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";

interface RegResult {
  id: string;
  customerName: string;
  customerPhone: string;
  bookingId: string;
  status: string;
  slotDate: string;
  slotTime: string;
  familyMembersCount: number;
  amountPaid: number;
  eventName?: string;
  qrToken?: string;
}

function fmtPaise(p: number | null | undefined): string {
  const v = (p || 0) / 100;
  return `\u20B9${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const STATUS_COLORS: Record<string, string> = {
  ticket_generated: "#8B5CF6",
  arrived: "#3B82F6",
  checked_in: "#10B981",
  exited: "#6B7280",
  feedback_submitted: "#6B7280",
  payment_completed: "#F59E0B",
  registration_started: "#9CA3AF",
};

function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#9CA3AF";
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <View style={[styles.statusPill, { backgroundColor: color + "20", borderColor: color + "44" }]}>
      <ThemedText type="small" style={{ color, fontWeight: "700" }}>{label}</ThemedText>
    </View>
  );
}

async function fetchJson(path: string): Promise<any> {
  const res = await fetch(new URL(path, getApiUrl()), { credentials: "include" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    let b: any = null;
    try { b = JSON.parse(t); } catch {}
    const err: any = new Error(b?.error || `Request failed (${res.status})`);
    throw err;
  }
  return res.json();
}

export default function EventSupportScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RegResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RegResult | null>(null);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setSelected(null);
    setSearched(false);
    try {
      const q = encodeURIComponent(query.trim());
      const data = await fetchJson(`/api/dashboard/events/support/lookup?q=${q}&t=${Date.now()}`);
      const regs: RegResult[] = data.results || [];
      setResults(regs);
      setSearched(true);
      if (regs.length === 1) setSelected(regs[0]);
    } catch (e: any) {
      setError(e?.message || "Search failed");
    } finally {
      setLoading(false);
    }
  }, [query]);

  const handleResend = useCallback(async () => {
    if (!selected) return;
    setResending(true);
    setResendSuccess(false);
    try {
      await apiRequest("POST", "/api/dashboard/events/support/resend-ticket", {
        registrationId: selected.id,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 3000);
    } catch (e: any) {
      setError(e?.message || "Resend failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setResending(false);
    }
  }, [selected]);

  const handleClear = useCallback(() => {
    setQuery("");
    setResults([]);
    setSelected(null);
    setSearched(false);
    setError(null);
    setResendSuccess(false);
  }, []);

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + Spacing.lg, paddingBottom: tabBarHeight + Spacing["2xl"] },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Search bar */}
        <View style={[styles.searchCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.searchRow}>
            <Feather name="search" size={18} color={theme.textSecondary} style={{ marginRight: Spacing.sm }} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Booking ID, phone, or name"
              placeholderTextColor={theme.textSecondary}
              style={[styles.searchInput, { color: theme.text }]}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
              testID="input-support-search"
            />
            {query.length > 0 ? (
              <Pressable onPress={handleClear} hitSlop={10} testID="button-support-clear">
                <Feather name="x" size={18} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>
          <Button
            onPress={handleSearch}
            loading={loading}
            disabled={!query.trim()}
            style={styles.searchBtn}
            testID="button-support-search"
          >
            Search
          </Button>
        </View>

        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: "#EF444418", borderColor: "#EF444433" }]}>
            <Feather name="alert-circle" size={15} color="#EF4444" />
            <ThemedText type="small" style={{ color: "#EF4444", flex: 1 }}>{error}</ThemedText>
          </View>
        ) : null}

        {/* Results list (multiple matches) */}
        {searched && !selected && results.length > 1 ? (
          <>
            <ThemedText type="body" style={{ fontWeight: "600", marginBottom: Spacing.sm, color: theme.textSecondary }}>
              {results.length} results found — tap to view
            </ThemedText>
            {results.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => setSelected(r)}
                style={[styles.resultRow, { backgroundColor: theme.surface, borderColor: theme.border }]}
                testID={`result-${r.bookingId}`}
              >
                <View style={{ flex: 1 }}>
                  <ThemedText type="body" style={{ fontWeight: "600" }}>{r.customerName}</ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>{r.bookingId}</ThemedText>
                  {r.eventName ? <ThemedText type="small" style={{ color: theme.textSecondary }}>{r.eventName}</ThemedText> : null}
                </View>
                <StatusPill status={r.status} />
                <Feather name="chevron-right" size={16} color={theme.textSecondary} />
              </Pressable>
            ))}
          </>
        ) : null}

        {searched && !loading && results.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Feather name="inbox" size={40} color={theme.textSecondary} />
            <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md, textAlign: "center" }}>
              No registrations found for "{query}"
            </ThemedText>
          </View>
        ) : null}

        {/* Detailed view for selected registration */}
        {selected ? (
          <>
            {results.length > 1 ? (
              <Pressable onPress={() => setSelected(null)} style={styles.backLink}>
                <Feather name="chevron-left" size={16} color={theme.primary} />
                <ThemedText type="body" style={{ color: theme.primary }}>Back to results</ThemedText>
              </Pressable>
            ) : null}

            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.avatar, { backgroundColor: theme.primary + "20" }]}>
                  <Feather name="user" size={22} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText type="h4">{selected.customerName}</ThemedText>
                  {selected.eventName ? (
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>{selected.eventName}</ThemedText>
                  ) : null}
                </View>
                <StatusPill status={selected.status} />
              </View>

              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              <InfoRow label="Booking ID" value={selected.bookingId} mono />
              <InfoRow label="Phone" value={selected.customerPhone} />
              <InfoRow label="Slot Date" value={selected.slotDate} />
              <InfoRow label="Slot Time" value={selected.slotTime} />
              <InfoRow label="Guests" value={String(1 + (selected.familyMembersCount || 0))} />
              <InfoRow label="Advance Paid" value={fmtPaise(selected.amountPaid)} />
            </View>

            {/* Resend ticket */}
            {selected.qrToken ? (
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.sectionRow}>
                  <Feather name="send" size={16} color={theme.primary} />
                  <ThemedText type="body" style={{ fontWeight: "600", marginLeft: Spacing.sm }}>
                    Resend Ticket
                  </ThemedText>
                </View>
                <ThemedText type="small" style={{ color: theme.textSecondary, marginBottom: Spacing.md }}>
                  Sends the QR boarding pass to the customer's WhatsApp number again.
                </ThemedText>
                {resendSuccess ? (
                  <View style={[styles.successBadge, { backgroundColor: "#10B98115", borderColor: "#10B98133" }]}>
                    <Feather name="check-circle" size={14} color="#10B981" />
                    <ThemedText type="small" style={{ color: "#10B981", fontWeight: "600" }}>Ticket sent!</ThemedText>
                  </View>
                ) : (
                  <Button onPress={handleResend} loading={resending} variant="outline" testID="button-resend-ticket">
                    Resend WhatsApp Ticket
                  </Button>
                )}
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={styles.infoRow}>
      <ThemedText type="small" style={{ color: theme.textSecondary, flex: 1 }}>{label}</ThemedText>
      <ThemedText
        type="body"
        style={{ fontWeight: "600", fontFamily: mono ? Platform.OS === "ios" ? "Courier" : "monospace" : undefined }}
        numberOfLines={1}
      >
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.lg },
  searchCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  searchRow: { flexDirection: "row", alignItems: "center" },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: Platform.OS === "ios" ? 2 : 0 },
  searchBtn: {},
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.sm,
  },
  emptyWrap: { alignItems: "center", marginTop: Spacing["4xl"] },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.xs },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionRow: { flexDirection: "row", alignItems: "center", marginBottom: Spacing.xs },
  successBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
});
