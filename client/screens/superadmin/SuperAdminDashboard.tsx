import React from "react";
import { View, StyleSheet } from "react-native";
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
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { SuperCard } from "./_components/SuperCard";

const TOP_CITIES = [
  { city: "Singapore", value: 1820 },
  { city: "Dubai", value: 1540 },
  { city: "London", value: 1320 },
  { city: "New York", value: 1180 },
  { city: "Mumbai", value: 990 },
  { city: "Toronto", value: 820 },
  { city: "Sydney", value: 720 },
];

const ACTIVE_TICKETS = [
  { month: "Jan", a: 320, b: 240 },
  { month: "Feb", a: 410, b: 280 },
  { month: "Mar", a: 360, b: 310 },
  { month: "Apr", a: 480, b: 360 },
  { month: "May", a: 520, b: 410 },
  { month: "Jun", a: 470, b: 380 },
  { month: "Jul", a: 540, b: 460 },
  { month: "Aug", a: 600, b: 510 },
  { month: "Sep", a: 580, b: 490 },
];

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
              vs last month
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

function TopCitiesChart() {
  const { theme } = useTheme();
  const max = Math.max(...TOP_CITIES.map((c) => c.value));
  const barH = 22;
  const gap = 12;
  const labelW = 96;
  const valW = 56;
  const chartH = TOP_CITIES.length * (barH + gap);

  return (
    <SuperCard style={{ flex: 2, minWidth: 360 }}>
      <View style={styles.chartHeader}>
        <View>
          <ThemedText style={[styles.chartTitle, { color: theme.text }]}>
            Top Cities by Active Organizations
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
        {TOP_CITIES.map((c) => {
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
        })}
      </View>
    </SuperCard>
  );
}

function RevenueGrowthCard() {
  const { theme } = useTheme();
  const progress = 0.72;
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = c * progress;

  return (
    <SuperCard style={{ flex: 1, minWidth: 280 }}>
      <ThemedText style={[styles.chartTitle, { color: theme.text }]}>
        Monthly Revenue & Growth
      </ThemedText>
      <ThemedText style={[styles.chartSub, { color: theme.textSecondary }]}>
        Recurring subscriptions in USD
      </ThemedText>

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
              72%
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
            $86,420
          </ThemedText>
          <View style={styles.changeRow}>
            <Feather name="trending-up" size={12} color="#10B981" />
            <ThemedText
              lightColor="#10B981"
              darkColor="#10B981"
              style={styles.changeText}
            >
              +18.4%
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
                Subscriptions
              </ThemedText>
              <ThemedText style={[styles.statLineVal, { color: theme.text }]}>
                $62,140
              </ThemedText>
            </View>
            <View style={styles.statLine}>
              <View
                style={[styles.legendDot, { backgroundColor: "#3B82F6" }]}
              />
              <ThemedText
                style={[styles.statLineLabel, { color: theme.textSecondary }]}
              >
                Add-ons
              </ThemedText>
              <ThemedText style={[styles.statLineVal, { color: theme.text }]}>
                $24,280
              </ThemedText>
            </View>
          </View>
        </View>
      </View>
    </SuperCard>
  );
}

function ActiveTicketsChart() {
  const { theme } = useTheme();
  const w = 720;
  const h = 240;
  const pad = { l: 36, r: 16, t: 16, b: 28 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const max = Math.max(
    ...ACTIVE_TICKETS.flatMap((d) => [d.a, d.b]),
  );
  const groupW = innerW / ACTIVE_TICKETS.length;
  const barW = (groupW - 12) / 2;
  const yTicks = 4;

  return (
    <SuperCard>
      <View style={styles.chartHeader}>
        <View>
          <ThemedText style={[styles.chartTitle, { color: theme.text }]}>
            Active Tickets Issued
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
          {ACTIVE_TICKETS.map((d, i) => {
            const x0 = pad.l + groupW * i + 6;
            const aH = (d.a / max) * innerH;
            const bH = (d.b / max) * innerH;
            return (
              <G key={d.month}>
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
      </View>
    </SuperCard>
  );
}

export default function SuperAdminDashboard() {
  const { theme } = useTheme();
  const { currentUser } = useOrganization();

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
                  Online Orgs
                </ThemedText>
                <ThemedText
                  style={[styles.welcomeStatValue, { color: theme.text }]}
                >
                  248
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
                  Active Now
                </ThemedText>
                <ThemedText
                  style={[styles.welcomeStatValue, { color: theme.text }]}
                >
                  1,432
                </ThemedText>
              </View>
            </View>
          </View>
        </SuperCard>

        {/* Metric cards */}
        <View style={styles.metricGrid}>
          <MetricCard
            label="Premium Organizations"
            value="186"
            change="+12.3%"
            positive
            icon="award"
            gradientFrom="#8c1867"
            gradientTo="#c9347b"
          />
          <MetricCard
            label="New Organizations"
            value="42"
            change="+8.7%"
            positive
            icon="user-plus"
            gradientFrom="#1d499b"
            gradientTo="#3b82f6"
          />
          <MetricCard
            label="Trial Organizations"
            value="63"
            change="-2.1%"
            positive={false}
            icon="clock"
            gradientFrom="#f59e0b"
            gradientTo="#f97316"
          />
        </View>

        {/* Cities + Revenue */}
        <View style={[styles.metricGrid, { marginTop: Spacing.xl }]}>
          <TopCitiesChart />
          <RevenueGrowthCard />
        </View>

        {/* Active tickets */}
        <View style={{ marginTop: Spacing.xl }}>
          <ActiveTicketsChart />
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
