import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { SuperCard } from "./_components/SuperCard";

interface Plan {
  id: string;
  name: string;
  price: string;
  cadence: string;
  description: string;
  features: string[];
  highlight?: boolean;
  tone: string;
}

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: "$49",
    cadence: "/ month",
    description: "Single-branch businesses just getting started with queue management",
    tone: "#3B82F6",
    features: ["1 branch", "Up to 3 service desks", "Basic analytics", "Email support", "Customer SMS notifications (200/mo)"],
  },
  {
    id: "growth",
    name: "Growth",
    price: "$140",
    cadence: "/ month",
    description: "Multi-branch operations that need richer analytics and team controls",
    tone: BrandColors.primary,
    highlight: true,
    features: ["Up to 8 branches", "Unlimited service desks", "Advanced analytics & reports", "Priority support", "Customer SMS (2,000/mo)", "Custom journeys", "Role-based access"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    cadence: "billed annually",
    description: "Banks, government and large operators with custom compliance needs",
    tone: "#0F172A",
    features: ["Unlimited branches", "Dedicated success manager", "SLA & uptime guarantees", "SSO & audit logs", "On-prem & hybrid options", "Custom integrations"],
  },
];

export default function PricePlanScreen() {
  const { theme } = useTheme();
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

        <View style={styles.grid}>
          {PLANS.map((p) => (
            <SuperCard
              key={p.id}
              style={[
                styles.planCard,
                p.highlight && { borderColor: BrandColors.primary, borderWidth: 2 },
              ]}
            >
              {p.highlight ? (
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

              <View style={[styles.planIcon, { backgroundColor: p.tone + "1A" }]}>
                <Feather
                  name={p.id === "enterprise" ? "shield" : p.id === "growth" ? "zap" : "package"}
                  size={20}
                  color={p.tone}
                />
              </View>
              <ThemedText style={[styles.planName, { color: theme.text }]}>
                {p.name}
              </ThemedText>
              <ThemedText style={[styles.planDesc, { color: theme.textSecondary }]}>
                {p.description}
              </ThemedText>

              <View style={styles.priceRow}>
                <ThemedText style={[styles.priceMain, { color: theme.text }]}>
                  {p.price}
                </ThemedText>
                <ThemedText style={[styles.priceCadence, { color: theme.mutedText }]}>
                  {p.cadence}
                </ThemedText>
              </View>

              <View style={[styles.divider, { backgroundColor: theme.borderSubtle }]} />

              <View style={{ gap: 10 }}>
                {p.features.map((f) => (
                  <View key={f} style={styles.feature}>
                    <Feather name="check" size={14} color="#10B981" />
                    <ThemedText style={[styles.featureText, { color: theme.text }]}>{f}</ThemedText>
                  </View>
                ))}
              </View>

              <Pressable
                style={[
                  styles.cta,
                  {
                    backgroundColor: p.highlight ? BrandColors.primary : theme.surfaceMuted,
                    borderColor: p.highlight ? BrandColors.primary : theme.borderSubtle,
                  },
                ]}
              >
                <ThemedText
                  lightColor={p.highlight ? "#FFFFFF" : theme.text}
                  darkColor={p.highlight ? "#FFFFFF" : theme.text}
                  style={styles.ctaText}
                >
                  Edit Plan
                </ThemedText>
              </Pressable>
            </SuperCard>
          ))}
        </View>
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
});
