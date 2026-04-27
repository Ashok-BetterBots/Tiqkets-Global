import React, { useMemo } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  RefreshControl,
  useColorScheme,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";

type LimitCounter = { current: number; cap: number | null };

interface PlanLimitsResponse {
  enforced: boolean;
  plan: {
    id: string | null;
    name: string | null;
    slug: string | null;
    status: string | null;
  };
  usage: {
    branches: LimitCounter;
    staffUsers: LimitCounter;
    desks: LimitCounter;
    dailyTickets: LimitCounter;
  };
  servicesPerBranchCap: number | null;
}

interface TileProps {
  testID: string;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  current: number;
  cap: number | null;
  enforced: boolean;
  isDark: boolean;
}

function formatCap(cap: number | null) {
  if (cap === null || cap === undefined) return "Unlimited";
  return String(cap);
}

function pickStatusColor(
  current: number,
  cap: number | null,
  enforced: boolean,
  palette: typeof Colors.light,
) {
  if (!enforced || cap === null) return palette.primary;
  if (cap <= 0) return palette.primary;
  const ratio = current / cap;
  if (ratio >= 1) return "#EF4444";
  if (ratio >= 0.8) return "#F59E0B";
  return palette.primary;
}

function UsageTile({
  testID,
  label,
  icon,
  current,
  cap,
  enforced,
  isDark,
}: TileProps) {
  const palette = isDark ? Colors.dark : Colors.light;
  const color = pickStatusColor(current, cap, enforced, palette);
  const showBar = enforced && cap !== null && cap > 0;
  const ratio = showBar ? Math.min(1, current / (cap as number)) : 0;
  const capLabel = formatCap(cap);

  return (
    <View
      testID={testID}
      style={[
        styles.tile,
        {
          backgroundColor: palette.surface,
          borderColor: palette.borderSubtle,
        },
      ]}
    >
      <View style={styles.tileHeader}>
        <View style={[styles.tileIconWrap, { backgroundColor: color + "18" }]}>
          <Feather name={icon} size={14} color={color} />
        </View>
        <ThemedText
          style={[styles.tileLabel, { color: palette.textSecondary }]}
          numberOfLines={1}
        >
          {label}
        </ThemedText>
      </View>
      <View style={styles.tileValueRow}>
        <ThemedText style={styles.tileValue}>{current}</ThemedText>
        <ThemedText
          style={[styles.tileCap, { color: palette.textSecondary }]}
          numberOfLines={1}
        >
          {" / "}
          {capLabel}
        </ThemedText>
      </View>
      {showBar ? (
        <View
          style={[styles.barTrack, { backgroundColor: palette.surfaceMuted }]}
        >
          <View
            style={[
              styles.barFill,
              { width: `${Math.round(ratio * 100)}%`, backgroundColor: color },
            ]}
          />
        </View>
      ) : (
        <ThemedText
          style={[styles.tileHint, { color: palette.textSecondary }]}
          numberOfLines={1}
        >
          {enforced ? "No cap on this plan" : "No active subscription"}
        </ThemedText>
      )}
    </View>
  );
}

export default function OrgBillingScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const palette = isDark ? Colors.dark : Colors.light;
  const isWeb = Platform.OS === "web";
  const { organization } = useOrganization();
  const orgId = organization?.id;

  const { data, isLoading, isError, refetch, isRefetching } =
    useQuery<PlanLimitsResponse>({
      queryKey: orgId
        ? ["/api/dashboard/plan-limits", orgId]
        : ["/api/dashboard/plan-limits", "no-org"],
      enabled: !!orgId,
    });

  const planName = data?.plan?.name || "No active plan";
  const planStatus = data?.plan?.status || (data?.enforced ? "active" : "none");
  const enforced = !!data?.enforced;

  const tiles = useMemo(() => {
    if (!data) return [];
    return [
      {
        testID: "plan-usage-tile-branches",
        label: "Branches",
        icon: "git-branch" as keyof typeof Feather.glyphMap,
        ...data.usage.branches,
      },
      {
        testID: "plan-usage-tile-staff",
        label: "Staff",
        icon: "users" as keyof typeof Feather.glyphMap,
        ...data.usage.staffUsers,
      },
      {
        testID: "plan-usage-tile-desks",
        label: "Desks",
        icon: "monitor" as keyof typeof Feather.glyphMap,
        ...data.usage.desks,
      },
      {
        testID: "plan-usage-tile-tickets",
        label: "Daily Tickets",
        icon: "tag" as keyof typeof Feather.glyphMap,
        ...data.usage.dailyTickets,
      },
    ];
  }, [data]);

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
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={palette.primary}
          />
        }
      >
        {!isWeb ? (
          <View style={styles.headerBlock}>
            <ThemedText type="h2" style={styles.headerTitle}>
              Billing
            </ThemedText>
            <ThemedText
              style={[styles.headerSub, { color: palette.textSecondary }]}
            >
              Plan, usage, and invoices
            </ThemedText>
          </View>
        ) : null}

        <Card variant="outlined" testID="card-plan-usage" style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.cardTitle}>Plan Usage</ThemedText>
              <ThemedText
                testID="text-plan-name"
                style={[styles.cardSub, { color: palette.textSecondary }]}
                numberOfLines={1}
              >
                {planName}
                {enforced ? (
                  <ThemedText
                    style={[
                      styles.statusPill,
                      { color: palette.primary },
                    ]}
                  >
                    {"  •  "}
                    {planStatus}
                  </ThemedText>
                ) : null}
              </ThemedText>
            </View>
            {!enforced ? (
              <View
                style={[
                  styles.noPlanBadge,
                  { backgroundColor: palette.surfaceMuted },
                ]}
              >
                <Feather name="info" size={12} color={palette.textSecondary} />
                <ThemedText
                  style={[
                    styles.noPlanBadgeText,
                    { color: palette.textSecondary },
                  ]}
                >
                  Limits not enforced
                </ThemedText>
              </View>
            ) : null}
          </View>

          {isLoading && !data ? (
            <View style={styles.loadingBlock}>
              <ThemedText
                style={{ color: palette.textSecondary, fontSize: 13 }}
              >
                Loading usage…
              </ThemedText>
            </View>
          ) : isError ? (
            <View style={styles.loadingBlock}>
              <ThemedText style={{ color: "#EF4444", fontSize: 13 }}>
                Couldn't load plan usage. Pull to retry.
              </ThemedText>
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

        <Card variant="outlined" style={[styles.card, styles.invoicesCard]}>
          <ThemedText style={styles.cardTitle}>Invoices</ThemedText>
          <ThemedText
            style={[styles.cardSub, { color: palette.textSecondary }]}
          >
            Payment history will appear here once you subscribe to a paid plan.
          </ThemedText>
        </Card>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
  },
  headerBlock: {
    marginBottom: Spacing.sm,
  },
  headerTitle: {
    fontWeight: "700",
  },
  headerSub: {
    fontSize: 13,
    marginTop: 2,
  },
  card: {
    padding: Spacing.xl,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  cardSub: {
    fontSize: 12,
    marginTop: 2,
  },
  statusPill: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
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
  tileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
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
  tileValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  tileValue: {
    fontSize: 22,
    fontWeight: "800",
  },
  tileCap: {
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 2,
  },
  tileHint: {
    fontSize: 11,
    marginTop: 2,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 4,
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
  loadingBlock: {
    paddingVertical: Spacing.lg,
  },
  invoicesCard: {
    gap: Spacing.sm,
  },
});
