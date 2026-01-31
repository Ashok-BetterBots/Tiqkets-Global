import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut, Layout } from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { QueueCustomer } from "@/types/organization";

type FilterStatus = "all" | "waiting" | "called" | "serving";

interface CustomerCardProps {
  customer: QueueCustomer;
  isSelectiveMode: boolean;
  onCall: () => void;
  onServe: () => void;
  onComplete: () => void;
  onNoShow: () => void;
}

function CustomerCard({
  customer,
  isSelectiveMode,
  onCall,
  onServe,
  onComplete,
  onNoShow,
}: CustomerCardProps) {
  const getStatusColor = () => {
    switch (customer.status) {
      case "called":
        return Colors.light.accent;
      case "serving":
        return Colors.light.success;
      default:
        return Colors.light.primary;
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
        <View style={[styles.priorityBadge, { backgroundColor: Colors.light.accent + "20" }]}>
          <Feather name="alert-triangle" size={12} color={Colors.light.accent} />
          <ThemedText style={[styles.priorityText, { color: Colors.light.accent }]}>Urgent</ThemedText>
        </View>
      );
    }
    return null;
  };

  const waitTime = Math.round((Date.now() - new Date(customer.joinedAt).getTime()) / 60000);

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} layout={Layout}>
      <Card style={styles.customerCard}>
        <View style={styles.customerHeader}>
          <View style={styles.ticketInfo}>
            <View style={[styles.ticketBadge, { backgroundColor: getStatusColor() + "15" }]}>
              <ThemedText style={[styles.ticketNumber, { color: getStatusColor() }]}>
                {customer.ticketNumber}
              </ThemedText>
            </View>
            {getPriorityBadge()}
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
                <Feather name="phone" size={12} color={Colors.light.textSecondary} />
                <ThemedText style={styles.metaText}>{customer.customerPhone}</ThemedText>
              </View>
            ) : null}
            <View style={styles.metaItem}>
              <Feather name="clock" size={12} color={Colors.light.textSecondary} />
              <ThemedText style={styles.metaText}>{waitTime} min waiting</ThemedText>
            </View>
          </View>
          <View style={styles.serviceTag}>
            <Feather name="tag" size={12} color={Colors.light.primary} />
            <ThemedText style={styles.serviceText}>{customer.serviceName}</ThemedText>
          </View>
        </View>

        <View style={styles.customerActions}>
          {customer.status === "waiting" && isSelectiveMode ? (
            <Button
              title="Call Now"
              onPress={onCall}
              size="small"
              style={styles.actionButton}
            />
          ) : null}
          {customer.status === "waiting" && !isSelectiveMode ? (
            <View style={styles.waitingNote}>
              <Feather name="info" size={14} color={Colors.light.textSecondary} />
              <ThemedText style={styles.waitingText}>In FIFO queue</ThemedText>
            </View>
          ) : null}
          {customer.status === "called" ? (
            <View style={styles.buttonRow}>
              <Button
                title="Start Serving"
                onPress={onServe}
                size="small"
                style={[styles.actionButton, { marginRight: Spacing.sm }]}
              />
              <Pressable style={styles.noShowButton} onPress={onNoShow}>
                <Feather name="user-x" size={16} color={Colors.light.accent} />
              </Pressable>
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
  const headerHeight = useHeaderHeight();
  const {
    organization,
    queue,
    refreshQueue,
    callNextCustomer,
    callSpecificCustomer,
    markAsServing,
    markAsComplete,
    markAsNoShow,
  } = useOrganization();

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [refreshing, setRefreshing] = useState(false);

  const isSelectiveMode = organization?.settings.queueMode === "selective";

  const filteredQueue = queue.filter((c) => {
    if (filterStatus === "all") return c.status !== "completed" && c.status !== "no_show" && c.status !== "cancelled";
    return c.status === filterStatus;
  });

  const waitingCount = queue.filter((c) => c.status === "waiting").length;
  const calledCount = queue.filter((c) => c.status === "called").length;
  const servingCount = queue.filter((c) => c.status === "serving").length;

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

  const filters: { key: FilterStatus; label: string; count: number }[] = [
    { key: "all", label: "Active", count: waitingCount + calledCount + servingCount },
    { key: "waiting", label: "Waiting", count: waitingCount },
    { key: "called", label: "Called", count: calledCount },
    { key: "serving", label: "Serving", count: servingCount },
  ];

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.topBar, { marginTop: headerHeight }]}>
        {!isSelectiveMode ? (
          <Button
            title={`Call Next (${waitingCount})`}
            onPress={handleCallNext}
            disabled={waitingCount === 0}
            icon={<Feather name="volume-2" size={18} color="#FFFFFF" />}
            style={styles.callNextButton}
          />
        ) : (
          <View style={styles.modeIndicator}>
            <Feather name="target" size={18} color={Colors.light.primary} />
            <ThemedText style={styles.modeText}>Selective Mode - Choose who to call</ThemedText>
          </View>
        )}
      </View>

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
              filterStatus === filter.key && styles.filterChipActive,
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              setFilterStatus(filter.key);
            }}
          >
            <ThemedText
              style={[
                styles.filterText,
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.light.primary} />
        }
      >
        {filteredQueue.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={48} color={Colors.light.textSecondary} />
            <ThemedText style={styles.emptyTitle}>No customers</ThemedText>
            <ThemedText style={styles.emptySubtitle}>
              {filterStatus === "all" ? "The queue is empty" : `No ${filterStatus} customers`}
            </ThemedText>
          </View>
        ) : (
          filteredQueue.map((customer) => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              isSelectiveMode={isSelectiveMode}
              onCall={() => handleCall(customer.id)}
              onServe={() => handleServe(customer.id)}
              onComplete={() => handleComplete(customer.id)}
              onNoShow={() => handleNoShow(customer.id)}
            />
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  callNextButton: {
    width: "100%",
  },
  modeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.primary + "15",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  modeText: {
    marginLeft: Spacing.sm,
    fontSize: 14,
    color: Colors.light.primary,
    fontWeight: "600",
  },
  filtersScroll: {
    maxHeight: 50,
  },
  filtersContainer: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: "#F1F5F9",
  },
  filterChipActive: {
    backgroundColor: Colors.light.primary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.light.textSecondary,
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
    color: Colors.light.textSecondary,
  },
  serviceTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  serviceText: {
    fontSize: 12,
    color: Colors.light.primary,
    fontWeight: "500",
  },
  customerActions: {
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: Spacing.md,
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionButton: {
    flex: 1,
  },
  noShowButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.light.accent + "15",
    justifyContent: "center",
    alignItems: "center",
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
});
