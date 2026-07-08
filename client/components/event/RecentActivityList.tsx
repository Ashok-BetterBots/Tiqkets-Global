import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { getApiUrl } from "@/lib/query-client";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";

const BRAND   = BrandColors.primary;
const SUCCESS = "#10B981";
const DANGER  = "#EF4444";
const AMBER   = "#F59E0B";

const BILLING_PAGE_SIZE = 10;
const DEFAULT_PAGE_SIZE = 20;

type ActivityType = "checkin" | "exit" | "billing";

interface ActivityItem {
  id: string;
  customerName: string;
  bookingId: string;
  locationId?: string | null;
  familyMembersCount?: number;
  createdAt?: string;
  stage?: string;
  slotDate?: string | null;
  slotTime?: string | null;
  checkedInAt?: string | null;
  // billing-only
  invoiceAmount?: number;
  advanceRedeemed?: number;
  finalAmountDue?: number;
  redeemedAt?: string | null;
}

interface Props {
  type: ActivityType;
  refreshKey?: number;
  hideHeader?: boolean;
}

function fmtTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch { return ts; }
}

function fmtSlotTime(slotTime?: string | null): string {
  if (!slotTime) return "—";
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
  checkin: { title: "Recent Check-Ins",    icon: "log-in",      actualIcon: "log-in",      emptyMsg: "No check-ins yet",             actualLabel: "Checked in" },
  exit:    { title: "Recent Check-Outs",   icon: "log-out",     actualIcon: "log-out",     emptyMsg: "No exits yet",                 actualLabel: "Exited" },
  billing: { title: "Recent Transactions", icon: "credit-card", actualIcon: "credit-card", emptyMsg: "No billing transactions yet",  actualLabel: "Billed" },
};

