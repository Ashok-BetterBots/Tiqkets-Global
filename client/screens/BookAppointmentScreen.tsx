import { logHandledError } from "@/lib/logger";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { getApiUrl } from "@/lib/query-client";

type BookAppointmentRouteProp = RouteProp<RootStackParamList, "BookAppointment">;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface DiscoverOrg {
  id: string;
  name: string;
  branchName: string;
  address: string;
  description: string;
  category: string;
  isOpen: boolean;
  services: DiscoverService[];
}

interface AppointmentInputField {
  id: string;
  label: string;
  type: "text" | "email" | "phone" | "number" | "select" | "checkbox";
  required: boolean;
  options?: string[];
}

interface DiscoverService {
  id: string;
  name: string;
  description: string;
  averageWaitTime: number;
  inputFields: AppointmentInputField[];
}

function normalizeInputFields(raw: any): AppointmentInputField[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((f: any, idx: number) => ({
    id: f.id || `f${idx}`,
    label: f.label || f.name || "Field",
    type: (f.type as AppointmentInputField["type"]) || "text",
    required: f.required !== false,
    options: Array.isArray(f.options) ? f.options : [],
  }));
}

interface ApiSlot {
  time: string;
  available: boolean;
  spotsLeft: number;
}

export default function BookAppointmentScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<BookAppointmentRouteProp>();
  const { theme } = useTheme();
  const { user } = useAuth();

  const passedOrgId = route.params?.organizationId;
  const passedOrgName = route.params?.organizationName;

  const [step, setStep] = useState<"org" | "service" | "date" | "time" | "details">(passedOrgId ? "service" : "org");
  const [organizations, setOrganizations] = useState<DiscoverOrg[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<DiscoverOrg | null>(null);
  const [selectedService, setSelectedService] = useState<DiscoverService | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlotTime, setSelectedSlotTime] = useState<string | null>(null);
  const [timeSlots, setTimeSlots] = useState<ApiSlot[]>([]);
  const [customerName, setCustomerName] = useState(user?.name || "");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [branchServices, setBranchServices] = useState<DiscoverService[]>([]);
  const [confirmationResult, setConfirmationResult] = useState<{ confirmationNumber: string; date: string; time: string } | null>(null);

  useEffect(() => {
    if (passedOrgId) {
      loadBranchServices(passedOrgId);
    } else {
      loadOrganizations();
    }
  }, [passedOrgId]);

  const loadOrganizations = async () => {
    setIsLoadingOrgs(true);
    try {
      const apiUrl = getApiUrl();
      const url = new URL("/api/discover", apiUrl);
      const response = await fetch(url.toString());
      if (response.ok) {
        const data = await response.json();
        if (data.organizations) {
          const orgs: DiscoverOrg[] = (data.organizations || []).map((o: any) => ({
            ...o,
            services: (o.services || []).map((s: any) => ({
              id: s.id,
              name: s.name,
              description: s.description || s.name,
              averageWaitTime: s.averageWaitTime || s.avgWaitTime || 15,
              inputFields: normalizeInputFields(s.inputFields || s.formFields),
            })),
          }));
          setOrganizations(orgs);
        }
      }
    } catch (error) {
      console.log("Error fetching organizations:", error);
    } finally {
      setIsLoadingOrgs(false);
    }
  };

  const loadBranchServices = async (branchId: string) => {
    setIsLoadingServices(true);
    try {
      const apiUrl = getApiUrl();
      const url = new URL(`/api/join/${branchId}`, apiUrl);
      const response = await fetch(url.toString());
      if (response.ok) {
        const data = await response.json();
        const services: DiscoverService[] = (data.services || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          description: s.description || s.name,
          averageWaitTime: s.avgWaitTime || s.averageWaitTime || 15,
          inputFields: normalizeInputFields(s.inputFields || s.formFields),
        }));
        setBranchServices(services);
        setSelectedOrg({
          id: branchId,
          name: data.organizationName || passedOrgName || "Organization",
          branchName: data.branchName || "",
          address: "",
          description: data.organizationName || "",
          category: "Services",
          isOpen: true,
          services,
        });
      }
    } catch (error) {
      console.log("Error fetching branch services:", error);
    } finally {
      setIsLoadingServices(false);
    }
  };

  const loadTimeSlots = async (branchId: string, date: Date) => {
    setIsLoadingSlots(true);
    try {
      const apiUrl = getApiUrl();
      const dateStr = date.toISOString().split("T")[0];
      const url = new URL(`/api/reserve/${branchId}?date=${dateStr}`, apiUrl);
      const response = await fetch(url.toString());
      if (response.ok) {
        const data = await response.json();
        setTimeSlots(data.slots || []);
      }
    } catch (error) {
      console.log("Error fetching time slots:", error);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  const availableDates = useMemo(() => {
    const dates: Date[] = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      if (date.getDay() !== 0) {
        dates.push(date);
      }
    }
    return dates;
  }, []);

  const handleOrgSelect = (org: DiscoverOrg) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedOrg(org);
    setBranchServices(org.services);
    setStep("service");
  };

  const handleServiceSelect = (service: DiscoverService) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedService(service);
    setStep("date");
  };

  const handleDateSelect = (date: Date) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDate(date);
    setSelectedSlotTime(null);
    setTimeSlots([]);
    if (selectedOrg) {
      loadTimeSlots(selectedOrg.id, date);
    }
    setStep("time");
  };

  const handleSlotSelect = (slot: ApiSlot) => {
    if (!slot.available) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedSlotTime(slot.time);
    const initial: Record<string, string> = {};
    (selectedService?.inputFields || []).forEach((f) => {
      if (f.type === "phone" && user?.phone) initial[f.id] = user.phone;
      else initial[f.id] = "";
    });
    setFormData(initial);
    setFormErrors({});
    setStep("details");
  };

  const isPhoneField = (f: AppointmentInputField) =>
    f.type === "phone" || /phone|mobile|contact/i.test(f.label);
  const isEmailField = (f: AppointmentInputField) =>
    f.type === "email" || /email|e-?mail/i.test(f.label);
  const isPartySizeField = (f: AppointmentInputField) =>
    f.type === "number" && /party|guests?|people|persons?|pax|size|count/i.test(f.label);

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};
    if (!customerName.trim()) errs["__name"] = "Name is required";
    (selectedService?.inputFields || []).forEach((f) => {
      const val = formData[f.id];
      if (f.required) {
        if (f.type === "checkbox") {
          if (val !== "true") errs[f.id] = `${f.label} is required`;
        } else if (!val || !val.trim()) {
          errs[f.id] = `${f.label} is required`;
        }
      }
      if (val && f.type === "email") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) errs[f.id] = "Please enter a valid email";
      }
      if (val && f.type === "phone") {
        if (!/^[\d\s+()-]{8,}$/.test(val)) errs[f.id] = "Please enter a valid phone number";
      }
      if (val && f.type === "number") {
        const n = Number(val);
        if (!Number.isFinite(n) || n <= 0 || !/^\d+$/.test(val.trim())) {
          errs[f.id] = `${f.label} must be a positive number`;
        }
      }
    });
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleBook = async () => {
    if (!selectedOrg || !selectedDate || !selectedSlotTime) return;
    if (!validateForm()) return;

    const fields = selectedService?.inputFields || [];
    let phoneVal = "";
    let emailVal = "";
    let partyVal = 0;
    const extras: { label: string; value: string }[] = [];
    fields.forEach((f) => {
      const v = (formData[f.id] || "").trim();
      if (!v) return;
      if (!phoneVal && isPhoneField(f)) phoneVal = v;
      else if (!emailVal && isEmailField(f)) emailVal = v;
      else if (!partyVal && isPartySizeField(f)) {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n > 0) partyVal = n;
        else extras.push({ label: f.label, value: v });
      } else {
        extras.push({ label: f.label, value: f.type === "checkbox" ? (v === "true" ? "Yes" : "No") : v });
      }
    });
    const specialRequests = extras.length
      ? extras.map((e) => `${e.label}: ${e.value}`).join("\n")
      : "";

    setIsSubmitting(true);
    try {
      const apiUrl = getApiUrl();
      const dateStr = selectedDate.toISOString().split("T")[0];
      const url = new URL(`/api/reserve/${selectedOrg.id}`, apiUrl);
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerPhone: phoneVal || (user?.phone || ""),
          customerEmail: emailVal,
          partySize: partyVal || 2,
          date: dateStr,
          time: selectedSlotTime,
          specialRequests,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setConfirmationResult({
          confirmationNumber: data.confirmationNumber,
          date: dateStr,
          time: selectedSlotTime,
        });
        setStep("details");
      } else {
        const err = await response.json();
        logHandledError("Reservation failed", err);
      }
    } catch (error) {
      logHandledError("Failed to book reservation", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (date: Date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const formatSlotTime = (time: string) => {
    const [h, m] = time.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${m} ${ampm}`;
  };

  const goBack = () => {
    if (confirmationResult) {
      navigation.goBack();
      return;
    }
    if (step === "service" && !passedOrgId) setStep("org");
    else if (step === "service" && passedOrgId) navigation.goBack();
    else if (step === "date") setStep("service");
    else if (step === "time") setStep("date");
    else if (step === "details") setStep("time");
    else navigation.goBack();
  };

  const servicesToShow = step === "service" ? (passedOrgId ? branchServices : selectedOrg?.services || []) : [];

  const handleFieldChange = (id: string, value: string) => {
    setFormData((p) => ({ ...p, [id]: value }));
    if (formErrors[id]) setFormErrors((p) => ({ ...p, [id]: "" }));
  };

  const getKeyboardType = (type: AppointmentInputField["type"]) => {
    if (type === "email") return "email-address" as const;
    if (type === "phone") return "phone-pad" as const;
    if (type === "number") return "number-pad" as const;
    return "default" as const;
  };

  const renderDynamicField = (field: AppointmentInputField) => {
    const errorMsg = formErrors[field.id];
    const labelNode = (
      <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
        {field.label}{field.required ? " *" : ""}
      </ThemedText>
    );

    if (field.type === "select" && field.options && field.options.length > 0) {
      const isOpen = openDropdownId === field.id;
      const value = formData[field.id] || "";
      return (
        <View key={field.id}>
          {labelNode}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setOpenDropdownId(isOpen ? null : field.id);
            }}
            style={[
              styles.textInput,
              styles.dropdownTrigger,
              {
                backgroundColor: theme.surface,
                borderColor: errorMsg ? "#EF4444" : isOpen ? theme.primary : theme.borderSubtle,
              },
            ]}
            testID={`dropdown-${field.id}`}
          >
            <ThemedText
              type="body"
              style={{ color: value ? theme.text : theme.textSecondary, flex: 1 }}
            >
              {value || `Select ${field.label.toLowerCase()}`}
            </ThemedText>
            <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={theme.textSecondary} />
          </Pressable>
          {isOpen ? (
            <View style={[styles.dropdownList, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
              {field.options.map((opt, idx) => (
                <Pressable
                  key={`${field.id}-${idx}`}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleFieldChange(field.id, opt);
                    setOpenDropdownId(null);
                  }}
                  style={[
                    styles.dropdownOption,
                    value === opt ? { backgroundColor: theme.primary + "15" } : null,
                    idx < field.options!.length - 1
                      ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.borderSubtle }
                      : null,
                  ]}
                  testID={`option-${field.id}-${idx}`}
                >
                  <ThemedText type="body" style={{ color: value === opt ? theme.primary : theme.text }}>
                    {opt}
                  </ThemedText>
                  {value === opt ? <Feather name="check" size={16} color={theme.primary} /> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
          {errorMsg ? <ThemedText type="caption" style={styles.fieldError}>{errorMsg}</ThemedText> : null}
        </View>
      );
    }

    if (field.type === "checkbox") {
      const checked = formData[field.id] === "true";
      return (
        <View key={field.id} style={{ marginTop: Spacing.md }}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              handleFieldChange(field.id, checked ? "false" : "true");
            }}
            style={styles.checkboxRow}
            testID={`checkbox-${field.id}`}
          >
            <View
              style={[
                styles.checkbox,
                {
                  backgroundColor: checked ? theme.primary : "transparent",
                  borderColor: errorMsg ? "#EF4444" : checked ? theme.primary : theme.borderSubtle,
                },
              ]}
            >
              {checked ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
            </View>
            <ThemedText type="body" style={{ flex: 1 }}>
              {field.label}{field.required ? " *" : ""}
            </ThemedText>
          </Pressable>
          {errorMsg ? <ThemedText type="caption" style={styles.fieldError}>{errorMsg}</ThemedText> : null}
        </View>
      );
    }

    return (
      <View key={field.id}>
        {labelNode}
        <TextInput
          placeholder={`Enter ${field.label.toLowerCase()}`}
          placeholderTextColor={theme.textSecondary}
          value={formData[field.id] || ""}
          onChangeText={(t) => handleFieldChange(field.id, t)}
          keyboardType={getKeyboardType(field.type)}
          autoCapitalize={field.type === "email" ? "none" : "sentences"}
          style={[
            styles.textInput,
            {
              color: theme.text,
              borderColor: errorMsg ? "#EF4444" : theme.borderSubtle,
              backgroundColor: theme.surface,
            },
          ]}
          testID={`input-${field.id}`}
        />
        {errorMsg ? <ThemedText type="caption" style={styles.fieldError}>{errorMsg}</ThemedText> : null}
      </View>
    );
  };

  if (confirmationResult) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
        contentContainerStyle={{ paddingTop: headerHeight + Spacing.lg, paddingBottom: insets.bottom + Spacing["2xl"] }}
      >
        <Animated.View entering={FadeInDown.springify()} style={styles.confirmationContainer}>
          <View style={[styles.successIcon, { backgroundColor: theme.success + "20" }]}>
            <Feather name="check-circle" size={48} color={theme.success} />
          </View>
          <ThemedText type="h4" style={[styles.confirmTitle, { textAlign: "center" }]}>
            Reservation Confirmed
          </ThemedText>
          <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
            <View style={styles.summaryRow}>
              <Feather name="hash" size={16} color={theme.primary} />
              <ThemedText type="body" style={{ marginLeft: Spacing.sm, fontWeight: "700" }}>
                {confirmationResult.confirmationNumber}
              </ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <Feather name="briefcase" size={16} color={theme.primary} />
              <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                {selectedOrg?.name}
              </ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <Feather name="calendar" size={16} color={theme.primary} />
              <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                {confirmationResult.date}
              </ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <Feather name="clock" size={16} color={theme.primary} />
              <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                {formatSlotTime(confirmationResult.time)}
              </ThemedText>
            </View>
          </View>
          <Button onPress={() => navigation.goBack()} style={styles.bookButton}>
            Done
          </Button>
        </Animated.View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{ paddingTop: headerHeight + Spacing.lg, paddingBottom: insets.bottom + Spacing["2xl"] }}
      showsVerticalScrollIndicator={false}
    >
      {(step !== "org" || passedOrgId) ? (
        <Pressable onPress={goBack} style={styles.backButton} testID="button-back">
          <Feather name="arrow-left" size={20} color={theme.primary} />
          <ThemedText type="body" style={{ color: theme.primary, marginLeft: Spacing.xs }}>
            Back
          </ThemedText>
        </Pressable>
      ) : null}

      {step === "org" && !passedOrgId ? (
        <Animated.View entering={FadeInDown.springify()}>
          <ThemedText type="h4" style={styles.sectionTitle}>
            Select Organization
          </ThemedText>
          {isLoadingOrgs ? (
            <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: Spacing["2xl"] }} />
          ) : (
            <View style={styles.list}>
              {organizations.map((org) => (
                <Pressable
                  key={org.id}
                  onPress={() => handleOrgSelect(org)}
                  disabled={!org.isOpen}
                  style={({ pressed }) => [
                    styles.card,
                    { backgroundColor: theme.surface, borderColor: theme.borderSubtle },
                    pressed && { opacity: 0.9 },
                    !org.isOpen && { opacity: 0.5 },
                  ]}
                  testID={`button-org-${org.id}`}
                >
                  <View style={[styles.iconContainer, { backgroundColor: theme.primary + "15" }]}>
                    <Feather name="briefcase" size={20} color={theme.primary} />
                  </View>
                  <View style={styles.cardContent}>
                    <ThemedText type="body" style={styles.cardTitle}>
                      {org.name}
                    </ThemedText>
                    <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                      {org.description}
                    </ThemedText>
                    {org.address ? (
                      <View style={styles.locationRow}>
                        <Feather name="map-pin" size={12} color={theme.textSecondary} />
                        <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: 4 }}>
                          {org.address}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                  <View style={[styles.statusDot, { backgroundColor: org.isOpen ? theme.success : "#EF4444" }]} />
                  <Feather name="chevron-right" size={20} color={theme.textSecondary} />
                </Pressable>
              ))}
              {organizations.length === 0 ? (
                <View style={styles.emptyState}>
                  <Feather name="inbox" size={40} color={theme.textSecondary} />
                  <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md, textAlign: "center" }}>
                    No organizations available for booking
                  </ThemedText>
                </View>
              ) : null}
            </View>
          )}
        </Animated.View>
      ) : null}

      {step === "service" ? (
        <Animated.View entering={FadeInDown.springify()}>
          <ThemedText type="h4" style={styles.sectionTitle}>
            Select Service
          </ThemedText>
          <ThemedText type="caption" style={[styles.subtitle, { color: theme.textSecondary }]}>
            {selectedOrg?.name || passedOrgName}
          </ThemedText>
          {isLoadingServices ? (
            <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: Spacing["2xl"] }} />
          ) : (
            <View style={styles.list}>
              {servicesToShow.map((service) => (
                <Pressable
                  key={service.id}
                  onPress={() => handleServiceSelect(service)}
                  style={({ pressed }) => [
                    styles.card,
                    { backgroundColor: theme.surface, borderColor: theme.borderSubtle },
                    pressed && { opacity: 0.9 },
                  ]}
                  testID={`button-service-${service.id}`}
                >
                  <View style={styles.cardContent}>
                    <ThemedText type="body" style={styles.cardTitle}>
                      {service.name}
                    </ThemedText>
                    <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                      {service.description || `~${service.averageWaitTime} min`}
                    </ThemedText>
                  </View>
                  <Feather name="chevron-right" size={20} color={theme.textSecondary} />
                </Pressable>
              ))}
              {servicesToShow.length === 0 ? (
                <View style={styles.emptyState}>
                  <Feather name="inbox" size={40} color={theme.textSecondary} />
                  <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md, textAlign: "center" }}>
                    No services available
                  </ThemedText>
                </View>
              ) : null}
            </View>
          )}
        </Animated.View>
      ) : null}

      {step === "date" ? (
        <Animated.View entering={FadeInDown.springify()}>
          <ThemedText type="h4" style={styles.sectionTitle}>
            Select Date
          </ThemedText>
          <ThemedText type="caption" style={[styles.subtitle, { color: theme.textSecondary }]}>
            {selectedOrg?.name} - {selectedService?.name}
          </ThemedText>
          <View style={styles.dateGrid}>
            {availableDates.map((date) => (
              <Pressable
                key={date.toISOString()}
                onPress={() => handleDateSelect(date)}
                style={({ pressed }) => [
                  styles.dateCard,
                  { backgroundColor: theme.surface, borderColor: theme.borderSubtle },
                  pressed && { opacity: 0.9 },
                ]}
                testID={`button-date-${date.getDate()}`}
              >
                <ThemedText type="h4" style={{ color: theme.primary }}>
                  {date.getDate()}
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {date.toLocaleDateString("en-US", { weekday: "short" })}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      ) : null}

      {step === "time" && selectedDate ? (
        <Animated.View entering={FadeInDown.springify()}>
          <ThemedText type="h4" style={styles.sectionTitle}>
            Select Time
          </ThemedText>
          <ThemedText type="caption" style={[styles.subtitle, { color: theme.textSecondary }]}>
            {formatDate(selectedDate)}
          </ThemedText>
          {isLoadingSlots ? (
            <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: Spacing["2xl"] }} />
          ) : (
            <View style={styles.timeGrid}>
              {timeSlots.map((slot) => (
                <Pressable
                  key={slot.time}
                  onPress={() => handleSlotSelect(slot)}
                  disabled={!slot.available}
                  style={[
                    styles.timeSlot,
                    { backgroundColor: slot.available ? theme.surface : theme.surfaceMuted },
                    { borderColor: selectedSlotTime === slot.time ? theme.primary : theme.borderSubtle },
                    selectedSlotTime === slot.time ? { borderWidth: 2 } : null,
                    !slot.available ? { opacity: 0.5 } : null,
                  ]}
                  testID={`button-slot-${slot.time}`}
                >
                  <ThemedText
                    type="body"
                    style={{ color: slot.available ? theme.text : theme.textSecondary, fontWeight: "600" }}
                  >
                    {formatSlotTime(slot.time)}
                  </ThemedText>
                  {slot.available ? (
                    <ThemedText type="small" style={{ color: theme.success }}>
                      {slot.spotsLeft} spots
                    </ThemedText>
                  ) : (
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      Full
                    </ThemedText>
                  )}
                </Pressable>
              ))}
              {timeSlots.length === 0 ? (
                <View style={styles.emptyState}>
                  <Feather name="clock" size={40} color={theme.textSecondary} />
                  <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md, textAlign: "center" }}>
                    No time slots available for this date
                  </ThemedText>
                </View>
              ) : null}
            </View>
          )}
        </Animated.View>
      ) : null}

      {step === "details" && selectedSlotTime ? (
        <Animated.View entering={FadeInDown.springify()}>
          <ThemedText type="h4" style={styles.sectionTitle}>
            Confirm Reservation
          </ThemedText>

          <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
            <View style={styles.summaryRow}>
              <Feather name="briefcase" size={16} color={theme.primary} />
              <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                {selectedOrg?.name}
              </ThemedText>
            </View>
            {selectedService ? (
              <View style={styles.summaryRow}>
                <Feather name="tag" size={16} color={theme.primary} />
                <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                  {selectedService.name}
                </ThemedText>
              </View>
            ) : null}
            <View style={styles.summaryRow}>
              <Feather name="calendar" size={16} color={theme.primary} />
              <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                {selectedDate ? formatDate(selectedDate) : ""}
              </ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <Feather name="clock" size={16} color={theme.primary} />
              <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                {formatSlotTime(selectedSlotTime)}
              </ThemedText>
            </View>
          </View>

          <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
            Your Name *
          </ThemedText>
          <TextInput
            placeholder="Enter your name"
            placeholderTextColor={theme.textSecondary}
            value={customerName}
            onChangeText={(t) => {
              setCustomerName(t);
              if (formErrors["__name"]) setFormErrors((p) => ({ ...p, __name: "" }));
            }}
            style={[
              styles.textInput,
              {
                color: theme.text,
                borderColor: formErrors["__name"] ? "#EF4444" : theme.borderSubtle,
                backgroundColor: theme.surface,
              },
            ]}
            testID="input-customer-name"
          />
          {formErrors["__name"] ? (
            <ThemedText type="caption" style={styles.fieldError}>
              {formErrors["__name"]}
            </ThemedText>
          ) : null}

          {(selectedService?.inputFields || []).map((field) => renderDynamicField(field))}

          <Button onPress={handleBook} disabled={isSubmitting || !customerName.trim()} style={styles.bookButton} testID="button-confirm-reservation">
            {isSubmitting ? <ActivityIndicator size="small" color="#FFFFFF" /> : "Confirm Reservation"}
          </Button>
        </Animated.View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  subtitle: {
    marginBottom: Spacing.lg,
  },
  list: {
    gap: Spacing.sm,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontWeight: "600",
    marginBottom: 2,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
  },
  dateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  dateCard: {
    width: 70,
    height: 70,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  timeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  timeSlot: {
    width: "30%",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    borderWidth: 1,
  },
  summaryCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  label: {
    fontWeight: "600",
    marginBottom: Spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    fontSize: 15,
  },
  bookButton: {
    marginTop: Spacing.sm,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
  },
  fieldError: {
    color: "#EF4444",
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
  },
  dropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
  },
  dropdownList: {
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmationContainer: {
    alignItems: "center",
    paddingTop: Spacing["2xl"],
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  confirmTitle: {
    fontWeight: "700",
    marginBottom: Spacing.lg,
  },
});
