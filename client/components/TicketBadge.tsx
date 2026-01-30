import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Audio } from "expo-av";
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
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

interface TicketBadgeProps {
  ticketNumber: string;
  position: number;
  estimatedWaitTime: number;
  status?: "waiting" | "next" | "called";
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
  onAcknowledge,
}: TicketBadgeProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const soundRef = useRef<Audio.Sound | null>(null);
  const playCountRef = useRef(0);
  const isPlayingRef = useRef(false);
  const hapticIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const queueStatus = getQueueStatus(position, estimatedWaitTime, status);
  const statusMessage = getStatusMessage(queueStatus);
  const gradientColors = getStatusColor(queueStatus);

  useEffect(() => {
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
    if (isPlayingRef.current) return;
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
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const playOnce = async () => {
        if (!isPlayingRef.current || playCountRef.current >= 5) {
          stopAlertSound();
          return;
        }

        try {
          if (soundRef.current) {
            await soundRef.current.unloadAsync();
          }

          const { sound } = await Audio.Sound.createAsync(
            require("../../assets/audio/turn-alert.wav"),
            { shouldPlay: true }
          );
          soundRef.current = sound;

          sound.setOnPlaybackStatusUpdate((status) => {
            if (status.isLoaded && status.didJustFinish) {
              playCountRef.current++;
              if (Platform.OS !== "web") {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
              setTimeout(playOnce, 1000);
            }
          });
        } catch (error) {
          console.log("Audio playback error:", error);
          startHapticLoop();
        }
      };

      playOnce();
    } catch (error) {
      console.log("Audio setup error:", error);
      startHapticLoop();
    }
  };

  const startHapticLoop = () => {
    if (hapticIntervalRef.current) return;
    
    const playHaptic = async () => {
      if (Platform.OS !== "web" && isPlayingRef.current) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    };
    
    playHaptic();
    hapticIntervalRef.current = setInterval(() => {
      if (playCountRef.current >= 5) {
        stopAlertSound();
        return;
      }
      playCountRef.current++;
      playHaptic();
    }, 2000);
  };

  const stopAlertSound = async () => {
    isPlayingRef.current = false;
    playCountRef.current = 0;

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

  const animatedBadgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const animatedTextStyle = useAnimatedStyle(() => ({
    opacity: queueStatus === "your_turn" ? opacity.value : 1,
  }));

  const showBadge = queueStatus !== "waiting";

  return (
    <View style={styles.container}>
      <Animated.View style={animatedBadgeStyle}>
        <LinearGradient
          colors={gradientColors as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.badge}
        >
          <ThemedText
            type="caption"
            style={styles.label}
            lightColor="rgba(255,255,255,0.8)"
            darkColor="rgba(255,255,255,0.8)"
          >
            TICKET
          </ThemedText>
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
            type={queueStatus === "your_turn" || queueStatus === "next" ? "h4" : "caption"}
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

        {queueStatus !== "your_turn" && queueStatus !== "next" ? (
          <View style={styles.positionRow}>
            <ThemedText type="h2" style={styles.positionNumber}>
              #{position}
            </ThemedText>
            {showBadge ? (
              <View style={[styles.statusBadge, { backgroundColor: gradientColors[0] + "20" }]}>
                <ThemedText
                  type="caption"
                  style={{ color: gradientColors[0], fontWeight: "700" }}
                >
                  {queueStatus === "one_ahead" ? "ALMOST THERE" : "SOON"}
                </ThemedText>
              </View>
            ) : null}
          </View>
        ) : null}

        {queueStatus === "your_turn" ? (
          <Animated.View style={animatedTextStyle}>
            <ThemedText
              type="small"
              style={{ color: Colors.light.accent, textAlign: "center", marginTop: Spacing.sm }}
            >
              Tap to acknowledge
            </ThemedText>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  badge: {
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing["3xl"],
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    minWidth: 160,
    shadowColor: "#1A73E8",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  label: {
    fontWeight: "600",
    letterSpacing: 2,
    marginBottom: Spacing.xs,
  },
  ticketNumber: {
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: 2,
  },
  positionContainer: {
    alignItems: "center",
    marginTop: Spacing.xl,
  },
  statusMessage: {
    fontWeight: "600",
    marginBottom: Spacing.xs,
    textAlign: "center",
  },
  positionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  positionNumber: {
    fontWeight: "700",
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xs,
  },
});
