import React, { useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, Platform, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from "expo-av";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

const MAX_PLAY_COUNT = 10;
const PLAY_INTERVAL_MS = 2000;

interface TicketBadgeProps {
  ticketNumber: string;
  position: number;
  estimatedWaitTime: number;
  status?: "waiting" | "next" | "called" | "serving" | "hold" | "completed" | "cancelled" | "no_show";
  deskName?: string | null;
  tableNumber?: string | null;
  onAcknowledge?: () => void;
}

type QueueStatus = "waiting" | "get_ready" | "one_ahead" | "next" | "your_turn";

function getQueueStatus(position: number, estimatedWaitTime: number, status?: string): QueueStatus {
  if (status === "called") return "your_turn";
  if (position === 1) return "next";
  if (position === 2) return "one_ahead";
  if (position === 3 || (estimatedWaitTime >= 10 && estimatedWaitTime <= 15)) return "get_ready";
  return "waiting";
}

function getStatusMessage(queueStatus: QueueStatus): string {
  switch (queueStatus) {
    case "your_turn":
      return "YOUR TURN!";
    case "next":
      return "NEXT";
    case "one_ahead":
      return "Only one ticket ahead";
    case "get_ready":
      return "Get Ready";
    default:
      return "Position in Queue";
  }
}

function getStatusColor(queueStatus: QueueStatus): [string, string] {
  switch (queueStatus) {
    case "your_turn":
      return [Colors.light.accent, "#FF8F5E"];
    case "next":
      return [Colors.light.success, "#34D399"];
    case "one_ahead":
      return ["#F59E0B", "#FBBF24"];
    case "get_ready":
      return ["#8B5CF6", "#A78BFA"];
    default:
      return [Colors.light.primary, Colors.light.primaryDark];
  }
}

export function TicketBadge({ 
  ticketNumber, 
  position, 
  estimatedWaitTime,
  status = "waiting",
  deskName,
  tableNumber,
  onAcknowledge,
}: TicketBadgeProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const soundRef = useRef<Audio.Sound | null>(null);
  const playCountRef = useRef(0);
  const isPlayingRef = useRef(false);
  const hapticIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const playTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isAcknowledgedRef = useRef(false);

  const queueStatus = getQueueStatus(position, estimatedWaitTime, status);
  const statusMessage = getStatusMessage(queueStatus);
  const gradientColors = getStatusColor(queueStatus);

  useEffect(() => {
    isAcknowledgedRef.current = false;
    
    if (queueStatus === "your_turn") {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 400, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.7, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        true
      );

      playAlertSound();
    } else if (queueStatus === "next" || queueStatus === "one_ahead" || queueStatus === "get_ready") {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.02, { duration: 1000 }),
          withTiming(1, { duration: 1000 })
        ),
        -1,
        true
      );
      opacity.value = 1;
      stopAlertSound();
    } else {
      cancelAnimation(scale);
      cancelAnimation(opacity);
      scale.value = 1;
      opacity.value = 1;
      stopAlertSound();
    }

    return () => {
      stopAlertSound();
    };
  }, [queueStatus]);

  const playAlertSound = async () => {
    if (isPlayingRef.current || isAcknowledgedRef.current) return;
    isPlayingRef.current = true;
    playCountRef.current = 0;

    if (Platform.OS === "web") {
      startHapticLoop();
      return;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: false,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      });

      const playOnce = async () => {
        if (!isPlayingRef.current || isAcknowledgedRef.current || playCountRef.current >= MAX_PLAY_COUNT) {
          stopAlertSound();
          return;
        }

        try {
          if (soundRef.current) {
            await soundRef.current.unloadAsync();
          }

          const { sound } = await Audio.Sound.createAsync(
            require("../assets/sounds/alert.mp3"),
            { shouldPlay: true, volume: 1.0 }
          );
          soundRef.current = sound;

          sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.didJustFinish) {
              playCountRef.current++;
              if (Platform.OS !== "web") {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
              if (playCountRef.current < MAX_PLAY_COUNT && isPlayingRef.current && !isAcknowledgedRef.current) {
                playTimeoutRef.current = setTimeout(playOnce, PLAY_INTERVAL_MS);
              } else {
                stopAlertSound();
              }
            }
          });
        } catch (error) {
          console.log("Audio playback error:", error);
          startHapticLoop();
        }
      };

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playOnce();
    } catch (error) {
      console.log("Audio setup error:", error);
      startHapticLoop();
    }
  };

  const startHapticLoop = () => {
    if (hapticIntervalRef.current) return;
    
    const playHaptic = async () => {
      if (Platform.OS !== "web" && isPlayingRef.current && !isAcknowledgedRef.current) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    };
    
    playHaptic();
    hapticIntervalRef.current = setInterval(() => {
      if (playCountRef.current >= MAX_PLAY_COUNT || isAcknowledgedRef.current) {
        stopAlertSound();
        return;
      }
      playCountRef.current++;
      playHaptic();
    }, PLAY_INTERVAL_MS);
  };

  const stopAlertSound = async () => {
    isPlayingRef.current = false;
    playCountRef.current = 0;

    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }

    if (hapticIntervalRef.current) {
      clearInterval(hapticIntervalRef.current);
      hapticIntervalRef.current = null;
    }

    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (error) {
        console.log("Could not stop alert sound:", error);
      }
      soundRef.current = null;
    }
  };

  const handleAcknowledge = useCallback(() => {
    isAcknowledgedRef.current = true;
    stopAlertSound();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAcknowledge?.();
  }, [onAcknowledge]);

  const animatedBadgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const animatedTextStyle = useAnimatedStyle(() => ({
    opacity: queueStatus === "your_turn" ? opacity.value : 1,
  }));

  const showBadge = queueStatus !== "waiting";

  const badgeContent = (
    <>
      <ThemedText
        type="caption"
        style={styles.ticketLabel}
      >
        Your ticket number is
      </ThemedText>
      <Animated.View style={animatedBadgeStyle}>
        <LinearGradient
          colors={gradientColors as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.badge}
        >
          <ThemedText
            style={styles.ticketNumber}
            lightColor="#FFFFFF"
            darkColor="#FFFFFF"
          >
            {ticketNumber}
          </ThemedText>
        </LinearGradient>
      </Animated.View>

      <View style={styles.positionContainer}>
        <Animated.View style={animatedTextStyle}>
          <ThemedText
            type={queueStatus === "your_turn" || queueStatus === "next" ? "h4" : "body"}
            style={[
              styles.statusMessage,
              queueStatus === "your_turn" && { color: Colors.light.accent },
              queueStatus === "next" && { color: Colors.light.success },
              queueStatus === "one_ahead" && { color: "#F59E0B" },
              queueStatus === "get_ready" && { color: "#8B5CF6" },
            ]}
          >
            {statusMessage}
          </ThemedText>
        </Animated.View>

        {showBadge && queueStatus !== "your_turn" && queueStatus !== "next" ? (
          <View style={[styles.statusBadge, { backgroundColor: gradientColors[0] + "15" }]}>
            <ThemedText
              type="caption"
              style={{ color: gradientColors[0], fontWeight: "600" }}
            >
              {queueStatus === "one_ahead" ? "ALMOST THERE" : "GET READY"}
            </ThemedText>
          </View>
        ) : null}

        {queueStatus === "your_turn" && deskName ? (
          <View style={styles.deskInfoContainer}>
            <Feather name="map-pin" size={14} color={Colors.light.accent} />
            <ThemedText
              type="body"
              style={{ color: Colors.light.accent, fontWeight: "700", marginLeft: Spacing.xs }}
            >
              {deskName}
            </ThemedText>
          </View>
        ) : null}

        {queueStatus === "your_turn" && tableNumber ? (
          <View style={styles.tableInfoContainer}>
            <Feather name="grid" size={16} color={Colors.light.success} />
            <ThemedText
              type="body"
              style={{ color: Colors.light.success, fontWeight: "700", marginLeft: Spacing.sm }}
            >
              Proceed to Table {tableNumber}
            </ThemedText>
          </View>
        ) : null}

        {queueStatus === "your_turn" ? (
          <Animated.View style={animatedTextStyle}>
            <ThemedText
              type="small"
              style={{ color: Colors.light.accent, textAlign: "center", marginTop: Spacing.sm }}
            >
              Tap to stop alert
            </ThemedText>
          </Animated.View>
        ) : null}
      </View>
    </>
  );

  if (queueStatus === "your_turn") {
    return (
      <Pressable onPress={handleAcknowledge} style={styles.container}>
        {badgeContent}
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      {badgeContent}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  badge: {
    paddingVertical: Spacing["2xl"],
    paddingHorizontal: Spacing["4xl"],
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    minWidth: 200,
    shadowColor: "#1A73E8",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  ticketLabel: {
    fontWeight: "500",
    marginBottom: Spacing.sm,
    opacity: 0.7,
  },
  ticketNumber: {
    fontSize: 42,
    fontWeight: "700",
    letterSpacing: 3,
    lineHeight: 50,
  },
  positionContainer: {
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  statusMessage: {
    fontWeight: "600",
    marginBottom: Spacing.xs,
    textAlign: "center",
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
    marginTop: Spacing.xs,
  },
  deskInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.light.accent + "15",
  },
  tableInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.light.success + "15",
  },
});
