import React, { useCallback, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
  useColorScheme,
  Platform,
  Pressable,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { apiRequest, queryClient } from "@/lib/query-client";

// ---------------------------------------------------------------------------
// Types — mirror server/plan-limits.ts and server/subscription-service.ts so
// the UI can rely on the exact same field names we serialise on the wire.
// ---------------------------------------------------------------------------

type LimitCounter = { current: number; cap: number | null };
type BillingCycle = "monthly" | "yearly";

interface PendingPlanInfo {
  id: string;
  name: string;
  slug: string;
  billingCycle: BillingCycle;
  effectiveAt: string; // ISO
}

interface SubscriptionInfo {
  id: string | null;
  status: string | null;
  isTrial: boolean;
  billingCycle: BillingCycle | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndDate: string | null;
  daysRemaining: number | null;
  pendingPlan: PendingPlanInfo | null;
}

interface PlanLimitsResponse {
  enforced: boolean;
  plan: { id: string | null; name: string | null; slug: string | null; status: string | null };
  usage: {
    branches: LimitCounter;
    staffUsers: LimitCounter;
    desks: LimitCounter;
    dailyTickets: LimitCounter;
  };
  servicesPerBranchCap: number | null;
  subscription: SubscriptionInfo;
}

interface PlanRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  maxBranches: number;
  maxServicesPerBranch: number;
  maxStaffUsers: number;
  maxDailyTickets: number;
  features: Record<string, unknown> | null;
  isActive: boolean;
  sortOrder: number;
}

interface ProrationBreakdown {
  type: "upgrade" | "downgrade" | "same" | "initial";
  amountDueNow: number;
  newPlanFullPrice: number;
  unusedCreditFromCurrentPlan: number;
  daysInPeriod: number;
  daysRemaining: number;
  currency: string;
  newPeriodStart: string;
  newPeriodEnd: string;
  scheduled: boolean;
  description: string;
}

