import React, { useMemo } from "react";
import { View, StyleSheet, ActivityIndicator } from "react-native";
import Svg, {
  Rect,
  Line,
  Circle,
  G,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
} from "react-native-svg";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { SuperCard } from "./_components/SuperCard";
import { formatCompactMoney, formatPercent, pctChange } from "./_utils/format";

interface PlatformStats {
  organizations: { total: number; active: number; verified: number; newThisMonth: number; newPrevMonth: number };
  users: { total: number };
  branches: { total: number };
  subscriptions: {
    active: number;
    trialing: number;
    cancelled: number;
    activeNewLast30: number;
    activeNewPrev30: number;
    trialingNewLast30: number;
    trialingNewPrev30: number;
  };
  revenue: { last30Days: number; prev30Days: number; lifetime: number; currency: string };
  tickets: { last30Days: number; prev30Days: number; activeNow: number };
}

interface VisitorReport {
  rows: Array<{ orgId: string; org: string; city: string; visitors: number }>;
}

interface MonthlyTickets {
  months: Array<{ month: string; year: number; walkIn: number; appointment: number }>;
}

interface MetricProps {
  label: string;
  value: string;
  change: string;
  positive?: boolean;
  icon: keyof typeof Feather.glyphMap;
  gradientFrom: string;
  gradientTo: string;
}

function MetricCard({
  label,
  value,
  change,
  positive = true,
  icon,
  gradientFrom,
  gradientTo,
}: MetricProps) {
  const { theme } = useTheme();
  return (
    <SuperCard style={{ flex: 1, minWidth: 240 }}>
      <View style={styles.metricRow}>
        <View>
          <ThemedText style={[styles.metricLabel, { color: theme.mutedText }]}>
            {label}
          </ThemedText>
          <ThemedText style={[styles.metricValue, { color: theme.text }]}>
            {value}
          </ThemedText>
          <View style={styles.changeRow}>
            <Feather
              name={positive ? "trending-up" : "trending-down"}
              size={12}
              color={positive ? "#10B981" : "#EF4444"}
            />
            <ThemedText
              lightColor={positive ? "#10B981" : "#EF4444"}
              darkColor={positive ? "#10B981" : "#EF4444"}
              style={styles.changeText}
            >
              {change}
            </ThemedText>
            <ThemedText
              style={[styles.changeMuted, { color: theme.mutedText }]}
            >
              {label === "New Organizations" ? "vs last month" : "new vs prior 30d"}
            </ThemedText>
          </View>
        </View>
        <View style={styles.metricIconWrap}>
          <Svg width={56} height={56}>
            <Defs>
              <LinearGradient id={`g-${label}`} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={gradientFrom} />
                <Stop offset="1" stopColor={gradientTo} />
              </LinearGradient>
            </Defs>
            <Circle cx={28} cy={28} r={26} fill={`url(#g-${label})`} />
          </Svg>
          <View style={styles.metricIconOverlay} pointerEvents="none">
            <Feather name={icon} size={22} color="#FFFFFF" />
          </View>
        </View>
      </View>
    </SuperCard>
  );
}

