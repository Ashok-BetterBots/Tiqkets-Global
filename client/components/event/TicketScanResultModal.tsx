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
  registration?: {
    bookingId?: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    familyMembersCount?: number;
    slotDate?: string | null;
    slotTime?: string | null;
    formData?: Record<string, any>;
    status?: string;
    visitDurationMinutes?: number | null;
  };
}

type ScanValidity = "valid" | "duplicate" | "invalid";
type TimeStatus = "early" | "ontime" | "late";

const VALIDITY_COLORS = {
  valid:     { bg: "#10B981", light: "#D1FAE5", text: "#065F46", border: "#6EE7B7" },
  duplicate: { bg: "#F97316", light: "#FFEDD5", text: "#7C2D12", border: "#FDBA74" },
  invalid:   { bg: "#EF4444", light: "#FEE2E2", text: "#7F1D1D", border: "#FCA5A5" },
};

const TIME_COLORS = {
  ontime: { bg: "#D1FAE5", text: "#065F46", border: "#6EE7B7", icon: "#10B981" },
  early:  { bg: "#FEF9C3", text: "#713F12", border: "#FDE047", icon: "#CA8A04" },
  late:   { bg: "#FFEDD5", text: "#7C2D12", border: "#FDBA74", icon: "#F97316" },
};

const PREVIEW_BANNER_BY_TIME: Record<TimeStatus, { bg: string; light: string; text: string; border: string; icon: string; label: string }> = {
  ontime: { bg: "#10B981", light: "#D1FAE5", text: "#065F46", border: "#6EE7B7", icon: "user-check", label: "Ready to Check-In" },
  early:  { bg: "#EAB308", light: "#FEF9C3", text: "#713F12", border: "#FDE047", icon: "clock",      label: "Too Early" },
  late:   { bg: "#F97316", light: "#FFEDD5", text: "#7C2D12", border: "#FDBA74", icon: "alert-circle", label: "Running Late" },
};

function getScanValidity(data: ScanResponseData): ScanValidity {
  if (data.success) return "valid";
  if (data.duplicate) return "duplicate";
  return "invalid";
}

function getTimeStatus(slotDate?: string | null, slotTime?: string | null): TimeStatus | null {
  if (!slotDate || !slotTime) return null;
  try {
    const slotMs = new Date(`${slotDate}T${slotTime}`).getTime();
    if (isNaN(slotMs)) return null;
    const diffMin = (Date.now() - slotMs) / 60000;
    if (diffMin < -60) return "early";
    if (diffMin > 60) return "late";
    return "ontime";
  } catch { return null; }
}

function maskPhone(phone?: string): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return phone;
  const last4 = digits.slice(-4);
  return "•".repeat(Math.min(digits.length - 4, 6)) + last4;
}

function fmtKey(k: string): string {
  // If the key already has spaces it's a human-readable label — just capitalise first letter
  if (k.includes(" ")) {
    return k.charAt(0).toUpperCase() + k.slice(1);
  }
  // Convert camelCase / snake_case → "Title Case"
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
    const timeStr = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    return `${dateStr}, ${timeStr}`;
  } catch { return slotDate; }
}

