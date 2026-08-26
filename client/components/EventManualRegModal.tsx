import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { getApiUrl } from "@/lib/query-client";
import { BrandColors, Spacing, BorderRadius } from "@/constants/theme";

const BRAND = BrandColors.primary;

interface InputField {
  id: string;
  label: string;
  type: "text" | "number" | "select" | "checkbox" | "date" | "phone" | "email";
  required?: boolean;
  options?: string[];
}

interface SlotTime { time: string; label: string; available: number; past: boolean; }
interface SlotDay { date: string; label: string; times: SlotTime[]; }
interface EventLocation {
  id: string;
  name: string;
  registrationFee: number;
  inputFields: InputField[];
  slots: SlotDay[];
}
interface LandingData {
  event?: { registrationFee?: number | null };
  locations: EventLocation[];
  slots: SlotDay[];
}

interface Registration {
  id: string;
  customerName: string;
  customerPhone: string;
  bookingId?: string;
  qrToken?: string;
}

async function fetchJson(path: string): Promise<any> {
  const res = await fetch(new URL(path, getApiUrl()), { credentials: "include" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    let b: any = null;
    try { b = JSON.parse(t); } catch {}
    throw new Error(b?.error || `Request failed (${res.status})`);
  }
  return res.json();
}

async function postJson(path: string, body: any): Promise<any> {
  const res = await fetch(new URL(path, getApiUrl()), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const t = await res.text().catch(() => "");
  let data: any = null;
  try { data = JSON.parse(t); } catch {}
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

interface EmptyForm {
  locationId: string;
  slotDate: string;
  slotTime: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  familyMembersCount: string;
  formData: Record<string, any>;
  paymentMode: "offline_paid" | "complimentary" | "unpaid";
  paymentReason: string;
  amountCollected: string;
  ticketMethod: "generate" | "preprinted";
  preprintedTicketCode: string;
  hasSpecialNeeds: boolean;
  preferredLanguage: "en" | "ta";
}

const EMPTY_FORM: EmptyForm = {
  locationId: "",
  slotDate: "",
  slotTime: "",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  familyMembersCount: "0",
  formData: {},
  paymentMode: "offline_paid",
  paymentReason: "",
  amountCollected: "",
  ticketMethod: "generate",
  preprintedTicketCode: "",
  hasSpecialNeeds: false,
  preferredLanguage: "en",
};

export function EventManualRegModal({
  visible,
  onClose,
  branchId,
  eventId,
  eventName,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  branchId: string | null;
  eventId: string | null;
  eventName?: string;
  onSuccess?: () => void;
}) {
  const isDark = useColorScheme() === "dark";
  const { height: screenHeight } = useWindowDimensions();
  const surface = isDark ? "#1C1C1E" : "#FFFFFF";
  const bg = isDark ? "#0F0F12" : "#F5F6F8";
  const text = isDark ? "#F5F5F5" : "#1A1A2E";
  const textSecondary = isDark ? "#9AA0A6" : "#6B7280";
  const border = isDark ? "#2C2C2E" : "#E5E7EB";

  const [loadingLocations, setLoadingLocations] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [locations, setLocations] = useState<EventLocation[]>([]);
  const [form, setForm] = useState<EmptyForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<Registration | null>(null);
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraScanned, setCameraScanned] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const CameraModule = Platform.OS !== "web" ? require("expo-camera") : null;
  const { CameraView, useCameraPermissions } = CameraModule || {
    CameraView: null,
    useCameraPermissions: () => [null, async () => ({ granted: false })],
  };
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  useEffect(() => {
    if (!visible) return;
    setForm(EMPTY_FORM);
    setSuccess(null);
    setLoadError(null);
    setCameraOpen(false);
    setCameraScanned(false);
    setCameraError(null);
    if (!branchId || !eventId) return;
    setLoadingLocations(true);
    setLocations([]);
    fetchJson(`/api/event/${branchId}/${eventId}?t=${Date.now()}`)
      .then((data: LandingData) => {
        const eventFee = Number(data.event?.registrationFee ?? 0);
        const locs = (data.locations && data.locations.length > 0)
          ? data.locations.map((location) => ({
            ...location,
            registrationFee: location.registrationFee == null ? eventFee : Number(location.registrationFee) || 0,
          }))
          : [{ id: "", name: eventName || "Event", registrationFee: eventFee, inputFields: [], slots: data.slots || [] }];
        setLocations(locs);
        const fee = Number(locs[0]?.registrationFee || 0) / 100;
        setForm((f) => ({ ...f, amountCollected: String(fee), paymentMode: "offline_paid" }));
      })
      .catch((e: any) => setLoadError(e?.message || "Failed to load event slots"))
      .finally(() => setLoadingLocations(false));
  }, [visible, branchId, eventId]);

  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === form.locationId) || locations[0] || null,
    [locations, form.locationId],
  );
  const slotDates = selectedLocation?.slots || [];
  const selectedDay = useMemo(
    () => slotDates.find((d) => d.date === form.slotDate) || null,
    [slotDates, form.slotDate],
  );
  const bookableTimes = useMemo(
    () => (selectedDay?.times || []).filter((t) => !t.past && t.available > 0),
    [selectedDay],
  );

  const minDate = useMemo(() => {
    if (!slotDates.length) return new Date();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const first = new Date(slotDates[0].date + "T00:00:00");
    return first > today ? first : today;
  }, [slotDates]);
  const maxDate = useMemo(() => {
    if (!slotDates.length) return undefined;
    return new Date(slotDates[slotDates.length - 1].date + "T00:00:00");
  }, [slotDates]);
  const bookableDateSet = useMemo(
    () => new Set(slotDates.filter((d) => d.times.some((t) => !t.past && t.available > 0)).map((d) => d.date)),
    [slotDates],
  );
  // Infant/senior: split available dates into [all-except-last] vs [last]
  const availableDates = useMemo(
    () => slotDates.filter((d) => d.times.some((t) => !t.past && t.available > 0)),
    [slotDates],
  );
  const lastDate = availableDates.length > 0 ? availableDates[availableDates.length - 1] : null;
  const regularDates = availableDates.length > 1 ? availableDates.slice(0, -1) : availableDates;
  const formatDropdownDate = (dateStr: string): string => {
    try {
      const d = new Date(dateStr + "T00:00:00");
      return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    } catch { return dateStr; }
  };

  const amountDue = Number(selectedLocation?.registrationFee || 0) / 100;
  const amountCollectedNum = Number(form.amountCollected) || 0;
  const balanceDue = Math.max(0, amountDue - amountCollectedNum);
  const needsPaymentReason = form.paymentMode !== "offline_paid";

  const missingRequiredField = useMemo(() => {
    const fields = selectedLocation?.inputFields || [];
    for (const f of fields) {
      if (!f.required) continue;
      const v = form.formData[f.id];
      if (f.type === "checkbox") { continue; } // checkboxes are never required-to-block (web parity)
      if (v === undefined || v === null || String(v).trim() === "") return f.label;
    }
    return null;
  }, [selectedLocation, form.formData]);

  const canSubmit =
    !saving &&
    form.customerName.trim().length > 1 &&
    form.customerPhone.replace(/\D/g, "").length >= 10 &&
    !!form.slotDate &&
    !!form.slotTime &&
    !missingRequiredField &&
    (!needsPaymentReason || form.paymentReason.trim().length > 1) &&
    (form.paymentMode !== "offline_paid" || balanceDue <= 0) &&
    (form.ticketMethod !== "preprinted" || form.preprintedTicketCode.trim().length > 0);

  const setField = useCallback((patch: Partial<EmptyForm>) => setForm((f) => ({ ...f, ...patch })), []);
  const setCustomField = useCallback((fid: string, value: any) => {
    setForm((f) => ({ ...f, formData: { ...f.formData, [fid]: value } }));
  }, []);

  const openCameraScanner = useCallback(async () => {
    setCameraError(null);
    if (!CameraView) {
      setCameraError("Camera scanning is unavailable here. Enter the printed ticket ID instead.");
      return;
    }
    const permission = cameraPermission?.granted
      ? cameraPermission
      : await requestCameraPermission();
    if (!permission?.granted) {
      setCameraError("Camera permission was not granted. Enter the printed ticket ID instead.");
      return;
    }
    setCameraScanned(false);
    setCameraOpen(true);
  }, [CameraView, cameraPermission, requestCameraPermission]);

  const handlePreprintedTicketScan = useCallback((result: { data: string }) => {
    if (cameraScanned || !result.data?.trim()) return;
    setCameraScanned(true);
    // New print sheets encode the PTK booking ID directly in the QR.
    // Old print sheets encoded the event-ticket URL — extract just the token
    // so the server can look it up by qrToken. Either way, uppercase it.
    const raw = result.data.trim();
    const urlMatch = raw.match(/event-ticket\/([a-f0-9]{16,64})/i);
    const parsed = urlMatch ? urlMatch[1].toUpperCase() : raw.toUpperCase();
    setField({ preprintedTicketCode: parsed });
    setCameraOpen(false);
  }, [cameraScanned, setField]);

  const submit = useCallback(async () => {
    if (!eventId || !canSubmit) return;
    setSaving(true);
    try {
      const data = await postJson("/api/dashboard/events/registrations/manual", {
        eventId,
        locationId: selectedLocation?.id || null,
        slotDate: form.slotDate,
        slotTime: form.slotTime,
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        customerEmail: form.customerEmail.trim() || null,
        familyMembersCount: parseInt(form.familyMembersCount, 10) || 0,
        priorityAccess: form.hasSpecialNeeds,
        preferredLanguage: form.preferredLanguage,
        formData: form.formData,
        paymentMode: form.paymentMode,
        paymentReason: form.paymentReason.trim() || null,
        amountCollected: Math.round(amountCollectedNum * 100),
        ticketMethod: form.ticketMethod,
        preprintedTicketCode: form.preprintedTicketCode.trim() || null,
      });
      setSuccess(data.registration || null);
      onSuccess?.();
    } catch (e: any) {
      const msg = (e?.message || "Failed to create registration") as string;
      setLoadError(msg);
      // Show an alert so the error is visible regardless of scroll position —
      // the error box in the form is at the top and easy to miss when the
      // user is scrolled down to the Register button.
      Alert.alert("Registration failed", msg, [{ text: "OK" }]);
    } finally {
      setSaving(false);
    }
  }, [eventId, canSubmit, selectedLocation, form, amountCollectedNum, onSuccess]);

  const sheetHeight = Math.round(screenHeight * 0.75);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.card, { backgroundColor: surface, height: sheetHeight }]}
            testID="manual-reg-sheet"
          >
            <View style={[styles.handle, { backgroundColor: border }]} />
            <View style={styles.header}>
              <ThemedText style={{ fontSize: 18, fontWeight: "800", color: text, flex: 1 }}>
                {success ? "Registered" : "Add Customer"}
              </ThemedText>
              <Pressable onPress={onClose} hitSlop={12} testID="button-close-manual-reg">
                <Feather name="x" size={22} color={textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.scrollBody}
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              nestedScrollEnabled
              testID="manual-reg-scroll"
            >
              {loadingLocations ? (
                <View style={{ paddingVertical: Spacing.xl, alignItems: "center" }}>
                  <ActivityIndicator color={BRAND} />
                </View>
              ) : success ? (
                <View style={{ gap: Spacing.md }}>
                  <View style={[styles.successBox, { backgroundColor: "#10B98115", borderColor: "#10B98140" }]}>
                    <Feather name="check-circle" size={28} color="#10B981" />
                    <ThemedText style={{ fontWeight: "800", fontSize: 16, color: text, marginTop: 6 }}>
                      {success.customerName}
                    </ThemedText>
                    {success.bookingId ? (
                      <ThemedText style={{ color: textSecondary, fontSize: 12, marginTop: 2 }}>
                        {success.bookingId}
                      </ThemedText>
                    ) : null}
                    <ThemedText style={{ color: textSecondary, fontSize: 12, textAlign: "center", marginTop: 6 }}>
                      Ticket generated and sent on WhatsApp to {success.customerPhone}
                    </ThemedText>
                  </View>
                  <Pressable
                    style={[styles.primaryBtn, { backgroundColor: BRAND }]}
                    onPress={() => { setSuccess(null); setForm({ ...EMPTY_FORM, amountCollected: String(amountDue) }); }}
                    testID="button-add-another"
                  >
                    <ThemedText style={{ color: "#FFF", fontWeight: "700" }}>Add another</ThemedText>
                  </Pressable>
                </View>
              ) : (
                <View style={{ gap: Spacing.md }}>
                  {loadError ? (
                    <View style={[styles.errorBox, { backgroundColor: "#EF444415", borderColor: "#EF444440" }]}>
                      <ThemedText style={{ color: "#EF4444", fontSize: 12 }}>{loadError}</ThemedText>
                    </View>
                  ) : null}

                  {locations.length > 1 ? (
                    <Field label="Location">
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.xs }}>
                        {locations.map((l) => {
                          const sel = l.id === (selectedLocation?.id ?? locations[0]?.id);
                          return (
                            <Pressable
                              key={l.id}
                              onPress={() => setField({ locationId: l.id, slotDate: "", slotTime: "", amountCollected: String(Number(l.registrationFee || 0) / 100) })}
                              style={[styles.chip, { borderColor: sel ? BRAND : border, backgroundColor: sel ? BRAND + "15" : "transparent" }]}
                              testID={`chip-location-${l.id}`}
                            >
                              <ThemedText style={{ fontSize: 13, fontWeight: sel ? "700" : "500", color: sel ? BRAND : text }}>
                                {l.name}
                              </ThemedText>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </Field>
                  ) : null}

                  {/* ── Infant / senior citizens checkbox — shown FIRST ── */}
                  <Pressable
                    onPress={() => {
                      const next = !form.hasSpecialNeeds;
                      if (next) {
                        setField({ hasSpecialNeeds: true, slotDate: lastDate?.date || "", slotTime: "" });
                        setShowDateDropdown(false);
                      } else {
                        setField({ hasSpecialNeeds: false, slotDate: "", slotTime: "" });
                        setShowDateDropdown(false);
                      }
                    }}
                    style={{ flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm, paddingVertical: Spacing.xs }}
                    testID="checkbox-special-needs"
                  >
                    <View style={{
                      width: 20, height: 20, borderRadius: 4, borderWidth: 2,
                      borderColor: form.hasSpecialNeeds ? BRAND : border,
                      backgroundColor: form.hasSpecialNeeds ? BRAND : "transparent",
                      alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0,
                    }}>
                      {form.hasSpecialNeeds && <Feather name="check" size={12} color="#FFF" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={{ color: text, fontSize: 13, fontWeight: "600" }}>
                        Visiting with infants / senior citizens / pregnant women?
                      </ThemedText>
                      <ThemedText style={{ color: textSecondary, fontSize: 11, marginTop: 2 }}>
                        The last available event date will be auto-selected
                      </ThemedText>
                    </View>
                  </Pressable>

                  {/* ── Slot date — locked (special needs) or dropdown ── */}
                  <Field label="Slot date">
                    {form.hasSpecialNeeds ? (
                      <View style={[styles.input, { borderColor: border, flexDirection: "row", alignItems: "center", gap: Spacing.sm, opacity: 0.85 }]}>
                        <Feather name="lock" size={14} color={BRAND} />
                        <ThemedText style={{ color: text, flex: 1 }}>
                          {lastDate ? formatDropdownDate(lastDate.date) : "No dates available"}
                        </ThemedText>
                        <ThemedText style={{ color: textSecondary, fontSize: 11 }}>Last day</ThemedText>
                      </View>
                    ) : (
                      <>
                        <Pressable
                          onPress={() => setShowDateDropdown((v) => !v)}
                          style={[styles.input, { borderColor: showDateDropdown ? BRAND : border, flexDirection: "row", alignItems: "center", gap: Spacing.sm }]}
                          testID="button-manual-reg-date"
                        >
                          <Feather name="calendar" size={15} color={BRAND} />
                          <ThemedText style={{ color: form.slotDate ? text : textSecondary, flex: 1 }}>
                            {form.slotDate ? formatDropdownDate(form.slotDate) : "Select a date"}
                          </ThemedText>
                          <Feather name={showDateDropdown ? "chevron-up" : "chevron-down"} size={15} color={textSecondary} />
                        </Pressable>
                        {showDateDropdown && (
                          <View style={{ borderWidth: 1, borderColor: border, borderRadius: 10, marginTop: 4, overflow: "hidden" }}>
                            {regularDates.length === 0 ? (
                              <View style={{ padding: Spacing.md }}>
                                <ThemedText style={{ color: textSecondary, fontSize: 13 }}>No dates available</ThemedText>
                              </View>
                            ) : regularDates.map((d, idx) => {
                              const sel = d.date === form.slotDate;
                              return (
                                <Pressable
                                  key={d.date}
                                  onPress={() => { setField({ slotDate: d.date, slotTime: "" }); setShowDateDropdown(false); }}
                                  style={[{ paddingHorizontal: Spacing.md, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: Spacing.sm, backgroundColor: sel ? BRAND + "15" : surface }, idx > 0 ? { borderTopWidth: 1, borderTopColor: border } : {}]}
                                >
                                  <ThemedText style={{ color: sel ? BRAND : text, fontWeight: sel ? "700" : "500", flex: 1 }}>{formatDropdownDate(d.date)}</ThemedText>
                                  {sel && <Feather name="check" size={14} color={BRAND} />}
                                </Pressable>
                              );
                            })}
                          </View>
                        )}
                      </>
                    )}
                  </Field>

                  {form.slotDate ? (
                    <Field label="Slot time">
                      {bookableTimes.length === 0 ? (
                        <ThemedText style={{ color: textSecondary, fontSize: 13 }}>No available times for this date</ThemedText>
                      ) : (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.xs }}>
                          {bookableTimes.map((t) => {
                            const sel = t.time === form.slotTime;
                            return (
                              <Pressable
                                key={t.time}
                                onPress={() => setField({ slotTime: t.time })}
                                style={[styles.chip, { borderColor: sel ? BRAND : border, backgroundColor: sel ? BRAND + "15" : "transparent" }]}
                                testID={`chip-time-${t.time}`}
                              >
                                <ThemedText style={{ fontSize: 13, fontWeight: sel ? "700" : "500", color: sel ? BRAND : text }}>
                                  {t.label}
                                </ThemedText>
                              </Pressable>
                            );
                          })}
                        </ScrollView>
                      )}
                    </Field>
                  ) : null}

                  <Field label="Full name">
                    <TextInput
                      value={form.customerName}
                      onChangeText={(v) => setField({ customerName: v })}
                      placeholder="Full name"
                      placeholderTextColor={textSecondary}
                      style={[styles.input, { color: text, borderColor: border }]}
                      testID="input-manual-reg-name"
                    />
                  </Field>

                  <Field label="WhatsApp number">
                    <TextInput
                      value={form.customerPhone}
                      onChangeText={(v) => setField({ customerPhone: v })}
                      placeholder="10-digit number"
                      placeholderTextColor={textSecondary}
                      keyboardType="phone-pad"
                      style={[styles.input, { color: text, borderColor: border }]}
                      testID="input-manual-reg-phone"
                    />
                  </Field>

                  <Field label="Email (optional)">
                    <TextInput
                      value={form.customerEmail}
                      onChangeText={(v) => setField({ customerEmail: v })}
                      placeholder="name@email.com"
                      placeholderTextColor={textSecondary}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      style={[styles.input, { color: text, borderColor: border }]}
                      testID="input-manual-reg-email"
                    />
                  </Field>

                  <Field label="Extra guests">
                    <TextInput
                      value={form.familyMembersCount}
                      onChangeText={(v) => setField({ familyMembersCount: v.replace(/[^0-9]/g, "") })}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={textSecondary}
                      style={[styles.input, { color: text, borderColor: border, width: 100 }]}
                      testID="input-manual-reg-guests"
                    />
                  </Field>

                  <Field label="Customer language">
                    <View style={{ flexDirection: "row", gap: Spacing.xs }}>
                      {(["en", "ta"] as const).map((lang) => {
                        const sel = form.preferredLanguage === lang;
                        return (
                          <Pressable
                            key={lang}
                            onPress={() => setField({ preferredLanguage: lang })}
                            style={[styles.chip, { borderColor: sel ? BRAND : border, backgroundColor: sel ? BRAND + "15" : "transparent" }]}
                            testID={`chip-lang-${lang}`}
                          >
                            <ThemedText style={{ fontSize: 13, fontWeight: sel ? "700" : "500", color: sel ? BRAND : text }}>
                              {lang === "en" ? "English" : "தமிழ்"}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Field>

                  {(selectedLocation?.inputFields || []).map((f) => (
                    <CustomFieldInput
                      key={f.id}
                      field={f}
                      value={form.formData[f.id]}
                      onChange={(v) => setCustomField(f.id, v)}
                      colors={{ text, textSecondary, border }}
                    />
                  ))}
                  <Field label="Ticket method">
                    <View style={{ flexDirection: "row", gap: Spacing.sm }}>
                      {([
                        ["generate", "Generate new"],
                        ["preprinted", "Assign pre-printed"],
                      ] as const).map(([value, label]) => {
                        const selected = form.ticketMethod === value;
                        return (
                          <Pressable
                            key={value}
                            onPress={() => {
                              setField({ ticketMethod: value });
                              if (value === "generate") setCameraOpen(false);
                            }}
                            style={[styles.methodChoice, { borderColor: selected ? BRAND : border, backgroundColor: selected ? BRAND + "12" : "transparent" }]}
                            accessibilityRole="radio"
                            accessibilityState={{ selected }}
                            testID={`button-ticket-method-${value}`}
                          >
                            <Feather name={value === "generate" ? "printer" : "camera"} size={15} color={selected ? BRAND : textSecondary} />
                            <ThemedText style={{ color: selected ? BRAND : text, fontSize: 12, fontWeight: selected ? "700" : "500", flex: 1 }}>{label}</ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Field>
                  {form.ticketMethod === "preprinted" ? (
                    <Field label="Pre-printed ticket ID or QR">
                       {cameraOpen && CameraView && cameraPermission?.granted ? (
                         <View style={{ marginBottom: Spacing.sm }}>
                           <View style={[styles.cameraBox, { borderColor: BRAND + "55" }]}>
                             <CameraView
                               style={StyleSheet.absoluteFill}
                               facing="back"
                               barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                               onBarcodeScanned={cameraScanned ? undefined : handlePreprintedTicketScan}
                             />
                             <View style={StyleSheet.absoluteFill} pointerEvents="none">
                               <View style={[styles.cameraCorner, styles.cameraTopLeft, { borderColor: BRAND }]} />
                               <View style={[styles.cameraCorner, styles.cameraTopRight, { borderColor: BRAND }]} />
                               <View style={[styles.cameraCorner, styles.cameraBottomLeft, { borderColor: BRAND }]} />
                               <View style={[styles.cameraCorner, styles.cameraBottomRight, { borderColor: BRAND }]} />
                             </View>
                             <Pressable
                               onPress={() => setCameraOpen(false)}
                               style={styles.cameraClose}
                               testID="button-close-preprinted-scanner"
                             >
                               <Feather name="x" size={16} color="#FFF" />
                             </Pressable>
                           </View>
                           <ThemedText style={{ fontSize: 11, color: textSecondary, textAlign: "center", marginTop: 5 }}>
                             Align the printed QR code inside the frame
                           </ThemedText>
                         </View>
                       ) : (
                         <Pressable
                           onPress={openCameraScanner}
                           style={[styles.scanTicketButton, { backgroundColor: BRAND }]}
                           testID="button-scan-preprinted-ticket"
                         >
                           <Feather name="camera" size={16} color="#FFF" />
                           <ThemedText style={styles.scanTicketButtonText}>Scan QR code</ThemedText>
                         </Pressable>
                       )}
                       <TextInput
                         value={form.preprintedTicketCode}
                         onChangeText={(v) => setField({ preprintedTicketCode: v.toUpperCase() })}
                         placeholder="Or enter PTK-…"
                         placeholderTextColor={textSecondary}
                         autoCapitalize="none"
                         autoCorrect={false}
                         style={[styles.input, { color: text, borderColor: border }]}
                         testID="input-preprinted-ticket"
                       />
                      <ThemedText style={{ fontSize: 11, color: textSecondary, marginTop: 5 }}>
                         Scan the printed QR or enter its ID. Each ticket can be assigned once.
                      </ThemedText>
                       {cameraError ? (
                         <ThemedText style={{ fontSize: 11, color: "#EF4444", marginTop: 5 }}>
                           {cameraError}
                         </ThemedText>
                       ) : null}
                    </Field>
                  ) : null}
                   <View
                     style={[styles.paymentBox, {
                       borderColor: balanceDue > 0 ? "#F59E0B40" : "#10B98140",
                       backgroundColor: balanceDue > 0 ? "#F59E0B12" : "#10B98112",
                     }]}
                     testID="manual-reg-payment"
                   >
                     <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
                       <View style={{ flex: 1 }}>
                         <ThemedText style={{ fontWeight: "800", fontSize: 13, color: BRAND }}>
                           {amountDue > 0 ? "Payment treatment" : "Ready to register"}
                         </ThemedText>
                         <ThemedText style={{ fontSize: 11, color: textSecondary, marginTop: 2 }}>
                           {amountDue > 0
                             ? "Record offline payment or issue a complimentary/unpaid ticket."
                             : "Free entry — tap Register to proceed."}
                         </ThemedText>
                       </View>
                     </View>

                     {amountDue > 0 ? (
                       <View style={{ flexDirection: "row", gap: Spacing.xs, marginTop: Spacing.sm }}>
                         {([
                           ["offline_paid", "Paid offline"],
                           ["complimentary", "Complimentary"],
                           ["unpaid", "Unpaid"],
                         ] as const).map(([value, label]) => {
                           const selected = form.paymentMode === value;
                           return (
                             <Pressable
                               key={value}
                               onPress={() => setField({ paymentMode: value })}
                               style={[styles.paymentChoice, { borderColor: selected ? BRAND : border, backgroundColor: selected ? BRAND + "10" : "transparent" }]}
                               accessibilityRole="radio"
                               accessibilityState={{ selected }}
                               testID={`button-payment-mode-${value}`}
                             >
                               <ThemedText style={{ fontSize: 10, color: selected ? BRAND : text, fontWeight: selected ? "800" : "600" }}>{label}</ThemedText>
                             </Pressable>
                           );
                         })}
                       </View>
                     ) : null}

                     {amountDue > 0 && form.paymentMode === "offline_paid" ? (
                       <View style={{ flexDirection: "row", gap: Spacing.md, marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: border }}>
                         <View style={{ flex: 1 }}>
                           <ThemedText style={{ fontSize: 10, color: textSecondary }}>Amount due</ThemedText>
                           <ThemedText style={{ fontSize: 15, fontWeight: "800", color: text }}>₹{amountDue}</ThemedText>
                         </View>
                         <View style={{ flex: 1 }}>
                           <ThemedText style={{ fontSize: 10, color: textSecondary }}>Collected</ThemedText>
                           <TextInput
                             value={form.amountCollected}
                             onChangeText={(v) => setField({ amountCollected: v.replace(/[^0-9]/g, "") })}
                             keyboardType="number-pad"
                             style={[styles.input, { color: text, borderColor: border, paddingVertical: 6, marginTop: 2 }]}
                             testID="input-amount-collected"
                           />
                         </View>
                       </View>
                     ) : null}
                     {amountDue > 0 && form.paymentMode === "offline_paid" ? (
                       <ThemedText style={{ fontSize: 12, fontWeight: "700", marginTop: Spacing.sm, color: balanceDue > 0 ? "#F59E0B" : "#10B981" }}>
                         {balanceDue > 0 ? `Balance due: ₹${balanceDue}` : "Fully paid"}
                       </ThemedText>
                     ) : null}
                     {needsPaymentReason ? (
                       <TextInput
                         value={form.paymentReason}
                         onChangeText={(v) => setField({ paymentReason: v })}
                         placeholder="Reason for complimentary/unpaid registration"
                         placeholderTextColor={textSecondary}
                         style={[styles.input, { color: text, borderColor: border, marginTop: Spacing.sm }]}
                         testID="input-payment-reason"
                       />
                     ) : null}
                   </View>
                </View>
              )}
            </ScrollView>

            {!success && !loadingLocations ? (
              <View style={styles.footer} testID="manual-reg-footer">
                <Pressable style={[styles.secondaryBtn, { borderColor: BRAND }]} onPress={onClose}>
                  <ThemedText style={{ color: BRAND, fontWeight: "700" }}>Cancel</ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: BRAND }, (!canSubmit || saving) ? { opacity: 0.5 } : null]}
                  onPress={submit}
                  disabled={!canSubmit || saving}
                  testID="button-submit-manual-reg"
                >
                  <ThemedText style={{ color: "#FFF", fontWeight: "700" }}>
                    {saving ? "Registering…" : "Register"}
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const isDark = useColorScheme() === "dark";
  const textSecondary = isDark ? "#9AA0A6" : "#6B7280";
  return (
    <View>
      <ThemedText style={{ fontSize: 11, fontWeight: "700", color: textSecondary, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.3 }}>
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

function CustomFieldInput({
  field,
  value,
  onChange,
  colors,
}: {
  field: InputField;
  value: any;
  onChange: (v: any) => void;
  colors: { text: string; textSecondary: string; border: string };
}) {
  const [showDate, setShowDate] = useState(false);
  const label = field.required ? `${field.label} *` : field.label;

  if (field.type === "checkbox") {
    return (
      <Pressable
        onPress={() => onChange(!value)}
        style={[styles.checkboxRow, { borderColor: colors.border }]}
        testID={`checkbox-${field.id}`}
      >
        <View style={[styles.checkboxBox, { borderColor: BRAND, backgroundColor: value ? BRAND : "transparent" }]}>
          {value ? <Feather name="check" size={12} color="#FFF" /> : null}
        </View>
        <ThemedText style={{ color: colors.text, flex: 1 }}>{label}</ThemedText>
      </Pressable>
    );
  }

  if (field.type === "select") {
    return (
      <Field label={label}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.xs }}>
          {(field.options || []).map((opt) => {
            const sel = opt === value;
            return (
              <Pressable
                key={opt}
                onPress={() => onChange(opt)}
                style={[styles.chip, { borderColor: sel ? BRAND : colors.border, backgroundColor: sel ? BRAND + "15" : "transparent" }]}
                testID={`select-${field.id}-${opt}`}
              >
                <ThemedText style={{ fontSize: 13, fontWeight: sel ? "700" : "500", color: sel ? BRAND : colors.text }}>{opt}</ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </Field>
    );
  }

  if (field.type === "date") {
    return (
      <Field label={label}>
        <Pressable
          onPress={() => setShowDate((v) => !v)}
          style={[styles.input, { borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: Spacing.sm }]}
          testID={`date-${field.id}`}
        >
          <Feather name="calendar" size={14} color={BRAND} />
          <ThemedText style={{ color: value ? colors.text : colors.textSecondary, flex: 1 }}>
            {value || "Select a date"}
          </ThemedText>
        </Pressable>
        {showDate ? (
          <DateTimePicker
            value={value ? new Date(value + "T00:00:00") : new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(_e, d) => {
              if (d) {
                const y = d.getFullYear();
                const mo = String(d.getMonth() + 1).padStart(2, "0");
                const dy = String(d.getDate()).padStart(2, "0");
                onChange(`${y}-${mo}-${dy}`);
              }
              if (Platform.OS === "android") setShowDate(false);
            }}
            accentColor={BRAND}
          />
        ) : null}
      </Field>
    );
  }

  const keyboardType = field.type === "number" ? "number-pad" : field.type === "phone" ? "phone-pad" : field.type === "email" ? "email-address" : "default";

  return (
    <Field label={label}>
      <TextInput
        value={value ?? ""}
        onChangeText={onChange}
        keyboardType={keyboardType as any}
        autoCapitalize={field.type === "email" ? "none" : "sentences"}
        placeholder={field.label}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
        testID={`input-custom-${field.id}`}
      />
    </Field>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end", paddingHorizontal: 10, paddingBottom: 20 },
  card: { borderRadius: 28, overflow: "hidden" },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 8 },
  scrollBody: { flex: 1 },
  body: { paddingHorizontal: 20, paddingBottom: Spacing.lg, gap: Spacing.md },
  footer: { flexDirection: "row", gap: Spacing.sm, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },
  primaryBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: "center" },
  secondaryBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: "center", borderWidth: 1.5 },
  input: { borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: 14 },
  chip: { borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  successBox: { borderWidth: 1, borderRadius: BorderRadius.lg, padding: Spacing.lg, alignItems: "center" },
  errorBox: { borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.sm },
  paymentBox: { borderWidth: 1, borderRadius: BorderRadius.lg, padding: Spacing.md },
  paymentChoice: { flex: 1, minHeight: 34, borderWidth: 1, borderRadius: BorderRadius.sm, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  methodChoice: { flex: 1, minHeight: 42, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: 10 },
  scanTicketButton: { height: 40, borderRadius: BorderRadius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.xs, marginBottom: Spacing.sm },
  scanTicketButtonText: { color: "#FFF", fontSize: 13, fontWeight: "700" },
  cameraBox: { height: 164, borderRadius: BorderRadius.lg, overflow: "hidden", borderWidth: 2, position: "relative" },
  cameraCorner: { position: "absolute", width: 22, height: 22 },
  cameraTopLeft: { top: 12, left: 12, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 4 },
  cameraTopRight: { top: 12, right: 12, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 4 },
  cameraBottomLeft: { bottom: 12, left: 12, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 4 },
  cameraBottomRight: { bottom: 12, right: 12, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 4 },
  cameraClose: { position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 16, padding: 6 },
  switchTrack: { width: 44, height: 26, borderRadius: 13, padding: 2 },
  switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFF" },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, paddingVertical: 4 },
  checkboxBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