export function RecentActivityList({ type, refreshKey = 0, hideHeader = false }: Props) {
  const { theme } = useTheme();
  const [items, setItems]       = useState<ActivityItem[]>([]);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(false);
  const [eventId, setEventId]   = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const eventIdRef              = useRef<string | null>(null);
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageSize = type === "billing" ? BILLING_PAGE_SIZE : DEFAULT_PAGE_SIZE;

  // Debounce search input — reset to page 1 on change
  const handleSearch = (text: string) => {
    setSearch(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(text);
      setPage(1);
    }, 400);
  };

  const loadItems = useCallback(async (evId: string, pg: number, q: string) => {
    setLoading(true);
    try {
      const searchParam = q ? `&search=${encodeURIComponent(q)}` : "";
      const url = new URL(
        `/api/dashboard/events/${evId}/recent-activity?type=${type}&page=${pg}${searchParam}&t=${Date.now()}`,
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

  // Initial load — find the active event
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
          loadItems(active.id, 1, "");
        }
      } catch {}
    })();
  }, []);

  // Refresh triggered from parent
  useEffect(() => {
    if (refreshKey > 0 && eventIdRef.current) {
      setPage(1);
      setSearch("");
      setDebouncedSearch("");
      loadItems(eventIdRef.current, 1, "");
    }
  }, [refreshKey]);

  // Page change
  useEffect(() => {
    if (eventId && page > 1) loadItems(eventId, page, debouncedSearch);
  }, [page, eventId]);

  // Debounced search change
  useEffect(() => {
    if (eventIdRef.current) loadItems(eventIdRef.current, 1, debouncedSearch);
  }, [debouncedSearch]);

  const meta = TYPE_META[type];
  const isLastPage = items.length < pageSize;

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

      {/* Search bar — billing only */}
      {type === "billing" ? (
        <View style={[styles.searchBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Feather name="search" size={14} color={theme.textSecondary} />
          <TextInput
            value={search}
            onChangeText={handleSearch}
            placeholder="Search by name or booking ID…"
            placeholderTextColor={theme.textSecondary}
            style={[styles.searchInput, { color: theme.text }]}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => handleSearch("")} hitSlop={8}>
              <Feather name="x" size={14} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {items.length === 0 && !loading ? (
        <View style={styles.empty}>
          <Feather name={search ? "search" : "inbox"} size={24} color={theme.textSecondary} />
          <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: Spacing.sm }}>
            {search ? `No results for "${search}"` : meta.emptyMsg}
          </ThemedText>
        </View>
      ) : (
        <>
          {items.map((item, idx) => {
            const isLast = idx === items.length - 1;

            if (type === "billing") {
              return <BillingRow key={item.id} item={item} theme={theme} isLast={isLast} />;
            }

            const guests = 1 + (item.familyMembersCount || 0);
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
                <View style={[styles.rowIcon, { backgroundColor: (type === "exit" ? DANGER : SUCCESS) + "18" }]}>
                  <Feather name={meta.icon} size={14} color={type === "exit" ? DANGER : SUCCESS} />
                </View>

                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.nameRow}>
                    <ThemedText type="body" style={styles.customerName} numberOfLines={1}>
                      {item.customerName}
                    </ThemedText>
                    <ThemedText type="small" style={[styles.bookingId, { color: theme.textSecondary }]} numberOfLines={1}>
                      {item.bookingId}
                    </ThemedText>
                  </View>

                  <View style={styles.infoRow}>
                    <View style={[styles.infoChip, styles.infoChipEqual]}>
                      <Feather name="users" size={11} color={theme.textSecondary} />
                      <ThemedText type="small" style={[styles.infoText, { color: theme.textSecondary }]}>
                        {guests} {guests === 1 ? "guest" : "guests"}
                      </ThemedText>
                    </View>

                    <View style={[styles.infoDivider, { backgroundColor: theme.border }]} />

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
                          <Feather name="log-in" size={11} color={SUCCESS} />
                          <ThemedText type="small" style={[styles.infoText, { color: SUCCESS, fontWeight: "600" }]}>
                            {item.checkedInAt ? fmtTime(item.checkedInAt) : "—"}
                          </ThemedText>
                        </View>
                        <ThemedText style={[styles.timeChipLabel, { color: SUCCESS + "99" }]}>
                          Check-In
                        </ThemedText>
                      </View>
                    )}

                    <View style={[styles.infoDivider, { backgroundColor: theme.border }]} />

                    {type === "checkin" ? (
                      <View style={[styles.infoChip, styles.infoChipEqual, styles.infoChipEnd]}>
                        <Feather name={meta.actualIcon} size={11} color={SUCCESS} />
                        <ThemedText type="small" style={[styles.infoText, { color: SUCCESS, fontWeight: "600" }]}>
                          {fmtTime(item.createdAt)}
                        </ThemedText>
                      </View>
                    ) : (
                      <View style={[styles.infoChipEqual, styles.infoChipEnd, { alignItems: "flex-end" }]}>
                        <View style={styles.timeChipRow}>
                          <Feather name="log-out" size={11} color={DANGER} />
                          <ThemedText type="small" style={[styles.infoText, { color: DANGER, fontWeight: "600" }]}>
                            {fmtTime(item.createdAt)}
                          </ThemedText>
                        </View>
                        <ThemedText style={[styles.timeChipLabel, { color: DANGER + "99" }]}>
                          Check-Out
                        </ThemedText>
                      </View>
                    )}
                  </View>
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
              disabled={isLastPage}
              style={[styles.pageBtn, { borderColor: isLastPage ? theme.border : BRAND, opacity: isLastPage ? 0.4 : 1 }]}
            >
              <ThemedText type="small" style={{ color: isLastPage ? theme.textSecondary : BRAND, fontWeight: "600" }}>
                Next
              </ThemedText>
              <Feather name="chevron-right" size={14} color={isLastPage ? theme.textSecondary : BRAND} />
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

// ── Dedicated billing transaction card ────────────────────────────────────────
function BillingRow({ item, theme, isLast }: { item: ActivityItem; theme: any; isLast: boolean }) {
  const advance = item.advanceRedeemed ?? 0;
  const invoice = item.invoiceAmount ?? 0;
  const due     = item.finalAmountDue ?? 0;

  const fullyCovered = due === 0;
  const statusColor  = fullyCovered ? SUCCESS : AMBER;
  const statusLabel  = fullyCovered ? "Fully Covered" : "Partial";
  const statusIcon: React.ComponentProps<typeof Feather>["name"] = fullyCovered ? "check-circle" : "alert-circle";
  const iconBg       = fullyCovered ? SUCCESS + "18" : AMBER + "18";
  const iconColor    = fullyCovered ? SUCCESS : AMBER;

  return (
    <View
      style={[
        styles.billingCard,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          marginBottom: isLast ? 0 : Spacing.xs,
        },
      ]}
    >
      {/* Top row: icon + name/booking + status badge */}
      <View style={styles.billingTopRow}>
        <View style={[styles.billingIconCircle, { backgroundColor: iconBg }]}>
          <Feather name={statusIcon} size={15} color={iconColor} />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <ThemedText style={styles.billingName} numberOfLines={1}>{item.customerName}</ThemedText>
          <ThemedText style={[styles.billingBookingId, { color: theme.textSecondary }]} numberOfLines={1}>
            {item.bookingId}
          </ThemedText>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: statusColor + "18", borderColor: statusColor + "40" }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <ThemedText style={[styles.statusText, { color: statusColor }]}>{statusLabel}</ThemedText>
        </View>
      </View>

      {/* Amount breakdown grid */}
      <View style={[styles.amountGrid, { borderTopColor: theme.border }]}>
        <View style={styles.amountCell}>
          <ThemedText style={[styles.amountLabel, { color: theme.textSecondary }]}>Advance Applied</ThemedText>
          <ThemedText style={[styles.amountValue, { color: SUCCESS }]}>{fmtPaise(advance)}</ThemedText>
        </View>

        <View style={[styles.amountDivider, { backgroundColor: theme.border }]} />

        <View style={styles.amountCell}>
          <ThemedText style={[styles.amountLabel, { color: theme.textSecondary }]}>Invoice Total</ThemedText>
          <ThemedText style={[styles.amountValue, { color: theme.text }]}>{fmtPaise(invoice)}</ThemedText>
        </View>

        <View style={[styles.amountDivider, { backgroundColor: theme.border }]} />

        <View style={[styles.amountCell, styles.amountCellEnd]}>
          <ThemedText style={[styles.amountLabel, { color: theme.textSecondary }]}>
            {due > 0 ? "Customer Pays" : "Balance Due"}
          </ThemedText>
          <ThemedText style={[styles.amountValue, { color: due > 0 ? AMBER : theme.textSecondary, fontWeight: "800" }]}>
            {due > 0 ? fmtPaise(due) : "Nil"}
          </ThemedText>
        </View>
      </View>

      {/* Time footer */}
      <View style={[styles.billingFooter, { borderTopColor: theme.border }]}>
        <Feather name="clock" size={11} color={theme.textSecondary} />
        <ThemedText style={[styles.billingTime, { color: theme.textSecondary }]}>
          Redeemed at {fmtTime(item.redeemedAt)}
        </ThemedText>
      </View>
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
  // Search bar
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  // Non-billing rows (checkin / exit)
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
  infoChipEqual: { flex: 1 },
  infoChipCenter: { justifyContent: "center" },
  infoChipEnd: { justifyContent: "flex-end" },
  infoDivider: {
    width: StyleSheet.hairlineWidth,
    height: 14,
    marginHorizontal: Spacing.xs,
  },
  infoText: { fontSize: 11 },
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
  // Billing card
  billingCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  billingTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  billingIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  billingName: {
    fontSize: 14,
    fontWeight: "700",
  },
  billingBookingId: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    flexShrink: 0,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  amountGrid: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  amountCell: {
    flex: 1,
    alignItems: "flex-start",
  },
  amountCellEnd: {
    alignItems: "flex-end",
  },
  amountLabel: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  amountValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  amountDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    marginHorizontal: Spacing.sm,
  },
  billingFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
  },
  billingTime: {
    fontSize: 11,
    fontWeight: "500",
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
