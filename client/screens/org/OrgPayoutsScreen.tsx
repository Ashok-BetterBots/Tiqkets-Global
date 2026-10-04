import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { resolveOrganizationTimezone } from "@shared/home-report-calendar";
import { apiRequest, getErrorMessage, queryClient } from "@/lib/query-client";
import { BorderRadius, Spacing } from "@/constants/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type OnboardingStep = { id: "linked_account" | "stakeholder" | "route_product" | "settlement"; label: string; status: "complete" | "current" | "locked" };
type Profile = { configured: boolean; status: string; paymentMethod?: "razorpay_route" | "razorpay_direct" | "razorpay_payment_links"; directReady?: boolean; paymentLinksReady?: boolean; finalActivationStatus?: string | null; accountId?: string | null; stakeholderId?: string | null; productId?: string | null; productStatus?: string | null; canAcceptPaidTickets: boolean; actionRequired?: string | null; statusReason?: string | null; coolingEndsAt?: string | null; displayName?: string | null; onboarding?: { currentStage: OnboardingStep["id"] | "complete"; steps: OnboardingStep[] } };
type HistoryItem = { id: string; adapter?: "route" | "direct" | "payment_link" | "payment_links"; eventName: string; bookingId?: string | null; amount?: number; netAmount?: number; status?: string; transferStatus?: string; settlementStatus?: string; razorpayOrderId?: string | null; razorpayPaymentId?: string | null; razorpayTransferId?: string | null; providerSettlementStatus?: string | null; paymentLinkId?: string | null; paymentLinkReference?: string | null; paymentLinkReferenceId?: string | null; paymentMethod?: string | null; paidAt?: string | null; createdAt: string };
type History = { totals: { gross: number; transferred: number; settled: number; refunded: number }; pagination: { page: number; limit: number; total: number; totalPages: number }; items: HistoryItem[] };
type Form = {
  email: string; phone: string; contact_name: string; legal_business_name: string; business_type: string;
  profile: { category: string; subcategory: string; addresses: { registered: { street1: string; street2: string; city: string; state: string; postal_code: string; country: string } } };
  legal_info: { pan: string; gst: string };
  bank_account: { beneficiary_name: string; account_type: string; account_number: string; confirm_account_number: string; ifsc_code: string };
  tnc_accepted: boolean;
};

const initialForm: Form = {
  email: "", phone: "", contact_name: "", legal_business_name: "", business_type: "proprietorship",
  profile: { category: "media_and_entertainment", subcategory: "ticketing", addresses: { registered: { street1: "", street2: "", city: "", state: "", postal_code: "", country: "IN" } } },
  legal_info: { pan: "", gst: "" },
  bank_account: { beneficiary_name: "", account_type: "savings", account_number: "", confirm_account_number: "", ifsc_code: "" },
  tnc_accepted: false,
};

const ROUTE_BUSINESS_TYPES = new Set([
  "individual", "proprietorship", "partnership", "private_limited",
  "public_limited", "llp", "trust", "society", "ngo", "other",
  "not_yet_registered", "educational_institutes",
]);

const money = (paise = 0) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
const formatPayoutDate = (value: string, timeZone: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(undefined, { timeZone });
};
const formatPayoutDateTime = (value: string, timeZone: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(undefined, { timeZone });
};
const statusLabel = (value: string | null | undefined) => String(value || "not available").replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase());

