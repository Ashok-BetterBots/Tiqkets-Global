import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { apiRequest, getErrorMessage, queryClient } from "@/lib/query-client";
import { BorderRadius, Spacing } from "@/constants/theme";

type ProfileResponse = {
  profile: {
    configured: boolean;
    status: string;
    statusReason?: string | null;
    canAcceptPaidTickets: boolean;
    coolingEndsAt?: string | null;
    displayName?: string | null;
    accountReference?: string | null;
    actionRequired?: string | null;
  };
};

type HistoryResponse = {
  totals: { gross: number; transferred: number; settled: number; refunded: number; actionRequired: number };
  items: Array<{
    id: string;
    eventName: string;
    bookingId?: string | null;
    customerName: string;
    grossAmount: number;
    netAmount: number;
    refundedAmount: number;
    transferStatus: string;
    settlementStatus: string;
    settlementUtr?: string | null;
    createdAt: string;
    failureReason?: string | null;
  }>;
};

type OnboardingForm = {
  email: string;
  phone: string;
  legal_business_name: string;
  customer_facing_business_name: string;
  business_type: string;
  profile: {
    category: string;
    subcategory: string;
    business_model: string;
    addresses: { registered: { street1: string; street2: string; city: string; state: string; postal_code: string; country: string } };
  };
  legal_info: { pan: string; gst: string };
  apps: { websites: string[] };
};

const INITIAL_FORM: OnboardingForm = {
  email: "",
  phone: "",
  legal_business_name: "",
  customer_facing_business_name: "",
  business_type: "proprietorship",
  profile: {
    category: "events_and_entertainment",
    subcategory: "event_management",
    business_model: "",
    addresses: { registered: { street1: "", street2: "", city: "", state: "", postal_code: "", country: "IN" } },
  },
  legal_info: { pan: "", gst: "" },
  apps: { websites: [""] },
};