function TopCitiesChart({ rows, isLoading }: { rows: Array<{ city: string; value: number }>; isLoading: boolean }) {
  const { theme } = useTheme();
  const max = rows.length ? Math.max(...rows.map((c) => c.value)) : 1;
  const barH = 22;
  const gap = 12;
  const labelW = 96;
  const valW = 56;

  return (
    <SuperCard style={{ flex: 2, minWidth: 360 }}>
      <View style={styles.chartHeader}>
        <View>
          <ThemedText style={[styles.chartTitle, { color: theme.text }]}>
            Top Cities by Visitors
          </ThemedText>
          <ThemedText
            style={[styles.chartSub, { color: theme.textSecondary }]}
          >
            Where TIQKETS is getting the most traction
          </ThemedText>
        </View>
        <View
          style={[
            styles.tag,
            {
              backgroundColor: theme.surfaceMuted,
              borderColor: theme.borderSubtle,
            },
          ]}
        >
          <ThemedText style={[styles.tagText, { color: theme.textSecondary }]}>
            Last 30 days
          </ThemedText>
        </View>
      </View>

      <View style={{ marginTop: Spacing.lg }}>
        {isLoading ? (
          <View style={{ paddingVertical: Spacing["2xl"], alignItems: "center" }}>
            <ActivityIndicator color={theme.text} />
          </View>
        ) : rows.length === 0 ? (
          <View style={{ paddingVertical: Spacing["2xl"], alignItems: "center" }}>
            <Feather name="map-pin" size={20} color={theme.mutedText} />
            <ThemedText style={[styles.emptyHint, { color: theme.textSecondary }]}>
              No visitor activity in the last 30 days
            </ThemedText>
          </View>
        ) : (
          rows.map((c) => {
            const w = (c.value / max) * 100;
            return (
              <View key={c.city} style={[styles.cityRow, { height: barH + gap }]}>
                <View style={{ width: labelW }}>
                  <ThemedText
                    style={[styles.cityLabel, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {c.city}
                  </ThemedText>
                </View>
                <View
                  style={[
                    styles.barTrack,
                    { backgroundColor: theme.surfaceMuted },
                  ]}
                >
                  <View
                    style={[
                      styles.barFill,
                      { width: `${w}%`, backgroundColor: BrandColors.primary },
                    ]}
                  />
                </View>
                <View style={{ width: valW, alignItems: "flex-end" }}>
                  <ThemedText
                    style={[styles.cityValue, { color: theme.text }]}
                  >
                    {c.value.toLocaleString()}
                  </ThemedText>
                </View>
              </View>
            );
          })
        )}
      </View>
    </SuperCard>
  );
}

function RevenueGrowthCard({ stats, isLoading }: { stats: PlatformStats | undefined; isLoading: boolean }) {
  const { theme } = useTheme();
  const last = stats?.revenue.last30Days ?? 0;
  const prev = stats?.revenue.prev30Days ?? 0;
  const lifetime = stats?.revenue.lifetime ?? 0;
  const currency = stats?.revenue.currency ?? "INR";
  // Progress = how the recent 30d revenue compares to a soft monthly target.
  // If we have prior period, target = max(prev, last). Otherwise show 0.
  const target = Math.max(prev, last) || 1;
  const progress = Math.min(1, last / target);
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = c * progress;
  const mom = pctChange(last, prev);
  const positive = mom >= 0;

  return (
    <SuperCard style={{ flex: 1, minWidth: 280 }}>
      <ThemedText style={[styles.chartTitle, { color: theme.text }]}>
        Monthly Revenue & Growth
      </ThemedText>
      <ThemedText style={[styles.chartSub, { color: theme.textSecondary }]}>
        Recurring subscriptions in {currency}
      </ThemedText>

      {isLoading ? (
        <View style={{ paddingVertical: Spacing["2xl"], alignItems: "center" }}>
          <ActivityIndicator color={theme.text} />
        </View>
      ) : (
        <View style={styles.revenueWrap}>
          <View style={styles.ringWrap}>
            <Svg width={140} height={140}>
              <Circle
                cx={70}
                cy={70}
                r={r}
                stroke={theme.surfaceMuted}
                strokeWidth={12}
                fill="none"
              />
              <Circle
                cx={70}
                cy={70}
                r={r}
                stroke={BrandColors.primary}
                strokeWidth={12}
                fill="none"
                strokeDasharray={`${dash} ${c}`}
                strokeLinecap="round"
                transform="rotate(-90 70 70)"
              />
              <SvgText
                x={70}
                y={66}
                textAnchor="middle"
                fontSize={22}
                fontWeight="700"
                fill={theme.text}
              >
                {`${Math.round(progress * 100)}%`}
              </SvgText>
              <SvgText
                x={70}
                y={86}
                textAnchor="middle"
                fontSize={10}
                fill={theme.mutedText}
              >
                of target
              </SvgText>
            </Svg>
          </View>
          <View style={{ flex: 1, marginLeft: Spacing.lg }}>
            <ThemedText style={[styles.revenueValue, { color: theme.text }]}>
              {formatCompactMoney(last, currency)}
            </ThemedText>
            <View style={styles.changeRow}>
              <Feather
                name={positive ? "trending-up" : "trending-down"}
                size={12}
                color={positive ? "#10B981" : "#EF4444"}
              />
              <ThemedText
                lightColor={positive ? "#10B981" : "#EF4444"}
                darkColor={positive ? "#10B981" : "#EF4444"}
                style={styles.changeText}
              >
                {formatPercent(mom)}
              </ThemedText>
              <ThemedText
                style={[styles.changeMuted, { color: theme.mutedText }]}
              >
                MoM
              </ThemedText>
            </View>
            <View style={{ marginTop: Spacing.lg, gap: Spacing.sm }}>
              <View style={styles.statLine}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: BrandColors.primary },
                  ]}
                />
                <ThemedText
                  style={[styles.statLineLabel, { color: theme.textSecondary }]}
                >
                  Prior 30 days
                </ThemedText>
                <ThemedText style={[styles.statLineVal, { color: theme.text }]}>
                  {formatCompactMoney(prev, currency)}
                </ThemedText>
              </View>
              <View style={styles.statLine}>
                <View
                  style={[styles.legendDot, { backgroundColor: "#3B82F6" }]}
                />
                <ThemedText
                  style={[styles.statLineLabel, { color: theme.textSecondary }]}
                >
                  Lifetime
                </ThemedText>
                <ThemedText style={[styles.statLineVal, { color: theme.text }]}>
                  {formatCompactMoney(lifetime, currency)}
                </ThemedText>
              </View>
            </View>
          </View>
        </View>
      )}
    </SuperCard>
  );
}

