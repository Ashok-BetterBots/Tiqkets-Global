import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Alert,
  TextInput,
  Platform,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut, Layout } from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useColorScheme } from "react-native";
import { QueueCustomer } from "@/types/organization";
import { OrgStackParamList } from "@/navigation/OrgStackNavigator";

type NavigationProp = NativeStackNavigationProp<OrgStackParamList>;

type FilterStatus = "all" | "waiting" | "called" | "serving" | "no_show";

interface CustomerCardProps {
  customer: QueueCustomer;
  isSelectiveMode: boolean;
  isFirstWaiting: boolean;
  hasCalledCustomer: boolean;
  onCallNext: () => void;
  onCall: () => void;
  onServe: () => void;
  onCallAgain: () => void;
  onSkip: () => void;
  onComplete: () => void;
  onNoShow: () => void;
  inputFields?: { id: string; label: string }[];
  isDark?: boolean;
}

function CustomerCard({
  customer,
  isSelectiveMode,
  isFirstWaiting,
  hasCalledCustomer,
  onCallNext,
  onCall,
  onServe,
  onCallAgain,
  onSkip,
  onComplete,
  onNoShow,
  inputFields = [],
  isDark = false,
}: CustomerCardProps) {
  const colors = isDark ? Colors.dark : Colors.light;
  const isCalled = customer.status === "called";
  const canShowCallNext = isFirstWaiting && !isSelectiveMode && !hasCalledCustomer;
  const isProminent = isCalled || canShowCallNext;
  const getStatusColor = () => {
    switch (customer.status) {
      case "called":
        return colors.accent;
      case "serving":
        return colors.success;
      default:
        return colors.primary;
    }
  };

  const getStatusText = () => {
    switch (customer.status) {
      case "called":
        return "Called";
      case "serving":
        return "Serving";
      case "completed":
        return "Completed";
      case "no_show":
        return "No Show";
      default:
        return `Position ${customer.position}`;
    }
  };

  const getPriorityBadge = () => {
    if (customer.priority === "vip") {
      return (
        <View style={[styles.priorityBadge, { backgroundColor: "#F59E0B" + "20" }]}>
          <Feather name="star" size={12} color="#F59E0B" />
          <ThemedText style={[styles.priorityText, { color: "#F59E0B" }]}>VIP</ThemedText>
        </View>
      );
    }
    if (customer.priority === "emergency") {
      return (
        <View style={[styles.priorityBadge, { backgroundColor: colors.accent + "20" }]}>
          <Feather name="alert-triangle" size={12} color={colors.accent} />
          <ThemedText style={[styles.priorityText, { color: colors.accent }]}>Urgent</ThemedText>
        </View>
      );
    }
    return null;
  };

  const getSkipBadge = () => {
    if (customer.skipCount > 0) {
      return (
        <View style={[styles.skipBadge, { backgroundColor: "#EF4444" + "15" }]}>
          <ThemedText style={[styles.skipText, { color: "#EF4444" }]}>
            Skipped {customer.skipCount}x
          </ThemedText>
        </View>
      );
    }
    return null;
  };

  const waitTime = Math.round((Date.now() - new Date(customer.joinedAt).getTime()) / 60000);

  const getFieldLabel = (fieldId: string) => {
    const field = inputFields.find((f) => f.id === fieldId);
    return field?.label || fieldId;
  };

  const formDataEntries = Object.entries(customer.formData || {}).filter(
    ([key, value]) => value !== undefined && value !== null && value !== ""
  );

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} layout={Layout}>
      <Card style={StyleSheet.flatten([
        styles.customerCard,
        isProminent ? styles.prominentCard : undefined,
        isCalled ? styles.calledCard : undefined,
      ])}>
        {isCalled ? (
          <View style={styles.calledBanner}>
            <Feather name="volume-2" size={14} color="#FFFFFF" />
            <ThemedText style={styles.calledBannerText}>Now Calling</ThemedText>
          </View>
        ) : null}
        {canShowCallNext ? (
          <View style={[styles.nextUpBanner, { backgroundColor: colors.primary + "10" }]}>
            <Feather name="arrow-right" size={14} color={colors.primary} />
            <ThemedText style={[styles.nextUpBannerText, { color: colors.primary }]}>Next in Line</ThemedText>
          </View>
        ) : null}
        <View style={styles.customerHeader}>
          <View style={styles.ticketInfo}>
            <View style={[styles.ticketBadge, { backgroundColor: getStatusColor() + "15" }]}>
              <ThemedText style={[styles.ticketNumber, { color: getStatusColor() }]}>
                {customer.ticketNumber}
              </ThemedText>
            </View>
            {getPriorityBadge()}
            {getSkipBadge()}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor() + "15" }]}>
            <ThemedText style={[styles.statusText, { color: getStatusColor() }]}>
              {getStatusText()}
            </ThemedText>
          </View>
        </View>

        <View style={styles.customerDetails}>
          <ThemedText type="body" style={styles.customerName}>
            {customer.customerName}
          </ThemedText>
          <View style={styles.customerMeta}>
            {customer.customerPhone ? (
              <View style={styles.metaItem}>
                <Feather name="phone" size={12} color={colors.textSecondary} />
                <ThemedText style={[styles.metaText, { color: colors.textSecondary }]}>{customer.customerPhone}</ThemedText>
              </View>
            ) : null}
            <View style={styles.metaItem}>
              <Feather name="clock" size={12} color={colors.textSecondary} />
              <ThemedText style={[styles.metaText, { color: colors.textSecondary }]}>{waitTime} min waiting</ThemedText>
            </View>
          </View>
          <View style={styles.serviceTag}>
            <Feather name="tag" size={12} color={colors.primary} />
            <ThemedText style={[styles.serviceText, { color: colors.primary }]}>{customer.serviceName}</ThemedText>
          </View>
        </View>

        {isProminent && formDataEntries.length > 0 ? (
          <View style={[styles.formDataSection, { backgroundColor: isDark ? "#2A2A2A" : "#F8FAFC" }]}>
            <View style={styles.formDataHeader}>
              <Feather name="file-text" size={14} color={colors.primary} />
              <ThemedText style={styles.formDataTitle}>Customer Details</ThemedText>
            </View>
            <View style={styles.formDataGrid}>
              {formDataEntries.map(([key, value]) => (
                <View key={key} style={styles.formDataItem}>
                  <ThemedText style={[styles.formDataLabel, { color: colors.textSecondary }]}>{getFieldLabel(key)}</ThemedText>
                  <ThemedText style={[styles.formDataValue, { color: colors.text }]}>
                    {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
                  </ThemedText>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={[styles.customerActions, { borderTopColor: isDark ? "#3A3A3A" : "#F1F5F9" }]}>
          {customer.status === "waiting" && isSelectiveMode ? (
            <Button
              title="Call Now"
              onPress={onCall}
              size="small"
              style={styles.actionButton}
            />
          ) : null}
          {customer.status === "waiting" && !isSelectiveMode && canShowCallNext ? (
            <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)}>
              <Button
                title="Call Next"
                onPress={onCallNext}
                icon={<Feather name="volume-2" size={16} color="#FFFFFF" />}
                style={styles.callNextButtonInCard}
              />
            </Animated.View>
          ) : null}
          {customer.status === "waiting" && !isSelectiveMode && !canShowCallNext ? (
            <View style={styles.waitingNote}>
              <Feather name="clock" size={14} color={colors.textSecondary} />
              <ThemedText style={[styles.waitingText, { color: colors.textSecondary }]}>Position {customer.position}</ThemedText>
            </View>
          ) : null}
          {customer.status === "called" ? (
            <Animated.View entering={FadeIn.duration(300).delay(100)} exiting={FadeOut.duration(200)}>
              <View style={styles.calledActions}>
                <Button
                  title="Complete"
                  onPress={onComplete}
                  icon={<Feather name="check-circle" size={18} color="#FFFFFF" />}
                  style={styles.completeButtonPrimary}
                />
                <View style={styles.secondaryButtonRow}>
                  <Button
                    title="Call Again"
                    onPress={onCallAgain}
                    size="small"
                    variant="outline"
                    icon={<Feather name="phone-call" size={14} color={colors.primary} />}
                    style={styles.callAgainButton}
                  />
                  <Button
                    title="Skip"
                    onPress={onSkip}
                    size="small"
                    variant="ghost"
                    icon={<Feather name="skip-forward" size={14} color={colors.accent} />}
                    style={[styles.skipButton, { backgroundColor: colors.accent + "10" }]}
                  />
                </View>
                {customer.skipCount >= 2 ? (
                  <View style={styles.warningBanner}>
                    <Feather name="alert-circle" size={14} color="#EF4444" />
                    <ThemedText style={styles.warningText}>
                      Next skip will mark as No Show
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            </Animated.View>
          ) : null}
          {customer.status === "no_show" ? (
            <View style={styles.noShowNote}>
              <Feather name="user-x" size={14} color={colors.accent} />
              <ThemedText style={[styles.noShowText, { color: colors.textSecondary }]}>
                Customer marked as No Show after {customer.skipCount} skips
              </ThemedText>
            </View>
          ) : null}
          {customer.status === "serving" ? (
            <Button
              title="Complete"
              onPress={onComplete}
              size="small"
              variant="secondary"
              style={styles.actionButton}
            />
          ) : null}
        </View>
      </Card>
    </Animated.View>
  );
}

export default function OrgQueueScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const {
    organization,
    queue,
    refreshQueue,
    callNextCustomer,
    callSpecificCustomer,
    callAgainCustomer,
    skipCustomer,
    markAsServing,
    markAsComplete,
    markAsNoShow,
    checkInCustomer,
  } = useOrganization();

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [ticketInput, setTicketInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastCheckIn, setLastCheckIn] = useState<{ ticketNumber: string; name: string; time: string } | null>(null);

  const isSelectiveMode = organization?.settings.queueMode === "selective";
  const isCheckInMode = organization?.settings.queueMode === "checkin";

  const filteredQueue = queue.filter((c) => {
    if (filterStatus === "all") return c.status !== "completed" && c.status !== "no_show" && c.status !== "cancelled";
    if (filterStatus === "no_show") return c.status === "no_show";
    return c.status === filterStatus;
  });

  const waitingCount = queue.filter((c) => c.status === "waiting").length;
  const calledCount = queue.filter((c) => c.status === "called").length;
  const servingCount = queue.filter((c) => c.status === "serving").length;
  const noShowCount = queue.filter((c) => c.status === "no_show").length;

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshQueue();
    setRefreshing(false);
  };

  const handleCallNext = async () => {
    if (waitingCount === 0) {
      Alert.alert("No Customers", "There are no customers waiting in the queue.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await callNextCustomer();
  };

  const handleCall = async (customerId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await callSpecificCustomer(customerId);
  };

  const handleServe = async (customerId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await markAsServing(customerId);
  };

  const handleComplete = async (customerId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await markAsComplete(customerId);
  };

  const handleCallAgain = async (customerId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await callAgainCustomer(customerId);
    Alert.alert("Called Again", "Notification sent to customer");
  };

  const handleSkip = async (customerId: string) => {
    const customer = queue.find((c) => c.id === customerId);
    if (!customer) return;

    const isLastSkip = customer.skipCount >= 2;
    
    Alert.alert(
      isLastSkip ? "Mark as No Show" : "Skip Customer",
      isLastSkip
        ? "This customer has already been skipped 2 times. Skipping again will mark them as No Show."
        : `Skip this customer? They will be moved back 1 position. (Skip ${customer.skipCount + 1}/3)`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isLastSkip ? "Mark No Show" : "Skip",
          style: isLastSkip ? "destructive" : "default",
          onPress: async () => {
            const result = await skipCustomer(customerId);
            if (result.isNoShow) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert("No Show", "Customer marked as No Show after 3 skips. Notification sent.");
            } else {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              Alert.alert("Skipped", "Customer moved back in queue. Notification sent.");
            }
          },
        },
      ]
    );
  };

  const handleNoShow = async (customerId: string) => {
    Alert.alert(
      "Mark as No Show",
      "Are you sure this customer did not show up?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, No Show",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await markAsNoShow(customerId);
          },
        },
      ]
    );
  };

  const handleCheckIn = async () => {
    if (!ticketInput.trim()) {
      Alert.alert("Enter Ticket", "Please enter a ticket number to check in.");
      return;
    }
    
    Keyboard.dismiss();
    setIsProcessing(true);
    
    try {
      const result = await checkInCustomer(ticketInput.trim());
      
      if (result.success && result.customer) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setLastCheckIn({
          ticketNumber: result.customer.ticketNumber,
          name: result.customer.customerName,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
        setTicketInput("");
        Alert.alert(
          "Check-In Successful",
          `${result.customer.customerName} (${result.customer.ticketNumber}) has been checked in.`
        );
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Check-In Failed", result.error || "Could not process check-in.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleScanQR = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("CheckInScanner");
  };

  const checkedInToday = queue.filter((c) => c.status === "completed").length;

  const filters: { key: FilterStatus; label: string; count: number }[] = [
    { key: "all", label: "Active", count: waitingCount + calledCount + servingCount },
    { key: "waiting", label: "Waiting", count: waitingCount },
    { key: "called", label: "Called", count: calledCount },
    { key: "serving", label: "Serving", count: servingCount },
    { key: "no_show", label: "No Show", count: noShowCount },
  ];

  const waitingCustomers = queue.filter((c) => c.status === "waiting");
  const firstWaitingId = waitingCustomers.length > 0 ? waitingCustomers[0].id : null;

  if (isCheckInMode) {
    return (
      <ThemedView style={styles.container}>
        <ScrollView
          style={styles.queueList}
          contentContainerStyle={[styles.checkInContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          <Card style={styles.checkInCard} elevation={2}>
            <View style={[styles.checkInHeader, { borderBottomColor: isDark ? "#333" : "#E5E5E5" }]}>
              <View style={[styles.checkInIconContainer, { backgroundColor: colors.primary + "15" }]}>
                <Feather name="check-circle" size={32} color={colors.primary} />
              </View>
              <ThemedText style={styles.checkInTitle}>Check-In Mode</ThemedText>
              <ThemedText style={[styles.checkInSubtitle, { color: colors.textSecondary }]}>
                Scan QR code or enter ticket number to check in customers
              </ThemedText>
            </View>

            <View style={styles.checkInInputSection}>
              <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                Ticket Number
              </ThemedText>
              <View style={styles.ticketInputRow}>
                <TextInput
                  style={[
                    styles.ticketInput,
                    { 
                      backgroundColor: isDark ? "#2A2A2A" : "#F8FAFC",
                      color: colors.text,
                      borderColor: isDark ? "#3A3A3A" : "#E2E8F0",
                    }
                  ]}
                  placeholder="e.g. A001"
                  placeholderTextColor={colors.textSecondary}
                  value={ticketInput}
                  onChangeText={setTicketInput}
                  autoCapitalize="characters"
                  returnKeyType="done"
                  onSubmitEditing={handleCheckIn}
                  editable={!isProcessing}
                />
                <Pressable
                  style={[
                    styles.checkInButton,
                    { backgroundColor: colors.primary },
                    isProcessing && { opacity: 0.6 }
                  ]}
                  onPress={handleCheckIn}
                  disabled={isProcessing}
                >
                  <Feather name={isProcessing ? "loader" : "check"} size={20} color="#FFFFFF" />
                  <ThemedText style={styles.checkInButtonText}>
                    {isProcessing ? "Checking..." : "Check In"}
                  </ThemedText>
                </Pressable>
              </View>
            </View>

            <View style={styles.dividerRow}>
              <View style={[styles.divider, { backgroundColor: isDark ? "#333" : "#E5E5E5" }]} />
              <ThemedText style={[styles.dividerText, { color: colors.textSecondary }]}>or</ThemedText>
              <View style={[styles.divider, { backgroundColor: isDark ? "#333" : "#E5E5E5" }]} />
            </View>

            <Pressable
              style={[styles.scanQRButton, { borderColor: colors.primary }]}
              onPress={handleScanQR}
            >
              <Feather name="camera" size={24} color={colors.primary} />
              <ThemedText style={[styles.scanQRText, { color: colors.primary }]}>
                Scan QR Code
              </ThemedText>
            </Pressable>
          </Card>

          <View style={styles.statsRow}>
            <Card style={styles.statCard} elevation={1}>
              <ThemedText style={[styles.statNumber, { color: colors.primary }]}>{queue.length}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>Registered</ThemedText>
            </Card>
            <Card style={styles.statCard} elevation={1}>
              <ThemedText style={[styles.statNumber, { color: colors.success }]}>{checkedInToday}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>Checked In</ThemedText>
            </Card>
          </View>

          {lastCheckIn ? (
            <Card style={styles.lastCheckInCard} elevation={1}>
              <View style={styles.lastCheckInHeader}>
                <Feather name="user-check" size={16} color={colors.success} />
                <ThemedText style={[styles.lastCheckInTitle, { color: colors.success }]}>
                  Last Check-In
                </ThemedText>
              </View>
              <View style={styles.lastCheckInInfo}>
                <ThemedText style={styles.lastCheckInName}>{lastCheckIn.name}</ThemedText>
                <ThemedText style={[styles.lastCheckInTicket, { color: colors.textSecondary }]}>
                  Ticket {lastCheckIn.ticketNumber} • {lastCheckIn.time}
                </ThemedText>
              </View>
            </Card>
          ) : null}
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersContainer}
        style={styles.filtersScroll}
      >
        {filters.map((filter) => (
          <Pressable
            key={filter.key}
            style={[
              styles.filterChip,
              { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" },
              filterStatus === filter.key && { backgroundColor: colors.primary },
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setFilterStatus(filter.key);
            }}
          >
            <ThemedText
              style={[
                styles.filterText,
                { color: colors.textSecondary },
                filterStatus === filter.key && styles.filterTextActive,
              ]}
            >
              {filter.label} ({filter.count})
            </ThemedText>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.queueList}
        contentContainerStyle={[styles.queueContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {filteredQueue.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={48} color={colors.textSecondary} />
            <ThemedText style={styles.emptyTitle}>No customers</ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {filterStatus === "all" ? "The queue is empty" : `No ${filterStatus} customers`}
            </ThemedText>
          </View>
        ) : (
          filteredQueue.map((customer) => {
            const service = organization?.services.find((s) => s.id === customer.serviceId);
            const inputFields = service?.inputFields?.map((f) => ({ id: f.id, label: f.label })) || [];
            const isFirstWaiting = customer.status === "waiting" && customer.id === firstWaitingId;
            return (
              <CustomerCard
                key={customer.id}
                customer={customer}
                isSelectiveMode={isSelectiveMode}
                isFirstWaiting={isFirstWaiting}
                hasCalledCustomer={calledCount > 0}
                onCallNext={handleCallNext}
                onCall={() => handleCall(customer.id)}
                onServe={() => handleServe(customer.id)}
                onCallAgain={() => handleCallAgain(customer.id)}
                onSkip={() => handleSkip(customer.id)}
                onComplete={() => handleComplete(customer.id)}
                onNoShow={() => handleNoShow(customer.id)}
                inputFields={inputFields}
                isDark={isDark}
              />
            );
          })
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  callNextButton: {
    width: "100%",
  },
  filtersScroll: {
    maxHeight: 50,
    marginTop: Spacing.md,
  },
  filtersContainer: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  filterText: {
    fontSize: 13,
    fontWeight: "600",
  },
  filterTextActive: {
    color: "#FFFFFF",
  },
  queueList: {
    flex: 1,
  },
  queueContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  customerCard: {
    padding: Spacing.lg,
  },
  customerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  ticketInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  ticketBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  ticketNumber: {
    fontSize: 16,
    fontWeight: "700",
  },
  priorityBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
    gap: 4,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: "600",
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  customerDetails: {
    marginBottom: Spacing.md,
  },
  customerName: {
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  customerMeta: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
  },
  serviceTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  serviceText: {
    fontSize: 12,
    fontWeight: "500",
  },
  customerActions: {
    borderTopWidth: 1,
    paddingTop: Spacing.md,
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionButton: {
    flex: 1,
  },
  calledActions: {
    gap: Spacing.md,
  },
  completeButtonPrimary: {
    width: "100%",
  },
  secondaryButtonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  mainButtonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  serveButton: {
    flex: 1,
  },
  callAgainButton: {
    flex: 1,
  },
  skipButton: {
    flex: 0.8,
  },
  skipBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  skipText: {
    fontSize: 10,
    fontWeight: "600",
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EF4444" + "10",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  warningText: {
    fontSize: 12,
    color: "#EF4444",
    fontWeight: "500",
  },
  noShowNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  noShowText: {
    fontSize: 13,
    color: Colors.light.accent,
  },
  waitingNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
  },
  waitingText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["4xl"],
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: Spacing.lg,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: Spacing.xs,
  },
  prominentCard: {
    padding: Spacing.xl,
    borderWidth: 2,
    borderColor: Colors.light.primary + "40",
    backgroundColor: Colors.light.primary + "05",
  },
  calledCard: {
    borderColor: Colors.light.accent,
    backgroundColor: Colors.light.accent + "08",
  },
  calledBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.light.accent,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  calledBannerText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  nextUpBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.light.primary + "15",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  nextUpBannerText: {
    color: Colors.light.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  callNextButtonInCard: {
    width: "100%",
  },
  formDataSection: {
    backgroundColor: Colors.light.primary + "08",
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  formDataHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  formDataTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.light.primary,
  },
  formDataGrid: {
    gap: Spacing.sm,
  },
  formDataItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  formDataLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    flex: 1,
  },
  formDataValue: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.light.text,
    flex: 1.5,
    textAlign: "right",
  },
  checkInContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  checkInCard: {
    padding: Spacing.xl,
  },
  checkInHeader: {
    alignItems: "center",
    borderBottomWidth: 1,
    paddingBottom: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  checkInIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  checkInTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  checkInSubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  checkInInputSection: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  ticketInputRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  ticketInput: {
    flex: 1,
    height: 50,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 2,
    borderWidth: 1,
  },
  checkInButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  checkInButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
    fontWeight: "500",
  },
  scanQRButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderStyle: "dashed",
    gap: Spacing.sm,
  },
  scanQRText: {
    fontSize: 16,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  statCard: {
    flex: 1,
    padding: Spacing.lg,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 32,
    fontWeight: "700",
    lineHeight: 40,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: "500",
    marginTop: Spacing.xs,
  },
  lastCheckInCard: {
    padding: Spacing.lg,
  },
  lastCheckInHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  lastCheckInTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  lastCheckInInfo: {
    gap: 2,
  },
  lastCheckInName: {
    fontSize: 16,
    fontWeight: "600",
  },
  lastCheckInTicket: {
    fontSize: 13,
  },
  waitingListSection: {
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: Spacing.xs,
  },
  waitingCustomerCard: {
    padding: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  waitingCustomerInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  ticketBadgeSmall: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
  },
  ticketNumberSmall: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  customerNameSection: {
    flex: 1,
  },
  waitingCustomerName: {
    fontSize: 14,
    fontWeight: "600",
  },
  waitingCustomerService: {
    fontSize: 12,
    marginTop: 2,
  },
  quickCheckInButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  moreWaiting: {
    fontSize: 13,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
});
