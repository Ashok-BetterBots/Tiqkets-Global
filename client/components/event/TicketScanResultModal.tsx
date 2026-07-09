import React from "react";
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";

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
  registration?: {
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
      // Within 15 min either side → On Time
      return {
        label: "On Time",
        diffLabel: absDiff < 1 ? "Right on schedule" : diffMin < 0 ? `${formatDiff(absDiff)} to go` : `${formatDiff(absDiff)} ago`,
        color: "#065F46",
        bg: "#D1FAE5",
        icon: "check-circle",
      };
    }
    if (diffMin < 0) {
      // Before slot → Early
      return {
        label: "Early",
        diffLabel: `${formatDiff(absDiff)} early`,
        color: "#92400E",
        bg: "#FEF3C7",
        icon: "clock",
      };
    }
    // After slot → Late
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
  onConfirm?: () => void;
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
  const { theme } = useTheme();

  if (!data) return null;

  const reg = data.registration;
  const timeSummary = getTimeSummary(reg?.slotDate, reg?.slotTime);

  const guests = data.guests ?? (reg?.familyMembersCount != null ? 1 + reg.familyMembersCount : 1);

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

  // Check-out: a successful exit shows no banner/info at all — only invalid
  // or duplicate scans surface an alert. (Check-in keeps the visual confirmation.)
  const suppressValidBanner = action === "exit" && mode === "result" && validityKey === "valid";

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
          style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + Spacing.xl }]}
          onPress={() => {}}
        >
          {/* Drag handle */}
          <View style={[styles.handle, { backgroundColor: theme.border }]} />

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: Spacing.md }}
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

                <DetailRow icon="phone"    label="Phone"  value={maskPhone(reg.customerPhone)} theme={theme} />
                {guests > 1 ? <DetailRow icon="users" label="Guests" value={`${guests} people`} theme={theme} /> : null}
                {data.eventName ? <DetailRow icon="calendar" label="Event" value={data.eventName} theme={theme} /> : null}
                {reg.slotDate ? <DetailRow icon="clock" label="Booked Slot" value={fmtSlot(reg.slotDate, reg.slotTime)} theme={theme} /> : null}
                {action === "exit" && reg.visitDurationMinutes != null ? (
                  <DetailRow icon="activity" label="Visit Duration" value={fmtDuration(reg.visitDurationMinutes)} theme={theme} />
                ) : null}

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
            {suppressValidBanner ? null : mode === "preview" && onConfirm ? (
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
                  onPress={onConfirm}
                  style={[styles.btnFill, { backgroundColor: BRAND, opacity: confirming ? 0.7 : 1 }]}
                  disabled={confirming}
                >
                  {confirming ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Feather name="check-circle" size={16} color="#fff" />
                      <ThemedText style={styles.btnFillText}>
                        {action === "exit" ? "Confirm Check-Out" : "Confirm Check-In"}
                      </ThemedText>
                    </>
                  )}
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={onClose} style={[styles.closeBtn, { backgroundColor: BRAND }]}>
                <ThemedText style={styles.closeBtnText}>Close</ThemedText>
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
