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

interface DiscoverService {
  id: string;
  name: string;
  description: string;
  averageWaitTime: number;
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
  const [customerPhone, setCustomerPhone] = useState(user?.phone || "");
  const [customerEmail, setCustomerEmail] = useState("");
  const [partySize, setPartySize] = useState("2");
  const [notes, setNotes] = useState("");
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
          setOrganizations(data.organizations);
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
          averageWaitTime: s.avgWaitTime || 15,
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
    setStep("details");
  };

  const handleBook = async () => {
    if (!selectedOrg || !selectedDate || !selectedSlotTime) return;
    if (!customerName.trim()) return;

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
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim(),
          partySize: parseInt(partySize) || 2,
          date: dateStr,
          time: selectedSlotTime,
          specialRequests: notes.trim(),
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
        console.error("Reservation failed:", err);
      }
    } catch (error) {
      console.error("Failed to book reservation:", error);
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
          <View style={[styles.summaryCard, { backgroundColor: theme.backgroundDefault }]}>
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
            <View style={styles.summaryRow}>
              <Feather name="users" size={16} color={theme.primary} />
              <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                Party of {partySize}
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
                    { backgroundColor: theme.backgroundDefault },
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
                    { backgroundColor: theme.backgroundDefault },
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
                  { backgroundColor: theme.backgroundDefault, borderColor: theme.border },
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
                    { backgroundColor: slot.available ? theme.backgroundDefault : theme.backgroundSecondary },
                    { borderColor: selectedSlotTime === slot.time ? theme.primary : theme.border },
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

          <View style={[styles.summaryCard, { backgroundColor: theme.backgroundDefault }]}>
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
            onChangeText={setCustomerName}
            style={[styles.textInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundDefault }]}
            testID="input-customer-name"
          />

          <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
            Phone Number
          </ThemedText>
          <TextInput
            placeholder="Enter phone number"
            placeholderTextColor={theme.textSecondary}
            value={customerPhone}
            onChangeText={setCustomerPhone}
            keyboardType="phone-pad"
            style={[styles.textInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundDefault }]}
            testID="input-customer-phone"
          />

          <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
            Email
          </ThemedText>
          <TextInput
            placeholder="Enter email address"
            placeholderTextColor={theme.textSecondary}
            value={customerEmail}
            onChangeText={setCustomerEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            style={[styles.textInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundDefault }]}
            testID="input-customer-email"
          />

          <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
            Party Size
          </ThemedText>
          <View style={styles.partySizeRow}>
            {["1", "2", "3", "4", "5", "6"].map((size) => (
              <Pressable
                key={size}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPartySize(size);
                }}
                style={[
                  styles.partySizeButton,
                  { backgroundColor: partySize === size ? theme.primary : theme.backgroundDefault, borderColor: theme.border },
                ]}
                testID={`button-party-${size}`}
              >
                <ThemedText type="body" style={{ color: partySize === size ? "#FFFFFF" : theme.text, fontWeight: "600" }}>
                  {size}
                </ThemedText>
              </Pressable>
            ))}
          </View>

          <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
            Special Requests (Optional)
          </ThemedText>
          <TextInput
            placeholder="Any special requests or notes..."
            placeholderTextColor={theme.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            style={[styles.textArea, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundDefault }]}
            testID="input-notes"
          />

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
    borderRadius: BorderRadius.sm,
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
    borderRadius: BorderRadius.sm,
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
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    borderWidth: 1,
  },
  summaryCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
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
  textArea: {
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    padding: Spacing.md,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: Spacing.lg,
  },
  bookButton: {
    marginTop: Spacing.sm,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["2xl"],
  },
  partySizeRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  partySizeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
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