function ActiveTicketsChart({ data, isLoading }: { data: MonthlyTickets["months"]; isLoading: boolean }) {
  const { theme } = useTheme();
  const w = 720;
  const h = 240;
  const pad = { l: 36, r: 16, t: 16, b: 28 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const max = Math.max(1, ...data.flatMap((d) => [d.walkIn, d.appointment]));
  const groupW = data.length ? innerW / data.length : innerW;
  const barW = (groupW - 12) / 2;
  const yTicks = 4;

  return (
    <SuperCard>
      <View style={styles.chartHeader}>
        <View>
          <ThemedText style={[styles.chartTitle, { color: theme.text }]}>
            Tickets Issued
          </ThemedText>
          <ThemedText
            style={[styles.chartSub, { color: theme.textSecondary }]}
          >
            Customer queue tickets vs appointment bookings
          </ThemedText>
        </View>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View
              style={[
                styles.legendDot,
                { backgroundColor: BrandColors.primary },
              ]}
            />
            <ThemedText
              style={[styles.legendLabel, { color: theme.textSecondary }]}
            >
              Walk-in
            </ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: "#3B82F6" }]}
            />
            <ThemedText
              style={[styles.legendLabel, { color: theme.textSecondary }]}
            >
              Appointment
            </ThemedText>
          </View>
        </View>
      </View>

      <View style={{ marginTop: Spacing.lg }}>
        {isLoading ? (
          <View style={{ paddingVertical: Spacing["2xl"], alignItems: "center" }}>
            <ActivityIndicator color={theme.text} />
          </View>
        ) : (
          <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
            {Array.from({ length: yTicks + 1 }).map((_, i) => {
              const y = pad.t + (innerH / yTicks) * i;
              const v = Math.round((max / yTicks) * (yTicks - i));
              return (
                <G key={i}>
                  <Line
                    x1={pad.l}
                    x2={pad.l + innerW}
                    y1={y}
                    y2={y}
                    stroke={theme.borderSubtle}
                    strokeWidth={1}
                  />
                  <SvgText
                    x={pad.l - 6}
                    y={y + 3}
                    textAnchor="end"
                    fontSize={9}
                    fill={theme.mutedText}
                  >
                    {v}
                  </SvgText>
                </G>
              );
            })}
            {data.map((d, i) => {
              const x0 = pad.l + groupW * i + 6;
              const aH = (d.walkIn / max) * innerH;
              const bH = (d.appointment / max) * innerH;
              return (
                <G key={`${d.year}-${d.month}-${i}`}>
                  <Rect
                    x={x0}
                    y={pad.t + innerH - aH}
                    width={barW}
                    height={aH}
                    fill={BrandColors.primary}
                    rx={3}
                  />
                  <Rect
                    x={x0 + barW + 4}
                    y={pad.t + innerH - bH}
                    width={barW}
                    height={bH}
                    fill="#3B82F6"
                    rx={3}
                  />
                  <SvgText
                    x={x0 + barW + 2}
                    y={h - 8}
                    textAnchor="middle"
                    fontSize={10}
                    fill={theme.mutedText}
                  >
                    {d.month}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        )}
      </View>
    </SuperCard>
  );
}

export default function SuperAdminDashboard() {
  const { theme } = useTheme();
  const { currentUser } = useOrganization();

  const { data: stats, isLoading: statsLoading } = useQuery<PlatformStats>({
    queryKey: ["/api/superadmin/stats"],
  });
  const { data: visitors, isLoading: visitorsLoading } = useQuery<VisitorReport>({
    queryKey: ["/api/superadmin/visitors"],
  });
  const { data: monthly, isLoading: monthlyLoading } = useQuery<MonthlyTickets>({
    queryKey: ["/api/superadmin/tickets-monthly"],
  });

  const topCities = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of visitors?.rows ?? []) {
      const key = (r.city || "Unknown").trim();
      map.set(key, (map.get(key) ?? 0) + r.visitors);
    }
    return Array.from(map.entries())
      .map(([city, value]) => ({ city, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }, [visitors]);

  const orgs = stats?.organizations;
  const subs = stats?.subscriptions;
  const tickets = stats?.tickets;

  const newOrgsChange = pctChange(orgs?.newThisMonth ?? 0, orgs?.newPrevMonth ?? 0);
  // For sub counts we don't have point-in-time snapshots, so MoM is computed
  // from "newly created in that status" within last/prev 30-day windows —
  // an honest growth-rate proxy that doesn't pretend to know historical totals.
  const activeSubsChange = pctChange(subs?.activeNewLast30 ?? 0, subs?.activeNewPrev30 ?? 0);
  const trialChange = pctChange(subs?.trialingNewLast30 ?? 0, subs?.trialingNewPrev30 ?? 0);

  return (
    <View style={[styles.root, { backgroundColor: theme.backgroundRoot }]}>
      <View style={styles.contentMax}>
        {/* Welcome */}
        <SuperCard style={{ marginBottom: Spacing.xl }}>
          <View style={styles.welcomeRow}>
            <View style={{ flex: 1 }}>
              <ThemedText
                style={[styles.welcomeKicker, { color: theme.mutedText }]}
              >
                {new Date().toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </ThemedText>
              <ThemedText style={[styles.welcomeTitle, { color: theme.text }]}>
                Welcome back, {currentUser?.name?.split(" ")[0] || "Super Admin"}
              </ThemedText>
              <ThemedText
                style={[styles.welcomeSub, { color: theme.textSecondary }]}
              >
                Here is what's happening across all TIQKETS organizations today.
              </ThemedText>
            </View>
            <View style={styles.welcomeStats}>
              <View
                style={[
                  styles.welcomeStatBox,
                  {
                    backgroundColor: theme.surfaceMuted,
                    borderColor: theme.borderSubtle,
                  },
                ]}
              >
                <ThemedText
                  style={[styles.welcomeStatLabel, { color: theme.mutedText }]}
                >
                  Active Orgs
                </ThemedText>
                <ThemedText
                  style={[styles.welcomeStatValue, { color: theme.text }]}
                >
                  {statsLoading ? "—" : (orgs?.active ?? 0).toLocaleString()}
                </ThemedText>
              </View>
              <View
                style={[
                  styles.welcomeStatBox,
                  {
                    backgroundColor: theme.surfaceMuted,
                    borderColor: theme.borderSubtle,
                  },
                ]}
              >
                <ThemedText
                  style={[styles.welcomeStatLabel, { color: theme.mutedText }]}
                >
                  In Queue Now
                </ThemedText>
                <ThemedText
                  style={[styles.welcomeStatValue, { color: theme.text }]}
                >
                  {statsLoading ? "—" : (tickets?.activeNow ?? 0).toLocaleString()}
                </ThemedText>
              </View>
            </View>
          </View>
        </SuperCard>

        {/* Metric cards */}
        <View style={styles.metricGrid}>
          <MetricCard
            label="Premium Organizations"
            value={statsLoading ? "—" : (subs?.active ?? 0).toLocaleString()}
            change={formatPercent(activeSubsChange)}
            positive={activeSubsChange >= 0}
            icon="award"
            gradientFrom="#8c1867"
            gradientTo="#c9347b"
          />
          <MetricCard
            label="New Organizations"
            value={statsLoading ? "—" : (orgs?.newThisMonth ?? 0).toLocaleString()}
            change={formatPercent(newOrgsChange)}
            positive={newOrgsChange >= 0}
            icon="user-plus"
            gradientFrom="#1d499b"
            gradientTo="#3b82f6"
          />
          <MetricCard
            label="Trial Organizations"
            value={statsLoading ? "—" : (subs?.trialing ?? 0).toLocaleString()}
            change={formatPercent(trialChange)}
            positive={trialChange >= 0}
            icon="clock"
            gradientFrom="#f59e0b"
            gradientTo="#f97316"
          />
        </View>

        {/* Cities + Revenue */}
        <View style={[styles.metricGrid, { marginTop: Spacing.xl }]}>
          <TopCitiesChart rows={topCities} isLoading={visitorsLoading} />
          <RevenueGrowthCard stats={stats} isLoading={statsLoading} />
        </View>

        {/* Active tickets */}
        <View style={{ marginTop: Spacing.xl }}>
          <ActiveTicketsChart data={monthly?.months ?? []} isLoading={monthlyLoading} />
        </View>

        <View style={{ height: Spacing["3xl"] }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: Spacing.xl },
  contentMax: { width: "100%", maxWidth: 1280, alignSelf: "center" },
  welcomeRow: { flexDirection: "row", alignItems: "center", gap: Spacing.lg },
  welcomeKicker: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  welcomeTitle: { fontSize: 22, fontWeight: "700" },
  welcomeSub: { fontSize: 13, marginTop: 4 },
  welcomeStats: { flexDirection: "row", gap: Spacing.md },
  welcomeStatBox: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    minWidth: 110,
    alignItems: "flex-start",
  },
  welcomeStatLabel: { fontSize: 11, fontWeight: "600" },
  welcomeStatValue: { fontSize: 18, fontWeight: "700", marginTop: 4 },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.lg,
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metricLabel: { fontSize: 12, fontWeight: "600", letterSpacing: 0.4 },
  metricValue: { fontSize: 28, fontWeight: "700", marginTop: 6 },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
  },
  changeText: { fontSize: 12, fontWeight: "700" },
  changeMuted: { fontSize: 11, marginLeft: 4 },
  metricIconWrap: { width: 56, height: 56, position: "relative" },
  metricIconOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chartTitle: { fontSize: 15, fontWeight: "700" },
  chartSub: { fontSize: 12, marginTop: 3 },
  tag: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  tagText: { fontSize: 11, fontWeight: "600" },
  cityRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  cityLabel: { fontSize: 13, fontWeight: "500" },
  cityValue: { fontSize: 13, fontWeight: "700" },
  barTrack: {
    flex: 1,
    height: 14,
    borderRadius: BorderRadius.full,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: BorderRadius.full },
  emptyHint: { fontSize: 12, marginTop: 6 },
  revenueWrap: {
    marginTop: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
  },
  ringWrap: { width: 140, height: 140 },
  revenueValue: { fontSize: 28, fontWeight: "700" },
  statLine: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  statLineLabel: { fontSize: 12, flex: 1 },
  statLineVal: { fontSize: 13, fontWeight: "700" },
  legend: { flexDirection: "row", gap: Spacing.lg },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 12, fontWeight: "500" },
});
