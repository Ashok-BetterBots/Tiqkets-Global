import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { apiRequest, getErrorMessage, queryClient } from "@/lib/query-client";
import { BorderRadius, Spacing } from "@/constants/theme";
import {
  INDIA_STATES,
  RAZORPAY_BANK_ACCOUNT_TYPES,
  RAZORPAY_BUSINESS_TYPES,
  RAZORPAY_EVENT_BUSINESS_MODELS,
  RAZORPAY_EVENT_CATEGORIES,
  getIndiaCities,
  getRazorpaySubcategories,
  type OnboardingOption,
} from "@shared/razorpay-onboarding";

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
  bank_account: {
    account_number: string;
    confirm_account_number: string;
    account_type: string;
    ifsc_code: string;
    beneficiary_name: string;
  };
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
    business_model: RAZORPAY_EVENT_BUSINESS_MODELS[0].value,
    addresses: { registered: { street1: "", street2: "", city: "", state: "", postal_code: "", country: "IN" } },
  },
  legal_info: { pan: "", gst: "" },
  apps: { websites: [""] },
  bank_account: { account_number: "", confirm_account_number: "", account_type: "savings", ifsc_code: "", beneficiary_name: "" },
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
  const cityOptions = useMemo(
    () => form.profile.addresses.registered.state ? getIndiaCities(form.profile.addresses.registered.state) : [],
    [form.profile.addresses.registered.state],
  );

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
      setForm((current) => ({
        ...current,
        legal_info: { ...current.legal_info, pan: "", gst: "" },
        bank_account: { account_number: "", confirm_account_number: "", account_type: current.bank_account.account_type, ifsc_code: "", beneficiary_name: "" },
      }));
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
  const setBankAccount = (key: keyof OnboardingForm["bank_account"], value: string) => setForm((current) => ({ ...current, bank_account: { ...current.bank_account, [key]: value } }));
  const selectCategory = (value: string) => setForm((current) => ({
    ...current,
    profile: {
      ...current.profile,
      category: value,
      subcategory: getRazorpaySubcategories(value)[0]?.value || "",
    },
  }));
  const selectState = (value: string) => setForm((current) => ({
    ...current,
    profile: {
      ...current.profile,
      addresses: { registered: { ...current.profile.addresses.registered, state: value, city: "" } },
    },
  }));
  const submitPayoutSetup = () => {
    const address = form.profile.addresses.registered;
    const bank = form.bank_account;
    if (!form.legal_business_name || !form.email || !form.phone || !form.business_type || !form.profile.category || !form.profile.subcategory || !form.profile.business_model) {
      Alert.alert("Complete business details", "Select each business field before submitting.");
      return;
    }
    if (!address.street1 || !address.street2 || !address.state || !address.city || !/^\d{6}$/.test(address.postal_code)) {
      Alert.alert("Complete registered address", "Both address lines, state, city, and a six-digit postal code are required.");
      return;
    }
    if (!bank.beneficiary_name || !bank.account_type || !bank.account_number || !bank.confirm_account_number || !bank.ifsc_code) {
      Alert.alert("Complete bank details", "Beneficiary, account type, account number, confirmation, and IFSC are required.");
      return;
    }
    if (bank.account_number.replace(/\s/g, "") !== bank.confirm_account_number.replace(/\s/g, "")) {
      Alert.alert("Account numbers do not match", "Re-enter the same bank account number in both fields.");
      return;
    }
    saveMutation.mutate();
  };

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
               These details are sent directly to Razorpay for onboarding. Bank and tax information is never retained in this app.
            </ThemedText>
            <View style={styles.fields}>
              <Field label="Legal business name" value={form.legal_business_name} onChangeText={(value) => set("legal_business_name", value)} />
              <Field label="Customer-facing business name" value={form.customer_facing_business_name} onChangeText={(value) => set("customer_facing_business_name", value)} />
              <Field label="Business email" value={form.email} keyboardType="email-address" onChangeText={(value) => set("email", value)} />
              <Field label="Business phone (with country code)" value={form.phone} keyboardType="phone-pad" onChangeText={(value) => set("phone", value)} />
              <SelectField label="Business type" value={form.business_type} options={RAZORPAY_BUSINESS_TYPES} onValueChange={(value) => set("business_type", value)} />
              <SelectField label="Business category" value={form.profile.category} options={RAZORPAY_EVENT_CATEGORIES.map(({ value, label }) => ({ value, label }))} onValueChange={selectCategory} />
              <SelectField label="Business subcategory" value={form.profile.subcategory} options={getRazorpaySubcategories(form.profile.category)} onValueChange={(value) => setProfile("subcategory", value)} />
              <SelectField label="Business model" value={form.profile.business_model} options={RAZORPAY_EVENT_BUSINESS_MODELS} onValueChange={(value) => setProfile("business_model", value)} />
              <Field label="Registered address" value={form.profile.addresses.registered.street1} onChangeText={(value) => setAddress("street1", value)} />
              <Field label="Address line 2" value={form.profile.addresses.registered.street2} onChangeText={(value) => setAddress("street2", value)} />
              <View style={styles.twoColumns}>
                <View style={styles.column}><SelectField label="State" value={form.profile.addresses.registered.state} options={INDIA_STATES} onValueChange={selectState} /></View>
                <View style={styles.column}><SelectField label="City" value={form.profile.addresses.registered.city} options={cityOptions} onValueChange={(value) => setAddress("city", value)} disabled={!form.profile.addresses.registered.state} /></View>
              </View>
              <Field label="Postal code" value={form.profile.addresses.registered.postal_code} keyboardType="number-pad" onChangeText={(value) => setAddress("postal_code", value)} />
              <ThemedText type="h4" style={styles.sectionTitle}>Bank details</ThemedText>
              <Field label="Beneficiary name" value={form.bank_account.beneficiary_name} onChangeText={(value) => setBankAccount("beneficiary_name", value)} />
              <SelectField label="Account type" value={form.bank_account.account_type} options={RAZORPAY_BANK_ACCOUNT_TYPES} onValueChange={(value) => setBankAccount("account_type", value)} />
              <Field label="Account number" value={form.bank_account.account_number} keyboardType="number-pad" secureTextEntry onChangeText={(value) => setBankAccount("account_number", value)} />
              <Field label="Confirm account number" value={form.bank_account.confirm_account_number} keyboardType="number-pad" secureTextEntry onChangeText={(value) => setBankAccount("confirm_account_number", value)} />
              <Field label="IFSC code" value={form.bank_account.ifsc_code} autoCapitalize="characters" onChangeText={(value) => setBankAccount("ifsc_code", value)} hint="Example: HDFC0001234" />
              <Field label="PAN (optional — sent to Razorpay only)" value={form.legal_info.pan} autoCapitalize="characters" onChangeText={(value) => setLegalInfo("pan", value)} secureTextEntry />
              <Field label="GSTIN (optional — sent to Razorpay only)" value={form.legal_info.gst} autoCapitalize="characters" onChangeText={(value) => setLegalInfo("gst", value)} secureTextEntry />
              <Field label="Business website (optional)" value={form.apps.websites[0] || ""} keyboardType="url" autoCapitalize="none" onChangeText={setWebsite} />
            </View>
            {saveMutation.isError ? <ThemedText type="small" style={{ color: theme.error }}>{getErrorMessage(saveMutation.error)}</ThemedText> : null}
            <Pressable
              onPress={submitPayoutSetup}
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

