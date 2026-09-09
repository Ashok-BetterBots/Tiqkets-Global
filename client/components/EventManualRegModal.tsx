import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { getApiUrl } from "@/lib/query-client";
import { Spacing, BorderRadius } from "@/constants/theme";
import { formatEventSlotRange } from "@shared/eventSlots";

const BRAND = "#9C1A5B";

const SPECIAL_CATEGORY_IMAGES = {
  senior_citizen: require("../../attached_assets/person_1788525899674.png"),
  pregnant_women: require("../../attached_assets/pregnant_1788525899674.png"),
  infants: require("../../attached_assets/human_1788525899674.png"),
  specially_abled: require("../../attached_assets/disabled_1788525899674.png"),
} as const;

interface InputField {
  id: string;
  label: string;
  type: "text" | "number" | "select" | "checkbox" | "date" | "phone" | "email";
  required?: boolean;
  options?: string[];
}

interface SlotTime { time: string; label: string; rangeLabel?: string; available: number; past: boolean; }
interface SlotDay { date: string; label: string; times: SlotTime[]; }
interface EventLocation {
  id: string;
  name: string;
  registrationFee: number;
  slotDurationMinutes?: number;
  inputFields: InputField[];
  slots: SlotDay[];
}
interface LandingData {
  event?: { registrationFee?: number | null; slotDurationMinutes?: number | null };
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
  let res: Response;
  try {
    res = await fetch(new URL(path, getApiUrl()), { credentials: "include" });
  } catch {
    throw new Error("Unable to reach the server. Please check your connection and try again.");
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    let b: any = null;
    try { b = JSON.parse(t); } catch {}
    throw new Error(b?.error || `Request failed (${res.status})`);
  }
  return res.json();
}

