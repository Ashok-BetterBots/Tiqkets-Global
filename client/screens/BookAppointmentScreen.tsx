import React, { useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { useAppointments } from "@/contexts/AppointmentContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Organization, Service, TimeSlot } from "@/types/queue";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const MOCK_ORGANIZATIONS: Organization[] = [
  {
    id: "org_1",
    name: "City Hospital",
    description: "Healthcare services",
    services: [
      { id: "svc_1", name: "General Consultation", description: "30 min consultation", averageWaitTime: 15, formFields: [] },
      { id: "svc_2", name: "Lab Tests", description: "Blood work & diagnostics", averageWaitTime: 10, formFields: [] },
      { id: "svc_3", name: "Pharmacy", description: "Prescription pickup", averageWaitTime: 5, formFields: [] },
    ],
    location: { latitude: 37.7749, longitude: -122.4194, address: "123 Health St, San Francisco", radius: 100 },
  },
  {
    id: "org_2",
    name: "National Bank",
    description: "Banking services",
    services: [
      { id: "svc_4", name: "Account Services", description: "Account management", averageWaitTime: 12, formFields: [] },
      { id: "svc_5", name: "Loans", description: "Loan applications", averageWaitTime: 20, formFields: [] },
      { id: "svc_6", name: "Customer Support", description: "General inquiries", averageWaitTime: 8, formFields: [] },
    ],
    location: { latitude: 37.7849, longitude: -122.4094, address: "456 Finance Ave, San Francisco", radius: 100 },
  },
  {
    id: "org_3",
    name: "DMV Office",
    description: "Government services",
    services: [
      { id: "svc_7", name: "License Renewal", description: "Renew driver's license", averageWaitTime: 25, formFields: [] },
      { id: "svc_8", name: "Vehicle Registration", description: "Register your vehicle", averageWaitTime: 30, formFields: [] },
    ],
    location: { latitude: 37.7649, longitude: -122.4294, address: "789 Gov Blvd, San Francisco", radius: 100 },
  },
];

