import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Image,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

const BRAND = "#8c1867";

export interface ScanResponseData {
  success?: boolean;
  duplicate?: boolean;
  invalid?: boolean;
  eventPaused?: boolean;
  error?: string;
  eventName?: string;
  guests?: number;
  formLabels?: Record<string, string>;
  checkoutAlert?: {
    title: string;
    message: string;
    iconUrl: string;
    maxDurationMinutes: number;
    elapsedMinutes: number;
    capturedAt: string;
  } | null;
  registration?: {
    eventId?: string;
    bookingId?: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    familyMembersCount?: number;
    slotDate?: string | null;
    slotTime?: string | null;
    qrToken?: string;
    formData?: Record<string, any>;
    status?: string;
    visitDurationMinutes?: number | null;
  };
}

// ─── Validity (banner) ───────────────────────────────────────────────────────
type ScanValidity = "valid" | "duplicate" | "invalid" | "preview";

const VALIDITY_CONFIG: Record<ScanValidity, {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  bg: string; light: string; text: string; border: string;
}> = {
  preview:   { icon: "check-circle", label: "Valid Ticket",     bg: "#10B981", light: "#D1FAE5", text: "#065F46", border: "#6EE7B7" },
  valid:     { icon: "check-circle", label: "Valid Entry",      bg: "#10B981", light: "#D1FAE5", text: "#065F46", border: "#6EE7B7" },
  duplicate: { icon: "alert-circle", label: "Already Scanned",  bg: "#F97316", light: "#FFEDD5", text: "#7C2D12", border: "#FDBA74" },
  invalid:   { icon: "x-circle",     label: "Invalid Ticket",   bg: "#EF4444", light: "#FEE2E2", text: "#7F1D1D", border: "#FCA5A5" },
};

// ─── Time summary (separate section) ────────────────────────────────────────
type TimeSummary = { label: string; diffLabel: string; color: string; bg: string; icon: React.ComponentProps<typeof Feather>["name"] };

/** Returns a 3-state time summary with the delta formatted as human-readable text. */
function getTimeSummary(slotDate?: string | null, slotTime?: string | null): TimeSummary | null {
  if (!slotDate || !slotTime) return null;
  try {
    const slotMs = new Date(`${slotDate}T${slotTime}`).getTime();
    if (isNaN(slotMs)) return null;
    const diffMin = (Date.now() - slotMs) / 60000; // positive = past slot
    const absDiff = Math.abs(diffMin);

    const formatDiff = (min: number): string => {
      if (min < 1) return "less than a minute";
      if (min < 60) return `${Math.round(min)} min`;
      const h = Math.floor(min / 60);
      const m = Math.round(min % 60);
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    };

    if (Math.abs(diffMin) <= 15) {
      return {
        label: "On Time",
        diffLabel: absDiff < 1 ? "Right on schedule" : diffMin < 0 ? `${formatDiff(absDiff)} to go` : `${formatDiff(absDiff)} ago`,
        color: "#065F46",
        bg: "#D1FAE5",
        icon: "check-circle",
      };
    }
    if (diffMin < 0) {
      return {
        label: "Early",
        diffLabel: `${formatDiff(absDiff)} early`,
        color: "#92400E",
        bg: "#FEF3C7",
        icon: "clock",
      };
    }
    return {
      label: "Late",
      diffLabel: `${formatDiff(absDiff)} late`,
      color: "#6B7280",
      bg: "#F3F4F6",
      icon: "alert-circle",
    };
  } catch { return null; }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function maskPhone(phone?: string): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return phone;
  return "•".repeat(Math.min(digits.length - 4, 6)) + digits.slice(-4);
}

function fmtKey(k: string): string {
  if (k.includes(" ")) return k.charAt(0).toUpperCase() + k.slice(1);
  return k
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function fmtValue(v: any): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object" && v !== null) return JSON.stringify(v);
  return String(v);
}