export default function OrgPayoutsScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { organization } = useOrganization();
  const timeZone = resolveOrganizationTimezone(organization?.timezone);
  const dateLabel = (value: string) => formatPayoutDate(value, timeZone);
  const dateTimeLabel = (value: string) => formatPayoutDateTime(value, timeZone);
  const orgId = organization?.id;
  const [form, setForm] = useState<Form>(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [historyPage, setHistoryPage] = useState(1);
  const profileKey = useMemo(() => ["/api/dashboard/payouts", orgId, "profile"], [orgId]);
  const historyKey = useMemo(() => ["payout-history", orgId, historyPage], [orgId, historyPage]);
  const profileQuery = useQuery<{ profile: Profile }>({ queryKey: profileKey, enabled: Boolean(orgId) });
  const historyQuery = useQuery<History>({
    queryKey: historyKey,
    enabled: Boolean(orgId),
    queryFn: async () => (await apiRequest("GET", `/api/dashboard/payouts/${orgId}/history?page=${historyPage}&limit=10`)).json(),
  });
  const profile = profileQuery.data?.profile;
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: profileKey });
    queryClient.invalidateQueries({ queryKey: ["payout-history", orgId] });
  };

  const validate = () => {
    const address = form.profile.addresses.registered;
    const bank = form.bank_account;
    const next: Record<string, string> = {};
    const stage = profile?.onboarding?.currentStage || "linked_account";
    if (stage === "linked_account") {
      if (form.legal_business_name.trim().length < 4) next.legal_business_name = "Enter the legal business name (at least 4 characters).";
      if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = "Enter a valid business email.";
      if (!/^\d{8,15}$/.test(form.phone.replace(/\D/g, ""))) next.phone = "Enter a business phone number with 8–15 digits.";
      if (form.contact_name.trim().length < 4) next.contact_name = "Enter the authorized account contact name.";
      if (!ROUTE_BUSINESS_TYPES.has(form.business_type)) next.business_type = "Enter a supported Razorpay business type.";
      if (!address.street1 || !address.street2 || !address.city || !address.state || !/^\d{6}$/.test(address.postal_code)) next.address = "Complete both address lines and the registered address with a six-digit postal code.";
      if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(form.legal_info.pan.trim().toUpperCase())) next.pan = "Enter a valid PAN.";
      if (form.legal_info.gst.trim() && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d][Z][A-Z\d]$/.test(form.legal_info.gst.trim().toUpperCase())) next.gst = "Enter a valid GST identification number.";
    } else if (stage === "stakeholder") {
      if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = "Enter a valid account-contact email.";
      if (!/^\d{8,15}$/.test(form.phone.replace(/\D/g, ""))) next.phone = "Enter an account-contact phone number with country code.";
      if (form.contact_name.trim().length < 4) next.contact_name = "Enter the authorized account contact name.";
    } else if (stage === "settlement") {
      if (!bank.beneficiary_name || bank.account_number.replace(/\s/g, "").length < 5 || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(bank.ifsc_code.trim().toUpperCase())) next.bank = "Enter a valid beneficiary name, bank account number, and IFSC.";
      if (bank.account_number !== bank.confirm_account_number) next.confirm_account_number = "Account numbers do not match.";
    }
    if ((stage === "linked_account" || stage === "settlement") && !form.tnc_accepted) next.tnc_accepted = "Accept the Razorpay Route terms before submitting.";
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
      Alert.alert("Payout step saved", profile?.onboarding?.currentStage === "linked_account" ? "Your linked account is saved. Continue with the account contact step." : "Continue with the next Route setup step.");
    },
    onError: error => setErrors((error as { body?: { fieldErrors?: Record<string, string> } }).body?.fieldErrors || {}),
  });
  const reconcile = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/dashboard/payouts/${orgId}/reconcile`)).json(),
    onSuccess: invalidate,
  });
  const setTop = (key: "email" | "phone" | "contact_name" | "legal_business_name" | "business_type", value: string) => setForm(current => ({ ...current, [key]: value }));
  const setAddress = (key: keyof Form["profile"]["addresses"]["registered"], value: string) => setForm(current => ({ ...current, profile: { ...current.profile, addresses: { registered: { ...current.profile.addresses.registered, [key]: value } } } }));
  const setBank = (key: keyof Form["bank_account"], value: string) => setForm(current => ({ ...current, bank_account: { ...current.bank_account, [key]: value } }));

  if (!orgId) return <ThemedView style={styles.center}><ActivityIndicator color={theme.primary} /></ThemedView>;
  const isPaymentLinks = profile?.paymentMethod === "razorpay_payment_links";
  const isRoute = !isPaymentLinks && profile?.paymentMethod !== "razorpay_direct";
  const paymentLinksReady = profile?.paymentLinksReady ?? profile?.canAcceptPaidTickets ?? false;
  const statusColor = isPaymentLinks ? (paymentLinksReady ? "#15803d" : "#b45309") : (profile?.canAcceptPaidTickets ? "#15803d" : "#b45309");
  const onboardingStage = profile?.onboarding?.currentStage || "linked_account";
  return (
    <ThemedView style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Spacing["3xl"] + insets.bottom }]}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}><ThemedText type="h2">Ticket Payments</ThemedText><ThemedText type="body" style={{ color: theme.textSecondary }}>{isPaymentLinks ? "Razorpay Payment Links for paid event tickets." : isRoute ? "Razorpay Route payouts for paid event tickets." : "Razorpay Direct payments for paid event tickets."}</ThemedText></View>
          <Pressable accessibilityRole="button" onPress={() => reconcile.mutate()} disabled={reconcile.isPending} style={[styles.outlineButton, { borderColor: theme.border }]}><Feather name="refresh-cw" size={16} color={theme.text} /><ThemedText>{reconcile.isPending ? "Refreshing" : "Refresh"}</ThemedText></Pressable>
        </View>
        <View style={[styles.card, { borderColor: statusColor, backgroundColor: `${statusColor}10` }]}>
          <ThemedText type="h4" style={{ color: statusColor }}>{isPaymentLinks ? (paymentLinksReady ? "Razorpay Payment Links active" : "Razorpay Payment Links unavailable") : isRoute ? (profile?.canAcceptPaidTickets ? "Ready for paid registrations" : "Payout setup required") : (profile?.directReady ? "Razorpay Direct payments active" : "Razorpay Direct unavailable")}</ThemedText>
          <ThemedText type="body" style={{ color: theme.textSecondary }}>{isPaymentLinks ? (paymentLinksReady ? "Paid event registrations use hosted Razorpay Payment Links. Payment Links reuse the Direct credentials configured by the Super Admin." : "Payment Links reuse the Direct credentials configured by the Super Admin and must be ready before paid registrations can be accepted.") : isRoute ? (profile?.actionRequired || profile?.statusReason || "Submit organizer payout details to enable paid ticket checkout.") : (profile?.directReady ? "Paid event registrations are processed directly through the platform Razorpay account." : "Razorpay Direct must be configured by the Super Admin before paid registrations can be accepted.")}</ThemedText>
          {profile?.coolingEndsAt ? <ThemedText type="small" style={{ color: theme.textSecondary }}>Available after {dateLabel(profile.coolingEndsAt)}.</ThemedText> : null}
            {isRoute && profile?.configured ? <View style={styles.providerDetails}>
             <View style={styles.providerDetail}><ThemedText type="small" style={{ color: theme.textSecondary }}>Razorpay Product ID</ThemedText><ThemedText type="small" style={{ fontWeight: "800" }}>{profile.productId || "Not requested yet"}</ThemedText></View>
             <View style={styles.providerDetail}><ThemedText type="small" style={{ color: theme.textSecondary }}>Final activation status</ThemedText><ThemedText type="small" style={{ fontWeight: "800" }}>{statusLabel(profile.finalActivationStatus || profile.status)}</ThemedText></View>
           </View> : null}
        </View>
          {isRoute && !isPaymentLinks && !profile?.canAcceptPaidTickets ? <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.backgroundDefault }]}>
          <ThemedText type="h3">{profile?.configured ? "Continue Route setup" : "Set up payouts"}</ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>{profile?.configured ? "Your linked account is saved. Complete the current step below; a second account will not be created." : "Business and tax details are submitted directly to Razorpay and are never shown from your payout profile."}</ThemedText>
          {profile?.onboarding?.steps?.map(step => <View key={step.id} style={[styles.step, { borderColor: step.status === "complete" ? "#86efac" : step.status === "current" ? theme.primary : theme.border, backgroundColor: step.status === "complete" ? "#f0fdf4" : step.status === "current" ? `${theme.primary}10` : theme.backgroundRoot }]}><ThemedText type="small" style={{ fontWeight: "800" }}>{step.status === "complete" ? "Complete" : step.status === "current" ? "Current" : "Upcoming"} · {step.label}</ThemedText></View>)}
          <View style={styles.fields}>
            <View style={onboardingStage === "linked_account" ? undefined : { display: "none" }}>
            <Field label="Legal business name *" value={form.legal_business_name} error={errors.legal_business_name} onChangeText={v => setTop("legal_business_name", v)} />
            <Field label="Business email *" value={form.email} error={errors.email} keyboardType="email-address" autoCapitalize="none" onChangeText={v => setTop("email", v)} />
            <Field label="Business phone *" value={form.phone} error={errors.phone} keyboardType="phone-pad" onChangeText={v => setTop("phone", v)} />
            <Field label="Account contact name *" value={form.contact_name} error={errors.contact_name} autoCapitalize="words" onChangeText={v => setTop("contact_name", v)} />
            <Field label="Business type *" value={form.business_type} error={errors.business_type} hint="Use a value supplied by Razorpay onboarding options." onChangeText={v => setTop("business_type", v)} />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>Razorpay category: Event ticketing</ThemedText>
            <Field label="Registered address *" value={form.profile.addresses.registered.street1} error={errors.address} onChangeText={v => setAddress("street1", v)} />
            <Field label="Address line 2 *" value={form.profile.addresses.registered.street2} error={errors.address} onChangeText={v => setAddress("street2", v)} />
            <Field label="City *" value={form.profile.addresses.registered.city} onChangeText={v => setAddress("city", v)} />
            <Field label="State *" value={form.profile.addresses.registered.state} error={errors.state} placeholder="Tamil Nadu" hint="Enter the full Indian state name." onChangeText={v => setAddress("state", v)} />
            <Field label="Postal code *" value={form.profile.addresses.registered.postal_code} keyboardType="number-pad" onChangeText={v => setAddress("postal_code", v)} />
            <Field label="PAN *" value={form.legal_info.pan} error={errors.pan} secureTextEntry autoCapitalize="characters" onChangeText={v => setForm(c => ({ ...c, legal_info: { ...c.legal_info, pan: v } }))} />
            <Field label="GSTIN (if registered)" value={form.legal_info.gst} error={errors.gst} secureTextEntry autoCapitalize="characters" onChangeText={v => setForm(c => ({ ...c, legal_info: { ...c.legal_info, gst: v } }))} />
            </View>
            {onboardingStage === "stakeholder" ? <View style={styles.fields}>
              <Field label="Account contact name *" value={form.contact_name} error={errors.contact_name} autoCapitalize="words" onChangeText={v => setTop("contact_name", v)} />
              <Field label="Account contact email *" value={form.email} error={errors.email} keyboardType="email-address" autoCapitalize="none" onChangeText={v => setTop("email", v)} />
              <Field label="Account contact phone *" value={form.phone} error={errors.phone} keyboardType="phone-pad" onChangeText={v => setTop("phone", v)} />
            </View> : null}
            {onboardingStage === "route_product" ? <ThemedText type="body" style={{ color: theme.textSecondary }}>Request the Razorpay Route product configuration for the saved linked account.</ThemedText> : null}
            {onboardingStage === "settlement" ? <View style={styles.fields}>
            <ThemedText type="h4">Bank details</ThemedText>
            <Field label="Beneficiary name *" value={form.bank_account.beneficiary_name} error={errors.bank} onChangeText={v => setBank("beneficiary_name", v)} />
            <Field label="Account type *" value={form.bank_account.account_type} onChangeText={v => setBank("account_type", v)} />
            <Field label="Account number *" value={form.bank_account.account_number} secureTextEntry keyboardType="number-pad" onChangeText={v => setBank("account_number", v)} />
            <Field label="Confirm account number *" value={form.bank_account.confirm_account_number} error={errors.confirm_account_number} secureTextEntry keyboardType="number-pad" onChangeText={v => setBank("confirm_account_number", v)} />
            <Field label="IFSC code *" value={form.bank_account.ifsc_code} autoCapitalize="characters" onChangeText={v => setBank("ifsc_code", v)} />
            </View> : null}
          </View>
          <View style={[styles.terms, onboardingStage === "linked_account" || onboardingStage === "settlement" ? undefined : { display: "none" }]}>
            <Switch value={form.tnc_accepted} onValueChange={value => setForm(current => ({ ...current, tnc_accepted: value }))} trackColor={{ false: theme.border, true: theme.primary }} />
            <ThemedText type="small" style={{ flex: 1, color: theme.textSecondary }}>I am authorized to accept Razorpay Route terms and confirm the organizer, tax, and bank details are accurate.</ThemedText>
          </View>
          {errors.tnc_accepted ? <ThemedText type="small" style={{ color: theme.error }}>{errors.tnc_accepted}</ThemedText> : null}
          {save.isError ? <ThemedText type="small" style={{ color: theme.error }}>{getErrorMessage(save.error)}</ThemedText> : null}
          <Pressable onPress={() => validate() && save.mutate()} disabled={save.isPending} style={[styles.submit, { backgroundColor: theme.primary }]}>{save.isPending ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.submitText}>{onboardingStage === "stakeholder" ? "Save account contact" : onboardingStage === "route_product" ? "Request Route product" : onboardingStage === "settlement" ? "Submit bank settlement" : "Create linked account"}</ThemedText>}</Pressable>
        </View> : null}
          <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.backgroundDefault }]}><ThemedText type="h3">Payment history</ThemedText>{historyQuery.isLoading ? <ActivityIndicator color={theme.primary} /> : null}{!historyQuery.isLoading && !historyQuery.data?.items.length ? <ThemedText type="body" style={{ color: theme.textSecondary }}>No paid registrations yet.</ThemedText> : null}{historyQuery.data?.items.map(item => <View key={item.id} style={[styles.history, { borderTopColor: theme.border }]}><View style={styles.historyHeader}><View style={{ flex: 1 }}><ThemedText style={{ fontWeight: "700" }}>{item.eventName}</ThemedText><ThemedText type="small" style={{ color: theme.textSecondary }}>{item.bookingId || "Ticket"}</ThemedText></View></View><View style={styles.historyDetails}>{(item.adapter === "payment_link" || item.adapter === "payment_links" ? [["Payment Link ID", item.paymentLinkId || "Unavailable"], ["Payment Link reference", item.paymentLinkReference || item.paymentLinkReferenceId || "Unavailable"], ["Payment", item.razorpayPaymentId || "Unavailable"], ["Status", statusLabel(item.status)], ["Amount", money(item.amount ?? item.netAmount ?? 0)], ["Date", dateTimeLabel(item.paidAt || item.createdAt)]] : [["Razorpay order", item.razorpayOrderId || "Unavailable"], ["Payment", item.razorpayPaymentId || "Unavailable"], ...(item.adapter === "route" ? [["Transfer", item.razorpayTransferId || item.transferStatus || "Unavailable"], ["Settlement", item.providerSettlementStatus || item.settlementStatus || "Unavailable"]] : []), ["Status", statusLabel(item.status || item.transferStatus)], ["Amount", money(item.amount ?? item.netAmount ?? 0)], ["Date", dateTimeLabel(item.paidAt || item.createdAt)]]).map(([label, value]) => <View key={label} style={styles.historyDetail}><ThemedText type="small" style={{ color: theme.textSecondary }}>{label}</ThemedText><ThemedText type="small" style={{ fontWeight: "700" }}>{value}</ThemedText></View>)}</View></View>)}{(historyQuery.data?.pagination.totalPages || 0) > 1 ? <View style={styles.pagination}><Pressable accessibilityRole="button" disabled={historyPage <= 1 || historyQuery.isFetching} onPress={() => setHistoryPage(page => Math.max(1, page - 1))} style={[styles.pageButton, { borderColor: theme.border, opacity: historyPage <= 1 ? 0.4 : 1 }]}><ThemedText type="small">Previous</ThemedText></Pressable><ThemedText type="small" style={{ color: theme.textSecondary }}>Page {historyQuery.data?.pagination.page || historyPage} of {historyQuery.data?.pagination.totalPages || 1}</ThemedText><Pressable accessibilityRole="button" disabled={historyPage >= (historyQuery.data?.pagination.totalPages || 1) || historyQuery.isFetching} onPress={() => setHistoryPage(page => page + 1)} style={[styles.pageButton, { borderColor: theme.border, opacity: historyPage >= (historyQuery.data?.pagination.totalPages || 1) ? 0.4 : 1 }]}><ThemedText type="small">Next</ThemedText></Pressable></View> : null}</View>
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
  card: { borderWidth: 1, borderRadius: BorderRadius.lg, padding: Spacing.lg, gap: Spacing.md }, providerDetails: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.md }, providerDetail: { minWidth: 180, flexGrow: 1, gap: 4 }, fields: { gap: Spacing.md }, step: { borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.sm }, field: { gap: 4 }, input: { minHeight: 44, borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: 12, paddingVertical: 10 },
  submit: { minHeight: 46, borderRadius: BorderRadius.md, alignItems: "center", justifyContent: "center" }, submitText: { color: "#fff", fontWeight: "800" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.md }, metric: { minWidth: 180, flexGrow: 1, borderWidth: 1, borderRadius: BorderRadius.lg, padding: Spacing.md, gap: 4 },
  history: { gap: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1 }, historyHeader: { flexDirection: "row", gap: Spacing.md, alignItems: "center" }, historyDetails: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm }, historyDetail: { minWidth: 145, flexGrow: 1, gap: 3 }, pagination: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: Spacing.sm }, pageButton: { borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: 12, paddingVertical: 8 }, terms: { flexDirection: "row", gap: Spacing.sm, alignItems: "flex-start" },
});