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
  Modal,
  ActivityIndicator,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut, Layout, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from "react-native-reanimated";
import { useEffect } from "react";
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
  const isAcknowledged = isCalled && !!customer.acknowledgedAt;
  const canShowCallNext = isFirstWaiting && !isSelectiveMode && !hasCalledCustomer;
  const isProminent = isCalled || canShowCallNext;

  const ackPulse = useSharedValue(1);

  useEffect(() => {
    if (isAcknowledged) {
      ackPulse.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      ackPulse.value = 1;
    }
  }, [isAcknowledged]);

  const ackPulseStyle = useAnimatedStyle(() => ({
    opacity: ackPulse.value,
  }));

  const getStatusText = () => {
    switch (customer.status) {
      case "called":
        return customer.acknowledgedAt ? "Acknowledged" : "Called";
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

  const getStatusColor = () => {
    switch (customer.status) {
      case "called":
        return customer.acknowledgedAt ? "#10B981" : colors.accent;
      case "serving":
        return colors.success;
      default:
        return colors.primary;
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
          <View style={[styles.calledBanner, customer.acknowledgedAt ? { backgroundColor: "#10B981" } : undefined]}>
            <Feather name={customer.acknowledgedAt ? "check-circle" : "volume-2"} size={14} color="#FFFFFF" />
            <ThemedText style={styles.calledBannerText}>
              {customer.acknowledgedAt ? "Customer Acknowledged" : "Now Calling"}
            </ThemedText>
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
            {isAcknowledged ? (
              <Animated.View style={[styles.ackPulseCircle, ackPulseStyle]} />
            ) : null}
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
          <View style={styles.customerNameRow}>
            {isAcknowledged ? (
              <Animated.View style={[styles.ackPulseCircle, ackPulseStyle]} />
            ) : null}
            <ThemedText type="body" style={styles.customerName}>
              {customer.customerName}
            </ThemedText>
          </View>
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
          {customer.deskName ? (
            <View style={[styles.serviceTag, { marginTop: 2 }]}>
              <Feather name="monitor" size={12} color={colors.secondary} />
              <ThemedText style={[styles.serviceText, { color: colors.secondary }]}>{customer.deskName}</ThemedText>
            </View>
          ) : null}
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
    currentUser,
    queue,
    branches,
    getAccessibleBranches,
    refreshQueue,
    refreshQueueForBranch,
    callNextCustomer,
    callSpecificCustomer,
    callAgainCustomer,
    skipCustomer,
    markAsServing,
    markAsComplete,
    markAsNoShow,
    markAsArrived,
    holdCustomer,
    resumeCustomer,
    allocateTable,
    checkInCustomer,
    addCounterOrder,
    addManualCustomer,
    checkInReservation,
    branchReservations,
    loadBranchReservations,
    checkInApiReservation,
    cancelApiReservation,
    moveToNextStage,
    skipStage,
    completeJourney,
    getCustomersAtStage,
    moveToStage,
  } = useOrganization();

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [ticketInput, setTicketInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastCheckIn, setLastCheckIn] = useState<{ ticketNumber: string; name: string; time: string } | null>(null);

  const [takeawayTab, setTakeawayTab] = useState<"active" | "completed">("active");
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [newOrderName, setNewOrderName] = useState("");
  const [newOrderId, setNewOrderId] = useState("");
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [counterOrderCount, setCounterOrderCount] = useState(1);
  
  // Dine In mode state
  const [dineInTab, setDineInTab] = useState<"reservation" | "waiting" | "called" | "hold" | "arrived">("waiting");
  const [showManualRegistrationModal, setShowManualRegistrationModal] = useState(false);
  const [manualRegistrationData, setManualRegistrationData] = useState({
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    notes: "",
  });
  const [isRegistering, setIsRegistering] = useState(false);
  const [showTableAllocationModal, setShowTableAllocationModal] = useState(false);
  const [selectedCustomerForTable, setSelectedCustomerForTable] = useState<QueueCustomer | null>(null);
  const [tableNumberInput, setTableNumberInput] = useState("");
  const [isAllocatingTable, setIsAllocatingTable] = useState(false);

  // Multi-stage mode state
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [selectedStageIndex, setSelectedStageIndex] = useState(0);
  const [multiStageBranchId, setMultiStageBranchId] = useState<string | null>(null);
  const [showStageSelectorModal, setShowStageSelectorModal] = useState(false);
  const [customerForStageAssign, setCustomerForStageAssign] = useState<QueueCustomer | null>(null);
  const accessibleBranches = getAccessibleBranches();
  const multiStageBranch = branches.find((b) => b.id === (multiStageBranchId || accessibleBranches[0]?.id));
  const journeys = multiStageBranch?.journeys?.filter((j) => j.isActive) || [];
  const selectedJourney = journeys.find((j) => j.id === selectedJourneyId) || journeys[0];

  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(
    currentUser?.branchId || accessibleBranches[0]?.id || null
  );
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(
    currentUser?.assignedServiceIds?.length === 1 ? currentUser.assignedServiceIds[0] : null
  );
  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(null);
  const [showStationModal, setShowStationModal] = useState(false);
  const [stationStep, setStationStep] = useState<"branch" | "service" | "desk">("branch");

  // Manual Add to Queue state
  const [showAddToQueueModal, setShowAddToQueueModal] = useState(false);
  const [addToQueueServiceId, setAddToQueueServiceId] = useState<string>("");
  const [addToQueueFormData, setAddToQueueFormData] = useState<Record<string, any>>({});
  const [addToQueueName, setAddToQueueName] = useState("");
  const [addToQueuePhone, setAddToQueuePhone] = useState("");
  const [addToQueueEmail, setAddToQueueEmail] = useState("");
  const [isAddingToQueue, setIsAddingToQueue] = useState(false);

  const currentBranchId = selectedBranchId || accessibleBranches[0]?.id || branches[0]?.id;

  const refreshQueueRef = React.useRef(refreshQueueForBranch);
  refreshQueueRef.current = refreshQueueForBranch;

  useEffect(() => {
    if (!currentBranchId) return;
    const interval = setInterval(() => {
      refreshQueueRef.current(currentBranchId);
    }, 8000);
    return () => clearInterval(interval);
  }, [currentBranchId]);
  const currentBranch = branches.find(b => b.id === currentBranchId);
  const branchQueueMode = (() => {
    const branchDefault = currentBranch?.settings?.queueMode || organization?.settings?.queueMode;
    if (selectedServiceId && currentBranch) {
      const svc = currentBranch.services?.find(s => s.id === selectedServiceId);
      if (svc?.serviceSettings?.queueMode) {
        return svc.serviceSettings.queueMode;
      }
    }
    return branchDefault;
  })();
  const isSelectiveMode = branchQueueMode === "selective";
  const isCheckInMode = branchQueueMode === "checkin";
  const isTakeawayMode = branchQueueMode === "takeaway";
  const isDineInMode = branchQueueMode === "dinein";
  const isMultiStageMode = branchQueueMode === "multistage";
  const branchServices = organization?.services.filter(s => s.isActive) || [];
  const selectedAddService = branchServices.find(s => s.id === addToQueueServiceId);

  const allDesks = currentBranch?.services?.flatMap(s => (s.desks || []).filter(d => d.isActive)) || [];
  const selectedDesk = allDesks.find(d => d.id === selectedDeskId) || null;

  const canSelectBranch = accessibleBranches.length > 1;
  const servicesForBranch = (() => {
    const branchSvcs = currentBranch?.services?.filter(s => s.isActive) || [];
    if (currentUser?.assignedServiceIds && currentUser.assignedServiceIds.length > 0) {
      return branchSvcs.filter(s => currentUser.assignedServiceIds!.includes(s.id));
    }
    return branchSvcs;
  })();
  const hasSpecificServiceAssignment = (currentUser?.assignedServiceIds?.length || 0) > 0;
  const canSelectService = !(currentUser?.assignedServiceIds?.length === 1) && servicesForBranch.length > 1;
  const desksForSelection = (() => {
    if (selectedServiceId) {
      const svc = currentBranch?.services?.find(s => s.id === selectedServiceId);
      return (svc?.desks || []).filter(d => d.isActive);
    }
    return allDesks;
  })();
  const canSelectDesk = desksForSelection.length > 0;
  const selectedBranch = branches.find(b => b.id === currentBranchId);
  const selectedService = servicesForBranch.find(s => s.id === selectedServiceId);

  const stationSummary = (() => {
    const parts: string[] = [];
    if (canSelectBranch && selectedBranch) parts.push(selectedBranch.name);
    parts.push(selectedService ? selectedService.name : "All Services");
    if (selectedDesk) parts.push(selectedDesk.name);
    return parts.join(" \u2192 ");
  })();

  const stationSteps: ("branch" | "service" | "desk")[] = (() => {
    const steps: ("branch" | "service" | "desk")[] = [];
    if (canSelectBranch) steps.push("branch");
    if (canSelectService) steps.push("service");
    if (canSelectDesk) steps.push("desk");
    return steps;
  })();

  const currentStepIndex = stationSteps.indexOf(stationStep);
  const isLastStep = currentStepIndex === stationSteps.length - 1 || stationSteps.length === 0;
  const isFirstStep = currentStepIndex <= 0;

  const openStationModal = () => {
    setStationStep(stationSteps[0] || "branch");
    setShowStationModal(true);
  };

  const handleStationNext = () => {
    if (isLastStep) {
      setShowStationModal(false);
      if (currentBranchId) {
        refreshQueueForBranch(currentBranchId);
      }
    } else {
      Haptics.selectionAsync();
      setStationStep(stationSteps[currentStepIndex + 1]);
    }
  };

  const handleStationBack = () => {
    if (!isFirstStep) {
      Haptics.selectionAsync();
      setStationStep(stationSteps[currentStepIndex - 1]);
    }
  };

  const getStepTitle = () => {
    switch (stationStep) {
      case "branch": return "Select Branch";
      case "service": return "Select Service";
      case "desk": return "Select Desk";
    }
  };

  const getStepSubtitle = () => {
    const total = stationSteps.length;
    if (total <= 1) return "";
    return `Step ${currentStepIndex + 1} of ${total}`;
  };

  const handleOpenAddToQueue = () => {
    setAddToQueueServiceId(branchServices[0]?.id || "");
    setAddToQueueFormData({});
    setAddToQueueName("");
    setAddToQueuePhone("");
    setAddToQueueEmail("");
    setShowAddToQueueModal(true);
  };

  const handleAddToQueue = async () => {
    if (!addToQueueName.trim()) {
      Alert.alert("Missing Info", "Customer name is required.");
      return;
    }
    if (!addToQueueServiceId) {
      Alert.alert("Missing Info", "Please select a service.");
      return;
    }
    setIsAddingToQueue(true);
    try {
      const { apiRequest } = await import("@/lib/query-client");
      const response = await apiRequest("POST", `/api/join/${currentBranchId}`, {
        serviceId: addToQueueServiceId,
        customerName: addToQueueName.trim(),
        customerPhone: addToQueuePhone.trim(),
        customerEmail: addToQueueEmail.trim(),
        formData: addToQueueFormData,
        source: "manual",
      });
      const data = await response.json();
      if (data.error) {
        Alert.alert("Error", data.error);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowAddToQueueModal(false);
        await refreshQueue();
      }
    } catch (e: any) {
      let errorMsg = "Failed to add customer";
      try {
        const parsed = JSON.parse(e.message?.split(": ").slice(1).join(": ") || "{}");
        if (parsed.error) errorMsg = parsed.error;
      } catch { errorMsg = e.message || errorMsg; }
      Alert.alert("Cannot Add to Queue", errorMsg);
    } finally {
      setIsAddingToQueue(false);
    }
  };

  const filteredQueue = queue.filter((c) => {
    if (selectedServiceId && c.serviceId !== selectedServiceId) return false;
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
    if (currentBranchId) {
      await refreshQueueForBranch(currentBranchId);
      if (isDineInMode) {
        await loadBranchReservations(currentBranchId);
      }
    } else {
      await refreshQueue();
    }
    setRefreshing(false);
  };

  const handleCallNext = async () => {
    if (waitingCount === 0) {
      Alert.alert("No Customers", "There are no customers waiting in the queue.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await callNextCustomer(
      selectedServiceId || undefined,
      selectedDesk?.id,
      selectedDesk?.name,
      currentBranchId || undefined
    );
    if (currentBranchId) {
      await refreshQueueForBranch(currentBranchId);
    }
  };

  const handleCall = async (customerId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await callSpecificCustomer(customerId, selectedDesk?.id, selectedDesk?.name);
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
    await callAgainCustomer(customerId, selectedDesk?.id, selectedDesk?.name);
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

  const isOrderIdDuplicate = (orderId: string): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return queue.some((order) => {
      const orderDate = new Date(order.joinedAt);
      orderDate.setHours(0, 0, 0, 0);
      const isSameDay = orderDate.getTime() === today.getTime();
      const isSameOrderId = order.formData?.orderId?.toLowerCase() === orderId.toLowerCase();
      return isSameDay && isSameOrderId;
    });
  };

  const handleCreateCounterOrder = async () => {
    if (!newOrderId.trim()) {
      Alert.alert("Enter Order ID", "Please enter an Order ID to identify this order.");
      return;
    }
    
    if (isOrderIdDuplicate(newOrderId.trim())) {
      Alert.alert(
        "Duplicate Order ID",
        `Order ID "${newOrderId.trim()}" has already been used today. Please enter a unique Order ID.`
      );
      return;
    }
    
    Keyboard.dismiss();
    setIsCreatingOrder(true);
    
    const customerName = newOrderName.trim() || `Customer ${counterOrderCount}`;
    
    try {
      const result = await addCounterOrder(customerName, newOrderId.trim());
      
      if (result.success && result.customer) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "Order Created",
          `Order ${newOrderId.trim()} created for ${customerName}`
        );
        if (!newOrderName.trim()) {
          setCounterOrderCount((prev) => prev + 1);
        }
        setNewOrderName("");
        setNewOrderId("");
        setShowNewOrderModal(false);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Error", result.error || "Failed to create order");
      }
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", "An unexpected error occurred");
    } finally {
      setIsCreatingOrder(false);
    }
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
              <Feather name="maximize" size={24} color={colors.primary} />
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

  if (isTakeawayMode) {
    const activeOrders = queue.filter((c) => c.status === "waiting" || c.status === "called" || c.status === "serving");
    const completedOrders = queue.filter((c) => c.status === "completed");
    const preparingOrders = queue.filter((c) => c.status === "waiting");
    const readyOrders = queue.filter((c) => c.status === "called" || c.status === "serving");
    
    const getOrderSource = (customer: QueueCustomer): "counter" | "customer" | "api" => {
      if (customer.formData?.orderSource) return customer.formData.orderSource;
      if (customer.formData?.registeredBy === "staff") return "counter";
      if (customer.formData?.registeredBy === "api") return "api";
      return "customer";
    };

    const handleMarkReady = async (customerId: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await callSpecificCustomer(customerId, selectedDesk?.id, selectedDesk?.name);
    };

    const handleCallAgainOrder = async (customerId: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await callAgainCustomer(customerId, selectedDesk?.id, selectedDesk?.name);
      const order = queue.find((o) => o.id === customerId);
      const callNum = (order?.callCount || 0) + 1;
      Alert.alert(
        "Customer Notified",
        `Notification sent to ${order?.customerName || "customer"}. (Called ${callNum} time${callNum > 1 ? "s" : ""})`
      );
    };

    const handleDelivered = async (customerId: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await markAsComplete(customerId);
    };

    const formatTime = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    const getSourceBadge = (source: "counter" | "customer" | "api") => {
      const config = {
        counter: { icon: "user" as const, label: "Counter", color: colors.primary },
        customer: { icon: "smartphone" as const, label: "Customer", color: colors.secondary },
        api: { icon: "code" as const, label: "API", color: "#6B7280" },
      };
      return config[source];
    };

    return (
      <ThemedView style={styles.container}>
        <View style={styles.takeawayHeader}>
          <View style={styles.takeawayTabs}>
            <Pressable
              style={[
                styles.takeawayTab,
                takeawayTab === "active" && { backgroundColor: colors.primary },
              ]}
              onPress={() => setTakeawayTab("active")}
            >
              <ThemedText
                style={[
                  styles.takeawayTabText,
                  { color: takeawayTab === "active" ? "#FFFFFF" : colors.text },
                ]}
              >
                Active ({activeOrders.length})
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.takeawayTab,
                takeawayTab === "completed" && { backgroundColor: colors.primary },
              ]}
              onPress={() => setTakeawayTab("completed")}
            >
              <ThemedText
                style={[
                  styles.takeawayTabText,
                  { color: takeawayTab === "completed" ? "#FFFFFF" : colors.text },
                ]}
              >
                Completed ({completedOrders.length})
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {takeawayTab === "active" ? (
          <>
            <View style={styles.takeawayStats}>
              <View style={[styles.takeawayStat, { backgroundColor: isDark ? "#2A2A2A" : "#FEF3C7" }]}>
                <Feather name="clock" size={18} color="#D97706" />
                <ThemedText style={[styles.takeawayStatNumber, { color: "#D97706" }]}>
                  {preparingOrders.length}
                </ThemedText>
                <ThemedText style={[styles.takeawayStatLabel, { color: colors.textSecondary }]}>
                  Preparing
                </ThemedText>
              </View>
              <View style={[styles.takeawayStat, { backgroundColor: isDark ? "#2A2A2A" : "#D1FAE5" }]}>
                <Feather name="check-circle" size={18} color={colors.success} />
                <ThemedText style={[styles.takeawayStatNumber, { color: colors.success }]}>
                  {readyOrders.length}
                </ThemedText>
                <ThemedText style={[styles.takeawayStatLabel, { color: colors.textSecondary }]}>
                  Ready
                </ThemedText>
              </View>
            </View>

            <ScrollView
              style={styles.queueList}
              contentContainerStyle={[styles.takeawayContent, { paddingBottom: insets.bottom + 100 }]}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
              }
            >
              {activeOrders.length === 0 ? (
                <View style={styles.takeawayEmptyState}>
                  <Feather name="package" size={48} color={colors.textSecondary} />
                  <ThemedText style={[styles.takeawayEmptyText, { color: colors.textSecondary }]}>
                    No active orders
                  </ThemedText>
                  <ThemedText style={[styles.takeawayEmptySubtext, { color: colors.textSecondary }]}>
                    Orders will appear here when customers place them
                  </ThemedText>
                </View>
              ) : (
                activeOrders.map((order) => {
                  const isReady = order.status === "called" || order.status === "serving";
                  const source = getOrderSource(order);
                  const sourceBadge = getSourceBadge(source);

                  const displayOrderId = order.formData?.orderId || order.ticketNumber;
                  
                  return (
                    <Card key={order.id} style={styles.orderCard} elevation={2}>
                      <View style={styles.orderHeader}>
                        <View style={styles.orderTicketSection}>
                          <View style={[styles.orderTicketBadge, { backgroundColor: colors.primary }]}>
                            <ThemedText style={styles.orderTicketNumber}>
                              {displayOrderId}
                            </ThemedText>
                          </View>
                          <View style={styles.orderInfo}>
                            <ThemedText style={styles.orderCustomerName}>
                              {order.customerName}
                            </ThemedText>
                            <View style={styles.orderMeta}>
                              <View style={[styles.sourceBadge, { backgroundColor: sourceBadge.color + "15" }]}>
                                <Feather name={sourceBadge.icon} size={10} color={sourceBadge.color} />
                                <ThemedText style={[styles.sourceBadgeText, { color: sourceBadge.color }]}>
                                  {sourceBadge.label}
                                </ThemedText>
                              </View>
                              <ThemedText style={[styles.orderTime, { color: colors.textSecondary }]}>
                                {formatTime(order.joinedAt)}
                              </ThemedText>
                            </View>
                          </View>
                        </View>
                        <View
                          style={[
                            styles.orderStatusBadge,
                            { backgroundColor: isReady ? colors.success + "15" : "#FEF3C7" },
                          ]}
                        >
                          <Feather
                            name={isReady ? "check-circle" : "clock"}
                            size={14}
                            color={isReady ? colors.success : "#D97706"}
                          />
                          <ThemedText
                            style={[
                              styles.orderStatusText,
                              { color: isReady ? colors.success : "#D97706" },
                            ]}
                          >
                            {isReady ? "Ready" : "Preparing"}
                          </ThemedText>
                        </View>
                      </View>

                      {order.serviceName ? (
                        <View style={[styles.orderServiceRow, { borderTopColor: isDark ? "#333" : "#E5E5E5" }]}>
                          <Feather name="tag" size={14} color={colors.textSecondary} />
                          <ThemedText style={[styles.orderServiceName, { color: colors.textSecondary }]}>
                            {order.serviceName}
                          </ThemedText>
                        </View>
                      ) : null}

                      <View style={styles.orderActions}>
                        {isReady ? (
                          <>
                            <Pressable
                              style={[styles.orderActionButton, styles.orderActionSecondary, { borderColor: colors.primary }]}
                              onPress={() => handleCallAgainOrder(order.id)}
                            >
                              <Feather name="bell" size={16} color={colors.primary} />
                              <View style={styles.callAgainContent}>
                                <ThemedText style={[styles.orderActionText, { color: colors.primary }]}>
                                  Call Again
                                </ThemedText>
                                {order.callCount > 0 ? (
                                  <View style={[styles.callCountBadge, { backgroundColor: colors.primary }]}>
                                    <ThemedText style={styles.callCountText}>
                                      {order.callCount}
                                    </ThemedText>
                                  </View>
                                ) : null}
                              </View>
                            </Pressable>
                            <Pressable
                              style={[styles.orderActionButton, styles.orderActionPrimary, { backgroundColor: colors.success }]}
                              onPress={() => handleDelivered(order.id)}
                            >
                              <Feather name="check" size={16} color="#FFFFFF" />
                              <ThemedText style={[styles.orderActionText, { color: "#FFFFFF" }]}>
                                Delivered
                              </ThemedText>
                            </Pressable>
                          </>
                        ) : (
                          <Pressable
                            style={[styles.orderActionButton, styles.orderActionPrimary, { backgroundColor: colors.primary, flex: 1 }]}
                            onPress={() => handleMarkReady(order.id)}
                          >
                            <Feather name="check-circle" size={16} color="#FFFFFF" />
                            <ThemedText style={[styles.orderActionText, { color: "#FFFFFF" }]}>
                              Mark as Ready
                            </ThemedText>
                          </Pressable>
                        )}
                      </View>
                    </Card>
                  );
                })
              )}
            </ScrollView>
          </>
        ) : (
          <ScrollView
            style={styles.queueList}
            contentContainerStyle={[styles.takeawayContent, { paddingBottom: insets.bottom + 100 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            }
          >
            {completedOrders.length === 0 ? (
              <View style={styles.takeawayEmptyState}>
                <Feather name="inbox" size={48} color={colors.textSecondary} />
                <ThemedText style={[styles.takeawayEmptyText, { color: colors.textSecondary }]}>
                  No completed orders yet
                </ThemedText>
              </View>
            ) : (
              completedOrders.slice(0, 50).map((order) => {
                const source = getOrderSource(order);
                const sourceBadge = getSourceBadge(source);
                const displayOrderId = order.formData?.orderId || order.ticketNumber;

                return (
                  <Card key={order.id} style={styles.completedOrderCard} elevation={1}>
                    <View style={styles.completedOrderHeader}>
                      <View style={styles.orderTicketSection}>
                        <View style={[styles.orderTicketBadge, { backgroundColor: colors.success }]}>
                          <ThemedText style={styles.orderTicketNumber}>
                            {displayOrderId}
                          </ThemedText>
                        </View>
                        <View style={styles.orderInfo}>
                          <ThemedText style={styles.orderCustomerName}>
                            {order.customerName}
                          </ThemedText>
                          <View style={styles.orderMeta}>
                            <View style={[styles.sourceBadge, { backgroundColor: sourceBadge.color + "15" }]}>
                              <Feather name={sourceBadge.icon} size={10} color={sourceBadge.color} />
                              <ThemedText style={[styles.sourceBadgeText, { color: sourceBadge.color }]}>
                                {sourceBadge.label}
                              </ThemedText>
                            </View>
                          </View>
                        </View>
                      </View>
                      <View style={styles.completedTime}>
                        <Feather name="check" size={14} color={colors.success} />
                        <ThemedText style={[styles.completedTimeText, { color: colors.textSecondary }]}>
                          {order.completedAt ? formatTime(order.completedAt) : "-"}
                        </ThemedText>
                      </View>
                    </View>
                  </Card>
                );
              })
            )}
          </ScrollView>
        )}

        {/* Floating Action Button for New Order */}
        <Pressable
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowNewOrderModal(true);
          }}
        >
          <Feather name="plus" size={24} color="#FFFFFF" />
        </Pressable>

        {/* New Order Modal */}
        <Modal
          visible={showNewOrderModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowNewOrderModal(false)}
        >
          <KeyboardAvoidingView 
            style={styles.modalOverlay}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <Pressable 
              style={styles.modalDismissArea} 
              onPress={() => {
                Keyboard.dismiss();
                setShowNewOrderModal(false);
                setNewOrderName("");
                setNewOrderId("");
              }}
            />
            <View style={[styles.modalContent, { backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF" }]}>
              <View style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>New Counter Order</ThemedText>
                <Pressable
                  onPress={() => {
                    setShowNewOrderModal(false);
                    setNewOrderName("");
                    setNewOrderId("");
                  }}
                  hitSlop={8}
                >
                  <Feather name="x" size={24} color={colors.text} />
                </Pressable>
              </View>

              <View style={styles.modalBody}>
                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    Order ID *
                  </ThemedText>
                  <TextInput
                    style={[
                      styles.modalInput,
                      {
                        backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5",
                        color: colors.text,
                        borderColor: isDark ? "#444" : "#E0E0E0",
                      },
                    ]}
                    placeholder="Enter order ID (e.g., #101, A1)"
                    placeholderTextColor={colors.textSecondary}
                    value={newOrderId}
                    onChangeText={setNewOrderId}
                    autoFocus
                  />
                  <ThemedText style={[styles.inputHint, { color: colors.textSecondary }]}>
                    You can find the Order ID at the top of the bill/invoice
                  </ThemedText>
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    Customer Name (Optional)
                  </ThemedText>
                  <TextInput
                    style={[
                      styles.modalInput,
                      {
                        backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5",
                        color: colors.text,
                        borderColor: isDark ? "#444" : "#E0E0E0",
                      },
                    ]}
                    placeholder={`Leave empty for "Customer ${counterOrderCount}"`}
                    placeholderTextColor={colors.textSecondary}
                    value={newOrderName}
                    onChangeText={setNewOrderName}
                  />
                </View>
              </View>

              <View style={styles.modalFooter}>
                <Pressable
                  style={[styles.modalButton, styles.cancelButton, { borderColor: colors.textSecondary }]}
                  onPress={() => {
                    setShowNewOrderModal(false);
                    setNewOrderName("");
                    setNewOrderId("");
                  }}
                >
                  <ThemedText style={[styles.cancelButtonText, { color: colors.textSecondary }]}>
                    Cancel
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalButton,
                    styles.createButton,
                    { backgroundColor: colors.primary },
                    isCreatingOrder && { opacity: 0.7 },
                  ]}
                  onPress={handleCreateCounterOrder}
                  disabled={isCreatingOrder}
                >
                  {isCreatingOrder ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Feather name="plus" size={18} color="#FFFFFF" />
                      <ThemedText style={styles.createButtonText}>Create Order</ThemedText>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </ThemedView>
    );
  }

  // =============== DINE IN MODE ===============
  if (isDineInMode) {
    const reservationCustomers = queue.filter((c) => c.status === "reservation").sort((a, b) => 
      new Date(a.reservationTime || a.joinedAt).getTime() - new Date(b.reservationTime || b.joinedAt).getTime()
    );
    const apiReservations = branchReservations.filter((r: any) => r.status === "confirmed");
    const waitingCustomers = queue.filter((c) => c.status === "waiting").sort((a, b) => 
      new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
    );
    const calledCustomers = queue.filter((c) => c.status === "called");
    const holdCustomers = queue.filter((c) => c.status === "hold");
    const arrivedCustomers = queue.filter((c) => c.status === "arrived");

    const dineInTabs = [
      { key: "reservation" as const, label: "Reservations", count: reservationCustomers.length + apiReservations.length, icon: "calendar" as const },
      { key: "waiting" as const, label: "Waiting", count: waitingCustomers.length, icon: "clock" as const },
      { key: "called" as const, label: "Called", count: calledCustomers.length, icon: "phone" as const },
      { key: "hold" as const, label: "On Hold", count: holdCustomers.length, icon: "pause-circle" as const },
      { key: "arrived" as const, label: "Arrived", count: arrivedCustomers.length, icon: "check-circle" as const },
    ];

    const getCurrentTabCustomers = () => {
      switch (dineInTab) {
        case "reservation": return reservationCustomers;
        case "waiting": return waitingCustomers;
        case "called": return calledCustomers;
        case "hold": return holdCustomers;
        case "arrived": return arrivedCustomers;
        default: return [];
      }
    };

    const getSourceBadge = (source: string) => {
      switch (source) {
        case "app":
          return { label: "App", color: colors.primary, icon: "smartphone" as const };
        case "qr":
          return { label: "QR", color: colors.secondary, icon: "grid" as const };
        case "manual":
          return { label: "Manual", color: colors.warning, icon: "edit" as const };
        case "reservation":
          return { label: "Reserved", color: colors.success, icon: "calendar" as const };
        default:
          return { label: "Unknown", color: colors.textSecondary, icon: "help-circle" as const };
      }
    };

    const handleCheckInReservation = async (customerId: string) => {
      const result = await checkInReservation(customerId);
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Checked In", `${result.customer?.customerName || "Customer"} has been checked in and moved to Waiting.`);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Error", result.error || "Failed to check in reservation");
      }
    };

    const handleCheckInApiReservation = async (reservationId: string, customerName: string) => {
      const result = await checkInApiReservation(reservationId);
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Checked In", `${customerName} has been checked in and added to the waiting queue.`);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Error", result.error || "Failed to check in reservation");
      }
    };

    const handleCancelApiReservation = async (reservationId: string) => {
      const result = await cancelApiReservation(reservationId);
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Error", result.error || "Failed to cancel reservation");
      }
    };

    const handleOpenManualRegistration = () => {
      setManualRegistrationData({ customerName: "", customerPhone: "", customerEmail: "", notes: "" });
      setShowManualRegistrationModal(true);
    };

    const handleManualRegistration = async () => {
      if (!manualRegistrationData.customerName.trim()) {
        Alert.alert("Error", "Customer name is required");
        return;
      }
      
      Keyboard.dismiss();
      setIsRegistering(true);
      
      try {
        const result = await addManualCustomer({
          customerName: manualRegistrationData.customerName,
          customerPhone: manualRegistrationData.customerPhone,
          customerEmail: manualRegistrationData.customerEmail,
          formData: manualRegistrationData.notes ? { notes: manualRegistrationData.notes } : {},
        });
        
        if (result.success) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(
            "Customer Registered",
            `${result.customer?.customerName} has been added to the queue.\n\nTicket: ${result.customer?.ticketNumber}`
          );
          setShowManualRegistrationModal(false);
          setManualRegistrationData({ customerName: "", customerPhone: "", customerEmail: "", notes: "" });
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert("Error", result.error || "Failed to register customer");
        }
      } catch (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Error", "An unexpected error occurred");
      } finally {
        setIsRegistering(false);
      }
    };

    const handleOpenTableAllocation = (customer: QueueCustomer) => {
      setSelectedCustomerForTable(customer);
      setTableNumberInput(customer.tableNumber || "");
      setShowTableAllocationModal(true);
    };

    const handleAllocateTable = async () => {
      if (!selectedCustomerForTable || !tableNumberInput.trim()) {
        Alert.alert("Enter Table Number", "Please enter a table number to allocate.");
        return;
      }

      Keyboard.dismiss();
      setIsAllocatingTable(true);

      try {
        const result = await allocateTable(selectedCustomerForTable.id, tableNumberInput.trim());
        if (result.success) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(
            "Table Allocated",
            `Table ${tableNumberInput.trim()} has been allocated to ${selectedCustomerForTable.customerName}. Notification sent to customer.`
          );
          setShowTableAllocationModal(false);
          setSelectedCustomerForTable(null);
          setTableNumberInput("");
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert("Error", result.error || "Failed to allocate table");
        }
      } catch (error) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Error", "An unexpected error occurred");
      } finally {
        setIsAllocatingTable(false);
      }
    };

    const handleDineInCallAgain = async (customerId: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await callAgainCustomer(customerId, selectedDesk?.id, selectedDesk?.name);
      const customer = queue.find((c) => c.id === customerId);
      const callNum = (customer?.callCount || 0) + 1;
      Alert.alert(
        "Customer Notified",
        `Reminder sent to ${customer?.customerName || "customer"}. (Called ${callNum} time${callNum > 1 ? "s" : ""})`
      );
    };

    const handleHoldCustomer = async (customerId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await holdCustomer(customerId);
      const customer = queue.find((c) => c.id === customerId);
      Alert.alert("On Hold", `${customer?.customerName || "Customer"} has been placed on hold.`);
    };

    const handleResumeCustomer = async (customerId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const customer = queue.find((c) => c.id === customerId);
      await resumeCustomer(customerId);
      setDineInTab("waiting");
      Alert.alert("Resumed", `${customer?.customerName || "Customer"} has been moved back to the waiting queue with their original position.`);
    };

    const handleMarkArrived = async (customerId: string) => {
      const result = await markAsArrived(customerId);
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Arrived", `${result.customer?.customerName || "Customer"} has been marked as arrived at table ${result.customer?.tableNumber || ""}.`);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Error", result.error || "Failed to mark as arrived");
      }
    };

    const handleDineInSkip = async (customerId: string) => {
      const customer = queue.find((c) => c.id === customerId);
      if (!customer) return;

      const isLastSkip = customer.skipCount >= 2;

      Alert.alert(
        isLastSkip ? "Mark as No Show" : "Skip Customer",
        isLastSkip
          ? "This customer has already been skipped 2 times. Skipping again will mark them as No Show."
          : `Skip this customer? They will be moved back to waiting. (Skip ${customer.skipCount + 1}/3)`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: isLastSkip ? "Mark No Show" : "Skip",
            style: "destructive",
            onPress: async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              await skipCustomer(customerId);
            },
          },
        ]
      );
    };

    const formatTime = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    const getCustomerFormDataDisplay = (customer: QueueCustomer) => {
      const entries = Object.entries(customer.formData || {}).filter(
        ([key]) => !["orderSource", "orderId"].includes(key)
      );
      if (entries.length === 0) return null;
      return entries.slice(0, 2).map(([key, value]) => (
        <ThemedText key={key} style={[styles.dineInFormDataText, { color: colors.textSecondary }]}>
          {key}: {String(value)}
        </ThemedText>
      ));
    };

    return (
      <ThemedView style={styles.container}>
        {/* Dine In Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dineInTabsContainer}
          style={styles.dineInTabsScroll}
        >
          {dineInTabs.map((tab) => (
            <Pressable
              key={tab.key}
              style={[
                styles.dineInTab,
                { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" },
                dineInTab === tab.key && { backgroundColor: colors.primary },
              ]}
              onPress={() => setDineInTab(tab.key)}
            >
              <Feather
                name={tab.icon}
                size={16}
                color={dineInTab === tab.key ? "#FFFFFF" : colors.textSecondary}
              />
              <ThemedText
                style={[
                  styles.dineInTabText,
                  { color: dineInTab === tab.key ? "#FFFFFF" : colors.textSecondary },
                ]}
              >
                {tab.label}
              </ThemedText>
              <View
                style={[
                  styles.dineInTabBadge,
                  {
                    backgroundColor: dineInTab === tab.key
                      ? "rgba(255,255,255,0.3)"
                      : isDark ? "#444" : "#E2E8F0",
                  },
                ]}
              >
                <ThemedText
                  style={[
                    styles.dineInTabBadgeText,
                    { color: dineInTab === tab.key ? "#FFFFFF" : colors.textSecondary },
                  ]}
                >
                  {tab.count}
                </ThemedText>
              </View>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView
          style={styles.queueList}
          contentContainerStyle={[styles.dineInContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {dineInTab === "reservation" && apiReservations.length > 0 ? (
            apiReservations.map((res: any) => (
              <Card key={`api-${res.id}`} style={{ padding: Spacing.md, borderLeftWidth: 4, borderLeftColor: "#9333ea" }} elevation={2}>
                <View style={styles.dineInCardHeader}>
                  <View style={styles.dineInTicketSection}>
                    <View style={[styles.dineInTicketBadge, { backgroundColor: "#9333ea" }]}>
                      <ThemedText style={styles.dineInTicketNumber}>
                        {res.confirmationCode?.slice(0, 3) || "R"}
                      </ThemedText>
                    </View>
                    <View style={styles.dineInCustomerInfo}>
                      <View style={styles.dineInNameRow}>
                        <ThemedText style={styles.dineInCustomerName}>
                          {res.customerName}
                        </ThemedText>
                        <View style={[styles.sourceBadge, { backgroundColor: "#9333ea20" }]}>
                          <Feather name="calendar" size={10} color="#9333ea" />
                          <ThemedText style={[styles.sourceBadgeText, { color: "#9333ea" }]}>
                            Online
                          </ThemedText>
                        </View>
                      </View>
                      <View style={styles.dineInMeta}>
                        <Feather name="clock" size={12} color="#9333ea" />
                        <ThemedText style={[styles.dineInMetaText, { color: "#9333ea", fontWeight: "600" }]}>
                          {res.reservationTime}
                        </ThemedText>
                        <Feather name="users" size={12} color={colors.textSecondary} style={{ marginLeft: 8 }} />
                        <ThemedText style={[styles.dineInMetaText, { color: colors.textSecondary }]}>
                          {res.partySize} guests
                        </ThemedText>
                      </View>
                      {res.specialRequests ? (
                        <ThemedText style={[styles.dineInMetaText, { color: colors.textSecondary, fontStyle: "italic", marginTop: 2 }]}>
                          {res.specialRequests}
                        </ThemedText>
                      ) : null}
                    </View>
                  </View>
                </View>
                <View style={styles.dineInCardActions}>
                  <Pressable
                    style={[styles.dineInActionButton, styles.dineInActionPrimary, { backgroundColor: colors.success }]}
                    onPress={() => handleCheckInApiReservation(res.id, res.customerName)}
                  >
                    <Feather name="log-in" size={16} color="#FFFFFF" />
                    <ThemedText style={[styles.dineInActionText, { color: "#FFFFFF" }]}>
                      Check In
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.dineInActionButton, styles.dineInActionSecondary, { borderColor: colors.error }]}
                    onPress={() => handleCancelApiReservation(res.id)}
                  >
                    <Feather name="x" size={16} color={colors.error} />
                  </Pressable>
                </View>
              </Card>
            ))
          ) : null}
          {getCurrentTabCustomers().length === 0 && (dineInTab !== "reservation" || apiReservations.length === 0) ? (
            <View style={styles.dineInEmptyState}>
              <Feather
                name={dineInTabs.find((t) => t.key === dineInTab)?.icon || "users"}
                size={48}
                color={colors.textSecondary}
              />
              <ThemedText style={[styles.dineInEmptyText, { color: colors.textSecondary }]}>
                No {dineInTab === "reservation" ? "reservations" : dineInTab === "waiting" ? "customers waiting" : dineInTab === "called" ? "customers called" : dineInTab === "hold" ? "customers on hold" : "arrived customers"}
              </ThemedText>
            </View>
          ) : null}
          {getCurrentTabCustomers().length > 0 ? (
            getCurrentTabCustomers().map((customer) => (
              <Card key={customer.id} style={styles.dineInCard} elevation={2}>
                <View style={styles.dineInCardHeader}>
                  <View style={styles.dineInTicketSection}>
                    <View style={[styles.dineInTicketBadge, { backgroundColor: colors.primary }]}>
                      <ThemedText style={styles.dineInTicketNumber}>
                        {customer.ticketNumber}
                      </ThemedText>
                    </View>
                    <View style={styles.dineInCustomerInfo}>
                      <View style={styles.dineInNameRow}>
                        <ThemedText style={styles.dineInCustomerName}>
                          {customer.customerName}
                        </ThemedText>
                        {customer.source ? (
                          <View style={[styles.sourceBadge, { backgroundColor: getSourceBadge(customer.source).color + "20" }]}>
                            <Feather name={getSourceBadge(customer.source).icon} size={10} color={getSourceBadge(customer.source).color} />
                            <ThemedText style={[styles.sourceBadgeText, { color: getSourceBadge(customer.source).color }]}>
                              {getSourceBadge(customer.source).label}
                            </ThemedText>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.dineInMeta}>
                        <Feather name="clock" size={12} color={colors.textSecondary} />
                        <ThemedText style={[styles.dineInMetaText, { color: colors.textSecondary }]}>
                          {dineInTab === "reservation" && customer.reservationTime ? `Reserved for ${formatTime(customer.reservationTime)}` : `Joined ${formatTime(customer.joinedAt)}`}
                        </ThemedText>
                        {customer.tableNumber ? (
                          <>
                            <Feather name="grid" size={12} color={colors.success} style={{ marginLeft: 8 }} />
                            <ThemedText style={[styles.dineInMetaText, { color: colors.success, fontWeight: "600" }]}>
                              Table: {customer.tableNumber}
                            </ThemedText>
                          </>
                        ) : null}
                      </View>
                      {getCustomerFormDataDisplay(customer)}
                    </View>
                  </View>
                  {customer.callCount > 0 ? (
                    <View style={[styles.dineInCallCountBadge, { backgroundColor: colors.warning + "20" }]}>
                      <Feather name="phone" size={12} color={colors.warning} />
                      <ThemedText style={[styles.dineInCallCountText, { color: colors.warning }]}>
                        {customer.callCount}x
                      </ThemedText>
                    </View>
                  ) : null}
                </View>

                <View style={styles.dineInCardActions}>
                  {dineInTab === "reservation" ? (
                    <Pressable
                      style={[styles.dineInActionButton, styles.dineInActionPrimary, { backgroundColor: colors.success }]}
                      onPress={() => handleCheckInReservation(customer.id)}
                    >
                      <Feather name="log-in" size={16} color="#FFFFFF" />
                      <ThemedText style={[styles.dineInActionText, { color: "#FFFFFF" }]}>
                        Check In
                      </ThemedText>
                    </Pressable>
                  ) : dineInTab === "waiting" ? (
                    <Pressable
                      style={[styles.dineInActionButton, styles.dineInActionPrimary, { backgroundColor: colors.primary }]}
                      onPress={() => handleOpenTableAllocation(customer)}
                    >
                      <Feather name="grid" size={16} color="#FFFFFF" />
                      <ThemedText style={[styles.dineInActionText, { color: "#FFFFFF" }]}>
                        Allocate Table
                      </ThemedText>
                    </Pressable>
                  ) : dineInTab === "called" ? (
                    <>
                      <Pressable
                        style={[styles.dineInActionButton, styles.dineInActionPrimary, { backgroundColor: colors.success }]}
                        onPress={() => handleMarkArrived(customer.id)}
                      >
                        <Feather name="check" size={16} color="#FFFFFF" />
                        <ThemedText style={[styles.dineInActionText, { color: "#FFFFFF" }]}>
                          Arrived
                        </ThemedText>
                      </Pressable>
                      <Pressable
                        style={[styles.dineInActionButton, styles.dineInActionSecondary, { borderColor: colors.primary }]}
                        onPress={() => handleDineInCallAgain(customer.id)}
                      >
                        <Feather name="bell" size={16} color={colors.primary} />
                        {customer.callCount > 0 ? (
                          <View style={[styles.callCountBadge, { backgroundColor: colors.primary }]}>
                            <ThemedText style={styles.callCountText}>{customer.callCount}</ThemedText>
                          </View>
                        ) : null}
                      </Pressable>
                      <Pressable
                        style={[styles.dineInActionButton, styles.dineInActionSecondary, { borderColor: colors.warning }]}
                        onPress={() => handleHoldCustomer(customer.id)}
                      >
                        <Feather name="pause-circle" size={16} color={colors.warning} />
                      </Pressable>
                    </>
                  ) : dineInTab === "hold" ? (
                    <Pressable
                      style={[styles.dineInActionButton, styles.dineInActionPrimary, { backgroundColor: colors.primary }]}
                      onPress={() => handleResumeCustomer(customer.id)}
                    >
                      <Feather name="play" size={16} color="#FFFFFF" />
                      <ThemedText style={[styles.dineInActionText, { color: "#FFFFFF" }]}>
                        Resume
                      </ThemedText>
                    </Pressable>
                  ) : (
                    <View style={styles.dineInArrivedInfo}>
                      <Feather name="check-circle" size={20} color={colors.success} />
                      <ThemedText style={[styles.dineInArrivedText, { color: colors.success }]}>
                        Arrived at {customer.arrivedAt ? formatTime(customer.arrivedAt) : "-"}
                      </ThemedText>
                    </View>
                  )}
                </View>
              </Card>
            ))
          ) : null}
        </ScrollView>

        {/* FAB Buttons */}
        <View style={styles.fabContainer}>
          {/* Manual Registration Button */}
          <Pressable
            style={[styles.fabButton, { backgroundColor: colors.secondary }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              handleOpenManualRegistration();
            }}
          >
            <Feather name="user-plus" size={24} color="#FFFFFF" />
          </Pressable>
          
          {/* Scan Arrival Button */}
          {dineInTab === "called" || dineInTab === "waiting" ? (
            <Pressable
              style={[styles.fabButton, { backgroundColor: colors.success }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                navigation.navigate("CheckInScanner");
              }}
            >
              <Feather name="maximize" size={24} color="#FFFFFF" />
            </Pressable>
          ) : null}
        </View>

        {/* Table Allocation Modal */}
        <Modal
          visible={showTableAllocationModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowTableAllocationModal(false)}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <Pressable
              style={styles.modalDismissArea}
              onPress={() => {
                Keyboard.dismiss();
                setShowTableAllocationModal(false);
                setSelectedCustomerForTable(null);
                setTableNumberInput("");
              }}
            />
            <View style={[styles.modalContent, { backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF" }]}>
              <View style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>Allocate Table</ThemedText>
                <Pressable
                  onPress={() => {
                    setShowTableAllocationModal(false);
                    setSelectedCustomerForTable(null);
                    setTableNumberInput("");
                  }}
                  hitSlop={8}
                >
                  <Feather name="x" size={24} color={colors.text} />
                </Pressable>
              </View>

              {selectedCustomerForTable ? (
                <View style={styles.modalBody}>
                  <View style={[styles.dineInModalCustomerInfo, { backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5" }]}>
                    <ThemedText style={styles.dineInModalCustomerName}>
                      {selectedCustomerForTable.customerName}
                    </ThemedText>
                    <ThemedText style={[styles.dineInModalTicket, { color: colors.textSecondary }]}>
                      Ticket: {selectedCustomerForTable.ticketNumber}
                    </ThemedText>
                    {Object.entries(selectedCustomerForTable.formData || {}).slice(0, 3).map(([key, value]) => (
                      <ThemedText key={key} style={[styles.dineInModalFormData, { color: colors.textSecondary }]}>
                        {key}: {String(value)}
                      </ThemedText>
                    ))}
                  </View>

                  <View style={styles.inputGroup}>
                    <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                      Table Number *
                    </ThemedText>
                    <TextInput
                      style={[
                        styles.modalInput,
                        {
                          backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5",
                          color: colors.text,
                          borderColor: isDark ? "#444" : "#E0E0E0",
                        },
                      ]}
                      placeholder="e.g., Table 28, 36a, 37b"
                      placeholderTextColor={colors.textSecondary}
                      value={tableNumberInput}
                      onChangeText={setTableNumberInput}
                      autoFocus
                    />
                    <ThemedText style={[styles.inputHint, { color: colors.textSecondary }]}>
                      Customer will receive a notification with table details
                    </ThemedText>
                  </View>
                </View>
              ) : null}

              <View style={styles.modalFooter}>
                <Pressable
                  style={[styles.modalButton, styles.cancelButton, { borderColor: colors.textSecondary }]}
                  onPress={() => {
                    setShowTableAllocationModal(false);
                    setSelectedCustomerForTable(null);
                    setTableNumberInput("");
                  }}
                >
                  <ThemedText style={[styles.cancelButtonText, { color: colors.textSecondary }]}>
                    Cancel
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalButton,
                    styles.createButton,
                    { backgroundColor: colors.primary },
                    isAllocatingTable && { opacity: 0.7 },
                  ]}
                  onPress={handleAllocateTable}
                  disabled={isAllocatingTable}
                >
                  {isAllocatingTable ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Feather name="check" size={18} color="#FFFFFF" />
                      <ThemedText style={styles.createButtonText}>Allocate & Notify</ThemedText>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Manual Registration Modal */}
        <Modal
          visible={showManualRegistrationModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowManualRegistrationModal(false)}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <Pressable
              style={styles.modalDismissArea}
              onPress={() => {
                Keyboard.dismiss();
                setShowManualRegistrationModal(false);
              }}
            />
            <View style={[styles.modalContent, { backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF" }]}>
              <View style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>Add Customer</ThemedText>
                <Pressable
                  onPress={() => setShowManualRegistrationModal(false)}
                  hitSlop={8}
                >
                  <Feather name="x" size={24} color={colors.text} />
                </Pressable>
              </View>

              <View style={styles.modalBody}>
                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    Customer Name *
                  </ThemedText>
                  <TextInput
                    style={[
                      styles.modalInput,
                      {
                        backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5",
                        color: colors.text,
                        borderColor: colors.border,
                      },
                    ]}
                    placeholder="Enter customer name"
                    placeholderTextColor={colors.textSecondary}
                    value={manualRegistrationData.customerName}
                    onChangeText={(text) => setManualRegistrationData((prev) => ({ ...prev, customerName: text }))}
                    autoFocus
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    Phone Number
                  </ThemedText>
                  <TextInput
                    style={[
                      styles.modalInput,
                      {
                        backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5",
                        color: colors.text,
                        borderColor: colors.border,
                      },
                    ]}
                    placeholder="Enter phone number"
                    placeholderTextColor={colors.textSecondary}
                    value={manualRegistrationData.customerPhone}
                    onChangeText={(text) => setManualRegistrationData((prev) => ({ ...prev, customerPhone: text }))}
                    keyboardType="phone-pad"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    Email
                  </ThemedText>
                  <TextInput
                    style={[
                      styles.modalInput,
                      {
                        backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5",
                        color: colors.text,
                        borderColor: colors.border,
                      },
                    ]}
                    placeholder="Enter email address"
                    placeholderTextColor={colors.textSecondary}
                    value={manualRegistrationData.customerEmail}
                    onChangeText={(text) => setManualRegistrationData((prev) => ({ ...prev, customerEmail: text }))}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    Notes
                  </ThemedText>
                  <TextInput
                    style={[
                      styles.modalInput,
                      {
                        backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5",
                        color: colors.text,
                        borderColor: colors.border,
                        height: 80,
                        textAlignVertical: "top",
                      },
                    ]}
                    placeholder="Additional notes (optional)"
                    placeholderTextColor={colors.textSecondary}
                    value={manualRegistrationData.notes}
                    onChangeText={(text) => setManualRegistrationData((prev) => ({ ...prev, notes: text }))}
                    multiline
                  />
                </View>
              </View>

              <View style={styles.modalFooter}>
                <Pressable
                  style={[styles.modalButton, styles.cancelButton, { borderColor: colors.textSecondary }]}
                  onPress={() => setShowManualRegistrationModal(false)}
                >
                  <ThemedText style={[styles.cancelButtonText, { color: colors.textSecondary }]}>
                    Cancel
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalButton,
                    styles.createButton,
                    { backgroundColor: colors.primary },
                    isRegistering && { opacity: 0.7 },
                  ]}
                  onPress={handleManualRegistration}
                  disabled={isRegistering}
                >
                  {isRegistering ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Feather name="user-plus" size={18} color="#FFFFFF" />
                      <ThemedText style={styles.createButtonText}>Add to Queue</ThemedText>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </ThemedView>
    );
  }

  // Multi-Stage Mode UI
  if (isMultiStageMode) {
    const handleMultiStageCall = async (customerId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await callSpecificCustomer(customerId, selectedDesk?.id, selectedDesk?.name);
    };

    const handleMultiStageServe = async (customerId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await markAsServing(customerId);
    };

    const handleMultiStageCallAgain = async (customerId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await callAgainCustomer(customerId, selectedDesk?.id, selectedDesk?.name);
    };

    const handleOpenStageSelector = (customer: QueueCustomer) => {
      setCustomerForStageAssign(customer);
      setShowStageSelectorModal(true);
    };

    const handleAssignToStage = async (stageIndex: number) => {
      if (!customerForStageAssign) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const result = await moveToStage(customerForStageAssign.id, stageIndex);
      if (result.success) {
        setShowStageSelectorModal(false);
        setCustomerForStageAssign(null);
      }
    };

    const handleCompleteJourney = async (customerId: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await completeJourney(customerId);
    };

    const currentStage = selectedJourney?.stages[selectedStageIndex];
    const customersAtStage = selectedJourney
      ? getCustomersAtStage(selectedJourney.id, selectedStageIndex)
      : [];

    const stageTabs = selectedJourney?.stages.map((stage, index) => ({
      key: index,
      label: stage.serviceName,
      count: selectedJourney ? getCustomersAtStage(selectedJourney.id, index).length : 0,
      isOptional: stage.isOptional,
    })) || [];

    const getWaitTime = (customer: QueueCustomer) => {
      if (customer.stageHistory && customer.stageHistory.length > 0) {
        const currentStageEntry = customer.stageHistory.find(
          (h) => h.stageId === customer.currentStageId && !h.completedAt
        );
        if (currentStageEntry) {
          return Math.round((Date.now() - new Date(currentStageEntry.startedAt).getTime()) / 60000);
        }
      }
      return Math.round((Date.now() - new Date(customer.joinedAt).getTime()) / 60000);
    };

    if (!selectedJourney) {
      return (
        <ThemedView style={styles.container}>
          <View style={styles.emptyState}>
            <Feather name="git-branch" size={48} color={colors.textSecondary} />
            <ThemedText style={styles.emptyTitle}>No Journeys Configured</ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Go to Settings to create customer journeys for multi-stage processing.
            </ThemedText>
            <Pressable
              style={[styles.configureButton, { backgroundColor: colors.primary }]}
              onPress={() => navigation.navigate("JourneyManagement")}
            >
              <Feather name="settings" size={18} color="#FFFFFF" />
              <ThemedText style={styles.configureButtonText}>Configure Journeys</ThemedText>
            </Pressable>
          </View>
        </ThemedView>
      );
    }

    return (
      <ThemedView style={styles.container}>
        {journeys.length > 1 ? (
          <View style={styles.journeySelector}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.journeyTabs}>
                {journeys.map((journey) => (
                  <Pressable
                    key={journey.id}
                    style={[
                      styles.journeyTab,
                      {
                        backgroundColor:
                          selectedJourney?.id === journey.id
                            ? colors.primary
                            : isDark
                            ? "#2A2A2A"
                            : "#F1F5F9",
                      },
                    ]}
                    onPress={() => {
                      setSelectedJourneyId(journey.id);
                      setSelectedStageIndex(0);
                    }}
                  >
                    <ThemedText
                      style={[
                        styles.journeyTabText,
                        {
                          color:
                            selectedJourney?.id === journey.id
                              ? "#FFFFFF"
                              : colors.text,
                        },
                      ]}
                    >
                      {journey.name}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.stageFlowContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stageFlowContent}
          >
            {stageTabs.map((tab, index) => (
              <React.Fragment key={tab.key}>
                <Pressable
                  style={[
                    styles.stageTab,
                    {
                      backgroundColor:
                        selectedStageIndex === tab.key
                          ? colors.primary
                          : isDark
                          ? "#2A2A2A"
                          : "#F1F5F9",
                    },
                    tab.isOptional && selectedStageIndex !== tab.key && {
                      borderWidth: 1,
                      borderStyle: "dashed",
                      borderColor: isDark ? "#555" : "#CBD5E1",
                    },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedStageIndex(tab.key);
                  }}
                >
                  <View style={styles.stageTabContent}>
                    <View style={styles.stageTabHeader}>
                      <ThemedText
                        style={[
                          styles.stageTabIndex,
                          {
                            color:
                              selectedStageIndex === tab.key
                                ? "rgba(255,255,255,0.7)"
                                : colors.textSecondary,
                          },
                        ]}
                      >
                        Stage {tab.key + 1}
                      </ThemedText>
                      {tab.isOptional ? (
                        <View
                          style={[
                            styles.optionalBadge,
                            {
                              backgroundColor:
                                selectedStageIndex === tab.key
                                  ? "rgba(255,255,255,0.2)"
                                  : isDark
                                  ? "#3D3D00"
                                  : "#FEF3C7",
                            },
                          ]}
                        >
                          <ThemedText
                            style={[
                              styles.optionalBadgeText,
                              {
                                color:
                                  selectedStageIndex === tab.key
                                    ? "#FFFFFF"
                                    : colors.warning,
                              },
                            ]}
                          >
                            Opt
                          </ThemedText>
                        </View>
                      ) : null}
                    </View>
                    <ThemedText
                      style={[
                        styles.stageTabLabel,
                        {
                          color:
                            selectedStageIndex === tab.key
                              ? "#FFFFFF"
                              : colors.text,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {tab.label}
                    </ThemedText>
                    <View
                      style={[
                        styles.stageTabCount,
                        {
                          backgroundColor:
                            selectedStageIndex === tab.key
                              ? "rgba(255,255,255,0.3)"
                              : isDark
                              ? "#444"
                              : "#E2E8F0",
                        },
                      ]}
                    >
                      <ThemedText
                        style={[
                          styles.stageTabCountText,
                          {
                            color:
                              selectedStageIndex === tab.key
                                ? "#FFFFFF"
                                : colors.textSecondary,
                          },
                        ]}
                      >
                        {tab.count}
                      </ThemedText>
                    </View>
                  </View>
                </Pressable>
                {index < stageTabs.length - 1 ? (
                  <Feather
                    name="chevron-right"
                    size={18}
                    color={colors.textSecondary}
                    style={styles.stageArrow}
                  />
                ) : null}
              </React.Fragment>
            ))}
          </ScrollView>
        </View>

        <ScrollView
          style={styles.queueList}
          contentContainerStyle={[styles.multiStageContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {customersAtStage.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="users" size={48} color={colors.textSecondary} />
              <ThemedText style={styles.emptyTitle}>No customers at this stage</ThemedText>
              <ThemedText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                {currentStage?.serviceName || "Stage"} is currently empty
              </ThemedText>
            </View>
          ) : (
            customersAtStage.map((customer) => {
              const isLastStage = selectedStageIndex === (selectedJourney?.stages.length || 1) - 1;
              const stageWaitTime = getWaitTime(customer);
              const isWaiting = customer.status === "waiting";
              const isCalled = customer.status === "called";
              const isServing = customer.status === "serving";

              const getStatusColor = () => {
                switch (customer.status) {
                  case "called": return customer.acknowledgedAt ? "#10B981" : colors.accent;
                  case "serving": return colors.success;
                  default: return colors.primary;
                }
              };

              const getStatusLabel = () => {
                switch (customer.status) {
                  case "called": return customer.acknowledgedAt ? "Acknowledged" : "Called";
                  case "serving": return "Serving";
                  default: return "Waiting";
                }
              };

              return (
                <Card key={customer.id} style={styles.multiStageCard} elevation={2}>
                  <View style={styles.multiStageCardHeader}>
                    <View style={styles.multiStageTicketSection}>
                      <View style={[styles.multiStageTicketBadge, { backgroundColor: getStatusColor() }]}>
                        <ThemedText style={styles.multiStageTicketNumber}>
                          {customer.ticketNumber}
                        </ThemedText>
                      </View>
                      <View style={styles.multiStageCustomerInfo}>
                        <ThemedText style={styles.multiStageCustomerName}>
                          {customer.customerName}
                        </ThemedText>
                        <View style={styles.multiStageMeta}>
                          <View style={[styles.multiStageStatusBadge, { backgroundColor: getStatusColor() + "20" }]}>
                            <ThemedText style={[styles.multiStageStatusText, { color: getStatusColor() }]}>
                              {getStatusLabel()}
                            </ThemedText>
                          </View>
                          <Feather name="clock" size={12} color={colors.textSecondary} />
                          <ThemedText style={[styles.multiStageMetaText, { color: colors.textSecondary }]}>
                            {stageWaitTime} min
                          </ThemedText>
                        </View>
                      </View>
                    </View>
                    <View style={[styles.stageProgressBadge, { backgroundColor: isDark ? "#2A2A2A" : "#F1F5F9" }]}>
                      <ThemedText style={[styles.stageProgressText, { color: colors.textSecondary }]}>
                        {(customer.currentStageIndex || 0) + 1}/{selectedJourney?.stages.length || 1}
                      </ThemedText>
                    </View>
                  </View>

                  <View style={styles.multiStageActions}>
                    {isWaiting ? (
                      <>
                        <Pressable
                          style={[styles.multiStageActionButton, { backgroundColor: colors.primary }]}
                          onPress={() => handleMultiStageCall(customer.id)}
                        >
                          <Feather name="phone" size={16} color="#FFFFFF" />
                          <ThemedText style={styles.multiStageActionText}>Call</ThemedText>
                        </Pressable>
                        <Pressable
                          style={[styles.multiStageActionButton, styles.multiStageSecondaryAction, { borderColor: colors.error }]}
                          onPress={() => handleNoShow(customer.id)}
                        >
                          <Feather name="x" size={16} color={colors.error} />
                        </Pressable>
                      </>
                    ) : isCalled ? (
                      <>
                        <Pressable
                          style={[styles.multiStageActionButton, { backgroundColor: colors.success }]}
                          onPress={() => handleMultiStageServe(customer.id)}
                        >
                          <Feather name="user-check" size={16} color="#FFFFFF" />
                          <ThemedText style={styles.multiStageActionText}>Serve</ThemedText>
                        </Pressable>
                        <Pressable
                          style={[styles.multiStageActionButton, styles.multiStageSecondaryAction, { borderColor: colors.primary }]}
                          onPress={() => handleMultiStageCallAgain(customer.id)}
                        >
                          <Feather name="phone-forwarded" size={16} color={colors.primary} />
                        </Pressable>
                        <Pressable
                          style={[styles.multiStageActionButton, styles.multiStageSecondaryAction, { borderColor: colors.error }]}
                          onPress={() => handleNoShow(customer.id)}
                        >
                          <Feather name="x" size={16} color={colors.error} />
                        </Pressable>
                      </>
                    ) : isServing ? (
                      <>
                        {isLastStage ? (
                          <Pressable
                            style={[styles.multiStageActionButton, { backgroundColor: colors.success }]}
                            onPress={() => handleCompleteJourney(customer.id)}
                          >
                            <Feather name="check-circle" size={16} color="#FFFFFF" />
                            <ThemedText style={styles.multiStageActionText}>Complete Journey</ThemedText>
                          </Pressable>
                        ) : (
                          <Pressable
                            style={[styles.multiStageActionButton, { backgroundColor: colors.primary }]}
                            onPress={() => handleOpenStageSelector(customer)}
                          >
                            <Feather name="send" size={16} color="#FFFFFF" />
                            <ThemedText style={styles.multiStageActionText}>Assign to Stage</ThemedText>
                          </Pressable>
                        )}
                        <Pressable
                          style={[styles.multiStageActionButton, styles.multiStageSecondaryAction, { borderColor: colors.error }]}
                          onPress={() => handleNoShow(customer.id)}
                        >
                          <Feather name="x" size={16} color={colors.error} />
                        </Pressable>
                      </>
                    ) : null}
                  </View>
                </Card>
              );
            })
          )}
        </ScrollView>

        {showStageSelectorModal && customerForStageAssign && selectedJourney ? (
          <View style={[StyleSheet.absoluteFill, styles.stageSelectorOverlay]}>
            <Pressable
              style={styles.stageSelectorBackdrop}
              onPress={() => {
                setShowStageSelectorModal(false);
                setCustomerForStageAssign(null);
              }}
            />
            <View style={[styles.stageSelectorModal, { backgroundColor: isDark ? "#1E1E1E" : "#FFFFFF" }]}>
              <View style={styles.stageSelectorHeader}>
                <ThemedText style={styles.stageSelectorTitle}>Assign to Stage</ThemedText>
                <Pressable
                  onPress={() => {
                    setShowStageSelectorModal(false);
                    setCustomerForStageAssign(null);
                  }}
                >
                  <Feather name="x" size={24} color={colors.text} />
                </Pressable>
              </View>
              <ThemedText style={[styles.stageSelectorSubtitle, { color: colors.textSecondary }]}>
                Select the next stage for {customerForStageAssign.customerName}
              </ThemedText>
              <ScrollView style={styles.stageSelectorList}>
                {selectedJourney.stages.map((stage, index) => {
                  const isCurrentStage = index === (customerForStageAssign.currentStageIndex || 0);
                  const customersAtThisStage = getCustomersAtStage(selectedJourney.id, index).length;

                  return (
                    <Pressable
                      key={stage.id}
                      style={[
                        styles.stageSelectorItem,
                        { backgroundColor: isDark ? "#2A2A2A" : "#F8FAFC" },
                        isCurrentStage && { opacity: 0.5 },
                      ]}
                      onPress={() => !isCurrentStage && handleAssignToStage(index)}
                      disabled={isCurrentStage}
                    >
                      <View style={styles.stageSelectorItemLeft}>
                        <View style={[styles.stageSelectorNumber, { backgroundColor: colors.primary }]}>
                          <ThemedText style={styles.stageSelectorNumberText}>{index + 1}</ThemedText>
                        </View>
                        <View>
                          <ThemedText style={styles.stageSelectorItemName}>{stage.serviceName}</ThemedText>
                          <ThemedText style={[styles.stageSelectorItemCount, { color: colors.textSecondary }]}>
                            {customersAtThisStage} waiting
                          </ThemedText>
                        </View>
                      </View>
                      {stage.isOptional ? (
                        <View style={[styles.optionalBadge, { backgroundColor: isDark ? "#3D3D00" : "#FEF3C7" }]}>
                          <ThemedText style={[styles.optionalBadgeText, { color: colors.warning }]}>Optional</ThemedText>
                        </View>
                      ) : null}
                      {isCurrentStage ? (
                        <View style={[styles.currentStageBadge, { backgroundColor: colors.success + "20" }]}>
                          <ThemedText style={[styles.currentStageBadgeText, { color: colors.success }]}>Current</ThemedText>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
                <Pressable
                  style={[
                    styles.stageSelectorItem,
                    styles.completeJourneyItem,
                    { backgroundColor: colors.success + "15", borderColor: colors.success, borderWidth: 1 },
                  ]}
                  onPress={() => {
                    handleCompleteJourney(customerForStageAssign.id);
                    setShowStageSelectorModal(false);
                    setCustomerForStageAssign(null);
                  }}
                >
                  <View style={styles.stageSelectorItemLeft}>
                    <View style={[styles.stageSelectorNumber, { backgroundColor: colors.success }]}>
                      <Feather name="check" size={16} color="#FFFFFF" />
                    </View>
                    <View>
                      <ThemedText style={[styles.stageSelectorItemName, { color: colors.success }]}>Complete Journey</ThemedText>
                      <ThemedText style={[styles.stageSelectorItemCount, { color: colors.textSecondary }]}>
                        Mark customer as done
                      </ThemedText>
                    </View>
                  </View>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        ) : null}

        {/* FAB - Add Customer */}
        <Pressable
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            handleOpenAddToQueue();
          }}
          testID="fab-add-customer-multistage"
        >
          <Feather name="user-plus" size={24} color="#FFFFFF" />
        </Pressable>

        {/* Manual Add to Queue Modal (shared) */}
        <Modal
          visible={showAddToQueueModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowAddToQueueModal(false)}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <Pressable
              style={styles.modalDismissArea}
              onPress={() => {
                Keyboard.dismiss();
                setShowAddToQueueModal(false);
              }}
            />
            <View style={[styles.modalContent, { backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF" }]}>
              <View style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>Add Customer to Queue</ThemedText>
                <Pressable onPress={() => setShowAddToQueueModal(false)} hitSlop={8}>
                  <Feather name="x" size={24} color={colors.text} />
                </Pressable>
              </View>
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={styles.modalBody}>
                  {branchServices.length > 1 ? (
                    <View style={styles.inputGroup}>
                      <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Service *</ThemedText>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          {branchServices.map((service) => {
                            const svcStatus = (service as any).queueStatus || "active";
                            const isClosed = svcStatus === "paused" || svcStatus === "ended";
                            return (
                            <Pressable
                              key={service.id}
                              style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: isClosed ? (isDark ? "#333" : "#E5E7EB") : addToQueueServiceId === service.id ? colors.primary : (isDark ? "#333" : "#E5E7EB"), backgroundColor: isClosed ? (isDark ? "#1A1A1A" : "#F0F0F0") : addToQueueServiceId === service.id ? colors.primary + "15" : (isDark ? "#2A2A2A" : "#F9FAFB"), opacity: isClosed ? 0.5 : 1 }}
                              onPress={() => { if (!isClosed) { setAddToQueueServiceId(service.id); setAddToQueueFormData({}); } }}
                              disabled={isClosed}
                            >
                              <ThemedText style={{ fontSize: 13, fontWeight: addToQueueServiceId === service.id ? "700" : "500", color: isClosed ? colors.textSecondary : addToQueueServiceId === service.id ? colors.primary : colors.text }}>{service.name}{svcStatus === "paused" ? " (Paused)" : svcStatus === "ended" ? " (Closed)" : ""}</ThemedText>
                            </Pressable>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </View>
                  ) : null}
                  <View style={styles.inputGroup}>
                    <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Customer Name *</ThemedText>
                    <TextInput style={[styles.modalInput, { backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5", color: colors.text, borderColor: colors.border }]} placeholder="Enter customer name" placeholderTextColor={colors.textSecondary} value={addToQueueName} onChangeText={setAddToQueueName} />
                  </View>
                  <View style={styles.inputGroup}>
                    <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Phone Number</ThemedText>
                    <TextInput style={[styles.modalInput, { backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5", color: colors.text, borderColor: colors.border }]} placeholder="Enter phone number" placeholderTextColor={colors.textSecondary} value={addToQueuePhone} onChangeText={setAddToQueuePhone} keyboardType="phone-pad" />
                  </View>
                  <View style={styles.inputGroup}>
                    <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Email</ThemedText>
                    <TextInput style={[styles.modalInput, { backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5", color: colors.text, borderColor: colors.border }]} placeholder="Enter email address" placeholderTextColor={colors.textSecondary} value={addToQueueEmail} onChangeText={setAddToQueueEmail} keyboardType="email-address" autoCapitalize="none" />
                  </View>
                  {selectedAddService?.inputFields?.map((field) => (
                    <View key={field.id} style={styles.inputGroup}>
                      <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>{field.label}{field.required ? " *" : ""}</ThemedText>
                      {field.type === "select" && field.options ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          <View style={{ flexDirection: "row", gap: 8 }}>
                            {field.options.map((opt) => (
                              <Pressable key={opt} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: addToQueueFormData[field.id] === opt ? colors.primary : (isDark ? "#333" : "#E5E7EB"), backgroundColor: addToQueueFormData[field.id] === opt ? colors.primary + "15" : (isDark ? "#2A2A2A" : "#F9FAFB") }} onPress={() => setAddToQueueFormData(prev => ({ ...prev, [field.id]: opt }))}>
                                <ThemedText style={{ fontSize: 13, fontWeight: addToQueueFormData[field.id] === opt ? "700" : "500", color: addToQueueFormData[field.id] === opt ? colors.primary : colors.text }}>{opt}</ThemedText>
                              </Pressable>
                            ))}
                          </View>
                        </ScrollView>
                      ) : field.type === "checkbox" ? (
                        <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }} onPress={() => setAddToQueueFormData(prev => ({ ...prev, [field.id]: !prev[field.id] }))}>
                          <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: addToQueueFormData[field.id] ? colors.primary : (isDark ? "#555" : "#CCC"), backgroundColor: addToQueueFormData[field.id] ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
                            {addToQueueFormData[field.id] ? <Feather name="check" size={14} color="#FFF" /> : null}
                          </View>
                          <ThemedText style={{ fontSize: 14 }}>{field.label}</ThemedText>
                        </Pressable>
                      ) : (
                        <TextInput style={[styles.modalInput, { backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5", color: colors.text, borderColor: colors.border }]} placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`} placeholderTextColor={colors.textSecondary} value={addToQueueFormData[field.id] || ""} onChangeText={(text) => setAddToQueueFormData(prev => ({ ...prev, [field.id]: text }))} keyboardType={field.type === "phone" ? "phone-pad" : field.type === "number" ? "numeric" : field.type === "email" ? "email-address" : "default"} autoCapitalize={field.type === "email" ? "none" : "sentences"} />
                      )}
                    </View>
                  ))}
                </View>
              </ScrollView>
              <View style={styles.modalFooter}>
                <Pressable style={[styles.modalButton, styles.cancelButton, { borderColor: colors.textSecondary }]} onPress={() => setShowAddToQueueModal(false)}>
                  <ThemedText style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</ThemedText>
                </Pressable>
                <Pressable style={[styles.modalButton, styles.createButton, { backgroundColor: colors.primary }, isAddingToQueue && { opacity: 0.7 }]} onPress={handleAddToQueue} disabled={isAddingToQueue}>
                  {isAddingToQueue ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Feather name="user-plus" size={18} color="#FFFFFF" />
                      <ThemedText style={styles.createButtonText}>Add to Queue</ThemedText>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>

      <Pressable
        style={[styles.stationIndicator, { backgroundColor: isDark ? "#1C1C1E" : "#F8F9FA", borderColor: colors.primary + "30" }]}
        onPress={() => { Haptics.selectionAsync(); openStationModal(); }}
        testID="button-station-selector"
      >
        <View style={styles.stationIndicatorContent}>
          <Feather name="sliders" size={16} color={colors.primary} />
          <ThemedText style={[styles.stationIndicatorText, { color: colors.text }]} numberOfLines={1}>{stationSummary}</ThemedText>
        </View>
        <Feather name="chevron-right" size={16} color={colors.textSecondary} />
      </Pressable>

      <Modal
        visible={showStationModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowStationModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowStationModal(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF" }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.modalTitle}>{getStepTitle()}</ThemedText>
                {getStepSubtitle() ? (
                  <ThemedText style={[styles.stepSubtitle, { color: colors.textSecondary }]}>{getStepSubtitle()}</ThemedText>
                ) : null}
              </View>
              <Pressable onPress={() => setShowStationModal(false)} hitSlop={8}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>

            {stationSteps.length > 1 ? (
              <View style={styles.stepIndicatorRow}>
                {stationSteps.map((step, idx) => (
                  <View key={step} style={styles.stepDotWrapper}>
                    <View style={[
                      styles.stepDot,
                      { backgroundColor: idx <= currentStepIndex ? colors.primary : (isDark ? "#3A3A3A" : "#E5E7EB") },
                    ]} />
                    {idx < stationSteps.length - 1 ? (
                      <View style={[styles.stepLine, { backgroundColor: idx < currentStepIndex ? colors.primary : (isDark ? "#3A3A3A" : "#E5E7EB") }]} />
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
              <View style={styles.modalBody}>
                {stationStep === "branch" ? (
                  <View style={{ gap: 8 }}>
                    {accessibleBranches.map((branch) => (
                      <Pressable
                        key={branch.id}
                        style={[styles.stationOptionCard, {
                          borderColor: selectedBranchId === branch.id ? colors.primary : (isDark ? "#333" : "#E5E7EB"),
                          backgroundColor: selectedBranchId === branch.id ? colors.primary + "10" : (isDark ? "#2A2A2A" : "#F9FAFB"),
                        }]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSelectedBranchId(branch.id);
                          setSelectedServiceId(currentUser?.assignedServiceIds?.length === 1 ? currentUser.assignedServiceIds[0] : null);
                          setSelectedDeskId(null);
                        }}
                      >
                        <View style={styles.stationOptionIcon}>
                          <Feather name="map-pin" size={18} color={selectedBranchId === branch.id ? colors.primary : colors.textSecondary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={[styles.stationOptionTitle, selectedBranchId === branch.id && { color: colors.primary }]}>{branch.name}</ThemedText>
                          {branch.services && branch.services.length > 0 ? (
                            <ThemedText style={[styles.stationOptionMeta, { color: colors.textSecondary }]}>{branch.services.filter(s => s.isActive).length} services</ThemedText>
                          ) : null}
                        </View>
                        {selectedBranchId === branch.id ? (
                          <View style={[styles.stationCheckCircle, { backgroundColor: colors.primary }]}>
                            <Feather name="check" size={14} color="#FFFFFF" />
                          </View>
                        ) : (
                          <View style={[styles.stationCheckCircle, { borderWidth: 2, borderColor: isDark ? "#444" : "#D1D5DB" }]} />
                        )}
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {stationStep === "service" ? (
                  <View style={{ gap: 8 }}>
                    {!hasSpecificServiceAssignment ? (
                      <Pressable
                        style={[styles.stationOptionCard, {
                          borderColor: !selectedServiceId ? colors.primary : (isDark ? "#333" : "#E5E7EB"),
                          backgroundColor: !selectedServiceId ? colors.primary + "10" : (isDark ? "#2A2A2A" : "#F9FAFB"),
                        }]}
                        onPress={() => { Haptics.selectionAsync(); setSelectedServiceId(null); setSelectedDeskId(null); }}
                      >
                        <View style={styles.stationOptionIcon}>
                          <Feather name="layers" size={18} color={!selectedServiceId ? colors.primary : colors.textSecondary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={[styles.stationOptionTitle, !selectedServiceId && { color: colors.primary }]}>All Services</ThemedText>
                          <ThemedText style={[styles.stationOptionMeta, { color: colors.textSecondary }]}>Process queue for all services</ThemedText>
                        </View>
                        {!selectedServiceId ? (
                          <View style={[styles.stationCheckCircle, { backgroundColor: colors.primary }]}>
                            <Feather name="check" size={14} color="#FFFFFF" />
                          </View>
                        ) : (
                          <View style={[styles.stationCheckCircle, { borderWidth: 2, borderColor: isDark ? "#444" : "#D1D5DB" }]} />
                        )}
                      </Pressable>
                    ) : null}
                    {servicesForBranch.map((svc) => {
                      const svcDesks = (svc.desks || []).filter(d => d.isActive);
                      return (
                        <Pressable
                          key={svc.id}
                          style={[styles.stationOptionCard, {
                            borderColor: selectedServiceId === svc.id ? colors.primary : (isDark ? "#333" : "#E5E7EB"),
                            backgroundColor: selectedServiceId === svc.id ? colors.primary + "10" : (isDark ? "#2A2A2A" : "#F9FAFB"),
                          }]}
                          onPress={() => { Haptics.selectionAsync(); setSelectedServiceId(svc.id); setSelectedDeskId(null); }}
                        >
                          <View style={styles.stationOptionIcon}>
                            <Feather name="briefcase" size={18} color={selectedServiceId === svc.id ? colors.primary : colors.textSecondary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <ThemedText style={[styles.stationOptionTitle, selectedServiceId === svc.id && { color: colors.primary }]}>{svc.name}</ThemedText>
                            {svcDesks.length > 0 ? (
                              <ThemedText style={[styles.stationOptionMeta, { color: colors.textSecondary }]}>{svcDesks.length} desk{svcDesks.length !== 1 ? "s" : ""}</ThemedText>
                            ) : null}
                          </View>
                          {selectedServiceId === svc.id ? (
                            <View style={[styles.stationCheckCircle, { backgroundColor: colors.primary }]}>
                              <Feather name="check" size={14} color="#FFFFFF" />
                            </View>
                          ) : (
                            <View style={[styles.stationCheckCircle, { borderWidth: 2, borderColor: isDark ? "#444" : "#D1D5DB" }]} />
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                {stationStep === "desk" ? (
                  <View style={{ gap: 8 }}>
                    <Pressable
                      style={[styles.stationOptionCard, {
                        borderColor: !selectedDeskId ? colors.primary : (isDark ? "#333" : "#E5E7EB"),
                        backgroundColor: !selectedDeskId ? colors.primary + "10" : (isDark ? "#2A2A2A" : "#F9FAFB"),
                      }]}
                      onPress={() => { Haptics.selectionAsync(); setSelectedDeskId(null); }}
                    >
                      <View style={styles.stationOptionIcon}>
                        <Feather name="minus-circle" size={18} color={!selectedDeskId ? colors.primary : colors.textSecondary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={[styles.stationOptionTitle, !selectedDeskId && { color: colors.primary }]}>No Desk</ThemedText>
                        <ThemedText style={[styles.stationOptionMeta, { color: colors.textSecondary }]}>Process without desk assignment</ThemedText>
                      </View>
                      {!selectedDeskId ? (
                        <View style={[styles.stationCheckCircle, { backgroundColor: colors.primary }]}>
                          <Feather name="check" size={14} color="#FFFFFF" />
                        </View>
                      ) : (
                        <View style={[styles.stationCheckCircle, { borderWidth: 2, borderColor: isDark ? "#444" : "#D1D5DB" }]} />
                      )}
                    </Pressable>
                    {desksForSelection.map((desk) => {
                      const parentSvc = currentBranch?.services?.find(s => s.id === desk.serviceId);
                      return (
                        <Pressable
                          key={desk.id}
                          style={[styles.stationOptionCard, {
                            borderColor: selectedDeskId === desk.id ? colors.primary : (isDark ? "#333" : "#E5E7EB"),
                            backgroundColor: selectedDeskId === desk.id ? colors.primary + "10" : (isDark ? "#2A2A2A" : "#F9FAFB"),
                          }]}
                          onPress={() => { Haptics.selectionAsync(); setSelectedDeskId(desk.id); }}
                        >
                          <View style={styles.stationOptionIcon}>
                            <Feather name="monitor" size={18} color={selectedDeskId === desk.id ? colors.primary : colors.textSecondary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <ThemedText style={[styles.stationOptionTitle, selectedDeskId === desk.id && { color: colors.primary }]}>{desk.name}</ThemedText>
                            {parentSvc ? (
                              <ThemedText style={[styles.stationOptionMeta, { color: colors.textSecondary }]}>{parentSvc.name}</ThemedText>
                            ) : null}
                          </View>
                          {selectedDeskId === desk.id ? (
                            <View style={[styles.stationCheckCircle, { backgroundColor: colors.primary }]}>
                              <Feather name="check" size={14} color="#FFFFFF" />
                            </View>
                          ) : (
                            <View style={[styles.stationCheckCircle, { borderWidth: 2, borderColor: isDark ? "#444" : "#D1D5DB" }]} />
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              {!isFirstStep ? (
                <Pressable
                  style={[styles.modalButton, styles.cancelButton, { borderColor: colors.textSecondary }]}
                  onPress={handleStationBack}
                >
                  <Feather name="arrow-left" size={16} color={colors.textSecondary} />
                  <ThemedText style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Back</ThemedText>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.modalButton, styles.createButton, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={handleStationNext}
              >
                {isLastStep ? (
                  <>
                    <Feather name="check" size={18} color="#FFFFFF" />
                    <ThemedText style={styles.createButtonText}>Apply</ThemedText>
                  </>
                ) : (
                  <>
                    <ThemedText style={styles.createButtonText}>Next</ThemedText>
                    <Feather name="arrow-right" size={16} color="#FFFFFF" />
                  </>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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

      {/* FAB - Add Customer */}
      <Pressable
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          handleOpenAddToQueue();
        }}
        testID="fab-add-customer"
      >
        <Feather name="user-plus" size={24} color="#FFFFFF" />
      </Pressable>

      {/* Manual Add to Queue Modal */}
      <Modal
        visible={showAddToQueueModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddToQueueModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable
            style={styles.modalDismissArea}
            onPress={() => {
              Keyboard.dismiss();
              setShowAddToQueueModal(false);
            }}
          />
          <View style={[styles.modalContent, { backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF" }]}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Add Customer to Queue</ThemedText>
              <Pressable
                onPress={() => setShowAddToQueueModal(false)}
                hitSlop={8}
              >
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.modalBody}>
                {/* Service Selection */}
                {branchServices.length > 1 ? (
                  <View style={styles.inputGroup}>
                    <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                      Service *
                    </ThemedText>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {branchServices.map((service) => {
                          const svcStatus2 = (service as any).queueStatus || "active";
                          const isClosed2 = svcStatus2 === "paused" || svcStatus2 === "ended";
                          return (
                          <Pressable
                            key={service.id}
                            style={[
                              {
                                paddingHorizontal: 14,
                                paddingVertical: 10,
                                borderRadius: 10,
                                borderWidth: 2,
                                borderColor: isClosed2 ? (isDark ? "#333" : "#E5E7EB") : addToQueueServiceId === service.id ? colors.primary : (isDark ? "#333" : "#E5E7EB"),
                                backgroundColor: isClosed2 ? (isDark ? "#1A1A1A" : "#F0F0F0") : addToQueueServiceId === service.id ? colors.primary + "15" : (isDark ? "#2A2A2A" : "#F9FAFB"),
                                opacity: isClosed2 ? 0.5 : 1,
                              },
                            ]}
                            onPress={() => {
                              if (!isClosed2) {
                                setAddToQueueServiceId(service.id);
                                setAddToQueueFormData({});
                              }
                            }}
                            disabled={isClosed2}
                          >
                            <ThemedText style={{ fontSize: 13, fontWeight: addToQueueServiceId === service.id ? "700" : "500", color: isClosed2 ? colors.textSecondary : addToQueueServiceId === service.id ? colors.primary : colors.text }}>
                              {service.name}{svcStatus2 === "paused" ? " (Paused)" : svcStatus2 === "ended" ? " (Closed)" : ""}
                            </ThemedText>
                          </Pressable>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                ) : null}

                {/* Customer Name */}
                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    Customer Name *
                  </ThemedText>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5", color: colors.text, borderColor: colors.border }]}
                    placeholder="Enter customer name"
                    placeholderTextColor={colors.textSecondary}
                    value={addToQueueName}
                    onChangeText={setAddToQueueName}
                    testID="input-add-name"
                  />
                </View>

                {/* Phone */}
                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    Phone Number
                  </ThemedText>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5", color: colors.text, borderColor: colors.border }]}
                    placeholder="Enter phone number"
                    placeholderTextColor={colors.textSecondary}
                    value={addToQueuePhone}
                    onChangeText={setAddToQueuePhone}
                    keyboardType="phone-pad"
                    testID="input-add-phone"
                  />
                </View>

                {/* Email */}
                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                    Email
                  </ThemedText>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5", color: colors.text, borderColor: colors.border }]}
                    placeholder="Enter email address"
                    placeholderTextColor={colors.textSecondary}
                    value={addToQueueEmail}
                    onChangeText={setAddToQueueEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    testID="input-add-email"
                  />
                </View>

                {/* Dynamic Input Fields from Service */}
                {selectedAddService?.inputFields?.map((field) => (
                  <View key={field.id} style={styles.inputGroup}>
                    <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                      {field.label}{field.required ? " *" : ""}
                    </ThemedText>
                    {field.type === "select" && field.options ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          {field.options.map((opt) => (
                            <Pressable
                              key={opt}
                              style={[
                                {
                                  paddingHorizontal: 14,
                                  paddingVertical: 10,
                                  borderRadius: 10,
                                  borderWidth: 2,
                                  borderColor: addToQueueFormData[field.id] === opt ? colors.primary : (isDark ? "#333" : "#E5E7EB"),
                                  backgroundColor: addToQueueFormData[field.id] === opt ? colors.primary + "15" : (isDark ? "#2A2A2A" : "#F9FAFB"),
                                },
                              ]}
                              onPress={() => setAddToQueueFormData(prev => ({ ...prev, [field.id]: opt }))}
                            >
                              <ThemedText style={{ fontSize: 13, fontWeight: addToQueueFormData[field.id] === opt ? "700" : "500", color: addToQueueFormData[field.id] === opt ? colors.primary : colors.text }}>
                                {opt}
                              </ThemedText>
                            </Pressable>
                          ))}
                        </View>
                      </ScrollView>
                    ) : field.type === "checkbox" ? (
                      <Pressable
                        style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }}
                        onPress={() => setAddToQueueFormData(prev => ({ ...prev, [field.id]: !prev[field.id] }))}
                      >
                        <View style={{
                          width: 24, height: 24, borderRadius: 6, borderWidth: 2,
                          borderColor: addToQueueFormData[field.id] ? colors.primary : (isDark ? "#555" : "#CCC"),
                          backgroundColor: addToQueueFormData[field.id] ? colors.primary : "transparent",
                          alignItems: "center", justifyContent: "center",
                        }}>
                          {addToQueueFormData[field.id] ? <Feather name="check" size={14} color="#FFF" /> : null}
                        </View>
                        <ThemedText style={{ fontSize: 14 }}>{field.label}</ThemedText>
                      </Pressable>
                    ) : (
                      <TextInput
                        style={[styles.modalInput, { backgroundColor: isDark ? "#2A2A2A" : "#F5F5F5", color: colors.text, borderColor: colors.border }]}
                        placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                        placeholderTextColor={colors.textSecondary}
                        value={addToQueueFormData[field.id] || ""}
                        onChangeText={(text) => setAddToQueueFormData(prev => ({ ...prev, [field.id]: text }))}
                        keyboardType={field.type === "phone" ? "phone-pad" : field.type === "number" ? "numeric" : field.type === "email" ? "email-address" : "default"}
                        autoCapitalize={field.type === "email" ? "none" : "sentences"}
                      />
                    )}
                  </View>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                style={[styles.modalButton, styles.cancelButton, { borderColor: colors.textSecondary }]}
                onPress={() => setShowAddToQueueModal(false)}
              >
                <ThemedText style={[styles.cancelButtonText, { color: colors.textSecondary }]}>
                  Cancel
                </ThemedText>
              </Pressable>
              <Pressable
                style={[
                  styles.modalButton,
                  styles.createButton,
                  { backgroundColor: colors.primary },
                  isAddingToQueue && { opacity: 0.7 },
                ]}
                onPress={handleAddToQueue}
                disabled={isAddingToQueue}
                testID="button-add-to-queue"
              >
                {isAddingToQueue ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Feather name="user-plus" size={18} color="#FFFFFF" />
                    <ThemedText style={styles.createButtonText}>Add to Queue</ThemedText>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  stationIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    height: 44,
  },
  stationIndicatorContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flex: 1,
  },
  stationIndicatorText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  stepSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  stepIndicatorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: 0,
  },
  stepDotWrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stepLine: {
    width: 40,
    height: 2,
    marginHorizontal: 4,
  },
  stationOptionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 12,
  },
  stationOptionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(140, 24, 103, 0.08)",
  },
  stationOptionTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  stationOptionMeta: {
    fontSize: 12,
    marginTop: 1,
  },
  stationCheckCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
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
  customerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  ackPulseCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#10B981",
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
  inputHint: {
    fontSize: 12,
    marginTop: Spacing.xs,
    fontStyle: "italic",
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
  takeawayHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  takeawayTabs: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: BorderRadius.full,
    padding: 4,
  },
  takeawayTab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    alignItems: "center",
  },
  takeawayTabText: {
    fontSize: 14,
    fontWeight: "600",
  },
  takeawayStats: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  takeawayStat: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  takeawayStatNumber: {
    fontSize: 20,
    fontWeight: "700",
  },
  takeawayStatLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  takeawayContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  takeawayEmptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["4xl"],
    gap: Spacing.md,
  },
  takeawayEmptyText: {
    fontSize: 16,
    fontWeight: "600",
  },
  takeawayEmptySubtext: {
    fontSize: 14,
    textAlign: "center",
  },
  orderCard: {
    padding: Spacing.lg,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  orderTicketSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  orderTicketBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  orderTicketNumber: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  orderInfo: {
    flex: 1,
  },
  orderCustomerName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  orderMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  sourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: "600",
  },
  orderTime: {
    fontSize: 12,
  },
  orderStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  orderStatusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  orderServiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingTop: Spacing.md,
    marginTop: Spacing.md,
    borderTopWidth: 1,
  },
  orderServiceName: {
    fontSize: 13,
  },
  orderActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  orderActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  orderActionPrimary: {},
  orderActionSecondary: {
    borderWidth: 1.5,
  },
  orderActionText: {
    fontSize: 14,
    fontWeight: "600",
  },
  callAgainContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  callCountBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  callCountText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 12,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  completedOrderCard: {
    padding: Spacing.md,
  },
  completedOrderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  completedTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  completedTimeText: {
    fontSize: 13,
  },
  fab: {
    position: "absolute",
    bottom: 100,
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalDismissArea: {
    flex: 1,
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingTop: Spacing.lg,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  modalBody: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  modalInput: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    fontSize: 16,
    borderWidth: 1,
  },
  modalFooter: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing["2xl"],
  },
  modalButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  cancelButton: {
    borderWidth: 1.5,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  createButton: {},
  createButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  // Dine In Mode Styles
  dineInTabsScroll: {
    maxHeight: 60,
    marginTop: Spacing.sm,
  },
  dineInTabsContainer: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  dineInTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    gap: Spacing.xs,
  },
  dineInTabText: {
    fontSize: 14,
    fontWeight: "600",
  },
  dineInTabBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  dineInTabBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  dineInContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  dineInEmptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["2xl"],
    gap: Spacing.md,
  },
  dineInEmptyText: {
    fontSize: 16,
    textAlign: "center",
  },
  dineInCard: {
    padding: Spacing.md,
  },
  dineInCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  dineInTicketSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    flex: 1,
  },
  dineInTicketBadge: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  dineInTicketNumber: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  dineInCustomerInfo: {
    flex: 1,
    gap: 2,
  },
  dineInCustomerName: {
    fontSize: 16,
    fontWeight: "600",
  },
  dineInMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
  },
  dineInMetaText: {
    fontSize: 12,
  },
  dineInFormDataText: {
    fontSize: 12,
    marginTop: 2,
  },
  dineInCallCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.md,
    gap: 4,
  },
  dineInCallCountText: {
    fontSize: 12,
    fontWeight: "600",
  },
  dineInCardActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  dineInActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  dineInActionPrimary: {
    flex: 1,
  },
  dineInActionSecondary: {
    borderWidth: 1.5,
  },
  dineInActionText: {
    fontSize: 14,
    fontWeight: "600",
  },
  dineInArrivedInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  dineInArrivedText: {
    fontSize: 14,
    fontWeight: "500",
  },
  dineInModalCustomerInfo: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  dineInModalCustomerName: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  dineInModalTicket: {
    fontSize: 14,
    marginBottom: 4,
  },
  dineInModalFormData: {
    fontSize: 13,
  },
  dineInNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  fabContainer: {
    position: "absolute",
    bottom: 100,
    right: Spacing.md,
    alignItems: "center",
    gap: Spacing.sm,
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  configureButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.lg,
  },
  configureButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  journeySelector: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  journeyTabs: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  journeyTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  journeyTabText: {
    fontSize: 14,
    fontWeight: "500",
  },
  stageFlowContainer: {
    paddingTop: Spacing.md,
  },
  stageFlowContent: {
    paddingHorizontal: Spacing.md,
    alignItems: "center",
    gap: Spacing.xs,
  },
  stageTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    minWidth: 100,
  },
  stageTabContent: {
    gap: 4,
  },
  stageTabHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stageTabIndex: {
    fontSize: 11,
    fontWeight: "500",
  },
  optionalBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  optionalBadgeText: {
    fontSize: 9,
    fontWeight: "600",
  },
  stageTabLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  stageTabCount: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    marginTop: 4,
  },
  stageTabCountText: {
    fontSize: 12,
    fontWeight: "600",
  },
  stageArrow: {
    marginHorizontal: 2,
  },
  multiStageContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  multiStageCard: {
    padding: Spacing.md,
  },
  multiStageCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: Spacing.md,
  },
  multiStageTicketSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  multiStageTicketBadge: {
    minWidth: 64,
    height: 48,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  multiStageTicketNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  multiStageCustomerInfo: {
    flex: 1,
    gap: 2,
  },
  multiStageCustomerName: {
    fontSize: 16,
    fontWeight: "600",
  },
  multiStageMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  multiStageMetaText: {
    fontSize: 12,
  },
  stageProgressBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  stageProgressText: {
    fontSize: 12,
    fontWeight: "600",
  },
  multiStageActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
    paddingTop: Spacing.md,
  },
  multiStageActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    flex: 1,
  },
  multiStageSecondaryAction: {
    backgroundColor: "transparent",
    borderWidth: 1,
    flex: 0,
    paddingHorizontal: Spacing.sm,
  },
  multiStageActionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  multiStageStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    marginRight: 8,
  },
  multiStageStatusText: {
    fontSize: 11,
    fontWeight: "600",
  },
  stageSelectorOverlay: {
    justifyContent: "flex-end",
    zIndex: 1000,
  },
  stageSelectorBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  stageSelectorModal: {
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    maxHeight: "85%",
  },
  stageSelectorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  stageSelectorTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  stageSelectorSubtitle: {
    fontSize: 14,
    marginBottom: Spacing.lg,
  },
  stageSelectorList: {
    flexGrow: 0,
  },
  stageSelectorItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  completeJourneyItem: {
    marginTop: Spacing.sm,
  },
  stageSelectorItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  stageSelectorNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  stageSelectorNumberText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  stageSelectorItemName: {
    fontSize: 15,
    fontWeight: "600",
  },
  stageSelectorItemCount: {
    fontSize: 12,
  },
  currentStageBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  currentStageBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
});
