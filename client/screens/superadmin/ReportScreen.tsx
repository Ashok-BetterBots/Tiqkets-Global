import React from "react";
import { View, StyleSheet, Pressable, ActivityIndicator, Linking, Platform } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { PageHeader } from "./_components/PageHeader";
import { SuperCard } from "./_components/SuperCard";
import { getApiUrl } from "@/lib/query-client";

interface ReportApi {
  id: string;
  title: string;
  type: string;
  period: string;
  generated: string;
  status: string;
}

const TYPE_META: Record<string, { icon: keyof typeof Feather.glyphMap; tone: string }> = {
  Finance: { icon: "dollar-sign", tone: "#10B981" },
  Growth: { icon: "trending-up", tone: BrandColors.primary },
  Analytics: { icon: "users", tone: "#3B82F6" },
  Retention: { icon: "rotate-ccw", tone: "#F59E0B" },
  Operations: { icon: "activity", tone: "#8B5CF6" },
  Support: { icon: "life-buoy", tone: "#EF4444" },
};

function metaFor(type: string) {
  return TYPE_META[type] || { icon: "file-text" as const, tone: BrandColors.primary };
}

export default function ReportScreen() {
  const { theme } = useTheme();
  const { data, isLoading, isError } = useQuery<{ reports: ReportApi[] }>({
    queryKey: ["/api/superadmin/reports"],
  });
  const reports = data?.reports ?? [];

  const handleDownload = (id: string) => {
    try {
      const url = new URL(`/api/superadmin/reports/${id}/download`, getApiUrl()).toString();
      if (Platform.OS === "web") {
        window.location.href = url;
      } else {
        Linking.openURL(url).catch(() => undefined);
      }
    } catch {
      // ignore
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.content}>
        <PageHeader
          title="Reports"
          subtitle="Generate and download platform-wide reports"
          actions={[{ label: "Custom Report", icon: "plus" }]}
        />

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.text} />
          </View>
        ) : reports.length === 0 ? (
          <SuperCard>
            <View style={styles.empty}>
              <Feather name="file-text" size={28} color={theme.mutedText} />
              <ThemedText style={[styles.emptyTitle, { color: theme.text }]}>
                {isError ? "Failed to load reports" : "No reports available yet"}
              </ThemedText>
            </View>
          </SuperCard>
        ) : (
          <View style={styles.grid}>
            {reports.map((r) => {
              const meta = metaFor(r.type);
              const empty = r.status !== "Ready";
              return (
                <SuperCard key={r.id} style={styles.card}>
                  <View style={[styles.iconWrap, { backgroundColor: meta.tone + "1A" }]}>
                    <Feather name={meta.icon} size={20} color={meta.tone} />
                  </View>
                  <ThemedText style={[styles.cardTitle, { color: theme.text }]}>
                    {r.title}
                  </ThemedText>
                  <ThemedText style={[styles.cardDesc, { color: theme.textSecondary }]}>
                    {r.type} report — covers {r.period}. Generated {r.generated}.
                  </ThemedText>
                  <View style={styles.cardFooter}>
                    <View style={styles.formats}>
                      <View style={[styles.formatChip, { borderColor: theme.borderSubtle }]}>
                        <ThemedText
                          style={[styles.formatText, { color: theme.textSecondary }]}
                        >
                          CSV
                        </ThemedText>
                      </View>
                      <View
                        style={[
                          styles.formatChip,
                          {
                            borderColor: empty ? "#F59E0B" : "#10B981",
                            backgroundColor: empty ? "#FEF3C7" : "#DCFCE7",
                          },
                        ]}
                      >
                        <ThemedText
                          lightColor={empty ? "#92400E" : "#166534"}
                          darkColor={empty ? "#92400E" : "#166534"}
                          style={styles.formatText}
                        >
                          {r.status}
                        </ThemedText>
                      </View>
                    </View>
                    <Pressable
                      onPress={() => handleDownload(r.id)}
                      disabled={empty}
                      style={[
                        styles.dlBtn,
                        {
                          backgroundColor: empty ? theme.surfaceMuted : BrandColors.primary,
                          opacity: empty ? 0.6 : 1,
                        },
                      ]}
                    >
                      <Feather
                        name="download"
                        size={14}
                        color={empty ? theme.mutedText : "#FFFFFF"}
                      />
                      <ThemedText
                        lightColor={empty ? theme.mutedText : "#FFFFFF"}
                        darkColor={empty ? theme.mutedText : "#FFFFFF"}
                        style={styles.dlText}
                      >
                        Download
                      </ThemedText>
                    </Pressable>
                  </View>
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
  loading: { padding: Spacing["3xl"], alignItems: "center" },
  empty: { padding: Spacing["3xl"], alignItems: "center", gap: Spacing.sm },
  emptyTitle: { fontSize: 15, fontWeight: "700", marginTop: Spacing.sm },
});
