import React from "react";
import { View, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { SuperCard } from "./_components/SuperCard";
import { formatMoney } from "./_utils/format";

interface PlanApi {
  id: string;
  name: string;
  description: string | null;
  monthlyPrice: number;
  yearlyPrice: number | null;
  currency: string;
  features: any;
  branchLimit: number | null;
  userLimit: number | null;
  ticketLimit: number | null;
  isActive: boolean;
  isPopular: boolean;
  sortOrder: number;
}

const ACCENTS = ["#3B82F6", BrandColors.primary, "#0F172A", "#F59E0B", "#10B981", "#8B5CF6"];

function planFeatures(p: PlanApi): string[] {
  const list: string[] = [];
  if (p.branchLimit != null) {
    list.push(p.branchLimit === 0 ? "Unlimited branches" : `${p.branchLimit} branch${p.branchLimit === 1 ? "" : "es"}`);
  }
  if (p.userLimit != null) {
    list.push(p.userLimit === 0 ? "Unlimited team members" : `${p.userLimit} team member${p.userLimit === 1 ? "" : "s"}`);
  }
  if (p.ticketLimit != null) {
    list.push(p.ticketLimit === 0 ? "Unlimited tickets" : `${p.ticketLimit.toLocaleString()} tickets / month`);
  }
  const fx = p.features;
  if (Array.isArray(fx)) {
    for (const f of fx) {
      if (typeof f === "string") list.push(f);
      else if (f && typeof f === "object" && typeof f.label === "string") list.push(f.label);
    }
  } else if (fx && typeof fx === "object") {
    for (const [k, v] of Object.entries(fx)) {
      if (v) list.push(typeof v === "string" ? v : k.replace(/_/g, " "));
    }
  }
  return list;
}

export default function PricePlanScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError } = useQuery<{ plans: PlanApi[] }>({
    queryKey: ["/api/superadmin/plans"],
  });

  const plans = (data?.plans ?? []).filter((p) => p.isActive !== false);

  return (
    <View style={[styles.root, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.content}>
        <PageHeader
          title="Pricing & Plans"
          subtitle="Manage subscription tiers offered to organizations"
          actions={[
            { label: "Compare", icon: "bar-chart-2", variant: "secondary" },
            { label: "New Plan", icon: "plus" },
          ]}
        />

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.text} />
          </View>
        ) : plans.length === 0 ? (
          <SuperCard>
            <View style={styles.empty}>
              <Feather name="package" size={28} color={theme.mutedText} />
              <ThemedText style={[styles.emptyTitle, { color: theme.text }]}>
                {isError ? "Failed to load plans" : "No pricing plans yet"}
              </ThemedText>
              <ThemedText style={[styles.emptySub, { color: theme.textSecondary }]}>
                Create your first plan to make subscriptions available to organizations.
              </ThemedText>
            </View>
          </SuperCard>
        ) : (
          <View style={styles.grid}>
            {plans.map((p, idx) => {
              const tone = ACCENTS[idx % ACCENTS.length];
              const features = planFeatures(p);
              const priceLabel =
                p.monthlyPrice <= 0 ? "Custom" : formatMoney(p.monthlyPrice, p.currency);
              const cadence = p.monthlyPrice <= 0 ? "billed annually" : "/ month";
              return (
                <SuperCard
                  key={p.id}
                  style={[
                    styles.planCard,
                    p.isPopular && { borderColor: BrandColors.primary, borderWidth: 2 },
                  ]}
                >
                  {p.isPopular ? (
                    <View style={[styles.popularBadge, { backgroundColor: BrandColors.primary }]}>
                      <ThemedText
                        lightColor="#FFFFFF"
                        darkColor="#FFFFFF"
                        style={styles.popularText}
                      >
                        MOST POPULAR
                      </ThemedText>
                    </View>
                  ) : null}

                  <View style={[styles.planIcon, { backgroundColor: tone + "1A" }]}>
                    <Feather
                      name={p.monthlyPrice <= 0 ? "shield" : p.isPopular ? "zap" : "package"}
                      size={20}
                      color={tone}
                    />
                  </View>
                  <ThemedText style={[styles.planName, { color: theme.text }]}>{p.name}</ThemedText>
                  {p.description ? (
                    <ThemedText style={[styles.planDesc, { color: theme.textSecondary }]}>
                      {p.description}
                    </ThemedText>
                  ) : null}

                  <View style={styles.priceRow}>
                    <ThemedText style={[styles.priceMain, { color: theme.text }]}>
                      {priceLabel}
                    </ThemedText>
                    <ThemedText style={[styles.priceCadence, { color: theme.mutedText }]}>
                      {cadence}
                    </ThemedText>
                  </View>

                  <View style={[styles.divider, { backgroundColor: theme.borderSubtle }]} />

                  {features.length > 0 ? (
                    <View style={{ gap: 10 }}>
                      {features.map((f, i) => (
                        <View key={`${f}-${i}`} style={styles.feature}>
                          <Feather name="check" size={14} color="#10B981" />
                          <ThemedText style={[styles.featureText, { color: theme.text }]}>
                            {f}
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <ThemedText style={[styles.planDesc, { color: theme.mutedText }]}>
                      No features configured yet.
                    </ThemedText>
                  )}

                  <Pressable
                    style={[
                      styles.cta,
                      {
                        backgroundColor: p.isPopular ? BrandColors.primary : theme.surfaceMuted,
                        borderColor: p.isPopular ? BrandColors.primary : theme.borderSubtle,
                      },
                    ]}
                  >
                    <ThemedText
                      lightColor={p.isPopular ? "#FFFFFF" : theme.text}
                      darkColor={p.isPopular ? "#FFFFFF" : theme.text}
                      style={styles.ctaText}
                    >
                      Edit Plan
                    </ThemedText>
                  </Pressable>
                </SuperCard>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: Spacing.xl },
  content: { width: "100%", maxWidth: 1280, alignSelf: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.lg },
  planCard: { flex: 1, minWidth: 280, position: "relative" },
  popularBadge: {
    position: "absolute",
    top: -10,
    right: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  popularText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  planIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: Spacing.md },
  planName: { fontSize: 18, fontWeight: "700" },
  planDesc: { fontSize: 12, marginTop: 4, lineHeight: 18 },
  priceRow: { flexDirection: "row", alignItems: "flex-end", marginTop: Spacing.lg, gap: 6 },
  priceMain: { fontSize: 32, fontWeight: "800" },
  priceCadence: { fontSize: 12, marginBottom: 6 },
  divider: { height: 1, marginVertical: Spacing.lg },
  feature: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  featureText: { fontSize: 13 },
  cta: {
    marginTop: Spacing.xl,
    height: 40,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  ctaText: { fontSize: 13, fontWeight: "700" },
  loading: { padding: Spacing["3xl"], alignItems: "center" },
  empty: { padding: Spacing["3xl"], alignItems: "center", gap: Spacing.sm },
  emptyTitle: { fontSize: 15, fontWeight: "700", marginTop: Spacing.sm },
  emptySub: { fontSize: 13, textAlign: "center", maxWidth: 360 },
});
