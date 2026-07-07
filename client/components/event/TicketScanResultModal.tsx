import React from "react";
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  ScrollView,
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

const COLORS = {
  valid:     { bg: "#10B981", light: "#D1FAE5", text: "#065F46", border: "#6EE7B7" },
  duplicate: { bg: "#F97316", light: "#FFEDD5", text: "#7C2D12", border: "#FDBA74" },
  invalid:   { bg: "#EF4444", light: "#FEE2E2", text: "#7F1D1D", border: "#FCA5A5" },
};

const TIME_COLORS = {
  ontime: { bg: "#D1FAE5", text: "#065F46", border: "#6EE7B7" },
  early:  { bg: "#FEF9C3", text: "#713F12", border: "#FDE047" },
  late:   { bg: "#FFEDD5", text: "#7C2D12", border: "#FDBA74" },
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
  const masked = "•".repeat(digits.length - 4);
  return masked + last4;
}

function fmtKey(k: string): string {
  return k
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
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
  if (min < 60) return `${min}m`;
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
  onClose: () => void;
}

export function TicketScanResultModal({ visible, data, action, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  if (!data) return null;

  const validity = getScanValidity(data);
  const vc = COLORS[validity];
  const vc_cfg = VALIDITY_CONFIG[validity];

  const reg = data.registration;
  const timeStatus = getTimeStatus(reg?.slotDate, reg?.slotTime);
  const tc = timeStatus ? TIME_COLORS[timeStatus] : null;
  const tc_cfg = timeStatus ? TIME_CONFIG[timeStatus] : null;

  const guests = data.guests ?? (reg?.familyMembersCount != null ? 1 + reg.familyMembersCount : 1);

  const skipFormKeys = new Set(["name", "phone", "email", "customerName", "customerPhone", "customerEmail"]);
  const formEntries = Object.entries(reg?.formData || {}).filter(
    ([k, v]) => !skipFormKeys.has(k) && v !== null && v !== undefined && v !== "",
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + Spacing.xl }]} onPress={() => {}}>
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: theme.border }]} />

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: Spacing.md }}
          >
            {/* Status Banner */}
            <View style={[styles.banner, { backgroundColor: vc.light, borderColor: vc.border }]}>
              <View style={[styles.bannerIconWrap, { backgroundColor: vc.bg }]}>
                <Feather name={vc_cfg.icon} size={28} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={[styles.bannerLabel, { color: vc.text }]}>
                  {vc_cfg.label}
                </ThemedText>
                {data.error && validity !== "valid" ? (
                  <ThemedText style={[styles.bannerSub, { color: vc.text + "BB" }]} numberOfLines={2}>
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
                {/* Row: Name + Booking ID */}
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

                {/* Phone */}
                <DetailRow
                  icon="phone"
                  label="Phone"
                  value={maskPhone(reg.customerPhone)}
                  theme={theme}
                />

                {/* Guests */}
                {guests > 1 ? (
                  <DetailRow
                    icon="users"
                    label="Guests"
                    value={`${guests} people`}
                    theme={theme}
                  />
                ) : null}

                {/* Event */}
                {data.eventName ? (
                  <DetailRow
                    icon="calendar"
                    label="Event"
                    value={data.eventName}
                    theme={theme}
                  />
                ) : null}

                {/* Slot */}
                {reg.slotDate ? (
                  <DetailRow
                    icon="clock"
                    label="Slot"
                    value={fmtSlot(reg.slotDate, reg.slotTime)}
                    theme={theme}
                  />
                ) : null}

                {/* Time status chip */}
                {tc && tc_cfg ? (
                  <View style={styles.chipRow}>
                    <View style={[styles.chip, { backgroundColor: tc.bg, borderColor: tc.border }]}>
                      <Feather name={tc_cfg.icon} size={13} color={tc.text} />
                      <ThemedText style={[styles.chipText, { color: tc.text }]}>
                        {tc_cfg.label}
                      </ThemedText>
                    </View>
                  </View>
                ) : null}

                {/* Visit duration (for exit) */}
                {action === "exit" && reg.visitDurationMinutes != null ? (
                  <DetailRow
                    icon="activity"
                    label="Visit Duration"
                    value={fmtDuration(reg.visitDurationMinutes)}
                    theme={theme}
                  />
                ) : null}

                {/* Custom form fields */}
                {formEntries.length > 0 ? (
                  <>
                    <View style={[styles.divider, { backgroundColor: theme.border }]} />
                    {formEntries.map(([k, v]) => (
                      <DetailRow
                        key={k}
                        icon="file-text"
                        label={fmtKey(k)}
                        value={typeof v === "object" ? JSON.stringify(v) : String(v)}
                        theme={theme}
                      />
                    ))}
                  </>
                ) : null}
              </View>
            ) : (
              /* No registration data — just show the error */
              <View style={[styles.detailCard, { backgroundColor: theme.backgroundRoot, borderColor: theme.border }]}>
                <ThemedText style={{ color: theme.textSecondary, textAlign: "center" }}>
                  {data.error || "Scan could not be processed."}
                </ThemedText>
              </View>
            )}

            {/* Close button */}
            <Pressable
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: BRAND }]}
            >
              <ThemedText style={styles.closeBtnText}>Close</ThemedText>
            </Pressable>
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
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    marginBottom: Spacing.md,
  },
  bannerIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bannerLabel: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 2,
  },
  bannerSub: {
    fontSize: 13,
    fontWeight: "500",
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
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  guestName: {
    fontSize: 16,
    fontWeight: "700",
  },
  bookingId: {
    fontSize: 13,
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
  chipRow: {
    flexDirection: "row",
    marginBottom: Spacing.sm,
    marginLeft: 22,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
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
