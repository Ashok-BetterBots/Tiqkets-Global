import React, { useState } from "react";
import { View, StyleSheet, FlatList, Pressable, Alert, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { ThemedText } from "@/components/ThemedText";
import { EmptyState } from "@/components/EmptyState";
import { useTheme } from "@/hooks/useTheme";
import { useQueue } from "@/contexts/QueueContext";
import { Spacing, BorderRadius } from "@/constants/theme";
import { Service } from "@/types/queue";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface BranchServiceFromApi {
  id: string;
  name: string;
  avgWaitTime?: number;
  inputFields?: any[];
  currentQueue?: number;
  queueStatus?: string;
}

function ServiceCard({
  service,
  isSelected,
  onSelect,
}: {
  service: Service;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.98);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onSelect}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.serviceCard,
        { backgroundColor: theme.backgroundDefault },
        isSelected && { borderColor: theme.primary, borderWidth: 2 },
        animatedStyle,
      ]}
    >
      <View style={styles.serviceInfo}>
        <ThemedText type="body" style={styles.serviceName}>
          {service.name}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {service.description}
        </ThemedText>
        <View style={styles.waitInfo}>
          <Feather name="clock" size={12} color={theme.textSecondary} />
          <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: 4 }}>
            ~{service.averageWaitTime} min wait
          </ThemedText>
        </View>
      </View>
      {isSelected ? (
        <View style={[styles.checkCircle, { backgroundColor: theme.primary }]}>
          <Feather name="check" size={16} color="#FFFFFF" />
        </View>
      ) : (
        <View style={[styles.radioCircle, { borderColor: theme.border }]} />
      )}
    </AnimatedPressable>
  );
}

export default function ChangeServiceScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { activeQueue, changeService } = useQueue();
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [isChanging, setIsChanging] = useState(false);

  // The mobile joinQueue convention stores the branchId under organizationId
  // (the public /api/join/:branchId endpoint takes a branchId in the URL but
  // the client param was named organizationId). We use the same value here.
  const branchId = activeQueue?.organizationId;
  const branchInfoQuery = useQuery<{ services?: BranchServiceFromApi[] }>({
    queryKey: ["/api/join", branchId],
    enabled: !!branchId,
  });

  const handleSelectService = (service: Service) => {
    if (service.id === activeQueue?.serviceId) return;
    setSelectedService(service);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleConfirmChange = () => {
    if (!selectedService) return;

    Alert.alert(
      "Change Service",
      `Switch to ${selectedService.name}? You'll be placed in a new queue position.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setIsChanging(true);
            try {
              await changeService(selectedService.id, selectedService.name);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              navigation.goBack();
            } catch (e: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert("Could not change service", e?.message || "Please try again.");
            } finally {
              setIsChanging(false);
            }
          },
        },
      ]
    );
  };

  if (!activeQueue) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <EmptyState
          image={require("../../assets/images/empty-queue.png")}
          title="Not in a Queue"
          description="You need to be in a queue to change services."
        />
      </View>
    );
  }

  if (branchInfoQuery.isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (branchInfoQuery.isError) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <EmptyState
          image={require("../../assets/images/empty-queue.png")}
          title="Couldn't load services"
          description="Please check your connection and try again."
        />
      </View>
    );
  }

  const allServices = branchInfoQuery.data?.services || [];
  const availableServices: Service[] = allServices
    .filter((s) => s.id !== activeQueue.serviceId && s.queueStatus !== "ended")
    .map((s) => ({
      id: s.id,
      name: s.name,
      description: s.queueStatus === "paused" ? "Paused — try later" : `${s.currentQueue ?? 0} waiting now`,
      averageWaitTime: s.avgWaitTime ?? 0,
      formFields: [],
    }));

  if (availableServices.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <EmptyState
          image={require("../../assets/images/empty-queue.png")}
          title="No other services"
          description="There are no other services available at this branch right now."
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <FlatList
        data={availableServices}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
            <ServiceCard
              service={item}
              isSelected={selectedService?.id === item.id}
              onSelect={() => handleSelectService(item)}
            />
          </Animated.View>
        )}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={[styles.currentService, { backgroundColor: theme.backgroundDefault }]}>
              <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                Current Service
              </ThemedText>
              <ThemedText type="h4">{activeQueue.serviceName}</ThemedText>
            </View>
            <ThemedText
              type="body"
              style={[styles.subtitle, { color: theme.textSecondary }]}
            >
              Select a new service to join its queue:
            </ThemedText>
          </View>
        }
      />

      {selectedService ? (
        <Animated.View
          entering={FadeInDown.springify()}
          style={[
            styles.footer,
            {
              backgroundColor: theme.backgroundRoot,
              paddingBottom: insets.bottom + Spacing.lg,
            },
          ]}
        >
          <Pressable
            onPress={handleConfirmChange}
            disabled={isChanging}
            style={[
              styles.confirmButton,
              { backgroundColor: theme.primary },
              isChanging && { opacity: 0.5 },
            ]}
          >
            <Feather name="refresh-cw" size={18} color="#FFFFFF" />
            <ThemedText
              type="body"
              style={{ fontWeight: "600", marginLeft: Spacing.sm }}
              lightColor="#FFFFFF"
              darkColor="#FFFFFF"
            >
              Switch to {selectedService.name}
            </ThemedText>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.lg,
  },
  currentService: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  subtitle: {
    marginBottom: Spacing.sm,
  },
  serviceCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontWeight: "600",
    marginBottom: 2,
  },
  waitInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xs,
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.sm,
  },
});