interface PaymentRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  invoiceNumber: string | null;
  description: string | null;
  paidAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amountInPaise: number, currency = "INR"): string {
  // Razorpay amounts are in the smallest currency unit (paise for INR).
  const major = amountInPaise / 100;
  const symbol = currency === "INR" ? "Rs " : `${currency} `;
  return `${symbol}${major.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatCap(cap: number | null) {
  if (cap === null || cap === undefined) return "Unlimited";
  return String(cap);
}

function pickStatusColor(current: number, cap: number | null, enforced: boolean, palette: typeof Colors.light) {
  if (!enforced || cap === null) return palette.primary;
  if (cap <= 0) return palette.primary;
  const ratio = current / cap;
  if (ratio >= 1) return "#EF4444";
  if (ratio >= 0.8) return "#F59E0B";
  return palette.primary;
}

// Razorpay Web Checkout — loaded on demand. Returns a promise that resolves
// when the global Razorpay constructor is available. We don't ship the SDK
// at bundle time because the native build doesn't have a window object.
function loadRazorpay(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Razorpay checkout is only available on the web."));
      return;
    }
    const w = window as any;
    if (w.Razorpay) {
      resolve(w.Razorpay);
      return;
    }
    const existing = document.getElementById("rzp-checkout-script");
    if (existing) {
      existing.addEventListener("load", () => resolve(w.Razorpay));
      existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay")));
      return;
    }
    const script = document.createElement("script");
    script.id = "rzp-checkout-script";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(w.Razorpay);
    script.onerror = () => reject(new Error("Failed to load Razorpay"));
    document.body.appendChild(script);
  });
}

// ---------------------------------------------------------------------------
// Usage tile (carried over from previous version, untouched visuals)
// ---------------------------------------------------------------------------

interface TileProps {
  testID: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  current: number;
  cap: number | null;
  enforced: boolean;
  isDark: boolean;
}

function UsageTile({ testID, label, icon, current, cap, enforced, isDark }: TileProps) {
  const palette = isDark ? Colors.dark : Colors.light;
  const color = pickStatusColor(current, cap, enforced, palette);
  const showBar = enforced && cap !== null && cap > 0;
  const ratio = showBar ? Math.min(1, current / (cap as number)) : 0;
  const capLabel = formatCap(cap);
  return (
    <View
      testID={testID}
      style={[styles.tile, { backgroundColor: palette.surface, borderColor: palette.borderSubtle }]}
    >
      <View style={styles.tileHeader}>
        <View style={[styles.tileIconWrap, { backgroundColor: color + "18" }]}>
          <Feather name={icon} size={14} color={color} />
        </View>
        <ThemedText style={[styles.tileLabel, { color: palette.textSecondary }]} numberOfLines={1}>
          {label}
        </ThemedText>
      </View>
      <View style={styles.tileValueRow}>
        <ThemedText style={styles.tileValue}>{current}</ThemedText>
        <ThemedText style={[styles.tileCap, { color: palette.textSecondary }]} numberOfLines={1}>
          {" / "}
          {capLabel}
        </ThemedText>
      </View>
      {showBar ? (
        <View style={[styles.barTrack, { backgroundColor: palette.surfaceMuted }]}>
          <View style={[styles.barFill, { width: `${Math.round(ratio * 100)}%`, backgroundColor: color }]} />
        </View>
      ) : (
        <ThemedText style={[styles.tileHint, { color: palette.textSecondary }]} numberOfLines={1}>
          {enforced ? "No cap on this plan" : "No active subscription"}
        </ThemedText>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function OrgBillingScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const palette = isDark ? Colors.dark : Colors.light;
  const isWeb = Platform.OS === "web";
  const { organization } = useOrganization();
  const orgId = organization?.id;

  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [previewPlan, setPreviewPlan] = useState<PlanRow | null>(null);
  const [previewBreakdown, setPreviewBreakdown] = useState<ProrationBreakdown | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // ---------- queries ---------------------------------------------------
  const limitsQuery = useQuery<PlanLimitsResponse>({
    queryKey: orgId ? ["/api/dashboard/plan-limits", orgId] : ["/api/dashboard/plan-limits", "no-org"],
    enabled: !!orgId,
  });
  const plansQuery = useQuery<{ plans: PlanRow[] }>({
    queryKey: ["/api/billing/plans"],
  });
  const paymentsQuery = useQuery<{ payments: PaymentRow[] }>({
    queryKey: orgId ? ["/api/billing/payments", orgId] : ["/api/billing/payments", "no-org"],
    enabled: !!orgId,
  });

  const data = limitsQuery.data;
  const sub = data?.subscription;
  const plans = plansQuery.data?.plans ?? [];
  const payments = paymentsQuery.data?.payments ?? [];

  const visiblePlans = useMemo(
    () =>
      plans
        .filter((p) => p.isActive && p.slug !== "trial")
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [plans],
  );

  const planName = data?.plan?.name || "No active plan";
  const planStatus = sub?.status || (data?.enforced ? "active" : "none");
  const enforced = !!data?.enforced;

  // ---------- mutations ------------------------------------------------
  const cancelPendingMutation = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organization");
      const res = await apiRequest("POST", `/api/billing/cancel-pending-change/${orgId}`);
      return res.json();
    },
    onSuccess: () => {
      setActionMessage("Scheduled change cancelled.");
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/plan-limits", orgId] });
    },
    onError: (err: any) => {
      setActionError(err?.message || "Failed to cancel scheduled change");
    },
  });

  // ---------- proration preview --------------------------------------
  const openPreview = useCallback(
    async (plan: PlanRow) => {
      if (!orgId) return;
      setPreviewPlan(plan);
      setPreviewBreakdown(null);
      setPreviewError(null);
      setPreviewLoading(true);
      try {
        const res = await apiRequest("POST", "/api/billing/proration-preview", {
          orgId,
          planId: plan.id,
          billingCycle,
        });
        const json = await res.json();
        setPreviewBreakdown(json.breakdown);
      } catch (err: any) {
        setPreviewError(err?.message || "Failed to preview plan change");
      } finally {
        setPreviewLoading(false);
      }
    },
    [orgId, billingCycle],
  );

  const closePreview = useCallback(() => {
    if (checkoutBusy) return;
    setPreviewPlan(null);
    setPreviewBreakdown(null);
    setPreviewError(null);
  }, [checkoutBusy]);

  const confirmChange = useCallback(async () => {
    if (!orgId || !previewPlan || !previewBreakdown) return;
    setCheckoutBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      // Step 1: ask the server to either schedule the change (downgrade /
      // same / no-cost) or to mint a Razorpay order for the prorated diff.
      const res = await apiRequest("POST", "/api/billing/change-plan", {
        orgId,
        planId: previewPlan.id,
        billingCycle,
      });
      const json = await res.json();

      if (!json.requiresPayment) {
        if (json.breakdown?.scheduled) {
          setActionMessage(
            `Downgrade to ${previewPlan.name} scheduled for ${formatDate(json.breakdown.newPeriodStart)}.`,
          );
        } else {
          setActionMessage(`Plan updated to ${previewPlan.name}.`);
        }
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/plan-limits", orgId] });
        queryClient.invalidateQueries({ queryKey: ["/api/billing/payments", orgId] });
        setPreviewPlan(null);
        setPreviewBreakdown(null);
        return;
      }

      // Step 2: open Razorpay Web Checkout. On native we can't show
      // checkout — direct the user to the web dashboard.
      if (!isWeb) {
        setActionError("To complete payment, please open Billing in the web dashboard.");
        return;
      }
      const Razorpay = await loadRazorpay();
      const subscriptionId = json.subscription?.id;
      const pendingChange = json.pendingChange;
      const paid = await new Promise<{ ok: boolean; payload?: any; reason?: string }>((resolve) => {
        const rzp = new Razorpay({
          key: json.razorpay.keyId,
          order_id: json.razorpay.orderId,
          amount: json.razorpay.amount,
          currency: json.razorpay.currency,
          name: organization?.name || "TIQKETS",
          description: `${previewPlan.name} (${billingCycle}) — ${json.breakdown.type}`,
          theme: { color: "#0066ff" },
          handler: (response: any) => resolve({ ok: true, payload: response }),
          modal: { ondismiss: () => resolve({ ok: false, reason: "dismissed" }) },
        });
        rzp.on?.("payment.failed", (response: any) => {
          resolve({ ok: false, reason: response?.error?.description || "Payment failed" });
        });
        rzp.open();
      });

      if (!paid.ok) {
        if (paid.reason && paid.reason !== "dismissed") {
          setActionError(paid.reason);
        }
        return;
      }

      // Step 3: verify the signature server-side and apply the plan
      // change. Server is the source of truth — we never trust the
      // client-provided payment outcome.
      const verifyRes = await apiRequest("POST", "/api/billing/verify-payment", {
        razorpay_payment_id: paid.payload.razorpay_payment_id,
        razorpay_order_id: paid.payload.razorpay_order_id,
        razorpay_signature: paid.payload.razorpay_signature,
        orgId,
        subscriptionId,
        amount: json.razorpay.amount,
        pendingChange,
      });
      await verifyRes.json();
      setActionMessage(`Payment received. You're now on ${previewPlan.name} (${billingCycle}).`);
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/plan-limits", orgId] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/payments", orgId] });
      setPreviewPlan(null);
      setPreviewBreakdown(null);
    } catch (err: any) {
      setActionError(err?.message || "Plan change failed");
    } finally {
      setCheckoutBusy(false);
    }
  }, [orgId, previewPlan, previewBreakdown, billingCycle, isWeb, organization?.name]);

  // ---------- usage tiles ---------------------------------------------
  const tiles = useMemo(() => {
    if (!data) return [];
    return [
      { testID: "plan-usage-tile-branches", label: "Branches", icon: "git-branch" as const, ...data.usage.branches },
      { testID: "plan-usage-tile-staff", label: "Staff", icon: "users" as const, ...data.usage.staffUsers },
      { testID: "plan-usage-tile-desks", label: "Desks", icon: "monitor" as const, ...data.usage.desks },
      { testID: "plan-usage-tile-tickets", label: "Daily Tickets", icon: "tag" as const, ...data.usage.dailyTickets },
    ];
  }, [data]);

  const refetchAll = useCallback(() => {
    limitsQuery.refetch();
    plansQuery.refetch();
    paymentsQuery.refetch();
  }, [limitsQuery, plansQuery, paymentsQuery]);

  const isRefetching = limitsQuery.isRefetching || plansQuery.isRefetching || paymentsQuery.isRefetching;
  const showTrialBanner = sub?.isTrial && sub?.status === "trialing";
  const showExpiredBanner = sub && (sub.status === "expired" || (sub.status === "cancelled" && !sub.pendingPlan));
  const showPendingBanner = !!sub?.pendingPlan;

  return (
    <ThemedView style={styles.root}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: isWeb ? Spacing.xl : headerHeight + Spacing.xl,
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetchAll} tintColor={palette.primary} />}
      >
        {!isWeb ? (
          <View style={styles.headerBlock}>
            <ThemedText type="h2" style={styles.headerTitle}>Billing</ThemedText>
            <ThemedText style={[styles.headerSub, { color: palette.textSecondary }]}>
              Plan, usage, and invoices
            </ThemedText>
          </View>
        ) : null}

        {/* ---- Trial banner ---- */}
        {showTrialBanner ? (
          <Card variant="outlined" style={[styles.banner, { backgroundColor: "#0066ff10", borderColor: "#0066ff55" }]} testID="banner-trial">
            <View style={styles.bannerRow}>
              <Feather name="clock" size={18} color="#0066ff" />
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.bannerTitle}>You're on a free trial</ThemedText>
                <ThemedText style={[styles.bannerSub, { color: palette.textSecondary }]}>
                  {sub.daysRemaining ?? 0} day{(sub.daysRemaining ?? 0) === 1 ? "" : "s"} remaining ·
                  {" "}Ends {formatDate(sub.trialEndDate)}. Choose a plan below to keep going.
                </ThemedText>
              </View>
            </View>
          </Card>
        ) : null}

        {/* ---- Expired banner ---- */}
        {showExpiredBanner ? (
          <Card variant="outlined" style={[styles.banner, { backgroundColor: "#EF444410", borderColor: "#EF444455" }]} testID="banner-expired">
            <View style={styles.bannerRow}>
              <Feather name="alert-octagon" size={18} color="#EF4444" />
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.bannerTitle}>Subscription not active</ThemedText>
                <ThemedText style={[styles.bannerSub, { color: palette.textSecondary }]}>
                  Your queues are paused. Subscribe to a plan to resume customer joins and queue processing.
                </ThemedText>
              </View>
            </View>
          </Card>
        ) : null}

        {/* ---- Pending plan-change banner ---- */}
        {showPendingBanner && sub?.pendingPlan ? (
          <Card variant="outlined" style={[styles.banner, { backgroundColor: "#F59E0B10", borderColor: "#F59E0B55" }]} testID="banner-pending-change">
            <View style={styles.bannerRow}>
              <Feather name="calendar" size={18} color="#F59E0B" />
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.bannerTitle}>
                  Scheduled change to {sub.pendingPlan.name} ({sub.pendingPlan.billingCycle})
                </ThemedText>
                <ThemedText style={[styles.bannerSub, { color: palette.textSecondary }]}>
                  Takes effect on {formatDate(sub.pendingPlan.effectiveAt)}. You stay on your current plan until then.
                </ThemedText>
              </View>
              <Pressable
                testID="button-cancel-pending-change"
                onPress={() => cancelPendingMutation.mutate()}
                disabled={cancelPendingMutation.isPending}
                style={[styles.bannerCancelBtn, { borderColor: palette.borderSubtle }]}
              >
                <ThemedText style={styles.bannerCancelText}>
                  {cancelPendingMutation.isPending ? "Cancelling…" : "Cancel"}
                </ThemedText>
              </Pressable>
            </View>
          </Card>
        ) : null}

        {/* ---- Action message / error ---- */}
        {actionMessage ? (
          <Card variant="outlined" style={[styles.banner, { backgroundColor: "#16a34a10", borderColor: "#16a34a55" }]} testID="text-action-success">
            <View style={styles.bannerRow}>
              <Feather name="check-circle" size={18} color="#16a34a" />
              <ThemedText style={[styles.bannerSub, { flex: 1 }]}>{actionMessage}</ThemedText>
              <Pressable onPress={() => setActionMessage(null)}><Feather name="x" size={16} color={palette.textSecondary} /></Pressable>
            </View>
          </Card>
        ) : null}
        {actionError ? (
          <Card variant="outlined" style={[styles.banner, { backgroundColor: "#EF444410", borderColor: "#EF444455" }]} testID="text-action-error">
            <View style={styles.bannerRow}>
              <Feather name="alert-circle" size={18} color="#EF4444" />
              <ThemedText style={[styles.bannerSub, { flex: 1, color: "#EF4444" }]}>{actionError}</ThemedText>
              <Pressable onPress={() => setActionError(null)}><Feather name="x" size={16} color={palette.textSecondary} /></Pressable>
            </View>
          </Card>
        ) : null}

        {/* ---- Subscription header ---- */}
        <Card variant="outlined" testID="card-subscription-header" style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.cardTitle}>Current subscription</ThemedText>
              <ThemedText testID="text-plan-name" style={styles.cardSub} numberOfLines={1}>
                {planName}
                {sub?.billingCycle ? <ThemedText style={[styles.cardSub, { color: palette.textSecondary }]}>{` · ${sub.billingCycle}`}</ThemedText> : null}
              </ThemedText>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: planStatus === "active" ? "#16a34a20" : planStatus === "trialing" ? "#0066ff20" : "#EF444420" }]}>
              <ThemedText style={[styles.statusBadgeText, { color: planStatus === "active" ? "#16a34a" : planStatus === "trialing" ? "#0066ff" : "#EF4444" }]}>
                {planStatus}
              </ThemedText>
            </View>
          </View>
          <View style={styles.subscriptionMeta}>
            <View style={styles.metaItem}>
              <ThemedText style={[styles.metaLabel, { color: palette.textSecondary }]}>Period start</ThemedText>
              <ThemedText style={styles.metaValue}>{formatDate(sub?.currentPeriodStart)}</ThemedText>
            </View>
            <View style={styles.metaItem}>
              <ThemedText style={[styles.metaLabel, { color: palette.textSecondary }]}>Period end</ThemedText>
              <ThemedText style={styles.metaValue}>{formatDate(sub?.currentPeriodEnd)}</ThemedText>
            </View>
            {sub?.daysRemaining !== null && sub?.daysRemaining !== undefined ? (
              <View style={styles.metaItem}>
                <ThemedText style={[styles.metaLabel, { color: palette.textSecondary }]}>Days remaining</ThemedText>
                <ThemedText testID="text-days-remaining" style={styles.metaValue}>{sub.daysRemaining}</ThemedText>
              </View>
            ) : null}
          </View>
        </Card>

        {/* ---- Plan usage ---- */}
        <Card variant="outlined" testID="card-plan-usage" style={styles.card}>
          <ThemedText style={styles.cardTitle}>Plan usage</ThemedText>
          {limitsQuery.isLoading && !data ? (
            <View style={styles.loadingBlock}>
              <ThemedText style={{ color: palette.textSecondary, fontSize: 13 }}>Loading usage…</ThemedText>
            </View>
          ) : limitsQuery.isError ? (
            <View style={styles.loadingBlock}>
              <ThemedText style={{ color: "#EF4444", fontSize: 13 }}>Couldn't load plan usage. Pull to retry.</ThemedText>
            </View>
          ) : (
            <View style={styles.tileGrid}>
              {tiles.map((t) => (
                <UsageTile
                  key={t.testID}
                  testID={t.testID}
                  label={t.label}
                  icon={t.icon}
                  current={t.current}
                  cap={t.cap}
                  enforced={enforced}
                  isDark={isDark}
                />
              ))}
            </View>
          )}
        </Card>

        {/* ---- Plans grid ---- */}
        <Card variant="outlined" style={styles.card} testID="card-plans">
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.cardTitle}>Choose your plan</ThemedText>
              <ThemedText style={[styles.cardSub, { color: palette.textSecondary }]}>
                Upgrades are pro-rated and charged immediately. Downgrades start at the next renewal.
              </ThemedText>
            </View>
            <View style={[styles.cycleToggle, { backgroundColor: palette.surfaceMuted, borderColor: palette.borderSubtle }]}>
              {(["monthly", "yearly"] as BillingCycle[]).map((c) => {
                const active = billingCycle === c;
                return (
                  <Pressable
                    key={c}
                    testID={`button-cycle-${c}`}
                    onPress={() => setBillingCycle(c)}
                    style={[styles.cycleOption, active && { backgroundColor: palette.surface, borderColor: palette.borderSubtle }]}
                  >
                    <ThemedText style={[styles.cycleOptionText, active && { color: palette.primary, fontWeight: "700" }]}>
                      {c === "monthly" ? "Monthly" : "Yearly · save"}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {plansQuery.isLoading ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator />
            </View>
          ) : (
            <View style={styles.planGrid}>
              {visiblePlans.map((p) => {
                const isCurrent = data?.plan?.id === p.id;
                const price = billingCycle === "yearly" ? p.yearlyPrice : p.monthlyPrice;
                return (
                  <View
                    key={p.id}
                    testID={`card-plan-${p.slug}`}
                    style={[
                      styles.planCard,
                      { backgroundColor: palette.surface, borderColor: isCurrent ? palette.primary : palette.borderSubtle },
                    ]}
                  >
                    <ThemedText style={styles.planName}>{p.name}</ThemedText>
                    <ThemedText style={[styles.planDesc, { color: palette.textSecondary }]} numberOfLines={3}>
                      {p.description || ""}
                    </ThemedText>
                    <View style={styles.planPriceRow}>
                      <ThemedText style={styles.planPrice}>{formatCurrency(price, p.currency)}</ThemedText>
                      <ThemedText style={[styles.planPriceUnit, { color: palette.textSecondary }]}>
                        / {billingCycle === "yearly" ? "year" : "mo"}
                      </ThemedText>
                    </View>
                    <View style={styles.planFeatureList}>
                      <PlanFeature label={`${p.maxBranches === -1 ? "Unlimited" : p.maxBranches} branch${p.maxBranches === 1 ? "" : "es"}`} palette={palette} />
                      <PlanFeature label={`${p.maxServicesPerBranch === -1 ? "Unlimited" : p.maxServicesPerBranch} services / branch`} palette={palette} />
                      <PlanFeature label={`${p.maxStaffUsers === -1 ? "Unlimited" : p.maxStaffUsers} team members`} palette={palette} />
                      <PlanFeature
                        label={`${p.maxDailyTickets === -1 ? "Unlimited" : p.maxDailyTickets} tickets / day`}
                        palette={palette}
                      />
                    </View>
                    <Pressable
                      testID={`button-select-plan-${p.slug}`}
                      disabled={isCurrent}
                      onPress={() => openPreview(p)}
                      style={[
                        styles.planButton,
                        {
                          backgroundColor: isCurrent ? palette.surfaceMuted : palette.primary,
                          opacity: isCurrent ? 0.7 : 1,
                        },
                      ]}
                    >
                      <ThemedText
                        style={[
                          styles.planButtonText,
                          { color: isCurrent ? palette.textSecondary : "#fff" },
                        ]}
                      >
                        {isCurrent ? "Current plan" : "Select"}
                      </ThemedText>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        {/* ---- Invoices ---- */}
        <Card variant="outlined" style={styles.card} testID="card-invoices">
          <ThemedText style={styles.cardTitle}>Invoices</ThemedText>
          {paymentsQuery.isLoading ? (
            <ActivityIndicator />
          ) : payments.length === 0 ? (
            <ThemedText style={[styles.cardSub, { color: palette.textSecondary }]}>
              No invoices yet. They'll appear here after your first payment.
            </ThemedText>
          ) : (
            <View style={{ gap: Spacing.sm }}>
              {payments.map((pmt) => (
                <View
                  key={pmt.id}
                  testID={`row-invoice-${pmt.id}`}
                  style={[styles.invoiceRow, { borderColor: palette.borderSubtle }]}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.invoiceTitle} numberOfLines={1}>
                      {pmt.invoiceNumber || pmt.id.slice(0, 8)}
                    </ThemedText>
                    <ThemedText style={[styles.invoiceMeta, { color: palette.textSecondary }]} numberOfLines={1}>
                      {pmt.description || "Subscription payment"} · {formatDate(pmt.paidAt || pmt.createdAt)}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.invoiceAmount}>{formatCurrency(pmt.amount, pmt.currency)}</ThemedText>
                  <View
                    style={[
                      styles.invoiceStatus,
                      { backgroundColor: pmt.status === "captured" ? "#16a34a20" : "#F59E0B20" },
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.invoiceStatusText,
                        { color: pmt.status === "captured" ? "#16a34a" : "#F59E0B" },
                      ]}
                    >
                      {pmt.status}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>
      </ScrollView>

      {/* ----- Proration preview modal ----- */}
      <Modal visible={!!previewPlan} transparent animationType="fade" onRequestClose={closePreview}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: palette.surface, borderColor: palette.borderSubtle }]}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Confirm change to {previewPlan?.name}</ThemedText>
              <Pressable onPress={closePreview} disabled={checkoutBusy}><Feather name="x" size={18} color={palette.textSecondary} /></Pressable>
            </View>
            {previewLoading ? (
              <ActivityIndicator />
            ) : previewError ? (
              <ThemedText style={{ color: "#EF4444" }}>{previewError}</ThemedText>
            ) : previewBreakdown ? (
              <View style={{ gap: Spacing.md }}>
                <ThemedText style={[styles.cardSub, { color: palette.textSecondary }]} testID="text-proration-description">
                  {previewBreakdown.description}
                </ThemedText>
                <View style={styles.lineItemList}>
                  <LineItem
                    label={`${previewPlan?.name} (${billingCycle}) full price`}
                    value={formatCurrency(previewBreakdown.newPlanFullPrice, previewBreakdown.currency)}
                    palette={palette}
                  />
                  {previewBreakdown.unusedCreditFromCurrentPlan > 0 ? (
                    <LineItem
                      label="Credit for unused days on current plan"
                      value={`- ${formatCurrency(previewBreakdown.unusedCreditFromCurrentPlan, previewBreakdown.currency)}`}
                      palette={palette}
                    />
                  ) : null}
                  <LineItem
                    label={`Days remaining in cycle`}
                    value={`${previewBreakdown.daysRemaining} of ${previewBreakdown.daysInPeriod}`}
                    palette={palette}
                  />
                  <View style={[styles.totalRow, { borderTopColor: palette.borderSubtle }]}>
                    <ThemedText style={styles.totalLabel}>Due now</ThemedText>
                    <ThemedText testID="text-amount-due" style={styles.totalValue}>
                      {formatCurrency(previewBreakdown.amountDueNow, previewBreakdown.currency)}
                    </ThemedText>
                  </View>
                  {previewBreakdown.scheduled ? (
                    <ThemedText style={[styles.cardSub, { color: palette.textSecondary }]}>
                      Effective on {formatDate(previewBreakdown.newPeriodStart)} — no charge today.
                    </ThemedText>
                  ) : (
                    <ThemedText style={[styles.cardSub, { color: palette.textSecondary }]}>
                      New period: {formatDate(previewBreakdown.newPeriodStart)} → {formatDate(previewBreakdown.newPeriodEnd)}
                    </ThemedText>
                  )}
                </View>
                {!isWeb && previewBreakdown.amountDueNow > 0 ? (
                  <ThemedText style={[styles.cardSub, { color: "#F59E0B" }]}>
                    To complete payment, please open Billing in the web dashboard.
                  </ThemedText>
                ) : null}
                <View style={styles.modalActions}>
                  <Pressable
                    style={[styles.modalSecondary, { borderColor: palette.borderSubtle }]}
                    onPress={closePreview}
                    disabled={checkoutBusy}
                    testID="button-cancel-change"
                  >
                    <ThemedText>Cancel</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.modalPrimary, { backgroundColor: palette.primary }]}
                    onPress={confirmChange}
                    disabled={checkoutBusy || (previewBreakdown.amountDueNow > 0 && !isWeb)}
                    testID="button-confirm-change"
                  >
                    {checkoutBusy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <ThemedText style={{ color: "#fff", fontWeight: "700" }}>
                        {previewBreakdown.scheduled
                          ? "Schedule change"
                          : previewBreakdown.amountDueNow > 0
                            ? `Pay ${formatCurrency(previewBreakdown.amountDueNow, previewBreakdown.currency)}`
                            : "Confirm"}
                      </ThemedText>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

function PlanFeature({ label, palette }: { label: string; palette: typeof Colors.light }) {
  return (
    <View style={styles.planFeatureRow}>
      <Feather name="check" size={13} color={palette.primary} />
      <ThemedText style={[styles.planFeatureText, { color: palette.textSecondary }]} numberOfLines={1}>
        {label}
      </ThemedText>
    </View>
  );
}

function LineItem({ label, value, palette }: { label: string; value: string; palette: typeof Colors.light }) {
  return (
    <View style={styles.lineItem}>
      <ThemedText style={[styles.lineItemLabel, { color: palette.textSecondary }]}>{label}</ThemedText>
      <ThemedText style={styles.lineItemValue}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
  },
  headerBlock: { marginBottom: Spacing.sm },
  headerTitle: { fontWeight: "700" },
  headerSub: { fontSize: 13, marginTop: 2 },
  card: { padding: Spacing.xl },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  cardSub: { fontSize: 12, marginTop: 2 },
  banner: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  bannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  bannerTitle: { fontSize: 14, fontWeight: "700" },
  bannerSub: { fontSize: 12, marginTop: 2 },
  bannerCancelBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  bannerCancelText: { fontSize: 12, fontWeight: "600" },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  statusBadgeText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  subscriptionMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.lg,
  },
  metaItem: { minWidth: 110, gap: 2 },
  metaLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 },
  metaValue: { fontSize: 14, fontWeight: "700" },
  cycleToggle: {
    flexDirection: "row",
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    padding: 2,
  },
  cycleOption: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.xs,
  },
  cycleOptionText: { fontSize: 12, fontWeight: "600" },
  planGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.lg,
  },
  planCard: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 200,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  planName: { fontSize: 16, fontWeight: "800" },
  planDesc: { fontSize: 12, minHeight: 32 },
  planPriceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginVertical: Spacing.sm,
  },
  planPrice: { fontSize: 22, fontWeight: "800" },
  planPriceUnit: { fontSize: 12 },
  planFeatureList: { gap: 4 },
  planFeatureRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  planFeatureText: { fontSize: 12 },
  planButton: {
    paddingVertical: 10,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  planButtonText: { fontSize: 14, fontWeight: "700" },
  invoiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
  },
  invoiceTitle: { fontSize: 14, fontWeight: "700" },
  invoiceMeta: { fontSize: 12, marginTop: 2 },
  invoiceAmount: { fontSize: 14, fontWeight: "700" },
  invoiceStatus: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
  },
  invoiceStatusText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "#0008",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  modalCard: {
    width: "100%",
    maxWidth: 480,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { fontSize: 16, fontWeight: "800" },
  lineItemList: { gap: Spacing.xs },
  lineItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lineItemLabel: { fontSize: 12 },
  lineItemValue: { fontSize: 13, fontWeight: "600" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Spacing.sm,
    marginTop: Spacing.xs,
    borderTopWidth: 1,
  },
  totalLabel: { fontSize: 14, fontWeight: "700" },
  totalValue: { fontSize: 18, fontWeight: "800" },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  modalSecondary: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  modalPrimary: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    borderRadius: BorderRadius.sm,
    minWidth: 140,
    alignItems: "center",
  },
  // ---- legacy/usage tile styles (carried over) ----
  noPlanBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
  },
  noPlanBadgeText: { fontSize: 11, fontWeight: "600" },
  tileGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  tile: {
    flexGrow: 1,
    flexBasis: 160,
    minWidth: 140,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  tileHeader: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  tileIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    flex: 1,
  },
  tileValueRow: { flexDirection: "row", alignItems: "baseline" },
  tileValue: { fontSize: 22, fontWeight: "800" },
  tileCap: { fontSize: 13, fontWeight: "600", marginLeft: 2 },
  tileHint: { fontSize: 11, marginTop: 2 },
  barTrack: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: 4 },
  barFill: { height: "100%", borderRadius: 3 },
  loadingBlock: { paddingVertical: Spacing.lg },
});
