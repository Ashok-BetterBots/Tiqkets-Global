import { logHandledError } from "@/lib/logger";
import React, { useState, useEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import Animated, { FadeInUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useQueue } from "@/contexts/QueueContext";
import { getErrorMessage } from "@/lib/query-client";
import { Spacing } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type JoinQueueRouteProp = RouteProp<RootStackParamList, "JoinQueue">;

export default function JoinQueueScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<JoinQueueRouteProp>();
  const { theme } = useTheme();
  const { joinQueue } = useQueue();

  const {
    organizationId,
    serviceId,
    formData,
    organizationName: passedOrgName,
    serviceName: passedServiceName,
  } = route.params || {};

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasNavigatedRef = useRef(false);
  const isSubmittingRef = useRef(false);

  const organizationName = passedOrgName || "Organization";
  const serviceName = passedServiceName || "Service";

  const registerQueue = async () => {
    if (!organizationId || !serviceId) {
      navigation.goBack();
      return;
    }

    if (isSubmittingRef.current || hasNavigatedRef.current) {
      return;
    }
    isSubmittingRef.current = true;

    setIsLoading(true);
    setError(null);

    try {
      await joinQueue({
        organizationId,
        organizationName,
        serviceId,
        serviceName,
        formData: formData || {},
        notificationPreferences: {
          inApp: true,
          whatsApp: false,
          sms: false,
        },
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (!hasNavigatedRef.current) {
        hasNavigatedRef.current = true;
        navigation.replace("QueueDetails");
      }
    } catch (err: any) {
      logHandledError("Failed to join queue", err);
      setError(
        getErrorMessage(
          err,
          "We couldn't add you to the queue. Please try again.",
        ),
      );
    } finally {
      isSubmittingRef.current = false;
      setIsLoading(false);
    }
  };

  useEffect(() => {
    registerQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, serviceId]);

  if (isLoading) {
    return (
      <ThemedView
        style={[styles.container, { paddingTop: insets.top + Spacing.xl }]}
      >
        <View style={styles.centerContainer}>
          <Animated.View
            entering={FadeInUp.springify()}
            style={[
              styles.statusIcon,
              { backgroundColor: theme.primary + "15" },
            ]}
          >
            <Feather name="loader" size={48} color={theme.primary} />
          </Animated.View>
          <ThemedText
            type="h4"
            style={{ marginTop: Spacing.xl, textAlign: "center" }}
          >
            Joining Queue...
          </ThemedText>
          <ThemedText
            type="caption"
            style={{
              color: theme.textSecondary,
              marginTop: Spacing.sm,
              textAlign: "center",
            }}
          >
            Please wait while we register you
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView
        style={[styles.container, { paddingTop: insets.top + Spacing.xl }]}
      >
        <View style={styles.centerContainer}>
          <View
            style={[
              styles.statusIcon,
              { backgroundColor: "#EF4444" + "20" },
            ]}
          >
            <Feather name="alert-triangle" size={44} color="#EF4444" />
          </View>
          <ThemedText
            type="h4"
            style={{ marginTop: Spacing.xl, textAlign: "center" }}
          >
            Couldn't Join Queue
          </ThemedText>
          <ThemedText
            type="body"
            style={{
              color: theme.textSecondary,
              marginTop: Spacing.sm,
              textAlign: "center",
            }}
          >
            {error}
          </ThemedText>
          <View style={styles.errorActions}>
            <Button
              onPress={registerQueue}
              style={styles.errorButton}
              testID="button-retry-join"
            >
              Try Again
            </Button>
            <Button
              variant="secondary"
              onPress={() => navigation.goBack()}
              style={styles.errorButton}
              testID="button-cancel-join"
            >
              Go Back
            </Button>
          </View>
        </View>
      </ThemedView>
    );
  }

  // Success state — navigation to QueueDetails has been requested. Render a
  // brief placeholder while the new screen mounts.
  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + Spacing.xl }]}>
      <View style={styles.centerContainer}>
        <Animated.View
          entering={FadeInUp.springify()}
          style={[styles.statusIcon, { backgroundColor: "#10B981" + "20" }]}
        >
          <Feather name="check-circle" size={48} color="#10B981" />
        </Animated.View>
        <ThemedText
          type="h4"
          style={{ marginTop: Spacing.xl, textAlign: "center" }}
        >
          You're in the Queue!
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xl,
  },
  statusIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  errorActions: {
    marginTop: Spacing["2xl"],
    gap: Spacing.md,
    width: "100%",
    maxWidth: 320,
  },
  errorButton: {
    width: "100%",
  },
});
