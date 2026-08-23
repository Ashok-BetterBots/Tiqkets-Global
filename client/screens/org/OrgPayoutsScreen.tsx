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

type Profile = { configured: boolean; status: string; canAcceptPaidTickets: boolean; actionRequired?: string | null; statusReason?: string | null; coolingEndsAt?: string | null; displayName?: string | null };
type HistoryItem = { id: string; eventName: string; bookingId?: string | null; netAmount: number; transferStatus: string; settlementStatus: string; createdAt: string; failureReason?: string | null };
type History = { totals: { gross: number; transferred: number; settled: number; refunded: number }; items: HistoryItem[] };
type Form = {
  email: string; phone: string; legal_business_name: string; customer_facing_business_name: string; business_type: string;
  profile: { category: string; subcategory: string; business_model: string; addresses: { registered: { street1: string; street2: string; city: string; state: string; postal_code: string; country: string } } };
  legal_info: { pan: string; gst: string };
  apps: { websites: string[] };
  bank_account: { beneficiary_name: string; account_type: string; account_number: string; confirm_account_number: string; ifsc_code: string };
};

const initialForm: Form = {
  email: "", phone: "", legal_business_name: "", customer_facing_business_name: "", business_type: "proprietorship",
  profile: { category: "events_and_entertainment", subcategory: "event_management", business_model: "online", addresses: { registered: { street1: "", street2: "", city: "", state: "", postal_code: "", country: "IN" } } },
  legal_info: { pan: "", gst: "" }, apps: { websites: [""] },
  bank_account: { beneficiary_name: "", account_type: "savings", account_number: "", confirm_account_number: "", ifsc_code: "" },
};

const money = (paise = 0) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
};

