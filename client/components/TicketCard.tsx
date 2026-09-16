import React, { useEffect, useMemo, useRef, useCallback } from "react";
import { View, StyleSheet, Platform, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from "@/utils/audioCompat";
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
import QRCode from "react-native-qrcode-svg";
import { ThemedText } from "@/components/ThemedText";
import { BrandColors, Spacing, BorderRadius } from "@/constants/theme";

const MAX_PLAY_COUNT = 10;
const PLAY_INTERVAL_MS = 2000;

type TicketStatus =
  | "waiting"
  | "next"
  | "called"
  | "serving"
  | "hold"
  | "completed"
  | "cancelled"
  | "no_show";

interface TicketCardProps {
  ticketId: string;
  ticketNumber: string;
  position: number;
  totalInQueue: number;
  estimatedWaitTime: number;
  status?: TicketStatus;
  organizationName: string;
  serviceName: string;
  joinedAt: string;
  deskName?: string | null;
  tableNumber?: string | null;
  onAcknowledge?: () => void;
  onManagePress?: () => void;
  manageLabel?: string;
}

type StatusKind = "waiting" | "get_ready" | "one_ahead" | "next" | "your_turn" | "serving";

function deriveStatus(
  position: number,
  estimatedWaitTime: number,
  status?: TicketStatus,
): StatusKind {
  if (status === "called") return "your_turn";
  if (status === "serving") return "serving";
  if (position <= 1) return "next";
  if (position === 2) return "one_ahead";
  if (position === 3 || (estimatedWaitTime >= 10 && estimatedWaitTime <= 15)) return "get_ready";
  return "waiting";
}

function statusLabel(kind: StatusKind): { title: string; sub: string } {
  switch (kind) {
    case "your_turn":
      return { title: "It's your turn!", sub: "Tap to acknowledge and stop the alert." };
    case "serving":
      return { title: "Now being served", sub: "Please proceed to the counter." };
    case "next":
      return { title: "You're up next", sub: "Be ready — your turn is moments away." };
    case "one_ahead":
      return { title: "Almost there", sub: "Only one customer ahead of you." };
    case "get_ready":
      return { title: "Get ready", sub: "Your turn is coming up shortly." };
    default:
      return { title: "Waiting in queue", sub: "You'll be notified when it's your turn." };
  }
}

function statusAccent(kind: StatusKind): string {
  switch (kind) {
    case "your_turn":
      return "#22C55E";
    case "serving":
      return "#34D399";
    case "next":
      return "#22C55E";
    case "one_ahead":
      return "#F59E0B";
    case "get_ready":
      return "#A78BFA";
    default:
      return BrandColors.primaryLight;
  }
}

function formatClock(date: Date): { time: string; ampm: string } {
  let h = date.getHours();
  const m = date.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return { time: `${h}:${m.toString().padStart(2, "0")}`, ampm };
}

function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "Now";
  if (minutes < 60) return `~${Math.max(1, Math.round(minutes))} mins`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `~${h}h ${m}m` : `~${h}h`;
}

function formatJoined(joinedAt: string): string {
  try {
    const d = new Date(joinedAt);
    if (Number.isNaN(d.getTime())) return "—";
    const { time, ampm } = formatClock(d);
    return `${time} ${ampm}`;
  } catch {
    return "—";
  }
}

