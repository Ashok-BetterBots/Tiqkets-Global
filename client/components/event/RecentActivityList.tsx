import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { getApiUrl } from "@/lib/query-client";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";

const BRAND = BrandColors.primary;

type ActivityType = "checkin" | "exit" | "billing";

interface ActivityItem {
  id: string;
  customerName: string;
  bookingId: string;
  locationId?: string | null;
  familyMembersCount?: number;
  createdAt: string;
  stage?: string;
  slotDate?: string | null;
  slotTime?: string | null;
  checkedInAt?: string | null;
  // billing-only
  invoiceAmount?: number;
  advanceRedeemed?: number;
}

interface Props {
  type: ActivityType;
  refreshKey?: number;
  hideHeader?: boolean;
}

function fmtTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch { return ts; }
}

function fmtSlotTime(slotTime?: string | null): string {
  if (!slotTime) return "—";
  // slotTime is "HH:MM" — parse as today's date to get locale format
  try {
    const [h, m] = slotTime.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch { return slotTime; }
}

function fmtPaise(p: number | null | undefined): string {
  const v = (p || 0) / 100;
  return `\u20B9${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

const TYPE_META: Record<ActivityType, {
  title: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  actualIcon: React.ComponentProps<typeof Feather>["name"];
  emptyMsg: string;
  actualLabel: string;
}> = {
  checkin: { title: "Recent Check-Ins",    icon: "log-in",      actualIcon: "log-in",     emptyMsg: "No check-ins yet",          actualLabel: "Checked in" },
  exit:    { title: "Recent Check-Outs",   icon: "log-out",     actualIcon: "log-out",    emptyMsg: "No exits yet",              actualLabel: "Exited" },
  billing: { title: "Recent Transactions", icon: "credit-card", actualIcon: "credit-card", emptyMsg: "No billing transactions yet", actualLabel: "Billed" },
};

export function RecentActivityList({ type, refreshKey = 0, hideHeader = false }: Props) {
  const { theme } = useTheme();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [eventId, setEventId] = useState<string | null>(null);
  const eventIdRef = useRef<string | null>(null);

  const loadItems = useCallback(async (evId: string, pg: number) => {
    setLoading(true);
    try {
      const url = new URL(
        `/api/dashboard/events/${evId}/recent-activity?type=${type}&page=${pg}&t=${Date.now()}`,
        getApiUrl(),
      );
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch {}
    setLoading(false);
  }, [type]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(new URL(`/api/dashboard/events?t=${Date.now()}`, getApiUrl()), { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        const evList = data.events || data || [];
        const active = evList.find((e: any) => ["published", "active"].includes(e.status)) ?? evList[0];
        if (active) {
          setEventId(active.id);
          eventIdRef.current = active.id;
          loadItems(active.id, 1);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (refreshKey > 0 && eventIdRef.current) {
      setPage(1);
      loadItems(eventIdRef.current, 1);
    }
  }, [refreshKey]);

  useEffect(() => {
    if (eventId && page > 1) loadItems(eventId, page);
  }, [page, eventId]);

  const meta = TYPE_META[type];

  return (
    <View style={[styles.container, { borderTopColor: theme.border }]}>
      {/* Section header */}
      {!hideHeader ? (
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: BRAND + "15" }]}>
            <Feather name={meta.icon} size={13} color={BRAND} />
          </View>
          <ThemedText type="body" style={{ fontWeight: "700", flex: 1 }}>{meta.title}</ThemedText>
          {loading ? <ActivityIndicator size="small" color={BRAND} /> : null}
        </View>
      ) : loading ? (
        <ActivityIndicator size="small" color={BRAND} style={{ alignSelf: "flex-end", marginBottom: Spacing.sm }} />
      ) : null}

      {items.length === 0 && !loading ? (
        <View style={styles.empty}>
          <Feather name="inbox" size={24} color={theme.textSecondary} />
          <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>
            {meta.emptyMsg}
          </ThemedText>
        </View>
      ) : (
        <>
          {items.map((item, idx) => {
            const guests = 1 + (item.familyMembersCount || 0);
            const isLast = idx === items.length - 1;

            return (
              <View
                key={item.id}
                style={[
                  styles.row,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    marginBottom: isLast ? 0 : Spacing.xs,
                  },
                ]}
              >
                {/* Left icon */}
                <View style={[styles.rowIcon, { backgroundColor: BRAND + "12" }]}>
                  <Feather name={meta.icon} size={14} color={BRAND} />
                </View>

                {/* Main content */}
                <View style={{ flex: 1, minWidth: 0 }}>
                  {/* Name + Booking ID — same row */}
                  <View style={styles.nameRow}>
                    <ThemedText type="body" style={styles.customerName} numberOfLines={1}>
                      {item.customerName}
                    </ThemedText>
                    <ThemedText type="small" style={[styles.bookingId, { color: theme.textSecondary }]} numberOfLines={1}>
                      {item.bookingId}
                    </ThemedText>
                  </View>

                  {/* Billing-specific */}
                  {type === "billing" && item.invoiceAmount ? (
                    <ThemedText type="small" style={{ color: "#10B981", fontWeight: "600", marginTop: 2 }}>
                      Invoice: {fmtPaise(item.invoiceAmount)}
                      {item.advanceRedeemed ? ` (Adv: ${fmtPaise(item.advanceRedeemed)})` : ""}
                    </ThemedText>
                  ) : null}

                  {/* Info row — 3 equal columns */}
                  {type !== "billing" ? (
                    <View style={styles.infoRow}>
                      {/* Guests */}
                      <View style={[styles.infoChip, styles.infoChipEqual]}>
                        <Feather name="users" size={11} color={theme.textSecondary} />
                        <ThemedText type="small" style={[styles.infoText, { color: theme.textSecondary }]}>
                          {guests} {guests === 1 ? "guest" : "guests"}
                        </ThemedText>
                      </View>

                      <View style={[styles.infoDivider, { backgroundColor: theme.border }]} />

                      {/* Col 2: slot time (check-in page) | check-in time (check-out page) */}
                      {type === "checkin" ? (
                        <View style={[styles.infoChip, styles.infoChipEqual, styles.infoChipCenter]}>
                          <Feather name="calendar" size={11} color={theme.textSecondary} />
                          <ThemedText type="small" style={[styles.infoText, { color: theme.textSecondary }]}>
                            {item.slotTime ? fmtSlotTime(item.slotTime) : "No slot"}
                          </ThemedText>
                        </View>
                      ) : (
                        <View style={[styles.infoChipEqual, styles.infoChipCenter, { alignItems: "center" }]}>
                          <View style={styles.timeChipRow}>
                            <Feather name="log-in" size={11} color={theme.textSecondary} />
                            <ThemedText type="small" style={[styles.infoText, { color: theme.textSecondary, fontWeight: "600" }]}>
                              {item.checkedInAt ? fmtTime(item.checkedInAt) : "—"}
                            </ThemedText>
                          </View>
                          <ThemedText style={[styles.timeChipLabel, { color: theme.textSecondary }]}>
                            Check-In
                          </ThemedText>
                        </View>
                      )}

                      <View style={[styles.infoDivider, { backgroundColor: theme.border }]} />

                      {/* Col 3: check-in time (check-in page) | check-out time (check-out page) */}
                      {type === "checkin" ? (
                        <View style={[styles.infoChip, styles.infoChipEqual, styles.infoChipEnd]}>
                          <Feather name={meta.actualIcon} size={11} color={BRAND} />
                          <ThemedText type="small" style={[styles.infoText, { color: BRAND, fontWeight: "600" }]}>
                            {fmtTime(item.createdAt)}
                          </ThemedText>
                        </View>
                      ) : (
                        <View style={[styles.infoChipEqual, styles.infoChipEnd, { alignItems: "flex-end" }]}>
                          <View style={styles.timeChipRow}>
                            <Feather name="log-out" size={11} color={BRAND} />
                            <ThemedText type="small" style={[styles.infoText, { color: BRAND, fontWeight: "600" }]}>
                              {fmtTime(item.createdAt)}
                            </ThemedText>
                          </View>
                          <ThemedText style={[styles.timeChipLabel, { color: BRAND + "99" }]}>
                            Check-Out
                          </ThemedText>
                        </View>
                      )}
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}

          {/* Pagination */}
          <View style={styles.pagination}>
            <Pressable
              onPress={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={[styles.pageBtn, { borderColor: page <= 1 ? theme.border : BRAND, opacity: page <= 1 ? 0.4 : 1 }]}
            >
              <Feather name="chevron-left" size={14} color={page <= 1 ? theme.textSecondary : BRAND} />
              <ThemedText type="small" style={{ color: page <= 1 ? theme.textSecondary : BRAND, fontWeight: "600" }}>
                Prev
              </ThemedText>
            </Pressable>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>Page {page}</ThemedText>
            <Pressable
              onPress={() => setPage((p) => p + 1)}
              disabled={items.length < 20}
              style={[styles.pageBtn, { borderColor: items.length < 20 ? theme.border : BRAND, opacity: items.length < 20 ? 0.4 : 1 }]}
            >
              <ThemedText type="small" style={{ color: items.length < 20 ? theme.textSecondary : BRAND, fontWeight: "600" }}>
                Next
              </ThemedText>
              <Feather name="chevron-right" size={14} color={items.length < 20 ? theme.textSecondary : BRAND} />
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing["2xl"],
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    alignItems: "center",
    padding: Spacing.xl,
    gap: Spacing.xs,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    marginBottom: 2,
  },
  customerName: {
    fontWeight: "600",
    flex: 1,
  },
  bookingId: {
    fontSize: 11,
    fontWeight: "500",
    flexShrink: 0,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 2,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  infoChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  infoChipEqual: {
    flex: 1,
  },
  infoChipCenter: {
    justifyContent: "center",
  },
  infoChipEnd: {
    justifyContent: "flex-end",
  },
  infoDivider: {
    width: StyleSheet.hairlineWidth,
    height: 14,
    marginHorizontal: Spacing.xs,
  },
  infoText: {
    fontSize: 11,
  },
  timeChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  timeChipLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginTop: 1,
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.md,
  },
  pageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
});
