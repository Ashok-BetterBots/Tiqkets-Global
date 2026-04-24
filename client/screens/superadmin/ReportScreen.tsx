import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { SuperCard } from "./_components/SuperCard";

interface ReportItem {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
  tone: string;
  format: string[];
}

const REPORTS: ReportItem[] = [
  { id: "r1", title: "Monthly Revenue Statement", description: "Subscription revenue across all organizations broken down by plan tier", icon: "dollar-sign", tone: "#10B981", format: ["PDF", "CSV"] },
  { id: "r2", title: "Organization Activity", description: "Daily, weekly and monthly active organizations and operating branches", icon: "activity", tone: BrandColors.primary, format: ["PDF", "XLSX"] },
  { id: "r3", title: "Visitor Throughput", description: "Total tickets issued, served, and abandoned across the platform", icon: "users", tone: "#3B82F6", format: ["PDF", "CSV"] },
  { id: "r4", title: "Plan Conversion Funnel", description: "Trial-to-paid conversion rates and churn cohort breakdown", icon: "trending-up", tone: "#F59E0B", format: ["PDF"] },
  { id: "r5", title: "Branch Performance", description: "Top performing branches by served customers and satisfaction", icon: "git-branch", tone: "#8B5CF6", format: ["PDF", "XLSX"] },
  { id: "r6", title: "Support Ticket Summary", description: "Tech support tickets opened, resolved and average resolution time", icon: "life-buoy", tone: "#EF4444", format: ["PDF", "CSV"] },
];

export default function ReportScreen() {
  const { theme } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.content}>
        <PageHeader
          title="Reports"
          subtitle="Generate and download platform-wide reports"
          actions={[{ label: "Custom Report", icon: "plus" }]}
        />
        <View style={styles.grid}>
          {REPORTS.map((r) => (
            <SuperCard key={r.id} style={styles.card}>
              <View style={[styles.iconWrap, { backgroundColor: r.tone + "1A" }]}>
                <Feather name={r.icon} size={20} color={r.tone} />
              </View>
              <ThemedText style={[styles.cardTitle, { color: theme.text }]}>
                {r.title}
              </ThemedText>
              <ThemedText style={[styles.cardDesc, { color: theme.textSecondary }]}>
                {r.description}
              </ThemedText>
              <View style={styles.cardFooter}>
                <View style={styles.formats}>
                  {r.format.map((f) => (
                    <View key={f} style={[styles.formatChip, { borderColor: theme.borderSubtle }]}>
                      <ThemedText style={[styles.formatText, { color: theme.textSecondary }]}>
                        {f}
                      </ThemedText>
                    </View>
                  ))}
                </View>
                <Pressable
                  style={[styles.dlBtn, { backgroundColor: BrandColors.primary }]}
                >
                  <Feather name="download" size={14} color="#FFFFFF" />
                  <ThemedText
                    lightColor="#FFFFFF"
                    darkColor="#FFFFFF"
                    style={styles.dlText}
                  >
                    Run
                  </ThemedText>
                </Pressable>
              </View>
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
  card: { flex: 1, minWidth: 320, maxWidth: "33%" },
  iconWrap: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: Spacing.md,
  },
  cardTitle: { fontSize: 15, fontWeight: "700" },
  cardDesc: { fontSize: 12, marginTop: 4, lineHeight: 18 },
  cardFooter: {
    marginTop: Spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  formats: { flexDirection: "row", gap: 6 },
  formatChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.xs, borderWidth: 1,
  },
  formatText: { fontSize: 10, fontWeight: "700" },
  dlBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: BorderRadius.sm,
  },
  dlText: { fontSize: 12, fontWeight: "700" },
});