function fmtSlot(slotDate?: string | null, slotTime?: string | null): string {
  if (!slotDate) return "—";
  try {
    const d = new Date(`${slotDate}T${slotTime || "00:00"}`);
    const dateStr = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    if (!slotTime) return dateStr;
    return `${dateStr}, ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
  } catch { return slotDate; }
}

function fmtDuration(min?: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  data: ScanResponseData | null;
  action: "checkin" | "exit";
  /** "preview" = show Confirm / Skip buttons; "result" = show Close button */
  mode?: "preview" | "result";
  onClose: () => void;
  /** Called with the (possibly adjusted) familyMembersCount when staff confirms check-in */
  onConfirm?: (familyMembersCount: number) => void;
  confirming?: boolean;
}

export function TicketScanResultModal({
  visible,
  data,
  action,
  mode = "result",
  onClose,
  onConfirm,
  confirming = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { theme, isDark } = useTheme();

  // Derive the initial guest count from the scan data
  const registeredGuests = data?.guests ?? (
    data?.registration?.familyMembersCount != null
      ? 1 + data.registration.familyMembersCount
      : 1
  );

  const [actualGuests, setActualGuests] = useState(registeredGuests);

  // Reset stepper whenever a new ticket is loaded into the modal
  useEffect(() => {
    setActualGuests(registeredGuests);
  }, [data?.registration?.bookingId, registeredGuests]);

  if (!data) return null;

  const reg = data.registration;
  const timeSummary = getTimeSummary(reg?.slotDate, reg?.slotTime);

  const skipFormKeys = new Set(["name", "phone", "email", "customerName", "customerPhone", "customerEmail"]);
  const formEntries = Object.entries(reg?.formData || {}).filter(
    ([k, v]) => !skipFormKeys.has(k) && v !== null && v !== undefined && v !== "",
  );

  // ── Banner: always validity-based ──────────────────────────────────────────
  const validityKey: ScanValidity =
    mode === "preview" ? "preview" :
    data.success      ? "valid" :
    data.duplicate    ? "duplicate" :
    "invalid";
  const vc = VALIDITY_CONFIG[validityKey];

  const suppressValidBanner = action === "exit" && mode === "result" && validityKey === "valid";
  const showCheckoutSurprise = suppressValidBanner && !!data.checkoutAlert;

  // Whether to show the guest count adjuster
  const showGuestAdjuster = action === "checkin" && mode === "preview";

  const guestsDiff = actualGuests - registeredGuests;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: theme.surface,
              paddingBottom: insets.bottom + Spacing.xl,
              minHeight: showCheckoutSurprise ? Math.max(420, windowHeight * 0.52) : undefined,
            },
          ]}
          onPress={() => {}}
        >
          {/* Drag handle */}
          <View style={[styles.handle, { backgroundColor: theme.border }]} />

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              { paddingBottom: Spacing.md },
              showCheckoutSurprise && styles.surpriseScrollContent,
            ]}
          >
            {/* ── 1. Validity banner ── */}
            {!suppressValidBanner ? (
              <View style={[styles.banner, { backgroundColor: vc.light, borderColor: vc.border }]}>
                <View style={[styles.bannerIconWrap, { backgroundColor: vc.bg }]}>
                  <Feather name={vc.icon} size={26} color="#fff" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <ThemedText style={[styles.bannerLabel, { color: vc.text }]}>{vc.label}</ThemedText>
                  {data.error && !data.success && mode === "result" ? (
                    <ThemedText style={[styles.bannerSub, { color: vc.text + "AA" }]} numberOfLines={2}>
                      {data.error}
                    </ThemedText>
                  ) : null}
                  {data.eventPaused ? (
                    <ThemedText style={[styles.bannerSub, { color: "#F97316" }]}>
                      Event is currently paused
                    </ThemedText>
                  ) : null}
                </View>
              </View>
            ) : null}

            {action === "exit" && mode === "result" && data.checkoutAlert ? (
              <View
                style={[
                  styles.checkoutAlert,
                  { backgroundColor: isDark ? "#2B1825" : "#FFF4FA", borderColor: isDark ? "#71365D" : "#E7BDD6" },
                ]}
                testID="checkout-duration-alert"
              >
                <View style={[styles.checkoutAlertIconHalo, { backgroundColor: isDark ? "#45203A" : "#F8DDEA" }]}>
                  <Image
                    source={{ uri: new URL(data.checkoutAlert.iconUrl, getApiUrl()).toString() }}
                    style={styles.checkoutAlertIcon}
                    resizeMode="cover"
                  />
                </View>
                <ThemedText style={[styles.checkoutAlertTitle, { color: BRAND }]}>
                  {data.checkoutAlert.title}
                </ThemedText>
                <ThemedText style={[styles.checkoutAlertMessage, { color: theme.text }]}>
                  {data.checkoutAlert.message}
                </ThemedText>
                <View style={[styles.checkoutAlertMetaPill, { backgroundColor: isDark ? "#3B2634" : "#FFFFFF" }]}>
                  <Feather name="clock" size={13} color={theme.textSecondary} />
                  <ThemedText style={[styles.checkoutAlertMeta, { color: theme.textSecondary }]}>
                    {fmtDuration(data.checkoutAlert.elapsedMinutes)} since check-in · limit {fmtDuration(data.checkoutAlert.maxDurationMinutes)}
                  </ThemedText>
                </View>
              </View>
            ) : null}

            {/* ── 2. Time summary chip ── */}
            {timeSummary && !suppressValidBanner ? (
              <View style={[styles.timeSummaryRow, { backgroundColor: timeSummary.bg }]}>
                <Feather name={timeSummary.icon} size={14} color={timeSummary.color} />
                <View style={{ flex: 1 }}>
                  <ThemedText style={[styles.timeSummaryLabel, { color: timeSummary.color }]}>
                    {timeSummary.label}
                  </ThemedText>
                  <ThemedText style={[styles.timeSummaryDiff, { color: timeSummary.color + "BB" }]}>
                    {timeSummary.diffLabel}
                    {reg?.slotTime ? ` · Slot at ${fmtSlot(reg.slotDate, reg.slotTime).split(", ").pop()}` : ""}
                  </ThemedText>
                </View>
              </View>
            ) : null}

            {/* ── 3. Details card ── */}
            {reg && !suppressValidBanner ? (
              <View style={[styles.detailCard, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}>
                {/* Name + Booking ID */}
                <View style={styles.topRow}>
                  <View style={[styles.avatarBox, { backgroundColor: BRAND + "18" }]}>
                    <Feather name="user" size={22} color={BRAND} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ThemedText style={styles.guestName} numberOfLines={1}>
                      {reg.customerName || "—"}
                    </ThemedText>
                    <ThemedText style={[styles.bookingId, { color: theme.textSecondary }]}>
                      {reg.bookingId || reg.status || "—"}
                    </ThemedText>
                  </View>
                </View>

                <View style={[styles.divider, { backgroundColor: theme.border }]} />

                <DetailRow icon="phone" label="Phone" value={maskPhone(reg.customerPhone)} theme={theme} />
                {data.eventName ? <DetailRow icon="calendar" label="Event" value={data.eventName} theme={theme} /> : null}
                {reg.slotDate ? <DetailRow icon="clock" label="Booked Slot" value={fmtSlot(reg.slotDate, reg.slotTime)} theme={theme} /> : null}
                {action === "exit" && reg.visitDurationMinutes != null ? (
                  <DetailRow icon="activity" label="Visit Duration" value={fmtDuration(reg.visitDurationMinutes)} theme={theme} />
                ) : null}

                {/* ── Guest count adjuster (check-in preview only) ── */}
                {showGuestAdjuster ? (
                  <>
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                    <View style={styles.guestAdjRow}>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={[styles.guestAdjLabel, { color: theme.textSecondary }]}>
                          GUESTS CHECKING IN
                        </ThemedText>
                        <ThemedText style={[styles.guestAdjSub, { color: theme.textSecondary }]}>
                          Registered for {registeredGuests} {registeredGuests === 1 ? "person" : "people"}
                          {guestsDiff !== 0 ? (
                            guestsDiff > 0 ? ` · +${guestsDiff} extra` : ` · ${guestsDiff} fewer`
                          ) : ""}
                        </ThemedText>
                      </View>
                      <View style={styles.stepperWrap}>
                        <Pressable
                          onPress={() => setActualGuests(Math.max(1, actualGuests - 1))}
                          style={[styles.stepperBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
                          disabled={actualGuests <= 1}
                          testID="button-guests-decrease"
                        >
                          <Feather name="minus" size={18} color={actualGuests <= 1 ? theme.textSecondary : BRAND} />
                        </Pressable>
                        <View style={[styles.stepperCount, { borderColor: guestsDiff !== 0 ? BRAND : theme.border, backgroundColor: guestsDiff !== 0 ? BRAND + "10" : theme.backgroundRoot }]}>
                          <ThemedText style={[styles.stepperCountText, { color: guestsDiff !== 0 ? BRAND : theme.text }]}>
                            {actualGuests}
                          </ThemedText>
                        </View>
                        <Pressable
                          onPress={() => setActualGuests(actualGuests + 1)}
                          style={[styles.stepperBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
                          testID="button-guests-increase"
                        >
                          <Feather name="plus" size={18} color={BRAND} />
                        </Pressable>
                      </View>
                    </View>
                    {guestsDiff !== 0 ? (
                      <View style={[styles.guestAdjNote, { backgroundColor: BRAND + "0D", borderColor: BRAND + "30" }]}>
                        <Feather name="info" size={12} color={BRAND} />
                        <ThemedText style={[styles.guestAdjNoteText, { color: BRAND }]}>
                          Count updated — this will be saved to the booking record
                        </ThemedText>
                      </View>
                    ) : null}
                  </>
                ) : (
                  /* Result mode: just show the guest count as a static row */
                  (action === "checkin" || data.guests != null) && actualGuests > 1 ? (
                    <DetailRow icon="users" label="Guests" value={`${actualGuests} people`} theme={theme} />
                  ) : null
                )}

                {/* Custom fields — Q&A format */}
                {formEntries.length > 0 ? (
                  <>
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                    <ThemedText style={[styles.qaHeader, { color: theme.textSecondary }]}>
                      Registration Details
                    </ThemedText>
                    {formEntries.map(([k, v]) => (
                      <View key={k} style={styles.qaItem}>
                        <ThemedText style={[styles.qaQuestion, { color: theme.textSecondary }]}>
                          {data.formLabels?.[k] || fmtKey(k)}
                        </ThemedText>
                        <ThemedText style={styles.qaAnswer}>{fmtValue(v)}</ThemedText>
                      </View>
                    ))}
                  </>
                ) : null}
              </View>
            ) : !suppressValidBanner ? (
              <View style={[styles.detailCard, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}>
                <ThemedText style={{ color: theme.textSecondary, textAlign: "center" }}>
                  {data.error || "Scan could not be processed."}
                </ThemedText>
              </View>
            ) : null}

            {/* Footer buttons */}
            {suppressValidBanner && !data.checkoutAlert ? null : mode === "preview" && onConfirm ? (
              <View style={styles.btnRow}>
                <Pressable
                  onPress={onClose}
                  style={[styles.btnOutline, { borderColor: theme.border }]}
                  disabled={confirming}
                >
                  <ThemedText style={[styles.btnOutlineText, { color: theme.textSecondary }]}>
                    {action === "exit" ? "Cancel" : "Skip"}
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => onConfirm(actualGuests - 1)}
                  style={[styles.btnFill, { backgroundColor: BRAND, opacity: confirming ? 0.7 : 1 }]}
                  disabled={confirming}
                  testID="button-confirm-checkin"
                >
                  {confirming ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Feather name="check-circle" size={16} color="#fff" />
                      <ThemedText style={styles.btnFillText}>
                        {action === "exit" ? "Confirm Check-Out" : `Check In ${actualGuests > 1 ? `(${actualGuests})` : ""}`}
                      </ThemedText>
                    </>
                  )}
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={onClose} style={[styles.closeBtn, { backgroundColor: BRAND }]}>
                <ThemedText style={styles.closeBtnText}>
                  {action === "exit" && mode === "result" && data.error ? "Cancel" : "Close"}
                </ThemedText>
              </Pressable>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DetailRow({
  icon, label, value, theme,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value: string;
  theme: any;
}) {
  return (
    <View style={styles.detailRow}>
      <Feather name={icon} size={14} color={theme.textSecondary} style={{ marginTop: 1 }} />
      <View style={styles.detailRowText}>
        <ThemedText style={[styles.detailLabel, { color: theme.textSecondary }]}>{label}</ThemedText>
        <ThemedText style={styles.detailValue}>{value}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    maxHeight: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: Spacing.lg,
  },
  /* ── Validity banner ── */
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    marginBottom: Spacing.sm,
  },
  bannerIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 2,
  },
  bannerLabel: {
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 4,
  },
  bannerSub: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  /* ── Time summary ── */
  checkoutAlert: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing["2xl"],
    borderRadius: 28,
    borderWidth: 1,
    marginBottom: Spacing.lg,
    overflow: "hidden",
  },
  surpriseScrollContent: {
    flexGrow: 1,
    justifyContent: "space-between",
  },
  checkoutAlertIconHalo: {
    width: 144,
    height: 144,
    borderRadius: 72,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  checkoutAlertIcon: {
    width: 108,
    height: 108,
    borderRadius: 26,
  },
  checkoutAlertTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  checkoutAlertMessage: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  checkoutAlertMetaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  checkoutAlertMeta: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
  timeSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.md,
  },
  timeSummaryLabel: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  timeSummaryDiff: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 16,
  },
  /* ── Detail card ── */
  detailCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  avatarBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  guestName: { fontSize: 16, fontWeight: "700" },
  bookingId: { fontSize: 12, marginTop: 2, fontWeight: "500" },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.sm },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  detailRowText: { flex: 1, minWidth: 0 },
  detailLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 1,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  detailValue: { fontSize: 14, fontWeight: "500" },
  /* ── Guest adjuster ── */
  guestAdjRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  guestAdjLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  guestAdjSub: {
    fontSize: 12,
    fontWeight: "500",
  },
  stepperWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    flexShrink: 0,
  },
  stepperBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperCount: {
    minWidth: 44,
    height: 38,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.sm,
  },
  stepperCountText: {
    fontSize: 18,
    fontWeight: "800",
  },
  guestAdjNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.xs,
  },
  guestAdjNoteText: {
    fontSize: 11,
    fontWeight: "600",
    flex: 1,
    flexWrap: "wrap",
  },
  /* ── Custom fields Q&A ── */
  qaHeader: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  qaItem: {
    marginBottom: Spacing.md,
    paddingLeft: Spacing.xs,
    borderLeftWidth: 2,
    borderLeftColor: BRAND + "40",
  },
  qaQuestion: { fontSize: 12, fontWeight: "600", marginBottom: 3 },
  qaAnswer: { fontSize: 15, fontWeight: "600" },
  /* ── Buttons ── */
  btnRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  btnOutline: {
    flex: 1,
    height: 50,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  btnOutlineText: { fontWeight: "700", fontSize: 15 },
  btnFill: {
    flex: 2,
    height: 50,
    borderRadius: BorderRadius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
  },
  btnFillText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  closeBtn: {
    height: 50,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.xs,
  },
  closeBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