function SelectField({
  label,
  value,
  options,
  onValueChange,
  hint,
  disabled = false,
}: {
  label: string;
  value: string;
  options: OnboardingOption[];
  onValueChange: (value: string) => void;
  hint?: string;
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const visibleOptions = options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <View style={styles.field}>
      <ThemedText type="small" style={styles.label}>{label}</ThemedText>
      {hint ? <ThemedText type="small" style={{ color: theme.textSecondary }}>{hint}</ThemedText> : null}
      <Pressable
        onPress={() => { if (!disabled) { setQuery(""); setOpen(true); } }}
        accessibilityRole="button"
        accessibilityLabel={`Select ${label}`}
        style={[styles.selectButton, { borderColor: theme.border, backgroundColor: theme.backgroundRoot, opacity: disabled ? 0.55 : 1 }]}
      >
        <ThemedText style={{ color: selected ? theme.text : theme.textSecondary, flex: 1 }} numberOfLines={1}>{selected?.label || `Select ${label.toLowerCase()}`}</ThemedText>
        <Feather name="chevron-down" size={18} color={theme.textSecondary} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.selectorOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={[styles.selectorCard, { backgroundColor: theme.backgroundDefault, borderColor: theme.border }]}>
            <View style={styles.selectorHeader}>
              <ThemedText type="h4">Select {label}</ThemedText>
              <Pressable onPress={() => setOpen(false)} accessibilityLabel={`Close ${label} options`}><Feather name="x" size={20} color={theme.text} /></Pressable>
            </View>
            {options.length > 8 ? <TextInput value={query} onChangeText={setQuery} placeholder="Search…" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundRoot }]} /> : null}
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.optionList}>
              {visibleOptions.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={() => { onValueChange(option.value); setOpen(false); }}
                  style={[styles.optionRow, { borderBottomColor: theme.border, backgroundColor: option.value === value ? `${theme.primary}14` : "transparent" }]}
                >
                  <ThemedText style={{ color: theme.text, flex: 1, fontWeight: option.value === value ? "700" : "400" }}>{option.label}</ThemedText>
                  {option.value === value ? <Feather name="check" size={18} color={theme.primary} /> : null}
                </Pressable>
              ))}
              {!visibleOptions.length ? <ThemedText type="small" style={{ color: theme.textSecondary, padding: Spacing.md }}>No matching options.</ThemedText> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  selectButton: { minHeight: 44, borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { marginTop: Spacing.sm },
  selectorOverlay: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.45)", justifyContent: "center", padding: Spacing.lg },
  selectorCard: { borderWidth: 1, borderRadius: BorderRadius.lg, padding: Spacing.md, maxHeight: "78%", gap: Spacing.sm },
  selectorHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  optionList: { maxHeight: 420 },
  optionRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingVertical: 13, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  twoColumns: { flexDirection: "row", gap: Spacing.md },
  column: { flex: 1 },
  primaryButton: { minHeight: 46, borderRadius: BorderRadius.md, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, paddingHorizontal: 16 },
  primaryButtonText: { color: "#fff", fontWeight: "800" },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.md },
  metric: { width: "23%", minWidth: 180, flexGrow: 1, borderWidth: 1, borderRadius: BorderRadius.lg, padding: Spacing.md, gap: 4 },
  historyRow: { flexDirection: "row", gap: Spacing.md, paddingVertical: Spacing.md, borderTopWidth: 1 },
});