function fmtDuration(min?: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

const VALIDITY_CONFIG = {
  valid:     { icon: "check-circle" as const, label: "Valid Entry" },
  duplicate: { icon: "alert-circle" as const, label: "Already Scanned" },
  invalid:   { icon: "x-circle" as const,     label: "Invalid Ticket" },
};

const TIME_CONFIG = {
  ontime: { icon: "check-circle" as const, label: "On Time" },
  early:  { icon: "clock" as const,        label: "Too Early" },
  late:   { icon: "alert-circle" as const, label: "Too Late" },
};

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
  const timeStatus = getTimeStatus(reg?.slotDate, reg?.slotTime);
  const tc = timeStatus ? TIME_COLORS[timeStatus] : null;
  const tc_cfg = timeStatus ? TIME_CONFIG[timeStatus] : null;

  const guests = data.guests ?? (reg?.familyMembersCount != null ? 1 + reg.familyMembersCount : 1);

  const skipFormKeys = new Set(["name", "phone", "email", "customerName", "customerPhone", "customerEmail"]);
  const formEntries = Object.entries(reg?.formData || {}).filter(
    ([k, v]) => !skipFormKeys.has(k) && v !== null && v !== undefined && v !== "",
  );

  // ── Banner content ────────────────────────────────────────────────────────
  let bannerBg: string, bannerLight: string, bannerText: string, bannerBorder: string;
  let bannerIcon: React.ComponentProps<typeof Feather>["name"];
  let bannerLabel: string;

  if (mode === "preview") {
    // Preview: colour by time status, neutral if unknown
    const pb = timeStatus
      ? PREVIEW_BANNER_BY_TIME[timeStatus]
      : { bg: BRAND, light: BRAND + "18", text: "#4B0563", border: BRAND + "55", icon: "user", label: "Ticket Found" };
    bannerBg = pb.bg; bannerLight = pb.light; bannerText = pb.text; bannerBorder = pb.border;
    bannerIcon = pb.icon as any; bannerLabel = pb.label;
  } else {
    const validity = getScanValidity(data);
    const vc = VALIDITY_COLORS[validity];
    const vc_cfg = VALIDITY_CONFIG[validity];
    bannerBg = vc.bg; bannerLight = vc.light; bannerText = vc.text; bannerBorder = vc.border;
    bannerIcon = vc_cfg.icon; bannerLabel = vc_cfg.label;
  }

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
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: theme.border }]} />

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: Spacing.md }}
          >
            {/* Status Banner */}
            <View style={[styles.banner, { backgroundColor: bannerLight, borderColor: bannerBorder }]}>
              <View style={[styles.bannerIconWrap, { backgroundColor: bannerBg }]}>
                <Feather name={bannerIcon} size={26} color="#fff" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <ThemedText style={[styles.bannerLabel, { color: bannerText }]}>
                  {bannerLabel}
                </ThemedText>

                {/* Time chip always inline in banner */}
                {tc && tc_cfg ? (
                  <View style={[styles.timeChip, { backgroundColor: tc.bg, borderColor: tc.border }]}>
                    <Feather name={tc_cfg.icon} size={11} color={tc.icon} />
                    <ThemedText style={[styles.timeChipText, { color: tc.text }]}>
                      {tc_cfg.label}
                    </ThemedText>
                  </View>
                ) : null}

                {/* Error sub-text in result mode */}
                {mode === "result" && data.error && !data.success ? (
                  <ThemedText style={[styles.bannerSub, { color: bannerText + "BB" }]} numberOfLines={2}>
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

            {/* Details Card */}
            {reg ? (
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

                {guests > 1 ? (
                  <DetailRow icon="users" label="Guests" value={`${guests} people`} theme={theme} />
                ) : null}

                {data.eventName ? (
                  <DetailRow icon="calendar" label="Event" value={data.eventName} theme={theme} />
                ) : null}

                {reg.slotDate ? (
                  <DetailRow icon="clock" label="Slot" value={fmtSlot(reg.slotDate, reg.slotTime)} theme={theme} />
                ) : null}

                {action === "exit" && reg.visitDurationMinutes != null ? (
                  <DetailRow icon="activity" label="Visit Duration" value={fmtDuration(reg.visitDurationMinutes)} theme={theme} />
                ) : null}

                {formEntries.length > 0 ? (
                  <>
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                    {formEntries.map(([k, v]) => (
                      <DetailRow
                        key={k}
                        icon="file-text"
                        label={fmtKey(k)}
                        value={fmtValue(v)}
                        theme={theme}
                      />
                    ))}
                  </>
                ) : null}
              </View>
            ) : (
              <View style={[styles.detailCard, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}>
                <ThemedText style={{ color: theme.textSecondary, textAlign: "center" }}>
                  {data.error || "Scan could not be processed."}
                </ThemedText>
              </View>
            )}

            {/* Footer buttons */}
            {mode === "preview" && onConfirm ? (
              <View style={styles.btnRow}>
                <Pressable
                  onPress={onClose}
                  style={[styles.btnOutline, { borderColor: theme.border }]}
                  disabled={confirming}
                >
                  <ThemedText style={[styles.btnOutlineText, { color: theme.textSecondary }]}>Skip</ThemedText>
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
                      <ThemedText style={styles.btnFillText}>Confirm Check-In</ThemedText>
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
  icon,
  label,
  value,
  theme,
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
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    marginBottom: Spacing.md,
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
    marginBottom: 5,
  },
  bannerSub: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 3,
  },
  timeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  timeChipText: {
    fontSize: 11,
    fontWeight: "700",
  },
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
  guestName: {
    fontSize: 16,
    fontWeight: "700",
  },
  bookingId: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: "500",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.sm,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  detailRowText: {
    flex: 1,
    minWidth: 0,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 1,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "500",
  },
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
  btnOutlineText: {
    fontWeight: "700",
    fontSize: 15,
  },
  btnFill: {
    flex: 2,
    height: 50,
    borderRadius: BorderRadius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
  },
  btnFillText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  closeBtn: {
    height: 50,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.xs,
  },
  closeBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