export default function BookAppointmentScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { bookAppointment, getAvailableSlots } = useAppointments();

  const [step, setStep] = useState<"org" | "service" | "date" | "time" | "details">("org");
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const availableSlots = useMemo(() => {
    if (!selectedOrg || !selectedService || !selectedDate) return [];
    return getAvailableSlots(selectedOrg.id, selectedService.id, selectedDate.toISOString());
  }, [selectedOrg, selectedService, selectedDate, getAvailableSlots]);

  const handleOrgSelect = (org: Organization) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedOrg(org);
    setStep("service");
  };

  const handleServiceSelect = (service: Service) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedService(service);
    setStep("date");
  };

  const handleDateSelect = (date: Date) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDate(date);
    setSelectedSlot(null);
    setStep("time");
  };

  const handleSlotSelect = (slot: TimeSlot) => {
    if (!slot.available) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedSlot(slot);
    setStep("details");
  };

  const handleBook = async () => {
    if (!selectedOrg || !selectedService || !selectedDate || !selectedSlot) return;

    setIsSubmitting(true);
    try {
      const startTime = new Date(selectedSlot.startTime);
      const endTime = new Date(selectedSlot.endTime);

      await bookAppointment({
        organizationId: selectedOrg.id,
        organizationName: selectedOrg.name,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        scheduledDate: selectedDate.toISOString(),
        scheduledTime: startTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
        endTime: endTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
        notes,
        formData: { name: user?.name, phone: user?.phone },
      });

      navigation.goBack();
    } catch (error) {
      console.error("Failed to book appointment:", error);
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

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  };

  const goBack = () => {
    if (step === "service") setStep("org");
    else if (step === "date") setStep("service");
    else if (step === "time") setStep("date");
    else if (step === "details") setStep("time");
    else navigation.goBack();
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{ paddingTop: headerHeight + Spacing.lg, paddingBottom: insets.bottom + Spacing["2xl"] }}
      showsVerticalScrollIndicator={false}
    >
      {step !== "org" && (
        <Pressable onPress={goBack} style={styles.backButton}>
          <Feather name="arrow-left" size={20} color={theme.primary} />
          <ThemedText type="body" style={{ color: theme.primary, marginLeft: Spacing.xs }}>
            Back
          </ThemedText>
        </Pressable>
      )}

      {step === "org" && (
        <Animated.View entering={FadeInDown.springify()}>
          <ThemedText type="h4" style={styles.sectionTitle}>
            Select Organization
          </ThemedText>
          <View style={styles.list}>
            {MOCK_ORGANIZATIONS.map((org) => (
              <Pressable
                key={org.id}
                onPress={() => handleOrgSelect(org)}
                style={({ pressed }) => [
                  styles.card,
                  { backgroundColor: theme.backgroundDefault },
                  pressed && { opacity: 0.9 },
                ]}
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
                  {org.location ? (
                    <View style={styles.locationRow}>
                      <Feather name="map-pin" size={12} color={theme.textSecondary} />
                      <ThemedText type="small" style={{ color: theme.textSecondary, marginLeft: 4 }}>
                        {org.location.address}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
                <Feather name="chevron-right" size={20} color={theme.textSecondary} />
              </Pressable>
            ))}
          </View>
        </Animated.View>
      )}

      {step === "service" && selectedOrg && (
        <Animated.View entering={FadeInDown.springify()}>
          <ThemedText type="h4" style={styles.sectionTitle}>
            Select Service
          </ThemedText>
          <ThemedText type="caption" style={[styles.subtitle, { color: theme.textSecondary }]}>
            {selectedOrg.name}
          </ThemedText>
          <View style={styles.list}>
            {selectedOrg.services.map((service) => (
              <Pressable
                key={service.id}
                onPress={() => handleServiceSelect(service)}
                style={({ pressed }) => [
                  styles.card,
                  { backgroundColor: theme.backgroundDefault },
                  pressed && { opacity: 0.9 },
                ]}
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
          </View>
        </Animated.View>
      )}

      {step === "date" && (
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
      )}

      {step === "time" && selectedDate && (
        <Animated.View entering={FadeInDown.springify()}>
          <ThemedText type="h4" style={styles.sectionTitle}>
            Select Time
          </ThemedText>
          <ThemedText type="caption" style={[styles.subtitle, { color: theme.textSecondary }]}>
            {formatDate(selectedDate)}
          </ThemedText>
          <View style={styles.timeGrid}>
            {availableSlots.map((slot) => (
              <Pressable
                key={slot.id}
                onPress={() => handleSlotSelect(slot)}
                disabled={!slot.available}
                style={[
                  styles.timeSlot,
                  { backgroundColor: slot.available ? theme.backgroundDefault : theme.backgroundSecondary },
                  { borderColor: selectedSlot?.id === slot.id ? theme.primary : theme.border },
                  selectedSlot?.id === slot.id && { borderWidth: 2 },
                  !slot.available && { opacity: 0.5 },
                ]}
              >
                <ThemedText
                  type="body"
                  style={{ color: slot.available ? theme.text : theme.textSecondary, fontWeight: "600" }}
                >
                  {formatTime(slot.startTime)}
                </ThemedText>
                {slot.available ? (
                  <ThemedText type="small" style={{ color: theme.success }}>
                    {slot.maxCapacity - slot.currentBookings} spots
                  </ThemedText>
                ) : (
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    Full
                  </ThemedText>
                )}
              </Pressable>
            ))}
          </View>
        </Animated.View>
      )}

      {step === "details" && selectedSlot && (
        <Animated.View entering={FadeInDown.springify()}>
          <ThemedText type="h4" style={styles.sectionTitle}>
            Confirm Booking
          </ThemedText>

          <View style={[styles.summaryCard, { backgroundColor: theme.backgroundDefault }]}>
            <View style={styles.summaryRow}>
              <Feather name="briefcase" size={16} color={theme.primary} />
              <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                {selectedOrg?.name}
              </ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <Feather name="tag" size={16} color={theme.primary} />
              <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                {selectedService?.name}
              </ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <Feather name="calendar" size={16} color={theme.primary} />
              <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                {selectedDate ? formatDate(selectedDate) : ""}
              </ThemedText>
            </View>
            <View style={styles.summaryRow}>
              <Feather name="clock" size={16} color={theme.primary} />
              <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                {formatTime(selectedSlot.startTime)} - {formatTime(selectedSlot.endTime)}
              </ThemedText>
            </View>
          </View>

          <ThemedText type="small" style={[styles.label, { color: theme.textSecondary }]}>
            Additional Notes (Optional)
          </ThemedText>
          <TextInput
            placeholder="Any special requests or notes..."
            placeholderTextColor={theme.textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            style={[styles.textArea, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundDefault }]}
          />

          <View style={[styles.infoBox, { backgroundColor: theme.primary + "10" }]}>
            <Feather name="info" size={16} color={theme.primary} />
            <ThemedText type="small" style={{ color: theme.primary, marginLeft: Spacing.sm, flex: 1 }}>
              When you arrive at the location, you'll be automatically checked in.
            </ThemedText>
          </View>

          <Button onPress={handleBook} disabled={isSubmitting} style={styles.bookButton}>
            {isSubmitting ? <ActivityIndicator size="small" color="#FFFFFF" /> : "Confirm Booking"}
          </Button>
        </Animated.View>
      )}
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
  textArea: {
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    padding: Spacing.md,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: Spacing.lg,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xl,
  },
  bookButton: {
    marginTop: Spacing.sm,
  },
});