export function TicketCard({
  ticketId,
  ticketNumber,
  position,
  totalInQueue,
  estimatedWaitTime,
  status = "waiting",
  organizationName,
  serviceName,
  joinedAt,
  deskName,
  tableNumber,
  onAcknowledge,
  onManagePress,
  manageLabel = "Manage Queue",
}: TicketCardProps) {
  const kind = deriveStatus(position, estimatedWaitTime, status);
  const isYourTurn = kind === "your_turn";
  const isServing = kind === "serving";

  // Audio + haptics for "your turn"
  const soundRef = useRef<Audio.Sound | null>(null);
  const playCountRef = useRef(0);
  const isPlayingRef = useRef(false);
  const hapticIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAcknowledgedRef = useRef(false);

  // Pulse animation for the queue number when getting close
  const pulse = useSharedValue(1);
  const heroOpacity = useSharedValue(1);
  const progressVal = useSharedValue(0);

  const peopleAhead = Math.max(0, position - 1);
  // Progress = how far along the journey we are. If we don't know the total
  // queue length we approximate using a soft curve so the bar never sits at 0.
  const progress = useMemo(() => {
    if (isYourTurn || isServing) return 1;
    if (totalInQueue && totalInQueue > 0) {
      const done = totalInQueue - position;
      return Math.max(0.04, Math.min(1, done / totalInQueue));
    }
    // Fallback: invert position into a 0..1 curve (1 -> ~0.85, 5 -> ~0.4)
    return Math.max(0.04, Math.min(1, 1 / (1 + position * 0.4)));
  }, [position, totalInQueue, isYourTurn, isServing]);

  const eta = useMemo(() => {
    const arrival = new Date(Date.now() + estimatedWaitTime * 60_000);
    return { ...formatClock(arrival), inMinutes: formatDuration(estimatedWaitTime) };
  }, [estimatedWaitTime]);

  useEffect(() => {
    progressVal.value = withTiming(progress, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [progress, progressVal]);

  useEffect(() => {
    isAcknowledgedRef.current = false;
    if (isYourTurn) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 400, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
      heroOpacity.value = withRepeat(
        withSequence(withTiming(0.75, { duration: 500 }), withTiming(1, { duration: 500 })),
        -1,
        true,
      );
      playAlertSound();
    } else if (kind === "next" || kind === "one_ahead" || kind === "get_ready") {
      pulse.value = withRepeat(
        withSequence(withTiming(1.02, { duration: 1100 }), withTiming(1, { duration: 1100 })),
        -1,
        true,
      );
      heroOpacity.value = 1;
      stopAlertSound();
    } else {
      cancelAnimation(pulse);
      cancelAnimation(heroOpacity);
      pulse.value = 1;
      heroOpacity.value = 1;
      stopAlertSound();
    }
    return () => {
      stopAlertSound();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

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
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      });
      const playOnce = async () => {
        if (
          !isPlayingRef.current ||
          isAcknowledgedRef.current ||
          playCountRef.current >= MAX_PLAY_COUNT
        ) {
          stopAlertSound();
          return;
        }
        try {
          if (soundRef.current) await soundRef.current.unloadAsync();
          const { sound } = await Audio.Sound.createAsync(
            require("../assets/sounds/alert.mp3"),
            { shouldPlay: true, volume: 1.0 },
          );
          soundRef.current = sound;
          sound.setOnPlaybackStatusUpdate((s) => {
            if (s.isLoaded && s.didJustFinish) {
              playCountRef.current++;
              if (Platform.OS !== "web") {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
              if (
                playCountRef.current < MAX_PLAY_COUNT &&
                isPlayingRef.current &&
                !isAcknowledgedRef.current
              ) {
                playTimeoutRef.current = setTimeout(playOnce, PLAY_INTERVAL_MS);
              } else {
                stopAlertSound();
              }
            }
          });
        } catch {
          startHapticLoop();
        }
      };
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playOnce();
    } catch {
      startHapticLoop();
    }
  };

  const startHapticLoop = () => {
    if (hapticIntervalRef.current) return;
    const tick = async () => {
      if (Platform.OS !== "web" && isPlayingRef.current && !isAcknowledgedRef.current) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    };
    tick();
    hapticIntervalRef.current = setInterval(() => {
      if (playCountRef.current >= MAX_PLAY_COUNT || isAcknowledgedRef.current) {
        stopAlertSound();
        return;
      }
      playCountRef.current++;
      tick();
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
      } catch {}
      soundRef.current = null;
    }
  };

  const handleAcknowledge = useCallback(() => {
    isAcknowledgedRef.current = true;
    stopAlertSound();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAcknowledge?.();
  }, [onAcknowledge]);

  const heroAnim = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: heroOpacity.value,
  }));

  const progressAnim = useAnimatedStyle(() => ({
    width: `${Math.round(progressVal.value * 100)}%`,
  }));

  const accent = statusAccent(kind);
  const labels = statusLabel(kind);

  const qrPayload = `tiqkets-ticket:${ticketId}`;

  return (
    <View style={styles.wrap}>
      {/* HERO — pink gradient ticket header */}
      <Pressable disabled={!isYourTurn} onPress={handleAcknowledge}>
        <LinearGradient
          colors={[BrandColors.primary, "#b6207e", BrandColors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          {/* Top mini row */}
          <View style={styles.heroTopRow}>
            <View style={styles.heroTag}>
              <Feather name="bookmark" size={12} color="#FFFFFF" />
              <ThemedText style={styles.heroTagText} lightColor="#FFFFFF" darkColor="#FFFFFF">
                QUEUE TICKET
              </ThemedText>
            </View>
            <View style={styles.posPill}>
              <ThemedText style={styles.posPillNumber} lightColor="#FFFFFF" darkColor="#FFFFFF">
                #{position}
              </ThemedText>
              <ThemedText style={styles.posPillLabel} lightColor="#FFFFFF" darkColor="#FFFFFF">
                Joined Queue Position
              </ThemedText>
            </View>
          </View>

          {/* Hero body: ticket number + ETA */}
          <Animated.View style={[styles.heroBody, heroAnim]}>
            <View style={styles.heroLeft}>
              <ThemedText style={styles.heroLabel} lightColor="#FFFFFF" darkColor="#FFFFFF">
                BOOKING ID
              </ThemedText>
              <ThemedText style={styles.heroNumber} lightColor="#FFFFFF" darkColor="#FFFFFF">
                {ticketNumber}
              </ThemedText>
              <View style={styles.heroAheadRow}>
                <Feather name="users" size={14} color="#FFFFFF" />
                <ThemedText style={styles.heroAhead} lightColor="#FFFFFF" darkColor="#FFFFFF">
                  {peopleAhead === 0
                    ? "You're next"
                    : `${peopleAhead} ${peopleAhead === 1 ? "person" : "people"} ahead`}
                </ThemedText>
              </View>
            </View>

            <View style={styles.heroDivider} />

            <View style={styles.heroRight}>
              <ThemedText style={styles.heroLabel} lightColor="#FFFFFF" darkColor="#FFFFFF">
                ESTIMATED TIME
              </ThemedText>
              <View style={styles.etaTimeRow}>
                <ThemedText style={styles.etaTime} lightColor="#FFFFFF" darkColor="#FFFFFF">
                  {eta.time}
                </ThemedText>
                <ThemedText style={styles.etaAmpm} lightColor="#FFFFFF" darkColor="#FFFFFF">
                  {eta.ampm}
                </ThemedText>
              </View>
              <View style={styles.etaPill}>
                <Feather name="clock" size={12} color="#FFFFFF" />
                <ThemedText style={styles.etaPillText} lightColor="#FFFFFF" darkColor="#FFFFFF">
                  {eta.inMinutes}
                </ThemedText>
              </View>
            </View>
          </Animated.View>
        </LinearGradient>
      </Pressable>

      {/* Perforated divider */}
      <View style={styles.perfRow}>
        <View style={styles.perfNotchLeft} />
        <View style={styles.perfDashWrap}>
          {Array.from({ length: 28 }).map((_, i) => (
            <View key={i} style={styles.perfDot} />
          ))}
        </View>
        <View style={styles.perfNotchRight} />
      </View>

      {/* BODY — dark luxury area */}
      <View style={styles.body}>
        {/* Organization */}
        <ThemedText style={styles.sectionLabel} lightColor="#94A3B8" darkColor="#94A3B8">
          ORGANIZATION
        </ThemedText>
        <View style={styles.orgRow}>
          <View style={styles.orgIcon}>
            <Feather name="home" size={18} color={BrandColors.primaryLight} />
          </View>
          <ThemedText style={styles.orgName} lightColor="#FFFFFF" darkColor="#FFFFFF">
            {organizationName || "Organization"}
          </ThemedText>
        </View>

        {/* Chips: service + joined time */}
        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <View style={styles.chipIconWrap}>
              <Feather name="calendar" size={14} color={BrandColors.primaryLight} />
            </View>
            <View style={styles.chipText}>
              <ThemedText style={styles.chipLabel} lightColor="#94A3B8" darkColor="#94A3B8">
                Service
              </ThemedText>
              <ThemedText
                style={styles.chipValue}
                numberOfLines={1}
                lightColor="#FFFFFF"
                darkColor="#FFFFFF"
              >
                {serviceName || "—"}
              </ThemedText>
            </View>
          </View>
          <View style={styles.chip}>
            <View style={styles.chipIconWrap}>
              <Feather name="clock" size={14} color={BrandColors.primaryLight} />
            </View>
            <View style={styles.chipText}>
              <ThemedText style={styles.chipLabel} lightColor="#94A3B8" darkColor="#94A3B8">
                Joined at
              </ThemedText>
              <ThemedText style={styles.chipValue} lightColor="#FFFFFF" darkColor="#FFFFFF">
                {formatJoined(joinedAt)}
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Progress */}
        <View style={styles.progressBlock}>
          <ThemedText style={styles.sectionLabel} lightColor="#94A3B8" darkColor="#94A3B8">
            QUEUE PROGRESS
          </ThemedText>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, progressAnim]}>
              <LinearGradient
                colors={[BrandColors.primary, "#ff4fb1"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>
          <View style={styles.progressMeta}>
            <View style={styles.progressMetaItem}>
              <Feather name="users" size={13} color={BrandColors.primaryLight} />
              <ThemedText
                style={styles.progressMetaText}
                lightColor="#CBD5E1"
                darkColor="#CBD5E1"
              >
                {peopleAhead === 0 ? "You're up" : `${peopleAhead} ahead`}
              </ThemedText>
            </View>
            <View style={styles.progressMetaItem}>
              <Feather name="clock" size={13} color="#94A3B8" />
              <ThemedText
                style={styles.progressMetaText}
                lightColor="#CBD5E1"
                darkColor="#CBD5E1"
              >
                Estimated {eta.inMinutes.replace("~", "")}
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Status + QR */}
        <View style={styles.statusRow}>
          <View style={[styles.statusCard, { borderColor: accent + "55" }]}>
            <View style={styles.statusHeader}>
              <View style={[styles.statusDot, { backgroundColor: accent }]} />
              <ThemedText style={styles.statusLabel} lightColor="#94A3B8" darkColor="#94A3B8">
                STATUS
              </ThemedText>
            </View>
            <ThemedText style={styles.statusTitle} lightColor="#FFFFFF" darkColor="#FFFFFF">
              {labels.title}
            </ThemedText>
            <ThemedText
              style={styles.statusSub}
              lightColor="#94A3B8"
              darkColor="#94A3B8"
              numberOfLines={2}
            >
              {labels.sub}
            </ThemedText>
            {deskName ? (
              <View style={styles.deskPill}>
                <Feather name="map-pin" size={11} color="#FFFFFF" />
                <ThemedText
                  style={styles.deskPillText}
                  lightColor="#FFFFFF"
                  darkColor="#FFFFFF"
                  numberOfLines={1}
                >
                  {deskName}
                </ThemedText>
              </View>
            ) : null}
            {tableNumber ? (
              <View style={styles.deskPill}>
                <Feather name="grid" size={11} color="#FFFFFF" />
                <ThemedText
                  style={styles.deskPillText}
                  lightColor="#FFFFFF"
                  darkColor="#FFFFFF"
                  numberOfLines={1}
                >
                  Table {tableNumber}
                </ThemedText>
              </View>
            ) : null}
          </View>

          <View style={styles.qrCard}>
            <ThemedText style={styles.qrLabel} lightColor="#94A3B8" darkColor="#94A3B8">
              SCAN AT COUNTER
            </ThemedText>
            <View style={styles.qrFrame}>
              <QRCode
                value={qrPayload}
                size={92}
                color="#0B0D11"
                backgroundColor="#FFFFFF"
              />
            </View>
          </View>
        </View>

        {/* CTA */}
        {onManagePress ? (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              onManagePress();
            }}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            testID="button-manage-queue"
          >
            <LinearGradient
              colors={[BrandColors.primary, "#b6207e"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.ctaInner}>
              <Feather name="sliders" size={16} color="#FFFFFF" />
              <ThemedText style={styles.ctaText} lightColor="#FFFFFF" darkColor="#FFFFFF">
                {manageLabel}
              </ThemedText>
              <Feather name="chevron-right" size={18} color="#FFFFFF" />
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const HERO_RADIUS = BorderRadius.lg;
const BODY_RADIUS = BorderRadius.lg;
const PERF_BG = "#0B0D11";

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    borderRadius: BODY_RADIUS,
    overflow: "hidden",
    backgroundColor: "#13161B",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 8,
  },

  // HERO
  hero: {
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    borderTopLeftRadius: HERO_RADIUS,
    borderTopRightRadius: HERO_RADIUS,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  heroTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroTagText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  posPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
  },
  posPillNumber: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  posPillLabel: {
    fontSize: 10,
    fontWeight: "600",
    opacity: 0.85,
  },

  heroBody: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  heroLeft: {
    flex: 1.15,
    paddingRight: Spacing.md,
  },
  heroDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.35)",
    marginHorizontal: Spacing.md,
  },
  heroRight: {
    flex: 1,
    paddingLeft: Spacing.md,
    alignItems: "flex-end",
  },
  heroLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "700",
    opacity: 0.75,
    marginBottom: 4,
  },
  heroNumber: {
    fontSize: 44,
    lineHeight: 50,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginVertical: 2,
  },
  heroAheadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  heroAhead: {
    fontSize: 13,
    fontWeight: "600",
    opacity: 0.95,
  },

  etaTimeRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  etaTime: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  etaAmpm: {
    fontSize: 16,
    fontWeight: "800",
    marginLeft: 6,
    opacity: 0.95,
  },
  etaPill: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
  },
  etaPillText: {
    fontSize: 12,
    fontWeight: "700",
  },

  // PERF DIVIDER
  perfRow: {
    height: 22,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  perfNotchLeft: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PERF_BG,
    marginLeft: -11,
  },
  perfNotchRight: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PERF_BG,
    marginRight: -11,
  },
  perfDashWrap: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  perfDot: {
    width: 6,
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.18)",
  },

  // BODY
  body: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    backgroundColor: "#13161B",
  },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: "800",
    marginBottom: 8,
  },
  orgRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  orgIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,61,130,0.15)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(168,61,130,0.4)",
  },
  orgName: {
    fontSize: 20,
    fontWeight: "800",
    flex: 1,
  },

  chipRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  chip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#1B1F26",
    borderRadius: BorderRadius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#262B33",
  },
  chipIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(168,61,130,0.15)",
  },
  chipText: { flex: 1 },
  chipLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  chipValue: {
    fontSize: 13,
    fontWeight: "700",
  },

  progressBlock: {
    marginBottom: Spacing.xl,
  },
  progressTrack: {
    height: 10,
    borderRadius: 6,
    backgroundColor: "#23262C",
    overflow: "hidden",
    marginBottom: 10,
  },
  progressFill: {
    height: "100%",
    borderRadius: 6,
    overflow: "hidden",
    shadowColor: BrandColors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  },
  progressMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  progressMetaText: {
    fontSize: 12,
    fontWeight: "700",
  },

  // STATUS + QR
  statusRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  statusCard: {
    flex: 1.4,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    backgroundColor: "#1B1F26",
    borderWidth: 1,
  },
  statusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  statusLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: "800",
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
  },
  statusSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  deskPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: BrandColors.primary,
  },
  deskPillText: {
    fontSize: 11,
    fontWeight: "800",
  },

  qrCard: {
    width: 116,
    padding: 8,
    borderRadius: BorderRadius.sm,
    backgroundColor: "#1B1F26",
    borderWidth: 1,
    borderColor: BrandColors.primary + "66",
    alignItems: "center",
  },
  qrLabel: {
    fontSize: 9,
    letterSpacing: 1,
    fontWeight: "800",
    marginBottom: 6,
    textAlign: "center",
  },
  qrFrame: {
    backgroundColor: "#FFFFFF",
    padding: 6,
    borderRadius: 8,
    width: "100%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // CTA
  cta: {
    height: 52,
    borderRadius: BorderRadius.md,
    overflow: "hidden",
    shadowColor: BrandColors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 6,
  },
  ctaPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  ctaInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: Spacing.lg,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.3,
    flex: 1,
    textAlign: "center",
  },
});
