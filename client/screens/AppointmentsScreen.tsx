import React from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAppointments } from "@/contexts/AppointmentContext";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { Appointment, Reservation } from "@/types/queue";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function AppointmentsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const {
    appointments,
    reservations,
    isLoading,
    cancelAppointment,
    checkInAppointment,
    locationPermissionGranted,
    requestLocationPermission,
    isAtLocation,
    checkLocationNow,
    userLocation,
  } = useAppointments();
  const [refreshing, setRefreshing] = React.useState(false);

  const upcomingAppointments = appointments.filter(
    (apt) => apt.status === "upcoming" || apt.status === "checked_in"
  );
  const pastAppointments = appointments.filter(
    (apt) => apt.status === "completed" || apt.status === "cancelled" || apt.status === "no_show"
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setRefreshing(false);
  };

  const handleCancel = (appointment: Appointment) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (Platform.OS !== "web") {
      Alert.alert(
        "Cancel Appointment",
        `Are you sure you want to cancel your appointment at ${appointment.organizationName}?`,
        [
          { text: "Keep", style: "cancel" },
          { text: "Cancel Appointment", style: "destructive", onPress: () => cancelAppointment(appointment.id) },
        ]
      );
    } else {
      cancelAppointment(appointment.id);
    }
  };

  const handleCheckIn = async (appointment: Appointment) => {
    await checkLocationNow();
    if (isAtLocation(appointment.organizationId)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      checkInAppointment(appointment.id);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      if (Platform.OS !== "web") {
        Alert.alert(
          "Not at Location",
          `You need to be at ${appointment.organizationName} to check in. Please move closer to the location and try again.`,
          [{ text: "OK" }]
        );
      }
    }
  };

  const handleModify = (appointment: Appointment) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate("BookAppointment", {
      modifyAppointmentId: appointment.id,
      organizationId: appointment.organizationId,
      organizationName: appointment.organizationName,
      serviceId: appointment.serviceId,
      serviceName: appointment.serviceName,
    });
  };

  const canCheckIn = (appointment: Appointment): boolean => {
    return isAtLocation(appointment.organizationId);
  };

  const handleEnableLocation = async () => {
    const granted = await requestLocationPermission();
    if (granted) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const getStatusColor = (status: Appointment["status"]) => {
    switch (status) {
      case "upcoming":
        return theme.primary;
      case "checked_in":
        return Colors.light.success;
      case "completed":
        return theme.textSecondary;
      case "cancelled":
        return Colors.light.accent;
      default:
        return theme.textSecondary;
    }
  };

  const getStatusLabel = (status: Appointment["status"]) => {
    switch (status) {
      case "upcoming":
        return "Upcoming";
      case "checked_in":
        return "Checked In";
      case "completed":
        return "Completed";
      case "cancelled":
        return "Cancelled";
      case "no_show":
        return "No Show";
      default:
        return status;
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: insets.bottom + Spacing["2xl"],
          paddingHorizontal: Spacing.xl,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {!locationPermissionGranted && Platform.OS !== "web" && (
          <Animated.View
            entering={FadeInDown.delay(100)}
            style={[styles.locationBanner, { backgroundColor: theme.primary + "15" }]}
          >
            <View style={styles.bannerContent}>
              <Feather name="map-pin" size={20} color={theme.primary} />
              <View style={{ flex: 1, marginLeft: Spacing.md }}>
                <ThemedText type="body" style={{ fontWeight: "600" }}>
                  Enable Auto Check-in
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  Get automatically checked in when you arrive
                </ThemedText>
              </View>
            </View>
            <Pressable
              onPress={handleEnableLocation}
              style={[styles.enableButton, { backgroundColor: theme.primary }]}
            >
              <ThemedText type="small" lightColor="#FFFFFF" darkColor="#FFFFFF" style={{ fontWeight: "600" }}>
                Enable
              </ThemedText>
            </Pressable>
          </Animated.View>
        )}

        <View style={styles.header}>
          <ThemedText type="h4" style={styles.sectionTitle}>
            Upcoming
          </ThemedText>
          <Button
            onPress={() => navigation.navigate("BookAppointment")}
            variant="primary"
            size="small"
          >
            Book New
          </Button>
        </View>

        {upcomingAppointments.length > 0 ? (
          <View style={styles.appointmentsList}>
            {upcomingAppointments.map((appointment, index) => (
              <Animated.View
                key={appointment.id}
                entering={FadeInDown.delay(index * 100)}
                style={[styles.appointmentCard, { backgroundColor: theme.surface }]}
              >
                <View style={styles.appointmentHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(appointment.status) + "20" }]}>
                    <ThemedText
                      type="small"
                      style={{ color: getStatusColor(appointment.status), fontWeight: "600" }}
                    >
                      {getStatusLabel(appointment.status)}
                    </ThemedText>
                  </View>
                  {appointment.ticketNumber ? (
                    <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                      #{appointment.ticketNumber}
                    </ThemedText>
                  ) : null}
                </View>

                <View style={styles.appointmentBody}>
                  <ThemedText type="h4" style={styles.orgName}>
                    {appointment.organizationName}
                  </ThemedText>
                  <ThemedText type="body" style={{ color: theme.textSecondary }}>
                    {appointment.serviceName}
                  </ThemedText>

                  <View style={styles.detailsRow}>
                    <View style={styles.detailItem}>
                      <Feather name="calendar" size={14} color={theme.primary} />
                      <ThemedText type="body" style={{ marginLeft: Spacing.xs }}>
                        {formatDate(appointment.scheduledDate)}
                      </ThemedText>
                    </View>
                    <View style={styles.detailItem}>
                      <Feather name="clock" size={14} color={theme.primary} />
                      <ThemedText type="body" style={{ marginLeft: Spacing.xs }}>
                        {appointment.scheduledTime}
                      </ThemedText>
                    </View>
                  </View>
                </View>

                <View style={styles.appointmentActions}>
                  {appointment.status === "upcoming" && (
                    <>
                      <Pressable
                        onPress={() => handleCheckIn(appointment)}
                        disabled={!canCheckIn(appointment)}
                        style={[
                          styles.actionButton,
                          { 
                            backgroundColor: canCheckIn(appointment) ? theme.primary : theme.backgroundSecondary,
                            opacity: canCheckIn(appointment) ? 1 : 0.6,
                          }
                        ]}
                      >
                        <Feather 
                          name="check" 
                          size={16} 
                          color={canCheckIn(appointment) ? "#FFFFFF" : theme.textSecondary} 
                        />
                        <ThemedText
                          type="small"
                          style={{ 
                            marginLeft: Spacing.xs, 
                            fontWeight: "600",
                            color: canCheckIn(appointment) ? "#FFFFFF" : theme.textSecondary,
                          }}
                        >
                          {canCheckIn(appointment) ? "Check In" : "At Location"}
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => handleModify(appointment)}
                        style={[styles.actionButton, { backgroundColor: theme.surfaceMuted }]}
                      >
                        <Feather name="edit-2" size={16} color={theme.primary} />
                        <ThemedText
                          type="small"
                          style={{ marginLeft: Spacing.xs, color: theme.primary, fontWeight: "600" }}
                        >
                          Modify
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        onPress={() => handleCancel(appointment)}
                        style={[styles.actionButton, { backgroundColor: theme.surfaceMuted }]}
                      >
                        <Feather name="x" size={16} color={theme.accent} />
                        <ThemedText
                          type="small"
                          style={{ marginLeft: Spacing.xs, color: theme.accent, fontWeight: "600" }}
                        >
                          Cancel
                        </ThemedText>
                      </Pressable>
                    </>
                  )}
                  {appointment.status === "checked_in" && (
                    <View style={[styles.checkedInBadge, { backgroundColor: Colors.light.success + "15" }]}>
                      <Feather name="check-circle" size={16} color={Colors.light.success} />
                      <ThemedText
                        type="body"
                        style={{ marginLeft: Spacing.xs, color: Colors.light.success, fontWeight: "600" }}
                      >
                        You're checked in!
                      </ThemedText>
                    </View>
                  )}
                </View>
              </Animated.View>
            ))}
          </View>
        ) : (
          <View style={[styles.emptyState, { backgroundColor: theme.surface }]}>
            <Feather name="calendar" size={48} color={theme.textSecondary} />
            <ThemedText type="body" style={{ color: theme.textSecondary, marginTop: Spacing.md }}>
              No upcoming appointments
            </ThemedText>
            <Button
              onPress={() => navigation.navigate("BookAppointment")}
              variant="outline"
              size="small"
              style={{ marginTop: Spacing.lg }}
            >
              Book an Appointment
            </Button>
          </View>
        )}

        {pastAppointments.length > 0 && (
          <>
            <ThemedText type="h4" style={[styles.sectionTitle, { marginTop: Spacing["2xl"] }]}>
              Past
            </ThemedText>
            <View style={styles.appointmentsList}>
              {pastAppointments.slice(0, 5).map((appointment, index) => (
                <Animated.View
                  key={appointment.id}
                  entering={FadeInDown.delay((upcomingAppointments.length + index) * 100)}
                  style={[styles.pastCard, { backgroundColor: theme.surface }]}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText type="body" style={{ fontWeight: "600" }}>
                      {appointment.organizationName}
                    </ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                      {appointment.serviceName} - {formatDate(appointment.scheduledDate)}
                    </ThemedText>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(appointment.status) + "20" }]}>
                    <ThemedText
                      type="small"
                      style={{ color: getStatusColor(appointment.status), fontWeight: "600" }}
                    >
                      {getStatusLabel(appointment.status)}
                    </ThemedText>
                  </View>
                </Animated.View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  locationBanner: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  enableButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.xs,
    alignSelf: "flex-start",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontWeight: "700",
  },
  appointmentsList: {
    gap: Spacing.md,
  },
  appointmentCard: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
  },
  appointmentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
  appointmentBody: {
    marginBottom: Spacing.lg,
  },
  orgName: {
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  detailsRow: {
    flexDirection: "row",
    marginTop: Spacing.md,
    gap: Spacing.xl,
  },
  detailItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  appointmentActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.xs,
  },
  checkedInBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.xs,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing["3xl"],
    borderRadius: BorderRadius.sm,
  },
  pastCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
  },
});