function money(paise: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format((paise || 0) / 100);
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function OrgPayoutsScreen() {
  const { theme } = useTheme();
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const [form, setForm] = useState(INITIAL_FORM);
  const profileKey = useMemo(() => ["/api/dashboard/payouts", orgId || "", "profile"], [orgId]);
  const historyKey = useMemo(() => ["/api/dashboard/payouts", orgId || "", "history"], [orgId]);
  const profileQuery = useQuery<ProfileResponse>({ queryKey: profileKey, enabled: !!orgId });
  const historyQuery = useQuery<HistoryResponse>({ queryKey: historyKey, enabled: !!orgId });
  const profile = profileQuery.data?.profile;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: profileKey });
    queryClient.invalidateQueries({ queryKey: historyKey });
  };
  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/dashboard/payouts/${orgId}/profile`, form);
      return response.json() as Promise<ProfileResponse>;
    },
    onSuccess: () => {
      invalidate();
      Alert.alert("Payout setup submitted", "Razorpay will review the account. Paid ticket checkout stays off until the account is active and its cooling period ends.");
      setForm((current) => ({ ...current, legal_info: { ...current.legal_info, pan: "", gst: "" } }));
    },
  });
  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/dashboard/payouts/${orgId}/reconcile`);
      return response.json();
    },
    onSuccess: invalidate,
  });
  const set = (key: "email" | "phone" | "legal_business_name" | "customer_facing_business_name" | "business_type", value: string) => setForm((current) => ({ ...current, [key]: value }));
  const setProfile = (key: "category" | "subcategory" | "business_model", value: string) => setForm((current) => ({ ...current, profile: { ...current.profile, [key]: value } }));
  const setAddress = (key: keyof OnboardingForm["profile"]["addresses"]["registered"], value: string) => setForm((current) => ({ ...current, profile: { ...current.profile, addresses: { registered: { ...current.profile.addresses.registered, [key]: value } } } }));
  const setLegalInfo = (key: keyof OnboardingForm["legal_info"], value: string) => setForm((current) => ({ ...current, legal_info: { ...current.legal_info, [key]: value } }));
  const setWebsite = (value: string) => setForm((current) => ({ ...current, apps: { websites: [value] } }));

  if (!orgId) return null;

  const statusColor = profile?.canAcceptPaidTickets ? theme.success : profile?.status === "needs_clarification" ? theme.warning : theme.textSecondary;
  return (
    <ThemedView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <ThemedText type="h2">Ticket Payments</ThemedText>
            <ThemedText type="body" style={{ color: theme.textSecondary }}>
              Route each paid event registration to your organizer payout account. Platform fees are currently 0%.
            </ThemedText>
          </View>
          <Pressable
            onPress={() => reconcileMutation.mutate()}
            disabled={reconcileMutation.isPending}
            style={[styles.outlineButton, { borderColor: theme.border }]}
          >
            {reconcileMutation.isPending ? <ActivityIndicator color={theme.primary} /> : <Feather name="refresh-cw" size={16} color={theme.primary} />}
            <ThemedText style={{ color: theme.primary, fontWeight: "700" }}>Refresh</ThemedText>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <View style={{ flex: 1 }}>
              <ThemedText type="h4">{profile?.canAcceptPaidTickets ? "Ready for paid registrations" : "Payout setup required"}</ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {profile?.actionRequired || "Loading payout status…"}
              </ThemedText>
            </View>
          </View>
          {profile?.configured ? (
            <View style={[styles.notice, { backgroundColor: `${statusColor}18` }]}>
              <ThemedText type="small" style={{ color: theme.text }}>
                {profile.displayName || "Organizer payout account"} · {profile.accountReference || "Account submitted"} · {profile.status.replace(/_/g, " ")}
              </ThemedText>
              {profile.coolingEndsAt ? <ThemedText type="small" style={{ color: theme.textSecondary }}>Cooling period ends: {dateLabel(profile.coolingEndsAt)}</ThemedText> : null}
            </View>
          ) : null}
        </View>

        {!profile?.canAcceptPaidTickets ? (
          <View style={[styles.card, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
            <ThemedText type="h3">Set up your Razorpay Route account</ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 4 }}>
              These details are sent directly to Razorpay for onboarding. Sensitive tax information is never retained in this app.
            </ThemedText>
            <View style={styles.fields}>
              <Field label="Legal business name" value={form.legal_business_name} onChangeText={(value) => set("legal_business_name", value)} />
              <Field label="Customer-facing business name" value={form.customer_facing_business_name} onChangeText={(value) => set("customer_facing_business_name", value)} />
              <Field label="Business email" value={form.email} keyboardType="email-address" onChangeText={(value) => set("email", value)} />
              <Field label="Business phone (with country code)" value={form.phone} keyboardType="phone-pad" onChangeText={(value) => set("phone", value)} />
              <Field label="Business type" value={form.business_type} onChangeText={(value) => set("business_type", value)} hint="For example: proprietorship, partnership, private_limited" />
              <Field label="Business category" value={form.profile.category} onChangeText={(value) => setProfile("category", value)} />
              <Field label="Business subcategory" value={form.profile.subcategory} onChangeText={(value) => setProfile("subcategory", value)} />
              <Field label="Business model (optional)" value={form.profile.business_model} onChangeText={(value) => setProfile("business_model", value)} />
              <Field label="Registered address" value={form.profile.addresses.registered.street1} onChangeText={(value) => setAddress("street1", value)} />
              <Field label="Address line 2 (optional)" value={form.profile.addresses.registered.street2} onChangeText={(value) => setAddress("street2", value)} />
              <View style={styles.twoColumns}>
                <View style={styles.column}><Field label="City" value={form.profile.addresses.registered.city} onChangeText={(value) => setAddress("city", value)} /></View>
                <View style={styles.column}><Field label="State" value={form.profile.addresses.registered.state} onChangeText={(value) => setAddress("state", value)} /></View>
              </View>
              <Field label="Postal code" value={form.profile.addresses.registered.postal_code} keyboardType="number-pad" onChangeText={(value) => setAddress("postal_code", value)} />
              <Field label="PAN (optional — sent to Razorpay only)" value={form.legal_info.pan} autoCapitalize="characters" onChangeText={(value) => setLegalInfo("pan", value)} secureTextEntry />
              <Field label="GSTIN (optional — sent to Razorpay only)" value={form.legal_info.gst} autoCapitalize="characters" onChangeText={(value) => setLegalInfo("gst", value)} secureTextEntry />
              <Field label="Business website (optional)" value={form.apps.websites[0] || ""} keyboardType="url" autoCapitalize="none" onChangeText={setWebsite} />
            </View>
            {saveMutation.isError ? <ThemedText type="small" style={{ color: theme.error }}>{getErrorMessage(saveMutation.error)}</ThemedText> : null}
            <Pressable
              onPress={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              style={[styles.primaryButton, { backgroundColor: theme.primary, opacity: saveMutation.isPending ? 0.65 : 1 }]}
            >
              {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : <Feather name="shield" size={17} color="#fff" />}
              <ThemedText style={styles.primaryButtonText}>{profile?.configured ? "Resubmit details" : "Submit payout setup"}</ThemedText>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.summaryGrid}>
          <Metric label="Gross ticket revenue" value={money(historyQuery.data?.totals.gross || 0)} theme={theme} />
          <Metric label="Transferred" value={money(historyQuery.data?.totals.transferred || 0)} theme={theme} />
          <Metric label="Settled to bank" value={money(historyQuery.data?.totals.settled || 0)} theme={theme} />
          <Metric label="Refunded / reversing" value={money(historyQuery.data?.totals.refunded || 0)} theme={theme} />
        </View>

        <View style={[styles.card, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
          <ThemedText type="h3">Payout history</ThemedText>
          {historyQuery.isLoading ? <ActivityIndicator color={theme.primary} style={{ margin: Spacing.lg }} /> : null}
          {!historyQuery.isLoading && !(historyQuery.data?.items.length) ? (
            <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>Paid registrations will appear here after a Route order is created.</ThemedText>
          ) : null}
          {(historyQuery.data?.items || []).map((item) => (
            <View key={item.id} style={[styles.historyRow, { borderTopColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: "700" }}>{item.eventName}</ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>{item.bookingId || item.customerName} · {dateLabel(item.createdAt)}</ThemedText>
                {item.failureReason ? <ThemedText type="small" style={{ color: theme.error }}>{item.failureReason}</ThemedText> : null}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <ThemedText style={{ fontWeight: "800" }}>{money(item.netAmount)}</ThemedText>
                <ThemedText type="small" style={{ color: item.transferStatus === "failed" ? theme.error : theme.textSecondary }}>
                  {item.settlementStatus === "settled" ? "settled" : item.transferStatus}
                </ThemedText>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string; hint?: string }) {
  const { theme } = useTheme();
  const { label, hint, ...input } = props;
  return (
    <View style={styles.field}>
      <ThemedText type="small" style={styles.label}>{label}</ThemedText>
      {hint ? <ThemedText type="small" style={{ color: theme.textSecondary }}>{hint}</ThemedText> : null}
      <TextInput {...input} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundRoot }]} placeholderTextColor={theme.textSecondary} />
    </View>
  );
}

function Metric({ label, value, theme }: { label: string; value: string; theme: any }) {
  return <View style={[styles.metric, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}><ThemedText type="small" style={{ color: theme.textSecondary }}>{label}</ThemedText><ThemedText type="h3">{value}</ThemedText></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: Spacing.lg, gap: Spacing.lg, maxWidth: 1080, width: "100%", alignSelf: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  outlineButton: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: 14, paddingVertical: 10 },
  card: { borderWidth: 1, borderRadius: BorderRadius.lg, padding: Spacing.lg, gap: Spacing.md },
  statusRow: { flexDirection: "row", gap: Spacing.md, alignItems: "flex-start" },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginTop: 5 },
  notice: { borderRadius: BorderRadius.md, padding: Spacing.md, gap: 4 },
  fields: { gap: Spacing.md, marginTop: Spacing.sm },
  field: { gap: 5 },
  label: { fontWeight: "700" },
  input: { borderWidth: 1, borderRadius: BorderRadius.md, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10 },
  twoColumns: { flexDirection: "row", gap: Spacing.md },
  column: { flex: 1 },
  primaryButton: { minHeight: 46, borderRadius: BorderRadius.md, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, paddingHorizontal: 16 },
  primaryButtonText: { color: "#fff", fontWeight: "800" },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.md },
  metric: { width: "23%", minWidth: 180, flexGrow: 1, borderWidth: 1, borderRadius: BorderRadius.lg, padding: Spacing.md, gap: 4 },
  historyRow: { flexDirection: "row", gap: Spacing.md, paddingVertical: Spacing.md, borderTopWidth: 1 },
});