export default function OrgPayoutsScreen() {
  const { theme } = useTheme();
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const [form, setForm] = useState<Form>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const profileKey = useMemo(() => ["/api/dashboard/payouts", orgId, "profile"], [orgId]);
  const historyKey = useMemo(() => ["/api/dashboard/payouts", orgId, "history"], [orgId]);
  const profileQuery = useQuery<{ profile: Profile }>({ queryKey: profileKey, enabled: Boolean(orgId) });
  const historyQuery = useQuery<History>({ queryKey: historyKey, enabled: Boolean(orgId) });
  // Options are fetched from the server so Razorpay's allowed values stay authoritative.
  const optionsQuery = useQuery({ queryKey: ["/api/dashboard/payouts", "onboarding-options"], queryFn: async () => (await apiRequest("GET", "/api/dashboard/payouts/onboarding-options")).json() });
  const profile = profileQuery.data?.profile;
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: profileKey });
    queryClient.invalidateQueries({ queryKey: historyKey });
  };

  const validate = () => {
    const address = form.profile.addresses.registered;
    const bank = form.bank_account;
    const next: Record<string, string> = {};
    if (!form.legal_business_name.trim()) next.legal_business_name = "Legal business name is required.";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = "Enter a valid business email.";
    if (!form.phone.trim()) next.phone = "Business phone is required.";
    if (!form.business_type) next.business_type = "Business type is required.";
    if (!form.profile.category || !form.profile.subcategory || !form.profile.business_model) next.profile = "Complete the business profile.";
    if (!address.street1 || !address.city || !address.state || !/^\d{6}$/.test(address.postal_code)) next.address = "Complete the registered address with a six-digit postal code.";
    if (!bank.beneficiary_name || !bank.account_number || !bank.ifsc_code) next.bank = "Complete all required bank details.";
    if (bank.account_number !== bank.confirm_account_number) next.confirm_account_number = "Account numbers do not match.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/dashboard/payouts/${orgId}/profile`, form)).json(),
    onSuccess: () => {
      invalidate();
      setErrors({});
      // Never retain request-only financial or tax data after it has been submitted.
      setForm(current => ({ ...current, legal_info: { pan: "", gst: "" }, bank_account: { ...current.bank_account, account_number: "", confirm_account_number: "", ifsc_code: "" } }));
      Alert.alert("Payout setup submitted", "Razorpay will review the account before paid ticket checkout is enabled.");
    },
    onError: error => setErrors((error as { body?: { fieldErrors?: Record<string, string> } }).body?.fieldErrors || {}),
  });
  const reconcile = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/dashboard/payouts/${orgId}/reconcile`)).json(),
    onSuccess: invalidate,
  });
  const setTop = (key: "email" | "phone" | "legal_business_name" | "customer_facing_business_name" | "business_type", value: string) => setForm(current => ({ ...current, [key]: value }));
  const setAddress = (key: keyof Form["profile"]["addresses"]["registered"], value: string) => setForm(current => ({ ...current, profile: { ...current.profile, addresses: { registered: { ...current.profile.addresses.registered, [key]: value } } } }));
  const setBank = (key: keyof Form["bank_account"], value: string) => setForm(current => ({ ...current, bank_account: { ...current.bank_account, [key]: value } }));

  if (!orgId) return <ThemedView style={styles.center}><ActivityIndicator color={theme.primary} /></ThemedView>;
  const statusColor = profile?.canAcceptPaidTickets ? "#15803d" : "#b45309";
  return (
    <ThemedView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}><ThemedText type="h2">Ticket Payments</ThemedText><ThemedText type="body" style={{ color: theme.textSecondary }}>Razorpay Route payouts for paid event tickets.</ThemedText></View>
          <Pressable accessibilityRole="button" onPress={() => reconcile.mutate()} disabled={reconcile.isPending} style={[styles.outlineButton, { borderColor: theme.border }]}><Feather name="refresh-cw" size={16} color={theme.text} /><ThemedText>{reconcile.isPending ? "Refreshing" : "Refresh"}</ThemedText></Pressable>
        </View>
        <View style={[styles.card, { borderColor: statusColor, backgroundColor: `${statusColor}10` }]}>
          <ThemedText type="h4" style={{ color: statusColor }}>{profile?.canAcceptPaidTickets ? "Ready for paid registrations" : "Payout setup required"}</ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>{profile?.actionRequired || profile?.statusReason || "Submit organizer payout details to enable paid ticket checkout."}</ThemedText>
          {profile?.coolingEndsAt ? <ThemedText type="small" style={{ color: theme.textSecondary }}>Available after {dateLabel(profile.coolingEndsAt)}.</ThemedText> : null}
        </View>
        {!profile?.canAcceptPaidTickets ? <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.backgroundDefault }]}>
          <ThemedText type="h3">Set up payouts</ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>Bank account, PAN, and GST details are submitted only in this request. They are never displayed from your payout profile or history.</ThemedText>
          {optionsQuery.isLoading ? <ActivityIndicator color={theme.primary} /> : null}
          <View style={styles.fields}>
            <Field label="Legal business name *" value={form.legal_business_name} error={errors.legal_business_name} onChangeText={v => setTop("legal_business_name", v)} />
            <Field label="Customer-facing business name" value={form.customer_facing_business_name} onChangeText={v => setTop("customer_facing_business_name", v)} />
            <Field label="Business email *" value={form.email} error={errors.email} keyboardType="email-address" autoCapitalize="none" onChangeText={v => setTop("email", v)} />
            <Field label="Business phone *" value={form.phone} error={errors.phone} keyboardType="phone-pad" onChangeText={v => setTop("phone", v)} />
            <Field label="Business type *" value={form.business_type} error={errors.business_type} hint="Use a value supplied by Razorpay onboarding options." onChangeText={v => setTop("business_type", v)} />
            <Field label="Business category *" value={form.profile.category} onChangeText={v => setForm(c => ({ ...c, profile: { ...c.profile, category: v } }))} />
            <Field label="Business subcategory *" value={form.profile.subcategory} onChangeText={v => setForm(c => ({ ...c, profile: { ...c.profile, subcategory: v } }))} />
            <Field label="Business model *" value={form.profile.business_model} error={errors.profile} onChangeText={v => setForm(c => ({ ...c, profile: { ...c.profile, business_model: v } }))} />
            <Field label="Registered address *" value={form.profile.addresses.registered.street1} error={errors.address} onChangeText={v => setAddress("street1", v)} />
            <Field label="City *" value={form.profile.addresses.registered.city} onChangeText={v => setAddress("city", v)} />
            <Field label="State *" value={form.profile.addresses.registered.state} onChangeText={v => setAddress("state", v)} />
            <Field label="Postal code *" value={form.profile.addresses.registered.postal_code} keyboardType="number-pad" onChangeText={v => setAddress("postal_code", v)} />
            <ThemedText type="h4">Bank details</ThemedText>
            <Field label="Beneficiary name *" value={form.bank_account.beneficiary_name} error={errors.bank} onChangeText={v => setBank("beneficiary_name", v)} />
            <Field label="Account type *" value={form.bank_account.account_type} onChangeText={v => setBank("account_type", v)} />
            <Field label="Account number *" value={form.bank_account.account_number} secureTextEntry keyboardType="number-pad" onChangeText={v => setBank("account_number", v)} />
            <Field label="Confirm account number *" value={form.bank_account.confirm_account_number} error={errors.confirm_account_number} secureTextEntry keyboardType="number-pad" onChangeText={v => setBank("confirm_account_number", v)} />
            <Field label="IFSC code *" value={form.bank_account.ifsc_code} autoCapitalize="characters" onChangeText={v => setBank("ifsc_code", v)} />
            <Field label="PAN (optional)" value={form.legal_info.pan} secureTextEntry autoCapitalize="characters" onChangeText={v => setForm(c => ({ ...c, legal_info: { ...c.legal_info, pan: v } }))} />
            <Field label="GSTIN (optional)" value={form.legal_info.gst} secureTextEntry autoCapitalize="characters" onChangeText={v => setForm(c => ({ ...c, legal_info: { ...c.legal_info, gst: v } }))} />
          </View>
          {save.isError ? <ThemedText type="small" style={{ color: theme.error }}>{getErrorMessage(save.error)}</ThemedText> : null}
          <Pressable onPress={() => validate() && save.mutate()} disabled={save.isPending} style={[styles.submit, { backgroundColor: theme.primary }]}>{save.isPending ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.submitText}>Submit payout setup</ThemedText>}</Pressable>
        </View> : null}
        <View style={styles.metrics}>{[["Gross ticket revenue", historyQuery.data?.totals.gross], ["Transferred", historyQuery.data?.totals.transferred], ["Settled to bank", historyQuery.data?.totals.settled], ["Refunded / reversing", historyQuery.data?.totals.refunded]].map(([label, amount]) => <View key={String(label)} style={[styles.metric, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}><ThemedText type="small" style={{ color: theme.textSecondary }}>{label}</ThemedText><ThemedText type="h3">{money(Number(amount || 0))}</ThemedText></View>)}</View>
        <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.backgroundDefault }]}><ThemedText type="h3">Payout history</ThemedText>{historyQuery.isLoading ? <ActivityIndicator color={theme.primary} /> : null}{!historyQuery.isLoading && !historyQuery.data?.items.length ? <ThemedText type="body" style={{ color: theme.textSecondary }}>No paid Route allocations yet.</ThemedText> : null}{historyQuery.data?.items.map(item => <View key={item.id} style={[styles.history, { borderTopColor: theme.border }]}><View style={{ flex: 1 }}><ThemedText style={{ fontWeight: "700" }}>{item.eventName}</ThemedText><ThemedText type="small" style={{ color: theme.textSecondary }}>{item.bookingId || "Ticket"} · {dateLabel(item.createdAt)}</ThemedText>{item.failureReason ? <ThemedText type="small" style={{ color: theme.error }}>{item.failureReason}</ThemedText> : null}</View><View style={{ alignItems: "flex-end" }}><ThemedText style={{ fontWeight: "800" }}>{money(item.netAmount)}</ThemedText><ThemedText type="small" style={{ color: theme.textSecondary }}>{item.settlementStatus === "settled" ? "settled" : item.transferStatus}</ThemedText></View></View>)}</View>
      </ScrollView>
    </ThemedView>
  );
}

function Field({ label, hint, error, ...props }: React.ComponentProps<typeof TextInput> & { label: string; hint?: string; error?: string }) {
  const { theme } = useTheme();
  return <View style={styles.field}><ThemedText type="small" style={{ fontWeight: "700" }}>{label}</ThemedText>{hint ? <ThemedText type="small" style={{ color: theme.textSecondary }}>{hint}</ThemedText> : null}<TextInput {...props} placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: error ? theme.error : theme.border, backgroundColor: theme.backgroundRoot }]} />{error ? <ThemedText type="small" style={{ color: theme.error }}>{error}</ThemedText> : null}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, center: { flex: 1, alignItems: "center", justifyContent: "center" }, content: { padding: Spacing.lg, gap: Spacing.lg, maxWidth: 1080, width: "100%", alignSelf: "center" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md }, outlineButton: { flexDirection: "row", gap: 8, alignItems: "center", borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: 14, paddingVertical: 10 },
  card: { borderWidth: 1, borderRadius: BorderRadius.lg, padding: Spacing.lg, gap: Spacing.md }, fields: { gap: Spacing.md }, field: { gap: 4 }, input: { minHeight: 44, borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: 12, paddingVertical: 10 },
  submit: { minHeight: 46, borderRadius: BorderRadius.md, alignItems: "center", justifyContent: "center" }, submitText: { color: "#fff", fontWeight: "800" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.md }, metric: { minWidth: 180, flexGrow: 1, borderWidth: 1, borderRadius: BorderRadius.lg, padding: Spacing.md, gap: 4 },
  history: { flexDirection: "row", gap: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1 },
});