async function postJson(path: string, body: any): Promise<any> {
  let res: Response;
  try {
    res = await fetch(new URL(path, getApiUrl()), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Unable to reach the server. Please check your connection and try again.");
  }
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
  productCategories: string[];
  selectedSpecialCategories: string[];
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
  ticketMethod: "preprinted",
  preprintedTicketCode: "",
  productCategories: [],
  selectedSpecialCategories: [],
  preferredLanguage: "ta",
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
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const surface = "#FFFFFF";
  const bg = "#F7F5FE";
  const text = "#271D24";
  const textSecondary = "#766C73";
  const border = "#E5DFE2";

  const [loadingLocations, setLoadingLocations] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [locations, setLocations] = useState<EventLocation[]>([]);
  const [form, setForm] = useState<EmptyForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<Registration | null>(null);
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [eventSlotDurationMinutes, setEventSlotDurationMinutes] = useState(30);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraScanned, setCameraScanned] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [regularDateConfirmedFingerprint, setRegularDateConfirmedFingerprint] = useState<string | null>(null);
  const [hasSpecialMembers, setHasSpecialMembers] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const formScrollRef = useRef<any>(null);
  const formScrollOffsetRef = useRef(0);
  const gentlyScrollAfterSlotSelection = useCallback((distance = 96) => {
    requestAnimationFrame(() => {
      formScrollRef.current?.scrollTo?.({
        y: formScrollOffsetRef.current + distance,
        animated: true,
      });
    });
  }, []);
  const CameraModule = Platform.OS !== "web" ? require("expo-camera") : null;
  const { CameraView, useCameraPermissions } = CameraModule || {
    CameraView: null,
    useCameraPermissions: () => [null, async () => ({ granted: false })],
  };
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const resetRegistrationState = useCallback((location?: EventLocation | null) => {
    const amountCollected = location
      ? String(Number(location.registrationFee || 0) / 100)
      : "";
    setForm({
      ...EMPTY_FORM,
      locationId: location?.id || "",
      amountCollected,
    });
    setLoadError(null);
    setShowDateDropdown(false);
    setShowTimeDropdown(false);
    setCameraOpen(false);
    setCameraScanned(false);
    setCameraError(null);
    setRegularDateConfirmedFingerprint(null);
    setHasSpecialMembers(false);
    setStep(1);
    setEventSlotDurationMinutes(30);
  }, []);

  const loadRegistrationAvailability = useCallback(async () => {
    if (!branchId || !eventId) return;
    setLoadingLocations(true);
    setLoadError(null);
    try {
      const data: LandingData = await fetchJson(`/api/event/${branchId}/${eventId}?t=${Date.now()}`);
      const eventFee = Number(data.event?.registrationFee ?? 0);
      const locs = (data.locations && data.locations.length > 0)
        ? data.locations.map((location) => ({
          ...location,
          registrationFee: location.registrationFee == null ? eventFee : Number(location.registrationFee) || 0,
        }))
        : [{ id: "", name: eventName || "Event", registrationFee: eventFee, inputFields: [], slots: data.slots || [] }];
      setEventSlotDurationMinutes(Math.max(5, Number(data.event?.slotDurationMinutes) || 30));
      setLocations(locs);
      setForm((current) => ({
        ...current,
        locationId: locs[0]?.id || "",
        slotDate: "",
        slotTime: "",
        amountCollected: String(Number(locs[0]?.registrationFee || 0) / 100),
        paymentMode: "offline_paid",
      }));
    } catch (e: any) {
      setLoadError(e?.message || "Failed to load event slots");
    } finally {
      setLoadingLocations(false);
    }
  }, [branchId, eventId, eventName]);

  useEffect(() => {
    if (!visible) return;
    resetRegistrationState();
    setSuccess(null);
    if (!branchId || !eventId) return;
    setLocations([]);
    void loadRegistrationAvailability();
  }, [visible, branchId, eventId, resetRegistrationState, loadRegistrationAvailability]);

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
  const step1Fingerprint = useMemo(() => JSON.stringify({
    locationId: form.locationId,
    productCategories: [...form.productCategories].sort(),
    specialCategories: [...form.selectedSpecialCategories].sort(),
    slotDate: form.slotDate,
    slotTime: form.slotTime,
    hasSpecialMembers,
  }), [form.locationId, form.productCategories, form.selectedSpecialCategories, form.slotDate, form.slotTime, hasSpecialMembers]);

  // A location can change while the special-access selection is still active.
  // Clear the old slot immediately, then assign the new location's final
  // available date once its availability has been resolved.
  useEffect(() => {
    if (form.selectedSpecialCategories.length === 0) return;
    const nextDate = lastDate?.date || "";
    if (form.slotDate !== nextDate) {
      setForm((current) => ({
        ...current,
        slotDate: nextDate,
        slotTime: "",
      }));
    } else if (!nextDate && form.slotTime) {
      setForm((current) => ({ ...current, slotTime: "" }));
    }
  }, [form.selectedSpecialCategories.length, form.slotDate, form.slotTime, lastDate?.date]);
  const formatDropdownDate = (dateStr: string): string => {
    try {
      const d = new Date(dateStr + "T00:00:00");
      return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    } catch { return dateStr; }
  };
  const formatSlotOption = useCallback((slot: SlotTime): string => {
    const duration = selectedLocation?.slotDurationMinutes ?? eventSlotDurationMinutes;
    const range = slot.rangeLabel || formatEventSlotRange(slot.time, duration);
    return `${range} (${slot.available} left)`;
  }, [eventSlotDurationMinutes, selectedLocation]);

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
    form.productCategories.length > 0 &&
    (!hasSpecialMembers || form.selectedSpecialCategories.length > 0) &&
    !missingRequiredField &&
    (!needsPaymentReason || form.paymentReason.trim().length > 1) &&
    (form.paymentMode !== "offline_paid" || balanceDue <= 0) &&
    (form.ticketMethod !== "preprinted" || form.preprintedTicketCode.trim().length > 0);

  const canContinueStep1 =
    form.productCategories.length > 0 &&
    (!hasSpecialMembers || form.selectedSpecialCategories.length > 0) &&
    !!form.slotDate &&
    !!form.slotTime;
  const canContinueStep2 =
    form.customerName.trim().length > 1 &&
    form.customerPhone.replace(/\D/g, "").length >= 10 &&
    !missingRequiredField;

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

  const performSubmit = useCallback(async () => {
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
        priorityAccess: form.selectedSpecialCategories.length > 0,
        productCategories: form.productCategories,
        productCategory: form.productCategories[0],
        specialCategories: form.selectedSpecialCategories,
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

  const continueFromStep1 = useCallback(() => {
    if (!canContinueStep1) return;
    if (!hasSpecialMembers && regularDateConfirmedFingerprint !== step1Fingerprint) {
      Alert.alert(
        "Please confirm before continuing",
        "For safety reasons, senior citizens, pregnant women, specially abled visitors, and visitors with infants are not permitted on regular event days. If anyone in the group belongs to one of these categories, go back and select Yes so the appropriate special-access date can be assigned.",
        [
          { text: "Go back and change", style: "cancel" },
          {
            text: "Confirm No & continue",
            onPress: () => {
              setRegularDateConfirmedFingerprint(step1Fingerprint);
              setStep(2);
            },
          },
        ],
      );
      return;
    }
    setStep(2);
  }, [canContinueStep1, hasSpecialMembers, regularDateConfirmedFingerprint, step1Fingerprint]);

  const submit = useCallback(() => {
    void performSubmit();
  }, [performSubmit]);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close Add Customer"
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, width: "100%", justifyContent: "flex-end" }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.card, { backgroundColor: surface, height: Math.min(screenHeight * 0.75, screenHeight - insets.top - insets.bottom - 24) }]}
            testID="manual-reg-sheet"
          >
            <View style={[styles.handle, { backgroundColor: border }]} />
            <View style={styles.header}>
              <ThemedText style={{ fontSize: 18, fontWeight: "800", color: text, flex: 1 }}>
                {success ? "Registered" : "Add Customer"}
              </ThemedText>
              <Pressable onPress={onClose} hitSlop={12} testID="button-close-manual-reg">
                <ThemedText style={{ color: BRAND, fontSize: 13, fontWeight: "800" }}>Cancel</ThemedText>
              </Pressable>
            </View>
            {!success && !loadingLocations ? (
              <View style={styles.progressWrap}>
                {[["Visit details", 1], ["Customer", 2], ["Issue Ticket", 3]].map(([label, number], index) => {
                  const n = number as 1 | 2 | 3;
                  const active = step === n;
                  const complete = step > n;
                  return (
                    <React.Fragment key={n}>
                      {index > 0 ? <View style={[styles.progressLine, { backgroundColor: complete || active ? BRAND : border }]} /> : null}
                      <View style={styles.progressItem}>
                        <View style={[styles.progressDot, { backgroundColor: active || complete ? BRAND : bg, borderColor: active || complete ? BRAND : border }]}>
                          {complete ? <Feather name="check" size={11} color="#FFF" /> : (
                            <ThemedText style={{ color: active ? "#FFF" : textSecondary, fontSize: 11, fontWeight: "800" }}>{n}</ThemedText>
                          )}
                        </View>
                        <ThemedText style={{ color: active ? text : textSecondary, fontSize: 10, fontWeight: active ? "800" : "600", textAlign: "center" }}>
                          {label}
                        </ThemedText>
                      </View>
                    </React.Fragment>
                  );
                })}
              </View>
            ) : null}

            <KeyboardAwareScrollViewCompat
              ref={formScrollRef}
              style={[styles.scrollBody, { flex: 1 }]}
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator
              nestedScrollEnabled
              directionalLockEnabled
              bottomOffset={24}
              onScroll={(event: any) => {
                formScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
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
                    onPress={() => {
                      resetRegistrationState(locations[0] || null);
                      setSuccess(null);
                      setLocations([]);
                      void loadRegistrationAvailability();
                    }}
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

                  {step === 1 ? (
                    <>
                  {locations.length > 1 ? (
                    <Field label="Location">
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.xs }}>
                        {locations.map((l) => {
                          const sel = l.id === (selectedLocation?.id ?? locations[0]?.id);
                          return (
                            <Pressable
                              key={l.id}
                               onPress={() => {
                                 setField({ locationId: l.id, slotDate: "", slotTime: "", amountCollected: String(Number(l.registrationFee || 0) / 100) });
                                 setShowTimeDropdown(false);
                               }}
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

                  <View style={styles.sectionCard}>
                  <Field label="Product category *">
                    <View style={styles.tileGrid}>
                      {([
                        ["electronics", "Electronics"],
                        ["furniture", "Furniture"],
                        ["home_appliances", "Home Appliances"],
                        ["vessels", "Vessels"],
                      ] as const).map(([value, label]) => {
                        const selected = form.productCategories.includes(value);
                        return (
                          <Pressable
                            key={value}
                            onPress={() => setField({
                              productCategories: selected
                                ? form.productCategories.filter((category) => category !== value)
                                : [...form.productCategories, value],
                            })}
                            style={[styles.categoryTile, { borderColor: selected ? BRAND : border, backgroundColor: selected ? BRAND + "15" : "transparent" }]}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selected }}
                            testID={`chip-product-category-${value}`}
                          >
                            <View style={styles.categoryIconRow}>
                              {value === "electronics" ? (
                                <Feather name="smartphone" size={16} color={selected ? BRAND : textSecondary} />
                              ) : value === "furniture" ? (
                                <MaterialCommunityIcons name="sofa" size={19} color={selected ? BRAND : textSecondary} />
                              ) : value === "home_appliances" ? (
                                <>
                                  <MaterialCommunityIcons name="fridge-outline" size={17} color={selected ? BRAND : textSecondary} />
                                  <MaterialCommunityIcons name="blender-outline" size={16} color={selected ? BRAND : textSecondary} />
                                </>
                              ) : (
                                <MaterialCommunityIcons name="bowl-outline" size={18} color={selected ? BRAND : textSecondary} />
                              )}
                            </View>
                            <ThemedText style={{ color: selected ? BRAND : text, fontSize: 12, fontWeight: selected ? "800" : "600" }}>
                              {label}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Field>
                  </View>

                  <View style={styles.sectionCard}>
                  <Field label="Visiting with anyone needing extra care?">
                    <ThemedText style={{ color: textSecondary, fontSize: 12, lineHeight: 17, marginBottom: Spacing.xs }}>
                      Infants, Senior Citizens, Pregnant Women or Differently Abled
                    </ThemedText>
                    <View style={styles.yesNoRow}>
                      {([false, true] as const).map((answer) => {
                        const selected = hasSpecialMembers === answer;
                        return (
                          <Pressable
                            key={String(answer)}
                            onPress={() => {
                              setHasSpecialMembers(answer);
                              setRegularDateConfirmedFingerprint(null);
                              if (!answer) {
                                setField({ selectedSpecialCategories: [], slotDate: "", slotTime: "" });
                                setShowDateDropdown(false);
                                setShowTimeDropdown(false);
                              }
                            }}
                            style={[
                              styles.yesNoOption,
                              { borderColor: selected ? BRAND : border, backgroundColor: selected ? BRAND + "12" : surface },
                            ]}
                            accessibilityRole="radio"
                            accessibilityState={{ checked: selected }}
                            testID={`radio-special-members-${answer ? "yes" : "no"}`}
                          >
                            <View style={[styles.radioOuter, { borderColor: selected ? BRAND : border }]}>
                              {selected ? <View style={styles.radioInner} /> : null}
                            </View>
                            <ThemedText style={{ color: selected ? BRAND : text, fontWeight: "800" }}>
                              {answer ? "Yes" : "No"}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                    {hasSpecialMembers ? (
                      <View style={[styles.specialMembersPanel, { borderColor: border, backgroundColor: bg }]}>
                        <ThemedText style={{ color: text, fontSize: 13, fontWeight: "800", marginBottom: Spacing.sm }}>
                          Select all that apply
                        </ThemedText>
                        <View style={styles.tileGrid}>
                      {([
                        ["senior_citizen", "Senior Citizen"],
                        ["pregnant_women", "Pregnant Women"],
                        ["infants", "Infants"],
                        ["specially_abled", "Specially Abled"],
                      ] as const).map(([value, label]) => {
                        const selected = form.selectedSpecialCategories.includes(value);
                        return (
                          <Pressable
                            key={value}
                            onPress={() => {
                              const next = selected
                                ? form.selectedSpecialCategories.filter((category) => category !== value)
                                : [...form.selectedSpecialCategories, value];
                              setField({
                                selectedSpecialCategories: next,
                                slotDate: next.length > 0 ? (lastDate?.date || "") : "",
                                slotTime: "",
                              });
                              setShowDateDropdown(false);
                              setShowTimeDropdown(false);
                            }}
                            style={[styles.categoryTile, { borderColor: selected ? BRAND : border, backgroundColor: selected ? BRAND + "15" : surface }]}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selected }}
                            testID={`checkbox-special-category-${value}`}
                          >
                            <View style={[styles.tileCheck, { borderColor: selected ? BRAND : border, backgroundColor: selected ? BRAND : surface }]}>
                              {selected ? <Feather name="check" size={9} color="#FFF" /> : null}
                            </View>
                            <Image
                              source={SPECIAL_CATEGORY_IMAGES[value]}
                              style={[styles.specialCategoryImage, { tintColor: selected ? BRAND : textSecondary }]}
                              resizeMode="contain"
                            />
                            <ThemedText style={{ color: selected ? BRAND : text, fontSize: 12, fontWeight: selected ? "800" : "600" }}>
                              {label}
                            </ThemedText>
                          </Pressable>
                        );
                      })}
                        </View>
                        <ThemedText style={{ color: textSecondary, fontSize: 11, marginTop: Spacing.sm }}>
                          Reserves the last available slot for priority access.
                        </ThemedText>
                      </View>
                    ) : null}
                  </Field>
                  </View>

                  {/* ── Slot date — locked (special needs) or dropdown ── */}
                  <View style={styles.slotCard}>
                  <View style={styles.slotRow}>
                  <View style={styles.slotRowField}>
                  <Field label="Slot date">
                    {form.selectedSpecialCategories.length > 0 ? (
                      <View style={[styles.input, { borderColor: border, flexDirection: "row", alignItems: "center", gap: Spacing.sm, opacity: 0.85 }]}>
                        <Feather name="lock" size={14} color={BRAND} />
                        <ThemedText style={{ color: text, flex: 1 }}>
                          {form.slotDate
                            ? formatDropdownDate(form.slotDate)
                            : lastDate
                              ? "Updating available date…"
                              : "No dates available"}
                        </ThemedText>
                        {form.slotDate === lastDate?.date ? (
                          <ThemedText style={{ color: textSecondary, fontSize: 11 }}>Last day</ThemedText>
                        ) : null}
                      </View>
                    ) : (
                      <>
                        {showDateDropdown && (
                          <View style={{ borderWidth: 1, borderColor: border, borderRadius: 10, marginBottom: 4, overflow: "hidden" }}>
                            {regularDates.length === 0 ? (
                              <View style={{ padding: Spacing.md }}>
                                <ThemedText style={{ color: textSecondary, fontSize: 13 }}>No dates available</ThemedText>
                              </View>
                            ) : regularDates.map((d, idx) => {
                              const sel = d.date === form.slotDate;
                              return (
                                <Pressable
                                  key={d.date}
                                   onPress={() => {
                                    setField({ slotDate: d.date, slotTime: "" });
                                    setShowDateDropdown(false);
                                    setShowTimeDropdown(false);
                                    gentlyScrollAfterSlotSelection();
                                  }}
                                  style={[{ paddingHorizontal: Spacing.md, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: Spacing.sm, backgroundColor: sel ? BRAND + "15" : surface }, idx > 0 ? { borderTopWidth: 1, borderTopColor: border } : {}]}
                                >
                                  <ThemedText style={{ color: sel ? BRAND : text, fontWeight: sel ? "700" : "500", flex: 1 }}>{formatDropdownDate(d.date)}</ThemedText>
                                  {sel && <Feather name="check" size={14} color={BRAND} />}
                                </Pressable>
                              );
                            })}
                          </View>
                        )}
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
                      </>
                    )}
                  </Field>
                  </View>

                  {form.slotDate ? (
                    <View style={styles.slotRowField}>
                    <Field label="Slot time">
                      {bookableTimes.length === 0 ? (
                        <ThemedText style={{ color: textSecondary, fontSize: 13 }}>No available times for this date</ThemedText>
                      ) : (
                        <>
                          {showTimeDropdown && (
                            <View style={{ borderWidth: 1, borderColor: border, borderRadius: 10, marginBottom: 4, overflow: "hidden" }}>
                              {bookableTimes.map((t, idx) => {
                                const sel = t.time === form.slotTime;
                                return (
                                  <Pressable
                                    key={t.time}
                                    onPress={() => {
                                      setField({ slotTime: t.time });
                                      setShowTimeDropdown(false);
                                      gentlyScrollAfterSlotSelection(72);
                                    }}
                                    style={[
                                      { paddingHorizontal: Spacing.md, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: Spacing.sm, backgroundColor: sel ? BRAND + "15" : surface },
                                      idx > 0 ? { borderTopWidth: 1, borderTopColor: border } : {},
                                    ]}
                                    testID={`option-manual-reg-time-${t.time}`}
                                  >
                                    <ThemedText style={{ color: sel ? BRAND : text, fontWeight: sel ? "700" : "500", flex: 1 }}>
                                      {formatSlotOption(t)}
                                    </ThemedText>
                                    {sel && <Feather name="check" size={14} color={BRAND} />}
                                  </Pressable>
                                );
                              })}
                            </View>
                          )}
                          <Pressable
                            onPress={() => setShowTimeDropdown((v) => !v)}
                            style={[styles.input, { borderColor: showTimeDropdown ? BRAND : border, flexDirection: "row", alignItems: "center", gap: Spacing.sm }]}
                            testID="button-manual-reg-time"
                          >
                            <Feather name="clock" size={15} color={BRAND} />
                            <ThemedText style={{ color: form.slotTime ? text : textSecondary, flex: 1 }}>
                              {form.slotTime
                                ? formatSlotOption(bookableTimes.find((t) => t.time === form.slotTime) || bookableTimes[0])
                                : "Select a time slot"}
                            </ThemedText>
                            <Feather name={showTimeDropdown ? "chevron-up" : "chevron-down"} size={15} color={textSecondary} />
                          </Pressable>
                        </>
                      )}
                    </Field>
                    </View>
                  ) : (
                    <View style={styles.slotRowField}>
                    <Field label="Slot time">
                      <View style={[styles.input, { borderColor: border, flexDirection: "row", alignItems: "center", gap: Spacing.sm, opacity: 0.7 }]}>
                        <Feather name="clock" size={15} color={BRAND} />
                        <ThemedText style={{ color: textSecondary, flex: 1 }}>Select a date first</ThemedText>
                      </View>
                    </Field>
                    </View>
                  )}
                  </View>
                  {form.slotTime ? (
                    <ThemedText style={styles.availabilityCaption}>
                      {formatSlotOption(bookableTimes.find((t) => t.time === form.slotTime) || bookableTimes[0])}
                    </ThemedText>
                  ) : null}
                  </View>
                  {form.slotTime ? (
                    <View style={styles.giftAnnouncement} testID="manual-reg-gift-announcement">
                      <Feather name="gift" size={21} color="#9A6700" />
                      <View style={{ flex: 1 }}>
                        <ThemedText style={styles.giftTitle}>A surprise gift awaits!</ThemedText>
                        <ThemedText style={styles.giftMessage}>Enter and exit the shop within 3 hours to receive a surprise gift.</ThemedText>
                      </View>
                    </View>
                  ) : null}
                    </>
                  ) : null}

                  {step === 2 ? (
                    <>
                  <View style={styles.sectionCard}>
                    <ThemedText style={styles.cardTitle}>Contact</ThemedText>
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
                    <View style={styles.iconInput}>
                      <Feather name="message-circle" size={16} color={BRAND} />
                      <TextInput
                        value={form.customerPhone}
                        onChangeText={(v) => setField({ customerPhone: v })}
                        placeholder="10-digit number"
                        placeholderTextColor={textSecondary}
                        keyboardType="phone-pad"
                        style={[styles.input, styles.inputWithIcon, { color: text, borderColor: border }]}
                        testID="input-manual-reg-phone"
                      />
                    </View>
                  </Field>
                  </View>

                  <View style={styles.sectionCard}>
                    <ThemedText style={styles.cardTitle}>Additional info</ThemedText>
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

                  <View style={styles.splitFields}>
                    <Field label="Extra guests">
                      <TextInput
                        value={form.familyMembersCount}
                        onChangeText={(v) => setField({ familyMembersCount: v.replace(/[^0-9]/g, "") })}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={textSecondary}
                        style={[styles.input, { color: text, borderColor: border }]}
                        testID="input-manual-reg-guests"
                      />
                    </Field>
                    <Field label="Customer language">
                    <View style={styles.languageRow}>
                      {(["ta", "en"] as const).map((lang) => {
                        const sel = form.preferredLanguage === lang;
                        return (
                          <Pressable
                            key={lang}
                            onPress={() => setField({ preferredLanguage: lang })}
                            style={[styles.chip, { borderColor: sel ? BRAND : border, backgroundColor: sel ? BRAND + "15" : "transparent" }]}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: sel }}
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
                  </View>

                  {(selectedLocation?.inputFields || []).map((f) => (
                    <CustomFieldInput
                      key={f.id}
                      field={f}
                      value={form.formData[f.id]}
                      onChange={(v) => setCustomField(f.id, v)}
                      colors={{ text, textSecondary, border }}
                    />
                  ))}
                  </View>
                    </>
                  ) : null}
                  {step === 3 ? (
                    <>
                  <View style={styles.sectionCard}>
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
                        <View style={styles.ticketEntryDivider}>
                          <View style={styles.dividerRule} />
                          <ThemedText style={styles.orLabel}>or</ThemedText>
                          <View style={styles.dividerRule} />
                        </View>
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
                       backgroundColor: bg,
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
                        <View style={[styles.paymentStatus, { backgroundColor: balanceDue > 0 ? "#FFF4D8" : "#E7F7EF" }]}>
                          {balanceDue <= 0 ? <Feather name="check" size={12} color="#16804B" /> : null}
                          <ThemedText style={{ fontSize: 12, fontWeight: "700", color: balanceDue > 0 ? "#A76700" : "#16804B" }}>
                            {balanceDue > 0 ? `Balance due: ₹${balanceDue}` : "Fully paid"}
                          </ThemedText>
                        </View>
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
                    </>
                  ) : null}
                </View>
              )}
            </KeyboardAwareScrollViewCompat>

            {!success && !loadingLocations ? (
              <View style={styles.footer} testID="manual-reg-footer">
                {step > 1 ? (
                  <Pressable style={[styles.secondaryBtn, { borderColor: BRAND }]} onPress={() => setStep((step - 1) as 1 | 2)}>
                    <ThemedText style={{ color: BRAND, fontWeight: "700" }}>Back</ThemedText>
                  </Pressable>
                ) : null}
                <Pressable
                  style={[
                    styles.primaryBtn,
                    { backgroundColor: BRAND },
                    ((step === 1 && !canContinueStep1) || (step === 2 && !canContinueStep2) || (step === 3 && (!canSubmit || saving)))
                      ? { opacity: 0.5 }
                      : null,
                  ]}
                  onPress={() => step === 1 ? continueFromStep1() : step === 2 ? setStep(3) : submit()}
                  disabled={(step === 1 && !canContinueStep1) || (step === 2 && !canContinueStep2) || (step === 3 && (!canSubmit || saving))}
                  testID={step === 3 ? "button-submit-manual-reg" : "button-next-manual-reg"}
                >
                  <ThemedText style={{ color: "#FFF", fontWeight: "700" }}>
                    {step === 3 ? (saving ? "Registering…" : "Register") : "Next"}
                  </ThemedText>
                </Pressable>
              </View>
            ) : null}
          </Pressable>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const textSecondary = "#766C73";
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
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  card: { width: "100%", borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" },
  handle: { width: 42, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 5 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 7, paddingBottom: 10, gap: 8 },
  progressWrap: { flexDirection: "row", alignItems: "flex-start", paddingHorizontal: 20, paddingBottom: 14 },
  progressItem: { flex: 1, alignItems: "center", gap: 5 },
  progressDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  progressLine: { flex: 1, height: 2, marginTop: 12 },
  scrollBody: { flex: 1 },
  body: { paddingHorizontal: 16, paddingBottom: 20, gap: 14 },
  footer: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16, borderTopWidth: 1, borderTopColor: "#EEE8EB", backgroundColor: "#FFFFFF" },
  primaryBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: "center" },
  secondaryBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, alignItems: "center", borderWidth: 1.5, backgroundColor: "#FFFFFF" },
  input: { borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: 14 },
  chip: { borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  sectionCard: { backgroundColor: "#F7F5FE", borderRadius: 12, padding: 14, gap: 12 },
  cardTitle: { color: "#271D24", fontSize: 14, fontWeight: "800", marginBottom: 1 },
  slotCard: { backgroundColor: "#F7F5FE", borderRadius: 12, padding: 14 },
  slotRow: { flexDirection: "row", gap: 10 },
  slotRowField: { flex: 1 },
  availabilityCaption: { color: "#766C73", fontSize: 11, marginTop: 7, marginLeft: 2 },
  splitFields: { flexDirection: "row", gap: 10 },
  iconInput: { flexDirection: "row", alignItems: "center" },
  inputWithIcon: { flex: 1, marginLeft: -25, paddingLeft: 34 },
  languageRow: { flexDirection: "row", gap: 4 },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 },
  categoryTile: { width: "48.5%", minHeight: 52, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 8, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, position: "relative" },
  yesNoRow: { flexDirection: "row", gap: Spacing.sm },
  yesNoOption: { flex: 1, minHeight: 46, borderWidth: 1.5, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: Spacing.sm },
  radioOuter: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: BRAND },
  specialMembersPanel: { borderWidth: 1, borderRadius: BorderRadius.lg, padding: Spacing.md, marginTop: Spacing.sm },
  categoryIconRow: { minHeight: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 1 },
  specialCategoryImage: { width: 17, height: 17 },
  tileCheck: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  successBox: { borderWidth: 1, borderRadius: BorderRadius.lg, padding: Spacing.lg, alignItems: "center" },
  errorBox: { borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.sm },
  paymentBox: { borderWidth: 1, borderRadius: 12, padding: 14, backgroundColor: "#FFFFFF" },
  paymentStatus: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6, marginTop: Spacing.sm },
  giftAnnouncement: { flexDirection: "row", alignItems: "flex-start", gap: Spacing.sm, borderWidth: 1.5, borderColor: "#F3BD3E", borderRadius: BorderRadius.md, padding: Spacing.sm, backgroundColor: "#FFF8D9" },
  giftTitle: { color: "#7A3E00", fontSize: 13, fontWeight: "800", marginBottom: 2 },
  giftMessage: { color: "#754C13", fontSize: 11, fontWeight: "600", lineHeight: 16 },
  paymentChoice: { flex: 1, minHeight: 34, borderWidth: 1, borderRadius: BorderRadius.sm, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  methodChoice: { flex: 1, minHeight: 42, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: 10 },
  ticketEntryDivider: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 4 },
  dividerRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "#E5DFE2" },
  orLabel: { fontSize: 11, color: "#766C73", fontWeight: "700" },
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
