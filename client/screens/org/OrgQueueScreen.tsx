import { logHandledError } from "@/lib/logger";
import React, { useState, useMemo, useCallback } from "react";
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
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, Layout, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from "react-native-reanimated";
import { useEffect } from "react";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { BottomSheetModal } from "@/components/BottomSheetModal";
import { Colors, Spacing, BorderRadius, Shadows, headingFont } from "@/constants/theme";
import { OrgDesign } from "@/constants/orgDesign";
import { useOrganization } from "@/contexts/OrganizationContext";
import { RequirePermission, usePermission } from "@/components/RequirePermission";
import { useColorScheme } from "react-native";
import { QueueCustomer } from "@/types/organization";
import { OrgStackParamList } from "@/navigation/OrgStackNavigator";

type NavigationProp = NativeStackNavigationProp<OrgStackParamList>;

type FilterStatus = "waiting" | "completed";

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
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isCalled = customer.status === "called";
  const isAcknowledged = isCalled && !!customer.acknowledgedAt;
  const canShowCallNext = isFirstWaiting && !isSelectiveMode;
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
      case "cancelled":
        return "Cancelled";
      default:
        return `Position ${customer.position}`;
    }
  };

  const getStatusColor = () => {
    switch (customer.status) {
      case "called":
        return customer.acknowledgedAt ? "#10B981" : colors.primary;
      case "serving":
        return colors.success;
      case "completed":
        return "#6B7280";
      case "no_show":
        return "#EF4444";
      case "cancelled":
        return "#F43F5E";
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

  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const hasExpandableDetails = !!customer.customerPhone || formDataEntries.length > 0;

  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} layout={Layout}>
      <Card variant="outlined" style={StyleSheet.flatten([
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
        <View style={styles.customerHeader}>
          <View style={styles.ticketInfo}>
            {isAcknowledged ? (
              <Animated.View style={[styles.ackPulseCircle, ackPulseStyle]} />
            ) : null}
            <View style={styles.ticketBadge}>
              <ThemedText style={styles.ticketNumber}>
                {customer.ticketNumber}
              </ThemedText>
            </View>
            {getPriorityBadge()}
            {getSkipBadge()}
          </View>
          <View style={[styles.statusBadge, customer.status !== "waiting" ? { backgroundColor: getStatusColor() + "15" } : undefined]}>
            {customer.status !== "waiting" ? (
              <View style={{ width: 6, height: 6, borderRadius: 3, marginRight: 5, backgroundColor: getStatusColor() }} />
            ) : null}
            <ThemedText style={styles.statusText}>
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
            <View style={styles.metaItem}>
              <Feather name="clock" size={11} color={colors.textSecondary} />
              <ThemedText style={[styles.metaText, { color: colors.textSecondary }]}>{waitTime} min waiting</ThemedText>
            </View>
            <View style={styles.serviceTag}>
              <Feather name="tag" size={11} color={colors.primary} />
              <ThemedText style={[styles.serviceText, { color: colors.primary }]}>{customer.serviceName}</ThemedText>
            </View>
            {customer.deskName ? (
              <View style={[styles.metaItem, { backgroundColor: colors.secondary + "12" }]}>
                <Feather name="monitor" size={11} color={colors.secondary} />
                <ThemedText style={[styles.metaText, { color: colors.secondary }]}>{customer.deskName}</ThemedText>
              </View>
            ) : null}
          </View>
        </View>

        {hasExpandableDetails ? (
          <Pressable
            onPress={() => setDetailsExpanded((v) => !v)}
            style={styles.detailsToggle}
            hitSlop={6}
          >
            <Feather
              name={detailsExpanded ? "chevron-up" : "chevron-down"}
              size={13}
              color={colors.textSecondary}
            />
            <ThemedText style={styles.detailsToggleText}>
              {detailsExpanded ? "Hide details" : "View details"}
            </ThemedText>
          </Pressable>
        ) : null}

        {detailsExpanded && hasExpandableDetails ? (
          <View style={styles.formDataSection}>
            <View style={styles.formDataGrid}>
              {customer.customerPhone ? (
                <View style={styles.formDataItem}>
                  <ThemedText style={[styles.formDataLabel, { color: colors.textSecondary }]}>Phone</ThemedText>
                  <ThemedText style={[styles.formDataValue, { color: colors.text }]}>
                    {customer.customerPhone}
                  </ThemedText>
                </View>
              ) : null}
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

        <View style={[styles.customerActions, { borderTopColor: colors.borderSubtle }]}>
          {customer.status === "waiting" && isSelectiveMode ? (
            <RequirePermission permission="org.queue.call_specific">
              <Button
                title="Call Now"
                onPress={onCall}
                size="small"
                style={styles.actionButton}
              />
            </RequirePermission>
          ) : null}
          {customer.status === "waiting" && !isSelectiveMode && canShowCallNext ? (
            <RequirePermission permission="org.queue.call_next">
              <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)}>
                <Pressable
                  onPress={onCallNext}
                  style={({ pressed }) => [
                    styles.callNextSolid,
                    pressed && { opacity: 0.9 },
                  ]}
                  testID="button-call-next-card"
                >
                  <Feather name="volume-2" size={16} color="#FFFFFF" />
                  <ThemedText style={styles.callNextSolidText}>Call Now</ThemedText>
                </Pressable>
              </Animated.View>
            </RequirePermission>
          ) : null}
          {customer.status === "called" ? (
            <Animated.View entering={FadeIn.duration(300).delay(100)} exiting={FadeOut.duration(200)}>
              <View style={styles.calledActions}>
                <RequirePermission permission="org.queue.complete">
                  <Button
                    title="Complete"
                    onPress={onComplete}
                    icon={<Feather name="check-circle" size={18} color="#FFFFFF" />}
                    style={styles.completeButtonPrimary}
                  />
                </RequirePermission>
                <View style={styles.secondaryButtonRow}>
                  <RequirePermission permission="org.queue.call_again">
                    <Button
                      title="Call Again"
                      onPress={onCallAgain}
                      size="small"
                      variant="outline"
                      icon={<Feather name="phone-call" size={14} color={colors.primary} />}
                      style={styles.callAgainButton}
                    />
                  </RequirePermission>
                  <RequirePermission permission="org.queue.skip">
                    <Button
                      title="Skip"
                      onPress={onSkip}
                      size="small"
                      variant="ghost"
                      icon={<Feather name="skip-forward" size={14} color={colors.accent} />}
                      style={[styles.skipButton, { backgroundColor: colors.accent + "10" }]}
                    />
                  </RequirePermission>
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
              <Feather name="user-x" size={14} color="#EF4444" />
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

// ---------------------------------------------------------------------------
// FIFO-mode customer card. A dedicated layout (separate from the generic
// CustomerCard) that matches the approved FIFO design: a ticket-number badge,
// name + position pill, registered time, and — for the first waiting customer
// — an inline action grid (Call Now / No Show / Start-Done and Skip / Transfer
// / Cancel) plus a chevron toggle that reveals the customer's submitted fields.
// ---------------------------------------------------------------------------
interface FifoCardProps {
  customer: QueueCustomer;
  expanded: boolean;
  tab: "waiting" | "hold" | "completed";
  displayPosition: number;
  inputFields: { id: string; label: string }[];
  onCallNow: () => void;
  onStart: () => void;
  onDone: () => void;
  onNoShow: () => void;
  onResume: () => void;
  onSkip: () => void;
  onTransfer: () => void;
  onCancel: () => void;
  /** Selective mode: show action buttons on every waiting card */
  isAllExpanded?: boolean;
  /** Override "Call Now" label (e.g. "Call" for selective) */
  callLabel?: string;
  /** Multi-stage: when serving, show "Move to …" instead of Done */
  onMoveStage?: () => void;
  moveStageLabel?: string;
  /** Show a "→ Moved to [service]" badge on completed cards */
  movedToService?: string;
}

function formatRegisteredTime(value: string | Date) {
  try {
    return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatWaitDuration(value: string | Date) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function FifoCard({
  customer,
  expanded,
  tab,
  displayPosition,
  inputFields,
  onCallNow,
  onStart,
  onDone,
  onNoShow,
  onResume,
  onSkip,
  onTransfer,
  onCancel,
  isAllExpanded,
  callLabel,
  onMoveStage,
  moveStageLabel,
  movedToService,
}: FifoCardProps) {
  const isTerminal = tab === "completed";
  const isHold = tab === "hold";
  const isServing = customer.status === "serving";
  const [showFields, setShowFields] = useState(false);

  const getFieldLabel = (fieldId: string) => inputFields.find((f) => f.id === fieldId)?.label || fieldId;
  const formDataEntries = Object.entries(customer.formData || {}).filter(
    ([key, value]) =>
      value !== undefined &&
      value !== null &&
      value !== "" &&
      !HIDDEN_FORM_KEYS.includes(key) &&
      // suppress phone-field entries that duplicate the top-level customerPhone
      !(customer.customerPhone && String(value) === String(customer.customerPhone))
  );
  const hasFields = !!customer.customerPhone || formDataEntries.length > 0;

  // Selective mode: show actions on every non-terminal/non-hold card.
  const showActions = (expanded || (isAllExpanded && !isTerminal && !isHold));

  return (
    <Animated.View
      entering={FadeIn}
      exiting={FadeOut}
      layout={Layout}
      style={[fifoStyles.card, (expanded || (isAllExpanded && !isTerminal && !isHold)) ? fifoStyles.cardExpanded : undefined]}
    >
      <View style={fifoStyles.topRow}>
        <View style={fifoStyles.ticketBadge}>
          <ThemedText style={fifoStyles.ticketBadgeText} numberOfLines={1}>{customer.ticketNumber}</ThemedText>
        </View>
        <View style={fifoStyles.centerCol}>
          <View style={fifoStyles.nameRow}>
            <ThemedText style={fifoStyles.name} numberOfLines={1}>
              {customer.customerName || "Guest"}
            </ThemedText>
            <View style={fifoStyles.posPill}>
              <ThemedText style={fifoStyles.posText}>Pos {displayPosition}</ThemedText>
            </View>
          </View>
          {customer.customerPhone ? (
            <ThemedText style={fifoStyles.phone} numberOfLines={1}>
              {customer.customerPhone}
            </ThemedText>
          ) : null}
          {/* Multi-stage: show "→ Moved to [service]" on completed cards */}
          {isTerminal && movedToService ? (
            <View style={fifoStyles.movedBadge}>
              <Feather name="arrow-right-circle" size={12} color="#8B5CF6" />
              <ThemedText style={fifoStyles.movedText}>Moved to {movedToService}</ThemedText>
            </View>
          ) : null}
        </View>
        <View style={fifoStyles.rightCol}>
          <View style={fifoStyles.regTimeRow}>
            <Feather name="clock" size={12} color={OrgDesign.muted} />
            <ThemedText style={fifoStyles.regTime}>{formatRegisteredTime(customer.joinedAt)}</ThemedText>
          </View>
          {isTerminal ? (
            <View style={[fifoStyles.terminalPill, {
              backgroundColor:
                customer.status === "cancelled" ? "#FFF1F2" :
                customer.status === "no_show" ? "#FEF2F2" :
                "#F3F4F6",
            }]}>
              <ThemedText style={[fifoStyles.terminalPillText, {
                color:
                  customer.status === "cancelled" ? "#F43F5E" :
                  customer.status === "no_show" ? "#EF4444" :
                  "#6B7280",
              }]}>
                {customer.status === "cancelled" ? "Cancelled" :
                 customer.status === "no_show" ? "No Show" :
                 "Completed"}
              </ThemedText>
            </View>
          ) : (
            <View style={fifoStyles.waitPill}>
              <ThemedText style={fifoStyles.waitText}>{formatWaitDuration(customer.joinedAt)} waiting</ThemedText>
            </View>
          )}
        </View>
      </View>

      {isHold ? (
        <View style={fifoStyles.holdRow}>
          <Pressable style={fifoStyles.resumeBtn} onPress={onResume} testID={`fifo-resume-${customer.id}`}>
            <Feather name="play" size={15} color="#FFFFFF" />
            <ThemedText style={fifoStyles.resumeText}>Resume</ThemedText>
          </Pressable>
        </View>
      ) : null}

      {showActions ? (
        <>
          <View style={fifoStyles.divider} />

          <View style={fifoStyles.actionRow}>
            <Pressable style={[fifoStyles.actBtn, fifoStyles.actCall]} onPress={onCallNow} testID={`fifo-call-${customer.id}`}>
              <Feather name="phone" size={15} color="#FFFFFF" />
              <ThemedText style={[fifoStyles.actText, { color: "#FFFFFF" }]}>{callLabel ?? "Call Now"}</ThemedText>
            </Pressable>
            {/* Multi-stage serving: show Move to Stage or Complete Journey */}
            {isServing && onMoveStage ? (
              <Pressable
                style={[fifoStyles.actBtn, fifoStyles.actMoveStage]}
                onPress={onMoveStage}
                testID={`fifo-movestage-${customer.id}`}
              >
                <Feather name="send" size={15} color="#FFFFFF" />
                <ThemedText style={[fifoStyles.actText, { color: "#FFFFFF" }]} numberOfLines={1}>
                  {moveStageLabel ?? "Move"}
                </ThemedText>
              </Pressable>
            ) : (
              <Pressable
                style={[fifoStyles.actBtn, isServing ? fifoStyles.actDone : fifoStyles.actStart]}
                onPress={isServing ? onDone : onStart}
                testID={`fifo-startdone-${customer.id}`}
              >
                <Feather name={isServing ? "check" : "play"} size={15} color="#FFFFFF" />
                <ThemedText style={[fifoStyles.actText, { color: "#FFFFFF" }]}>{isServing ? "Done" : "Start"}</ThemedText>
              </Pressable>
            )}
            <Pressable style={[fifoStyles.actBtn, fifoStyles.actOutline]} onPress={onSkip} testID={`fifo-skip-${customer.id}`}>
              <Feather name="skip-forward" size={15} color="#6B7280" />
              <ThemedText style={[fifoStyles.actText, { color: "#6B7280" }]}>Skip</ThemedText>
            </Pressable>
          </View>
          <View style={fifoStyles.actionRow}>
            <Pressable style={[fifoStyles.actBtn, fifoStyles.actOutline]} onPress={onTransfer} testID={`fifo-transfer-${customer.id}`}>
              <Feather name="repeat" size={15} color="#6B7280" />
              <ThemedText style={[fifoStyles.actText, { color: "#6B7280" }]}>Transfer</ThemedText>
            </Pressable>
            <Pressable style={[fifoStyles.actBtn, fifoStyles.actNoShow]} onPress={onNoShow} testID={`fifo-noshow-${customer.id}`}>
              <Feather name="user-x" size={15} color="#DC2626" />
              <ThemedText style={[fifoStyles.actText, { color: "#DC2626" }]}>No Show</ThemedText>
            </Pressable>
            <Pressable style={[fifoStyles.actBtn, fifoStyles.actCancel]} onPress={onCancel} testID={`fifo-cancel-${customer.id}`}>
              <Feather name="x" size={15} color="#DC2626" />
              <ThemedText style={[fifoStyles.actText, { color: "#DC2626" }]}>Cancel</ThemedText>
            </Pressable>
          </View>

          {hasFields ? (
            <>
              <Pressable
                style={fifoStyles.fieldsToggle}
                onPress={() => setShowFields((v) => !v)}
                hitSlop={6}
                testID={`fifo-fields-toggle-${customer.id}`}
              >
                <Feather name={showFields ? "chevron-up" : "chevron-down"} size={20} color={OrgDesign.primary} />
              </Pressable>
              {showFields ? (
                <View style={fifoStyles.fieldsBox}>
                  {customer.customerPhone ? (
                    <View style={fifoStyles.fieldRow}>
                      <ThemedText style={fifoStyles.fieldLabel}>Phone</ThemedText>
                      <ThemedText style={fifoStyles.fieldValue}>{customer.customerPhone}</ThemedText>
                    </View>
                  ) : null}
                  {formDataEntries.map(([key, value]) => (
                    <View key={key} style={fifoStyles.fieldRow}>
                      <ThemedText style={fifoStyles.fieldLabel}>{getFieldLabel(key)}</ThemedText>
                      <ThemedText style={fifoStyles.fieldValue}>
                        {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </Animated.View>
  );
}

const fifoStyles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: OrgDesign.cardRadius,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F0ECF4",
    ...OrgDesign.cardShadow,
  },
  cardExpanded: {
    borderWidth: 2,
    borderColor: OrgDesign.primary,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  centerCol: {
    flex: 1,
    paddingRight: 8,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  name: {
    fontFamily: OrgDesign.fonts.bold,
    fontSize: 15,
    color: OrgDesign.text,
    flexShrink: 1,
  },
  phone: {
    fontFamily: OrgDesign.fonts.regular,
    fontSize: 12.5,
    color: OrgDesign.muted,
    marginTop: 3,
  },
  rightCol: {
    alignItems: "flex-end",
    gap: 6,
  },
  posPill: {
    backgroundColor: "#EEEDFF",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
  },
  posText: {
    fontFamily: OrgDesign.fonts.semibold,
    fontSize: 11,
    color: "#5B4FC7",
  },
  divider: {
    height: 1,
    backgroundColor: "#F0ECF4",
    marginTop: 16,
    marginBottom: 14,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  actBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    height: 40,
    borderRadius: 12,
  },
  actText: {
    fontFamily: OrgDesign.fonts.semibold,
    fontSize: 12.5,
  },
  actCall: {
    backgroundColor: OrgDesign.primary,
  },
  actDone: {
    backgroundColor: "#22C55E",
  },
  actOutline: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  actCancel: {
    backgroundColor: "#FEE2E2",
  },
  holdRow: {
    marginTop: 14,
  },
  resumeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 40,
    borderRadius: 12,
    backgroundColor: OrgDesign.primary,
  },
  resumeText: {
    fontFamily: OrgDesign.fonts.semibold,
    fontSize: 13,
    color: "#FFFFFF",
  },
  ticketBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: OrgDesign.primaryTint,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  ticketBadgeText: {
    fontFamily: OrgDesign.fonts.bold,
    fontSize: 14,
    color: OrgDesign.primary,
  },
  regTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  regTime: {
    fontFamily: OrgDesign.fonts.semibold,
    fontSize: 13,
    color: OrgDesign.text,
  },
  waitPill: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
  },
  waitText: {
    fontFamily: OrgDesign.fonts.semibold,
    fontSize: 11,
    color: "#B45309",
  },
  terminalPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
  },
  terminalPillText: {
    fontFamily: OrgDesign.fonts.semibold,
    fontSize: 11,
  },
  actNoShow: {
    backgroundColor: "#FEE2E2",
  },
  actStart: {
    backgroundColor: OrgDesign.primary,
  },
  actMoveStage: {
    backgroundColor: "#8B5CF6",
  },
  movedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  movedText: {
    fontFamily: OrgDesign.fonts.semibold,
    fontSize: 11.5,
    color: "#8B5CF6",
  },
  fieldsToggle: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 2,
  },
  fieldsBox: {
    backgroundColor: "#FAF9FC",
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginTop: 4,
  },
  fieldRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  fieldLabel: {
    fontFamily: OrgDesign.fonts.regular,
    fontSize: 12.5,
    color: OrgDesign.muted,
    flexShrink: 0,
  },
  fieldValue: {
    fontFamily: OrgDesign.fonts.semibold,
    fontSize: 12.5,
    color: OrgDesign.text,
    flex: 1,
    textAlign: "right",
  },
});

// Synthetic form-field key used by the manual / add-to-queue modals to
// collect the customer's full name when the selected service does not
// already define a name field. Kept off the normal field id namespace
// (double-underscore prefix) so it can't collide with a real field id.
const MANUAL_NAME_FIELD_KEY = "__fullName";

// Heuristics for recognising the "default" dine-in fields so the card and
// the manual-add form can treat them specially (party size, gender,
// share-table / split-table preferences) and hide everything else behind a
// "More" expander.
const isShareTableField = (label: string = "") =>
  /shar/i.test(label) && /(table|guest|seat)/i.test(label);
const isSplitTableField = (label: string = "") => /split/i.test(label);
// Party-size detection is intentionally specific so unrelated labels that
// merely mention "guests" (e.g. "Share table with other guests") are not
// misread as a party-size field. Share/split labels are also excluded.
const isPartySizeField = (label: string = "", key: string = "") => {
  if (key === "partySize") return true;
  if (isShareTableField(label) || isSplitTableField(label)) return false;
  return /party\s*size|member\s*count|\bpax\b|(?:number|no\.?|#)\s*of\s*(?:people|guests|persons|pax)|people\s*count|head\s*count/i.test(label);
};
const isNameLikeField = (label: string = "") => /name/i.test(label);
const isGenderField = (label: string = "") => /gender|sex\b/i.test(label);
// Coerce the many shapes a "yes/true" answer can take into a boolean.
const isTruthyAnswer = (v: any) =>
  v === true || v === 1 || /^(yes|true|y|1)$/i.test(String(v ?? "").trim());
// Keys that should never be surfaced to staff.
const HIDDEN_FORM_KEYS = ["orderSource", "orderId", "notes", MANUAL_NAME_FIELD_KEY];

export default function OrgQueueScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const colors = isDark ? Colors.dark : Colors.light;
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate("QueueScanner")}
          style={{ marginRight: Spacing.sm, padding: 8 }}
          hitSlop={8}
          testID="button-open-queue-scanner"
        >
          <Feather name="camera" size={21} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, colors.primary]);
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
    updateCustomerDetails,
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
    setQueueStatusFor,
    refreshOrganizationData,
    selectedBranchId,
    setSelectedBranchId,
    selectedServiceId,
    setSelectedServiceId,
    liveBranchMeta,
  } = useOrganization();

  // Re-pull org/branch data on focus so queue mode changes from the web
  // dashboard or another admin device propagate without a relogin.
  // Also snap to a concrete branch+service — "All Branches"/"All Services"
  // are only valid on the Overview page.
  useFocusEffect(
    useCallback(() => {
      void refreshOrganizationData();
      const branches = getAccessibleBranches();
      const firstBranch = branches[0];
      if (!selectedBranchId && firstBranch) {
        setSelectedBranchId(firstBranch.id);
        const firstService = firstBranch.services?.filter(s => s.isActive)?.[0];
        if (firstService) setSelectedServiceId(firstService.id);
      } else if (selectedBranchId && !selectedServiceId) {
        const branch = branches.find(b => b.id === selectedBranchId) || firstBranch;
        const firstService = branch?.services?.filter(s => s.isActive)?.[0];
        if (firstService) setSelectedServiceId(firstService.id);
      }
    }, [refreshOrganizationData, selectedBranchId, selectedServiceId, setSelectedBranchId, setSelectedServiceId, getAccessibleBranches])
  );

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("waiting");
  const [fifoTab, setFifoTab] = useState<"waiting" | "hold" | "completed">("waiting");
  const [checkInTab, setCheckInTab] = useState<"waiting" | "checkedin" | "noshow">("waiting");
  const [msTab, setMsTab] = useState<"waiting" | "completed">("waiting");
  const [showMoveStageModal, setShowMoveStageModal] = useState(false);
  const [moveStageTargetId, setMoveStageTargetId] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState<QueueCustomer | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [ticketInput, setTicketInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastCheckIn, setLastCheckIn] = useState<{ ticketNumber: string; name: string; time: string } | null>(null);

  const [takeawayTab, setTakeawayTab] = useState<"active" | "ready" | "delivered">("active");
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);

  const [newOrderId, setNewOrderId] = useState("");
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [counterOrderCount, setCounterOrderCount] = useState(1);
  
  // Dine In mode state
  const [dineInTab, setDineInTab] = useState<"waiting" | "assigned" | "hold" | "done">("waiting");
  const [showManualRegistrationModal, setShowManualRegistrationModal] = useState(false);
  const [manualRegistrationFormData, setManualRegistrationFormData] = useState<Record<string, any>>({});
  const [isRegistering, setIsRegistering] = useState(false);
  // manualExtraExpanded removed — all fields now always visible (no "More details" toggle)
  const [manualRegistrationWhatsApp, setManualRegistrationWhatsApp] = useState<string>("");
  const [manualRegistrationLang, setManualRegistrationLang] = useState<"en" | "ta">("en");
  const [expandedDineInCards, setExpandedDineInCards] = useState<Record<string, boolean>>({});
  const [showTableAllocationModal, setShowTableAllocationModal] = useState(false);
  const [selectedCustomerForTable, setSelectedCustomerForTable] = useState<QueueCustomer | null>(null);
  const [tableNumberInput, setTableNumberInput] = useState("");
  const [isAllocatingTable, setIsAllocatingTable] = useState(false);
  const [morePopupCustomer, setMorePopupCustomer] = useState<QueueCustomer | null>(null);
  const [editCustomer, setEditCustomer] = useState<QueueCustomer | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, any>>({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Multi-stage mode state
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [selectedStageIndex, setSelectedStageIndex] = useState(0);
  const [multiStageBranchId, setMultiStageBranchId] = useState<string | null>(null);
  const accessibleBranches = getAccessibleBranches();

  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(null);
  const [showStationModal, setShowStationModal] = useState(false);
  const [stationStep, setStationStep] = useState<"branch" | "service" | "desk">("branch");

  // Manual Add to Queue state
  const [showAddToQueueModal, setShowAddToQueueModal] = useState(false);
  const [addToQueueServiceId, setAddToQueueServiceId] = useState<string>("");
  const [addToQueueFormData, setAddToQueueFormData] = useState<Record<string, any>>({});
  const [addToQueueWhatsApp, setAddToQueueWhatsApp] = useState<string>("");
  const [addToQueueLang, setAddToQueueLang] = useState<"en" | "ta">("en");
  const [isAddingToQueue, setIsAddingToQueue] = useState(false);

  const [showQueueStatusPicker, setShowQueueStatusPicker] = useState(false);
  const [queueStatusLoading, setQueueStatusLoading] = useState(false);

  // Complete-all-active (shown only when the booking is closed)
  const [showCompleteAllModal, setShowCompleteAllModal] = useState(false);
  const [completeAllConfirmText, setCompleteAllConfirmText] = useState("");
  const [completeAllLoading, setCompleteAllLoading] = useState(false);
  const canCompleteQueue = usePermission("org.queue.complete");

  const currentBranchId = selectedBranchId || accessibleBranches[0]?.id || branches[0]?.id;

  const refreshQueueRef = React.useRef(refreshQueueForBranch);
  refreshQueueRef.current = refreshQueueForBranch;

  // Focus-scoped so it only polls while the Queue screen is actually visible.
  // This also prevents it overlapping with the Home tab's own queue poll —
  // tabs are mutually exclusive in focus, so exactly one screen polls at a time.
  useFocusEffect(
    useCallback(() => {
      if (!currentBranchId) return;
      // Pull fresh queue data immediately on focus (not only every 8s) so a
      // transaction processed on the web dashboard shows up the moment this
      // screen is opened or refocused.
      refreshQueueRef.current(currentBranchId);
      const interval = setInterval(() => {
        refreshQueueRef.current(currentBranchId);
      }, 8000);
      return () => clearInterval(interval);
    }, [currentBranchId])
  );
  const currentBranch = branches.find(b => b.id === currentBranchId);

  // Live meta (mode/services/journeys) from the queue poll — the authoritative
  // source for queue mode. Stored in a separate state so it never touches the
  // `branches` state that getAccessibleBranches depends on, preventing the
  // cascading useFocusEffect loop that caused the FIFO revert.
  const currentBranchLiveMeta = liveBranchMeta[currentBranchId || ""];
  const multiStageBranch = branches.find((b) => b.id === (multiStageBranchId || accessibleBranches[0]?.id));
  const journeys = (currentBranchLiveMeta?.journeys ?? multiStageBranch?.journeys ?? []).filter((j: any) => j.isActive);
  const selectedJourney = journeys.find((j: any) => j.id === selectedJourneyId) || journeys[0];

  const canSelectBranch = accessibleBranches.length > 1;
  const servicesForBranch = (() => {
    const branchSvcs = currentBranch?.services?.filter(s => s.isActive) || [];
    if (currentUser?.assignedServiceIds && currentUser.assignedServiceIds.length > 0) {
      return branchSvcs.filter(s => currentUser.assignedServiceIds!.includes(s.id));
    }
    return branchSvcs;
  })();
  const canSelectService = !(currentUser?.assignedServiceIds?.length === 1) && servicesForBranch.length > 1;

  // Queue operations need a concrete service, but the shared state may have
  // "All Services" (null). Use a local effective service for queue ops without
  // overwriting the shared selection.
  const effectiveServiceId = selectedServiceId || servicesForBranch[0]?.id || null;
  const effectiveService = servicesForBranch.find(s => s.id === effectiveServiceId);

  const branchQueueMode = (() => {
    // Live meta from the queue poll is the most up-to-date source — it's
    // cache-busted on every 8-second tick and reflects web-dashboard changes
    // without the cascade side-effect of mutating `branches`.
    if (currentBranchLiveMeta) {
      // Check per-service override first (same precedence as branches path).
      const liveServiceMode = effectiveServiceId
        ? currentBranchLiveMeta.services?.find((s: any) => s.id === effectiveServiceId)
            ?.serviceSettings?.queueMode
        : null;
      if (liveServiceMode) return liveServiceMode;
      if (currentBranchLiveMeta.settings?.queueMode) return currentBranchLiveMeta.settings.queueMode;
    }
    // Fallback: branch state (from refreshOrganizationData) before first poll.
    const branchDefault = currentBranch?.settings?.queueMode || organization?.settings?.queueMode;
    if (effectiveServiceId && currentBranch) {
      const svc = currentBranch.services?.find(s => s.id === effectiveServiceId);
      if (svc?.serviceSettings?.queueMode) {
        return svc.serviceSettings.queueMode;
      }
    }
    return branchDefault;
  })();
  const isSelectiveMode = branchQueueMode === "selective";
  const isFifoMode = branchQueueMode === "fifo";
  const isCheckInMode = branchQueueMode === "checkin";
  const isTakeawayMode = branchQueueMode === "takeaway";
  const isDineInMode = branchQueueMode === "dinein";
  const isMultiStageMode = branchQueueMode === "multistage";
  const branchServices = currentBranch?.services?.filter(s => s.isActive) || [];
  const selectedAddService = branchServices.find(s => s.id === addToQueueServiceId);

  const allDesks = currentBranch?.services?.flatMap(s => (s.desks || []).filter(d => d.isActive)) || [];
  const selectedDesk = allDesks.find(d => d.id === selectedDeskId) || null;

  const desksForSelection = (() => {
    // Always scope desks to the effective service (concrete) for queue ops.
    const svc = currentBranch?.services?.find(s => s.id === effectiveServiceId);
    return (svc?.desks || []).filter(d => d.isActive);
  })();
  const canSelectDesk = desksForSelection.length > 0;
  const selectedBranch = branches.find(b => b.id === currentBranchId);
  const selectedService = servicesForBranch.find(s => s.id === selectedServiceId);

  const stationSummary = (() => {
    const parts: string[] = [];
    if (canSelectBranch && selectedBranch) parts.push(selectedBranch.name);
    if (effectiveService) parts.push(effectiveService.name);
    if (selectedDesk) parts.push(selectedDesk.name);
    return parts.join(" \u2192 ");
  })();

  const queueStatusConfig: Record<string, { label: string; color: string; icon: keyof typeof Feather.glyphMap; description: string }> = {
    active: { label: "Booking Open", color: "#10B981", icon: "play-circle", description: "Accepting new customers" },
    paused: { label: "Paused", color: "#F59E0B", icon: "pause-circle", description: "Temporarily not accepting" },
    ended: { label: "Booking Closed", color: "#EF4444", icon: "stop-circle", description: "Queue closed for the day" },
  };

  const getCurrentQueueStatus = () => {
    if (selectedDeskId) {
      return (selectedDesk as any)?.queueStatus || "ended";
    }
    // In multi-stage mode the queue operates at the branch level;
    // per-service queueStatus is irrelevant and often null/ended.
    if (!isMultiStageMode && effectiveServiceId && effectiveService) {
      return (effectiveService as any)?.queueStatus || "ended";
    }
    return (currentBranch as any)?.queueStatus || "ended";
  };

  const currentQueueStatus = getCurrentQueueStatus();
  const queueStatusInfo = queueStatusConfig[currentQueueStatus] || queueStatusConfig.ended;

  const getQueueStatusTargetLabel = () => {
    if (selectedDeskId && selectedDesk) return selectedDesk.name;
    if (!isMultiStageMode && effectiveServiceId && effectiveService) return effectiveService.name;
    return currentBranch?.name || "Branch";
  };

  const handleQueueStatusChange = async (newStatus: string) => {
    if (!currentBranch || queueStatusLoading) return;
    // Close the picker immediately so the selection feels instant; the
    // optimistic local state update inside setQueueStatusFor reflects the new
    // value while the request lands.
    setShowQueueStatusPicker(false);
    setQueueStatusLoading(true);
    try {
      if (selectedDeskId) {
        await setQueueStatusFor({ type: "desk", id: selectedDeskId }, newStatus);
      } else if (!isMultiStageMode && effectiveServiceId && effectiveService) {
        await setQueueStatusFor({ type: "service", id: effectiveServiceId }, newStatus);
        if (effectiveService?.desks) {
          for (const desk of effectiveService.desks) {
            await setQueueStatusFor({ type: "desk", id: desk.id }, newStatus);
          }
        }
      } else {
        await setQueueStatusFor({ type: "branch", id: currentBranch.id }, newStatus);
        const branchSvcs = currentBranch.services?.filter(s => s.isActive) || [];
        for (const svc of branchSvcs) {
          await setQueueStatusFor({ type: "service", id: svc.id }, newStatus);
          if (svc.desks) {
            for (const desk of svc.desks) {
              await setQueueStatusFor({ type: "desk", id: desk.id }, newStatus);
            }
          }
        }
      }
      Haptics.notificationAsync(
        newStatus === "active" ? Haptics.NotificationFeedbackType.Success :
        newStatus === "paused" ? Haptics.NotificationFeedbackType.Warning :
        Haptics.NotificationFeedbackType.Error
      );
    } catch (error) {
      logHandledError("Error updating queue status", error);
    } finally {
      setQueueStatusLoading(false);
    }
  };

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
    const status = getCurrentQueueStatus();
    if (status === "paused") {
      Alert.alert("Queue Paused", "The queue is currently paused and not accepting new customers. Please resume the queue first.");
      return;
    }
    if (status === "ended") {
      Alert.alert("Queue Closed", "The queue is closed for the day and not accepting new customers.");
      return;
    }
    // In multi-stage mode customers enter at the currently-viewed stage;
    // use that stage's serviceId so the entry appears on the active tab.
    const msCurrentStageServiceId =
      isMultiStageMode && selectedJourney?.stages?.length
        ? (selectedJourney.stages[selectedStageIndex]?.serviceId ?? selectedJourney.stages[0].serviceId)
        : null;
    setAddToQueueServiceId(msCurrentStageServiceId || effectiveServiceId || branchServices[0]?.id || "");
    setAddToQueueFormData({});
    setAddToQueueWhatsApp("");
    setAddToQueueLang("en");
    setShowAddToQueueModal(true);
  };

  // True when a service's own input fields already collect the customer's
  // name. When false, the manual / add-to-queue modals inject a dedicated
  // "Full Name" field (stored under MANUAL_NAME_FIELD_KEY) so a manually
  // added entry is never silently tagged "Walk-in Customer".
  const serviceHasNameField = (service: any) =>
    (service?.inputFields || []).some((f: any) => {
      const label = (f.label || "").toLowerCase();
      return label.includes("name") || (f.type === "text" && label.includes("customer"));
    });

  const extractCustomerInfoFromFormData = (formData: Record<string, any>, service: any) => {
    const fields = service?.inputFields || [];
    let customerName = "";
    let customerPhone = "";
    let customerEmail = "";
    // Dedicated full-name field injected by the manual add flow takes
    // priority over any service field heuristics.
    const manualName = (formData[MANUAL_NAME_FIELD_KEY] || "").toString().trim();
    if (manualName) customerName = manualName;
    for (const field of fields) {
      const val = formData[field.id];
      if (!val) continue;
      const label = (field.label || "").toLowerCase();
      if (!customerName && (label.includes("name") || label.includes("full name") || field.type === "text" && label.includes("customer"))) {
        customerName = String(val).trim();
      }
      if (!customerPhone && (field.type === "phone" || label.includes("phone") || label.includes("mobile") || label.includes("contact"))) {
        customerPhone = String(val).trim();
      }
      if (!customerEmail && (field.type === "email" || label.includes("email"))) {
        customerEmail = String(val).trim();
      }
    }
    return { customerName: customerName || "Walk-in Customer", customerPhone, customerEmail };
  };

  const handleAddToQueue = async () => {
    if (!addToQueueServiceId) {
      Alert.alert("Missing Info", "Please select a service.");
      return;
    }
    const service = branchServices.find(s => s.id === addToQueueServiceId);
    if (!serviceHasNameField(service) && !(addToQueueFormData[MANUAL_NAME_FIELD_KEY] || "").toString().trim()) {
      Alert.alert("Missing Info", "Full Name is required.");
      return;
    }
    const requiredFields = (service?.inputFields || []).filter((f: any) => f.required);
    for (const field of requiredFields) {
      if (!addToQueueFormData[field.id] && addToQueueFormData[field.id] !== false) {
        Alert.alert("Missing Info", `${field.label} is required.`);
        return;
      }
    }
    const { customerName, customerPhone, customerEmail } = extractCustomerInfoFromFormData(addToQueueFormData, service);
    // Final safety net: never allow a manual add to fall back to the
    // "Walk-in Customer" placeholder when no real name was provided.
    if (!customerName || customerName === "Walk-in Customer") {
      Alert.alert("Missing Info", "Full Name is required.");
      return;
    }
    setIsAddingToQueue(true);
    try {
      const { apiRequest } = await import("@/lib/query-client");
      const response = await apiRequest("POST", `/api/join/${currentBranchId}`, {
        serviceId: addToQueueServiceId,
        customerName,
        customerPhone,
        customerEmail,
        ...(addToQueueWhatsApp.trim() ? { whatsappPhone: addToQueueWhatsApp.trim() } : {}),
        preferredLanguage: addToQueueLang,
        formData: addToQueueFormData,
        source: "manual",
        ...(isMultiStageMode && selectedJourney ? { journeyId: selectedJourney.id } : {}),
      });
      const data = await response.json();
      if (data.error) {
        Alert.alert("Error", data.error);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowAddToQueueModal(false);
        // Refresh the branch the staff member is actually viewing so the new
        // entry shows up immediately (refreshQueue() targets branches[0], which
        // is the wrong branch in multi-branch orgs and only reconciles on a
        // manual pull-to-refresh).
        if (currentBranchId) {
          await refreshQueueForBranch(currentBranchId);
        } else {
          await refreshQueue();
        }
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
    // Queue operations always need a concrete service; filter to effectiveService.
    if (effectiveServiceId && c.serviceId !== effectiveServiceId) return false;
    // Two-tab model (FIFO/Selective), matching the web dashboard:
    //  - "Completed" holds terminal tickets (finished or no-show)
    //  - "Waiting" is the live action hub for everything still in progress
    //    (waiting/called/serving) where every action happens.
    if (filterStatus === "completed") return c.status === "completed" || c.status === "no_show" || c.status === "cancelled";
    return c.status !== "completed" && c.status !== "no_show" && c.status !== "cancelled";
  });

  const svcScoped = (c: QueueCustomer) => !effectiveServiceId || c.serviceId === effectiveServiceId;
  const waitingCount = queue.filter((c) => svcScoped(c) && c.status === "waiting").length;
  const calledCount = queue.filter((c) => svcScoped(c) && c.status === "called").length;
  const servingCount = queue.filter((c) => svcScoped(c) && c.status === "serving").length;

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
      effectiveServiceId || undefined,
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

  const handleCompleteAllActive = async () => {
    if (completeAllConfirmText.trim().toUpperCase() !== "COMPLETE") return;
    if (!currentBranchId) return;
    setCompleteAllLoading(true);
    try {
      const { apiRequest } = await import("@/lib/query-client");
      // Scope to whatever the staff member currently has in view so the bulk
      // action matches the queue they see as closed.
      const body: Record<string, any> = {};
      if (effectiveServiceId) body.serviceId = effectiveServiceId;
      if (selectedDeskId) body.deskId = selectedDeskId;
      const response = await apiRequest("POST", `/api/branches/${currentBranchId}/queue/complete-active`, body);
      const data = await response.json();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCompleteAllModal(false);
      setCompleteAllConfirmText("");
      refreshQueueForBranch(currentBranchId);
      const n = data?.completed || 0;
      Alert.alert("Done", n > 0 ? `${n} customer${n === 1 ? "" : "s"} moved to completed.` : "No active customers to complete.");
    } catch (error) {
      logHandledError("Error completing active customers", error);
      Alert.alert("Error", "Failed to complete active customers. Please try again.");
    } finally {
      setCompleteAllLoading(false);
    }
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

  const handleResumeFifo = async (customerId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await resumeCustomer(customerId);
    setFifoTab("waiting");
  };

  const handleTransferFifo = (customerId: string) => {
    const customer = queue.find((c) => c.id === customerId);
    if (!customer) return;
    Haptics.selectionAsync();
    setTransferTarget(customer);
  };

  const handleAssignToDesk = async (deskId: string, deskName: string) => {
    if (!transferTarget) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await callSpecificCustomer(transferTarget.id, deskId, deskName);
    setTransferTarget(null);
    if (currentBranchId) await refreshQueueForBranch(currentBranchId);
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
      const orderRef = (order.formData?.orderReference || order.formData?.orderId || "") as string;
      const isSameOrderId = orderRef.toLowerCase() === orderId.toLowerCase();
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
    
    const customerName = `Customer ${counterOrderCount}`;
    
    try {
      const result = await addCounterOrder(customerName, newOrderId.trim(), currentBranchId, effectiveServiceId || undefined);
      
      if (result.success && result.customer) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          "Order Created",
          `Order ${newOrderId.trim()} created for ${customerName}`
        );
        setCounterOrderCount((prev) => prev + 1);
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

  const checkedInToday = queue.filter((c) => svcScoped(c) && (c.status === "serving" || c.status === "completed")).length;

  // Tab counts are service-scoped to match filteredQueue (and the web parity).
  const activeTabCount = queue.filter(
    (c) =>
      (!effectiveServiceId || c.serviceId === effectiveServiceId) &&
      c.status !== "completed" &&
      c.status !== "no_show" &&
      c.status !== "cancelled"
  ).length;
  const completedTabCount = queue.filter(
    (c) =>
      (!effectiveServiceId || c.serviceId === effectiveServiceId) &&
      (c.status === "completed" || c.status === "no_show")
  ).length;

  const filters: { key: FilterStatus; label: string; count: number }[] = [
    { key: "waiting", label: "Waiting", count: activeTabCount },
    { key: "completed", label: "Completed", count: completedTabCount },
  ];

  const waitingCustomers = queue.filter((c) => svcScoped(c) && c.status === "waiting");
  const firstWaitingId = waitingCustomers.length > 0 ? waitingCustomers[0].id : null;

  // FIFO-mode data (service-scoped). "Waiting" holds everything still in play
  // (waiting/called/serving), "On Hold" holds paused tickets, "Completed" holds
  // terminal tickets. Used only by the dedicated FIFO layout.
  const fifoWaiting = queue.filter(
    (c) => svcScoped(c) && (c.status === "waiting" || c.status === "called" || c.status === "serving")
  );
  const fifoHold = queue.filter((c) => svcScoped(c) && c.status === "hold");
  const fifoCompleted = queue.filter((c) => svcScoped(c) && (c.status === "completed" || c.status === "no_show"));
  const fifoFilters: { key: "waiting" | "hold" | "completed"; label: string; count: number }[] = [
    { key: "waiting", label: "Waiting", count: fifoWaiting.length },
    { key: "hold", label: "On Hold", count: fifoHold.length },
    { key: "completed", label: "Completed", count: fifoCompleted.length },
  ];
  const fifoList = fifoTab === "hold" ? fifoHold : fifoTab === "completed" ? fifoCompleted : fifoWaiting;

  const renderQueueStatusBar = () => (
    <>
      <View style={styles.queueStatusRow}>
        <Pressable
          style={[styles.queueStatusBar, styles.queueStatusBarInRow, { borderColor: queueStatusInfo.color + "40", backgroundColor: queueStatusInfo.color + "0A" }]}
          onPress={() => setShowQueueStatusPicker(true)}
          testID="button-queue-status"
        >
          <View style={styles.queueStatusBarLeft}>
            <View style={[styles.queueStatusDot, { backgroundColor: queueStatusInfo.color }]} />
            <ThemedText style={[styles.queueStatusLabel, { color: queueStatusInfo.color }]}>{queueStatusInfo.label}</ThemedText>
            <View style={[styles.queueStatusDivider, { backgroundColor: colors.borderSubtle }]} />
            <ThemedText style={[styles.queueStatusTarget, { color: colors.textSecondary }]} numberOfLines={1}>{getQueueStatusTargetLabel()}</ThemedText>
          </View>
          <Feather name="chevron-down" size={14} color={queueStatusInfo.color} />
        </Pressable>

        {currentQueueStatus === "ended" && canCompleteQueue ? (
          <Pressable
            style={styles.completeAllInlineBtn}
            onPress={() => { setCompleteAllConfirmText(""); setShowCompleteAllModal(true); }}
            testID="button-complete-all-active"
          >
            <Feather name="check-circle" size={14} color="#FFFFFF" />
            <ThemedText style={styles.completeAllInlineText} numberOfLines={1}>Complete All</ThemedText>
          </Pressable>
        ) : null}
      </View>

      <Modal visible={showCompleteAllModal} transparent animationType="fade" onRequestClose={() => setShowCompleteAllModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowCompleteAllModal(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.modalTitle}>Complete All Active</ThemedText>
                <ThemedText style={[styles.stepSubtitle, { color: colors.textSecondary }]}>{getQueueStatusTargetLabel()}</ThemedText>
              </View>
              <Pressable onPress={() => setShowCompleteAllModal(false)} hitSlop={8}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>
            <View style={[styles.completeAllWarning, { backgroundColor: "#EF4444" + "1A", borderColor: "#EF4444" + "40" }]}>
              <Feather name="alert-triangle" size={16} color="#EF4444" />
              <ThemedText style={[styles.completeAllWarningText, { color: "#B91C1C" }]}>
                This will move all active and serving customers in {getQueueStatusTargetLabel()} to Completed. This action cannot be undone.
              </ThemedText>
            </View>
            <ThemedText style={[styles.inputLabel, { color: colors.textSecondary, marginBottom: 6 }]}>Type COMPLETE to confirm</ThemedText>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.surfaceMuted, color: colors.text, borderColor: colors.borderSubtle }]}
              placeholder="COMPLETE"
              placeholderTextColor={colors.textSecondary}
              value={completeAllConfirmText}
              onChangeText={setCompleteAllConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
              testID="input-complete-all-confirm"
            />
            <Pressable
              style={[styles.completeAllConfirmBtn, {
                backgroundColor: (completeAllConfirmText.trim().toUpperCase() === "COMPLETE" && !completeAllLoading) ? "#EF4444" : "#FCA5A5",
              }]}
              onPress={handleCompleteAllActive}
              disabled={completeAllConfirmText.trim().toUpperCase() !== "COMPLETE" || completeAllLoading}
              testID="button-confirm-complete-all"
            >
              {completeAllLoading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="check" size={18} color="#FFFFFF" />}
              <ThemedText style={styles.completeAllConfirmText}>{completeAllLoading ? "Completing..." : "Complete All"}</ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showQueueStatusPicker} transparent animationType="fade" onRequestClose={() => setShowQueueStatusPicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowQueueStatusPicker(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: colors.surface }]} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.modalTitle}>Set Queue Status</ThemedText>
                <ThemedText style={[styles.stepSubtitle, { color: colors.textSecondary }]}>{getQueueStatusTargetLabel()}</ThemedText>
              </View>
              <Pressable onPress={() => setShowQueueStatusPicker(false)} hitSlop={8}>
                <Feather name="x" size={24} color={colors.text} />
              </Pressable>
            </View>
            <View style={{ gap: 8, paddingHorizontal: 4 }}>
              {(["active", "paused", "ended"] as const).map(status => {
                const cfg = queueStatusConfig[status];
                const isSelected = currentQueueStatus === status;
                return (
                  <Pressable
                    key={status}
                    style={[styles.stationOptionCard, {
                      borderColor: isSelected ? cfg.color : (colors.borderSubtle),
                      backgroundColor: isSelected ? cfg.color + "10" : (colors.surfaceMuted),
                    }]}
                    onPress={() => handleQueueStatusChange(status)}
                    disabled={queueStatusLoading}
                  >
                    <View style={[styles.stationOptionIcon, { backgroundColor: cfg.color + "15" }]}>
                      <Feather name={cfg.icon} size={18} color={cfg.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <ThemedText style={[styles.stationOptionTitle, isSelected && { color: cfg.color }]}>{cfg.label}</ThemedText>
                      <ThemedText style={[styles.stationOptionMeta, { color: colors.textSecondary }]}>{cfg.description}</ThemedText>
                    </View>
                    {isSelected ? (
                      <View style={[styles.stationCheckCircle, { backgroundColor: cfg.color }]}>
                        <Feather name="check" size={14} color="#FFFFFF" />
                      </View>
                    ) : (
                      <View style={[styles.stationCheckCircle, { borderWidth: 2, borderColor: colors.borderSubtle }]} />
                    )}
                    {queueStatusLoading ? (
                      <ActivityIndicator size="small" color={cfg.color} style={{ marginLeft: 8 }} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );

  if (isCheckInMode) {
    const ciWaiting   = queue.filter((c) => svcScoped(c) && c.status === "waiting");
    const ciCheckedIn = queue.filter((c) => svcScoped(c) && (c.status === "serving" || c.status === "completed"));
    const ciNoShow    = queue.filter((c) => svcScoped(c) && c.status === "no_show");
    const ciTabList   = checkInTab === "checkedin" ? ciCheckedIn : checkInTab === "noshow" ? ciNoShow : ciWaiting;

    const getInitials = (name: string) => {
      const parts = (name || "?").trim().split(/\s+/);
      return parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : (name || "?").slice(0, 2).toUpperCase();
    };

    const getSeatInfo = (c: QueueCustomer) => {
      if (!c.formData) return null;
      const fd = c.formData as Record<string, any>;
      return fd.seat || fd.seatNumber || fd["Seat"] || fd["Seat Number"] || null;
    };

    const handleCardCheckIn = async (c: QueueCustomer) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await handleServe(c.id);
      setLastCheckIn({
        ticketNumber: c.ticketNumber,
        name: c.customerName,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
    };

    const CI_TABS: { key: "waiting" | "checkedin" | "noshow"; label: string; count: number; color: string }[] = [
      { key: "waiting",   label: "Waiting",    count: ciWaiting.length,   color: colors.primary },
      { key: "checkedin", label: "Checked In", count: ciCheckedIn.length, color: colors.success },
      { key: "noshow",    label: "No Show",    count: ciNoShow.length,    color: "#EF4444" },
    ];

    return (
      <ThemedView style={styles.container}>

        {/* ── Scan / Enter section (fixed header card) ─────────────────── */}
        <View style={[styles.ciScanCard, { backgroundColor: colors.surface, borderBottomColor: colors.borderSubtle }]}>
          <View style={styles.ciScanHeader}>
            <View style={[styles.ciScanIconWrap, { backgroundColor: colors.primary + "18" }]}>
              <Feather name="maximize" size={15} color={colors.primary} />
            </View>
            <ThemedText style={[styles.ciScanLabel, { color: colors.primary }]}>
              SCAN OR ENTER TICKET ID
            </ThemedText>
          </View>

          <View style={styles.ciInputRow}>
            <TextInput
              style={[styles.ciTextInput, { backgroundColor: isDark ? "#2C2C2E" : "#F2F2F7", color: colors.text }]}
              placeholder="e.g. T-001"
              placeholderTextColor={colors.textSecondary}
              value={ticketInput}
              onChangeText={setTicketInput}
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={handleCheckIn}
              editable={!isProcessing}
            />
            <Pressable
              style={[styles.ciCheckInBtn, { backgroundColor: colors.primary }, isProcessing ? { opacity: 0.6 } : null]}
              onPress={handleCheckIn}
              disabled={isProcessing}
            >
              <ThemedText style={styles.ciCheckInBtnText}>
                {isProcessing ? "Checking…" : "Check In"}
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.ciDividerRow}>
            <View style={[styles.ciDivider, { backgroundColor: colors.borderSubtle }]} />
            <ThemedText style={[styles.ciDividerText, { color: colors.textSecondary }]}>or scan QR from phone</ThemedText>
            <View style={[styles.ciDivider, { backgroundColor: colors.borderSubtle }]} />
          </View>

          <Pressable
            style={[styles.ciCameraBtn, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "28" }]}
            onPress={handleScanQR}
          >
            <Feather name="camera" size={17} color={colors.primary} />
            <ThemedText style={[styles.ciCameraBtnText, { color: colors.primary }]}>Open Camera Scanner</ThemedText>
          </Pressable>
        </View>

        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        <View style={[styles.ciTabBar, { backgroundColor: colors.surface, borderBottomColor: colors.borderSubtle }]}>
          {CI_TABS.map((tab) => {
            const active = checkInTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={styles.ciTab}
                onPress={() => { Haptics.selectionAsync(); setCheckInTab(tab.key); }}
              >
                <View style={styles.ciTabInner}>
                  <ThemedText style={[
                    styles.ciTabText,
                    { color: active ? tab.color : colors.textSecondary },
                    active ? { fontFamily: "Nunito_700Bold" } : undefined,
                  ]}>
                    {tab.label}
                  </ThemedText>
                  <View style={[styles.ciTabBadge, { backgroundColor: active ? tab.color : colors.surfaceMuted }]}>
                    <ThemedText style={[styles.ciTabBadgeText, { color: active ? "#FFFFFF" : colors.textSecondary }]}>
                      {tab.count}
                    </ThemedText>
                  </View>
                </View>
                <View style={[styles.ciTabUnderline, active ? { backgroundColor: tab.color } : null]} />
              </Pressable>
            );
          })}
        </View>

        {/* ── Customer list ─────────────────────────────────────────────── */}
        {ciTabList.length === 0 ? (
          <View style={styles.ciEmptyState}>
            <View style={[styles.ciEmptyIcon, { backgroundColor: colors.surfaceMuted }]}>
              <Feather
                name={checkInTab === "checkedin" ? "check-circle" : checkInTab === "noshow" ? "user-x" : "users"}
                size={36}
                color={colors.textSecondary}
              />
            </View>
            <ThemedText style={[styles.ciEmptyTitle, { color: colors.text }]}>
              {checkInTab === "waiting" ? "No customers waiting" : checkInTab === "checkedin" ? "No check-ins yet" : "No no-shows recorded"}
            </ThemedText>
            <ThemedText style={[styles.ciEmptySubtitle, { color: colors.textSecondary }]}>
              {checkInTab === "waiting" ? "Customers will appear here when they join the queue" : checkInTab === "checkedin" ? "Checked-in customers will appear here" : "Customers marked no-show will appear here"}
            </ThemedText>
          </View>
        ) : (
          <ScrollView
            style={styles.ciList}
            contentContainerStyle={[styles.ciListContent, { paddingBottom: insets.bottom + 100 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          >
            {ciTabList.map((customer) => {
              const initials    = getInitials(customer.customerName);
              const seatInfo    = getSeatInfo(customer);
              const isCheckedIn = customer.status === "serving" || customer.status === "completed";
              const isNS        = customer.status === "no_show";
              const accentColor = isCheckedIn ? colors.success : isNS ? "#9CA3AF" : colors.primary;

              return (
                <View key={customer.id} style={[styles.ciCard, { backgroundColor: colors.surface }]}>
                  {/* Left accent strip */}
                  <View style={[styles.ciCardAccent, { backgroundColor: accentColor }]} />

                  <View style={styles.ciCardBody}>
                    {/* Top row: avatar + info + status badge */}
                    <View style={styles.ciCardTopRow}>
                      <View style={[styles.ciAvatar, { backgroundColor: accentColor + "20" }]}>
                        <ThemedText style={[styles.ciAvatarText, { color: accentColor }]}>{initials}</ThemedText>
                      </View>

                      <View style={styles.ciNameBlock}>
                        <View style={styles.ciNameRow}>
                          <ThemedText style={[styles.ciCustomerName, { color: colors.text }]} numberOfLines={1}>
                            {customer.customerName}
                          </ThemedText>
                          <View style={[styles.ciTicketChip, { backgroundColor: accentColor + "18" }]}>
                            <ThemedText style={[styles.ciTicketChipText, { color: accentColor }]}>
                              {customer.ticketNumber}
                            </ThemedText>
                          </View>
                        </View>

                        <View style={styles.ciMetaRow}>
                          {customer.customerPhone ? (
                            <View style={styles.ciMetaItem}>
                              <Feather name="phone" size={11} color={colors.textSecondary} />
                              <ThemedText style={[styles.ciMeta, { color: colors.textSecondary }]}>
                                {customer.customerPhone}
                              </ThemedText>
                            </View>
                          ) : null}
                          {seatInfo ? (
                            <View style={styles.ciMetaItem}>
                              <ThemedText style={[styles.ciMetaSep, { color: colors.borderSubtle }]}> · </ThemedText>
                              <ThemedText style={[styles.ciMeta, { color: colors.textSecondary }]}>Seat {seatInfo}</ThemedText>
                            </View>
                          ) : null}
                        </View>
                      </View>

                      <View style={[styles.ciStatusBadge, { backgroundColor: accentColor + "18" }]}>
                        <ThemedText style={[styles.ciStatusText, { color: accentColor }]}>
                          {isCheckedIn ? "Checked In" : isNS ? "No Show" : "Waiting"}
                        </ThemedText>
                      </View>
                    </View>

                    {/* Ticket ID pill */}
                    <View style={[styles.ciTicketIdRow, { backgroundColor: colors.primary + "0D" }]}>
                      <Feather name="grid" size={12} color={colors.primary} />
                      <ThemedText style={[styles.ciTicketId, { color: colors.primary }]}>
                        {customer.ticketNumber}
                      </ThemedText>
                    </View>

                    {/* Action buttons — only for waiting customers */}
                    {customer.status === "waiting" ? (
                      <View style={styles.ciCardActions}>
                        <Pressable
                          style={[styles.ciActionCheckIn, { backgroundColor: colors.primary }]}
                          onPress={() => handleCardCheckIn(customer)}
                        >
                          <Feather name="check" size={14} color="#FFFFFF" />
                          <ThemedText style={styles.ciActionCheckInText}>Check In</ThemedText>
                        </Pressable>
                        <Pressable
                          style={[styles.ciActionNoShow, { borderColor: colors.borderSubtle }]}
                          onPress={() => handleNoShow(customer.id)}
                        >
                          <ThemedText style={[styles.ciActionNoShowText, { color: colors.textSecondary }]}>No Show</ThemedText>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}

      </ThemedView>
    );
  }

  if (isTakeawayMode) {
    const preparingOrders = queue.filter((c) => svcScoped(c) && c.status === "waiting").sort((a, b) =>
      new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
    );
    const readyOrders = queue.filter((c) => svcScoped(c) && (c.status === "called" || c.status === "serving")).sort((a, b) =>
      new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
    );
    const deliveredOrders = queue.filter((c) => svcScoped(c) && c.status === "completed").sort((a, b) =>
      new Date(b.completedAt || b.joinedAt).getTime() - new Date(a.completedAt || a.joinedAt).getTime()
    );

    const formatTime = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    const getInitials = (name: string) => {
      const parts = name.trim().split(/\s+/);
      return parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : name.slice(0, 2).toUpperCase();
    };

    const getWaitMinutes = (joinedAt: string) =>
      Math.max(0, Math.floor((Date.now() - new Date(joinedAt).getTime()) / 60000));

    const getOrderItems = (order: QueueCustomer): string => {
      const fd = order.formData || {};
      for (const key of ["items", "orderItems", "foodItems", "order", "itemsList"]) {
        if (fd[key]) {
          const val = fd[key];
          if (Array.isArray(val)) return (val as string[]).join(", ");
          return String(val);
        }
      }
      const systemKeys = ["orderId", "orderSource", "registeredBy", "partySize", "tableNumber", "sourceTag"];
      const parts: string[] = [];
      for (const [k, v] of Object.entries(fd)) {
        if (!systemKeys.includes(k) && v && !k.startsWith("_") && typeof v === "string") {
          parts.push(v);
        }
      }
      return parts.length > 0 ? parts.join(", ") : (order.serviceName || "");
    };

    const handleMarkReady = async (customerId: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await callSpecificCustomer(customerId, selectedDesk?.id, selectedDesk?.name);
      setTakeawayTab("ready");
    };

    const handleCallOrder = async (customerId: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await callAgainCustomer(customerId, selectedDesk?.id, selectedDesk?.name);
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
      setTakeawayTab("delivered");
    };

    const twTabs = [
      { key: "active" as const, label: "Active", count: preparingOrders.length },
      { key: "ready" as const, label: "Ready", count: readyOrders.length },
      { key: "delivered" as const, label: "Delivered", count: deliveredOrders.length },
    ];

    return (
      <ThemedView style={styles.container}>
        {/* Tab bar — same visual language as dine-in */}
        <View style={[styles.diTabBar, { borderBottomColor: colors.borderSubtle }]}>
          {twTabs.map((tab) => {
            const active = takeawayTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.diTab, active && { borderBottomColor: colors.primary }]}
                onPress={() => setTakeawayTab(tab.key)}
              >
                <ThemedText
                  style={[
                    styles.diTabText,
                    { color: active ? colors.primary : colors.textSecondary, fontWeight: active ? "700" : "500" },
                  ]}
                >
                  {tab.label}
                </ThemedText>
                {tab.count > 0 ? (
                  <View style={[styles.diTabBadge, { backgroundColor: active ? colors.primary : colors.textSecondary + "28" }]}>
                    <ThemedText style={[styles.diTabBadgeText, { color: active ? "#FFFFFF" : colors.textSecondary }]}>
                      {tab.count}
                    </ThemedText>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          style={styles.queueList}
          contentContainerStyle={[styles.dineInContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {takeawayTab === "active" && preparingOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Feather name="shopping-bag" size={26} color={colors.textSecondary} />
              </View>
              <ThemedText style={styles.emptyTitle}>No active orders</ThemedText>
            </View>
          ) : null}
          {takeawayTab === "ready" && readyOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Feather name="bell" size={26} color={colors.textSecondary} />
              </View>
              <ThemedText style={styles.emptyTitle}>No ready orders</ThemedText>
            </View>
          ) : null}
          {takeawayTab === "delivered" && deliveredOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Feather name="check-circle" size={26} color={colors.textSecondary} />
              </View>
              <ThemedText style={styles.emptyTitle}>No delivered orders yet</ThemedText>
            </View>
          ) : null}

          {/* ── ACTIVE TAB ── */}
          {takeawayTab === "active" ? preparingOrders.map((order) => {
            const waitMins = getWaitMinutes(order.joinedAt);
            const displayOrderId = (order.formData?.orderReference as string) || (order.formData?.orderId as string) || order.ticketNumber;
            return (
              <View key={order.id} style={[styles.twCard, { backgroundColor: isDark ? colors.surface : "#FFFFFF" }]}>
                <View style={styles.twCardHeader}>
                  <View style={[styles.twAvatar, { backgroundColor: colors.primary + "20" }]}>
                    <ThemedText style={[styles.twAvatarText, { color: colors.primary }]}>
                      {order.ticketNumber}
                    </ThemedText>
                  </View>
                  <View style={styles.twCardMeta}>
                    <View style={styles.twNameRow}>
                      <ThemedText style={[styles.twTicketNumber, { color: colors.text }]} numberOfLines={1}>
                        {"Order ID: " + displayOrderId}
                      </ThemedText>
                    </View>
                    <ThemedText style={[styles.twTimeText, { color: colors.textSecondary }]}>
                      Ordered Time  {formatTime(order.joinedAt)}
                    </ThemedText>
                  </View>
                  <View style={styles.twWaitPill}>
                    <ThemedText style={styles.twWaitPillText}>~{waitMins} min</ThemedText>
                  </View>
                </View>

                <View style={styles.twActions}>
                  <Pressable
                    style={[styles.twMarkReadyBtn, { backgroundColor: colors.primary }]}
                    onPress={() => handleMarkReady(order.id)}
                    testID={`button-markready-${order.id}`}
                  >
                    <Feather name="bell" size={14} color="#FFFFFF" />
                    <ThemedText style={styles.twMarkReadyBtnText}>Mark Ready</ThemedText>
                  </Pressable>
                </View>
              </View>
            );
          }) : null}

          {/* ── READY TAB ── */}
          {takeawayTab === "ready" ? readyOrders.map((order) => {
            const displayOrderId = (order.formData?.orderReference as string) || (order.formData?.orderId as string) || order.ticketNumber;
            const orderItems = getOrderItems(order);
            return (
              <View key={order.id} style={[styles.twCard, { backgroundColor: isDark ? colors.surface : "#FFFFFF" }]}>
                <View style={styles.twCardHeader}>
                  <View style={[styles.twAvatar, { backgroundColor: "#D1FAE5" }]}>
                    <ThemedText style={[styles.twAvatarText, { color: "#059669" }]}>
                      {order.ticketNumber}
                    </ThemedText>
                  </View>
                  <View style={styles.twCardMeta}>
                    <View style={styles.twNameRow}>
                      <ThemedText style={[styles.twTicketNumber, { color: colors.text }]} numberOfLines={1}>
                        {"Order ID: " + displayOrderId}
                      </ThemedText>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: Spacing.md }}>
                      <ThemedText style={[styles.twTimeText, { color: colors.textSecondary }]}>
                        Ordered Time  {formatTime(order.joinedAt)}
                      </ThemedText>
                      <ThemedText style={styles.twReadyTime}>
                        ✓ Ready {order.calledAt ? formatTime(order.calledAt) : ""}
                      </ThemedText>
                    </View>
                  </View>
                </View>

                <View style={styles.twActions}>
                  <Pressable
                    style={[styles.twOutlineBtn, { borderColor: colors.primary }]}
                    onPress={() => handleCallAgainOrder(order.id)}
                    testID={`button-callagain-${order.id}`}
                  >
                    <ThemedText style={[styles.twOutlineBtnText, { color: colors.primary }]}>Call again</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.twDeliveredBtn, { backgroundColor: colors.primary }]}
                    onPress={() => handleDelivered(order.id)}
                    testID={`button-delivered-${order.id}`}
                  >
                    <ThemedText style={styles.twDeliveredBtnText}>Delivered ✓</ThemedText>
                  </Pressable>
                </View>
              </View>
            );
          }) : null}

          {/* ── DELIVERED TAB ── */}
          {takeawayTab === "delivered" ? deliveredOrders.map((order) => {
            const displayOrderId = (order.formData?.orderReference as string) || (order.formData?.orderId as string) || order.ticketNumber;
            const orderItems = getOrderItems(order);
            return (
              <View key={order.id} style={[styles.twCard, { backgroundColor: isDark ? colors.surface : "#FFFFFF" }]}>
                <View style={styles.twCardHeader}>
                  <View style={[styles.twAvatar, { backgroundColor: "#D1FAE5" }]}>
                    <ThemedText style={[styles.twAvatarText, { color: "#059669" }]}>
                      {order.ticketNumber}
                    </ThemedText>
                  </View>
                  <View style={[styles.twCardMeta, { flex: 1 }]}>
                    <View style={styles.twNameRow}>
                      <ThemedText style={[styles.twTicketNumber, { color: colors.text }]} numberOfLines={1}>
                        {"Order ID: " + displayOrderId}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.twDeliveredTimes}>
                    <ThemedText style={[styles.twDeliveredTimestamp, { color: colors.textSecondary }]}>
                      Ordered {formatTime(order.joinedAt)}
                    </ThemedText>
                    {order.completedAt ? (
                      <ThemedText style={[styles.twDeliveredTimestamp, { color: "#059669" }]}>
                        Delivered {formatTime(order.completedAt)}
                      </ThemedText>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          }) : null}

        </ScrollView>

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
          animationType="fade"
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
                setNewOrderId("");
              }}
            />
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
              <View style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>New Counter Order</ThemedText>
                <Pressable
                  onPress={() => {
                    setShowNewOrderModal(false);
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
                        backgroundColor: colors.surfaceMuted,
                        color: colors.text,
                        borderColor: colors.borderSubtle,
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

              </View>

              <View style={styles.modalFooter}>
                <Pressable
                  style={[styles.modalButton, styles.cancelButton, { borderColor: colors.textSecondary }]}
                  onPress={() => {
                    setShowNewOrderModal(false);
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
    const reservationCustomers = queue.filter((c) => svcScoped(c) && c.status === "reservation").sort((a, b) => 
      new Date(a.reservationTime || a.joinedAt).getTime() - new Date(b.reservationTime || b.joinedAt).getTime()
    );
    const apiReservations = branchReservations.filter((r: any) => r.status === "confirmed");
    const waitingCustomers = queue.filter((c) => svcScoped(c) && c.status === "waiting").sort((a, b) => 
      new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
    );
    const calledCustomers = queue.filter((c) => svcScoped(c) && c.status === "called");
    const holdCustomers = queue.filter((c) => svcScoped(c) && c.status === "hold");
    const arrivedCustomers = queue.filter((c) =>
      svcScoped(c) && (c.status === "arrived" || c.status === "completed" || c.status === "no_show" || c.status === "cancelled")
    ).sort((a, b) =>
      new Date(b.completedAt || b.arrivedAt || b.joinedAt).getTime() -
      new Date(a.completedAt || a.arrivedAt || a.joinedAt).getTime()
    );

    const dineInTabs = [
      { key: "waiting" as const, label: "Waiting", count: waitingCustomers.length },
      { key: "assigned" as const, label: "Assigned", count: calledCustomers.length },
      { key: "hold" as const, label: "On Hold", count: holdCustomers.length },
      { key: "done" as const, label: "Done", count: arrivedCustomers.length },
    ];

    const getCurrentTabCustomers = () => {
      switch (dineInTab) {
        case "waiting": return waitingCustomers;
        case "assigned": return calledCustomers;
        case "hold": return holdCustomers;
        case "done": return arrivedCustomers;
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
      const status = getCurrentQueueStatus();
      if (status === "paused") {
        Alert.alert("Queue Paused", "The queue is currently paused and not accepting new customers. Please resume the queue first.");
        return;
      }
      if (status === "ended") {
        Alert.alert("Queue Closed", "The queue is closed for the day and not accepting new customers.");
        return;
      }
      // Seed party size (default 1) only when the admin actually configured a
      // party-size field for this service, so we never inject a phantom
      // "Party Size" value when the service doesn't ask for it.
      const openService = effectiveService || branchServices[0];
      const openPartyField = (openService?.inputFields || []).find((f: any) => isPartySizeField(f.label, f.id));
      const seed: Record<string, any> = {};
      if (openPartyField?.id) {
        seed[openPartyField.id] = 1;
        seed.partySize = 1;
      }
      setManualRegistrationFormData(seed);
      setManualRegistrationWhatsApp("");
      setManualRegistrationLang("en");
      setShowManualRegistrationModal(true);
    };

    const handleManualRegistration = async () => {
      const currentService = effectiveService || branchServices[0];
      // When the service has no name field of its own, the injected
      // "Full Name" field is mandatory so manual entries carry a real name.
      if (!serviceHasNameField(currentService) && !(manualRegistrationFormData[MANUAL_NAME_FIELD_KEY] || "").toString().trim()) {
        Alert.alert("Missing Info", "Full Name is required.");
        return;
      }
      const requiredFields = (currentService?.inputFields || []).filter((f: any) => f.required);
      for (const field of requiredFields) {
        if (!manualRegistrationFormData[field.id] && manualRegistrationFormData[field.id] !== false) {
          Alert.alert("Missing Info", `${field.label} is required.`);
          return;
        }
      }
      const { customerName, customerPhone, customerEmail } = extractCustomerInfoFromFormData(manualRegistrationFormData, currentService);
      // Final safety net: even if a service "name" field is present but
      // optional and left blank, never let a manual entry silently become
      // "Walk-in Customer" — require a real name first.
      if (!customerName || customerName === "Walk-in Customer") {
        Alert.alert("Missing Info", "Full Name is required.");
        return;
      }
      
      Keyboard.dismiss();
      setIsRegistering(true);
      
      try {
        const result = await addManualCustomer({
          customerName,
          customerPhone,
          customerEmail,
          whatsappPhone: manualRegistrationWhatsApp.trim() || undefined,
          preferredLanguage: manualRegistrationLang,
          formData: manualRegistrationFormData,
          serviceId: currentService?.id,
        });
        
        if (result.success) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(
            "Customer Registered",
            `${result.customer?.customerName} has been added to the queue.\n\nTicket: ${result.customer?.ticketNumber}`
          );
          setShowManualRegistrationModal(false);
          setManualRegistrationFormData({});
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

    const handleWalkIn = async (customerId: string) => {
      const customer = queue.find((c) => c.id === customerId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await markAsComplete(customerId);
      Alert.alert("Walk In", `${customer?.customerName || "Customer"} has been marked as walked in.`);
    };

    const handleOpenEdit = (customer: QueueCustomer) => {
      const service = branchServices.find(s => s.id === customer.serviceId);
      const initial: Record<string, any> = { ...(customer.formData || {}) };
      if (!serviceHasNameField(service) && !(initial[MANUAL_NAME_FIELD_KEY] || "").toString().trim()) {
        initial[MANUAL_NAME_FIELD_KEY] = customer.customerName || "";
      }
      setEditFormData(initial);
      setEditCustomer(customer);
      setMorePopupCustomer(null);
    };

    const handleSaveEdit = async () => {
      if (!editCustomer) return;
      const service = branchServices.find(s => s.id === editCustomer.serviceId);
      if (!serviceHasNameField(service) && !(editFormData[MANUAL_NAME_FIELD_KEY] || "").toString().trim()) {
        Alert.alert("Missing Info", "Full Name is required.");
        return;
      }
      const requiredFields = (service?.inputFields || []).filter((f: any) => f.required);
      for (const field of requiredFields) {
        if (!editFormData[field.id] && editFormData[field.id] !== false) {
          Alert.alert("Missing Info", `${field.label} is required.`);
          return;
        }
      }
      const { customerName, customerPhone, customerEmail } = extractCustomerInfoFromFormData(editFormData, service);
      if (!customerName || customerName === "Walk-in Customer") {
        Alert.alert("Missing Info", "Full Name is required.");
        return;
      }
      setIsSavingEdit(true);
      try {
        const result = await updateCustomerDetails(editCustomer.id, (editCustomer as any).branchId || currentBranchId || "", {
          customerName,
          customerPhone,
          customerEmail,
          formData: editFormData,
        });
        if (result.success) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setEditCustomer(null);
          setEditFormData({});
        } else {
          Alert.alert("Error", result.error || "We couldn't update this customer's details. Please try again.");
        }
      } finally {
        setIsSavingEdit(false);
      }
    };

    const formatTime = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    // Split a customer's formData into the "default" dine-in details (party
    // size, gender, table-sharing chips) shown on the card by default, and
    // the remaining custom restaurant fields that only appear when expanded.
    const getDineInCardData = (customer: QueueCustomer) => {
      const service = branchServices.find(s => s.id === customer.serviceId);
      const serviceFields = service?.inputFields || [];
      const getLabel = (fieldId: string) => {
        const field = serviceFields.find((f: any) => f.id === fieldId);
        return field?.label || fieldId;
      };

      let partySize: string | number | null =
        (customer.formData?.partySize as any) ?? null;
      let gender: string | null = null;
      const statusChips: { label: string; active: boolean }[] = [];
      const extraFields: { label: string; value: string }[] = [];

      for (const [key, value] of Object.entries(customer.formData || {})) {
        if (value === undefined || value === null || value === "") continue;
        if (HIDDEN_FORM_KEYS.includes(key)) continue;
        const label = getLabel(key);
        if (isPartySizeField(label, key)) {
          if (partySize === null || partySize === undefined) partySize = value as any;
          continue;
        }
        if (isGenderField(label)) {
          gender = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
          continue;
        }
        if (isShareTableField(label)) {
          statusChips.push({ label: "Shared Table", active: isTruthyAnswer(value) });
          continue;
        }
        if (isSplitTableField(label)) {
          statusChips.push({ label: "Split Seating", active: isTruthyAnswer(value) });
          continue;
        }
        extraFields.push({
          label,
          value: typeof value === "boolean" ? (value ? "Yes" : "No") : String(value),
        });
      }

      return { partySize, gender, statusChips, extraFields };
    };

    const getGenderColors = (g: string | null) => {
      const v = (g || "").trim().toLowerCase();
      if (v === "male" || v === "m" || v === "man" || v === "boy") {
        return { bg: "#DBEAFE", fg: "#2563EB" };
      }
      if (v === "female" || v === "f" || v === "woman" || v === "girl") {
        return { bg: "#FCE7F3", fg: "#DB2777" };
      }
      return { bg: isDark ? colors.surfaceMuted : "#F3F4F6", fg: colors.textSecondary };
    };

    const getInitials = (name: string) => {
      const parts = name.trim().split(/\s+/);
      return parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : name.slice(0, 2).toUpperCase();
    };

    const getWaitMinutes = (joinedAt: string) =>
      Math.max(0, Math.floor((Date.now() - new Date(joinedAt).getTime()) / 60000));

    const getDoneStatus = (c: QueueCustomer): "seated" | "walkin" | "cancelled" => {
      if (c.status === "no_show" || c.status === "cancelled") return "cancelled";
      if (c.status === "arrived") return "seated";
      return c.tableNumber ? "seated" : "walkin";
    };

    return (
      <ThemedView style={styles.container}>

        {/* Dine-In Tab Bar */}
        <View style={[styles.diTabBar, { borderBottomColor: colors.borderSubtle }]}>
          {dineInTabs.map((tab) => {
            const active = dineInTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.diTab, active && { borderBottomColor: colors.primary }]}
                onPress={() => setDineInTab(tab.key)}
              >
                <ThemedText style={[styles.diTabText, { color: active ? colors.primary : colors.textSecondary, fontWeight: active ? "700" : "500" }]}>
                  {tab.label}
                </ThemedText>
                {tab.count > 0 ? (
                  <View style={[styles.diTabBadge, { backgroundColor: active ? colors.primary : colors.textSecondary + "28" }]}>
                    <ThemedText style={[styles.diTabBadgeText, { color: active ? "#FFFFFF" : colors.textSecondary }]}>
                      {tab.count}
                    </ThemedText>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <ScrollView
          style={styles.queueList}
          contentContainerStyle={[styles.dineInContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {getCurrentTabCustomers().length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Feather
                  name={dineInTab === "waiting" ? "clock" : dineInTab === "assigned" ? "grid" : dineInTab === "hold" ? "pause-circle" : "check-circle"}
                  size={26}
                  color={colors.textSecondary}
                />
              </View>
              <ThemedText style={styles.emptyTitle}>
                {dineInTab === "waiting" ? "No customers waiting" : dineInTab === "assigned" ? "No assigned tables" : dineInTab === "hold" ? "No customers on hold" : "No completed entries"}
              </ThemedText>
            </View>
          ) : null}

          {/* ── WAITING TAB ── */}
          {dineInTab === "waiting" ? getCurrentTabCustomers().map((customer, index) => {
            const cardData = getDineInCardData(customer);
            const waitMins = getWaitMinutes(customer.joinedAt);
            const shareChip = cardData.statusChips.find(c => c.label === "Shared Table");
            const splitChip = cardData.statusChips.find(c => c.label === "Split Seating");
            return (
              <View key={customer.id} style={[styles.diCard, { backgroundColor: isDark ? colors.surface : "#FFFFFF" }]}>
                <View style={styles.diCardHeader}>
                  <View style={[styles.diAvatar, { backgroundColor: colors.primary + "20" }]}>
                    {cardData.partySize != null ? (
                      <View style={styles.diAvatarInner}>
                        <Feather name="users" size={10} color={colors.primary} />
                        <ThemedText style={[styles.diAvatarText, { color: colors.primary }]}>
                          {String(cardData.partySize)}
                        </ThemedText>
                      </View>
                    ) : (
                      <ThemedText style={[styles.diAvatarText, { color: colors.primary }]}>
                        {getInitials(customer.customerName)}
                      </ThemedText>
                    )}
                  </View>
                  <View style={styles.diCardMeta}>
                    <View style={styles.diNameRow}>
                      <ThemedText style={[styles.diCustomerName, { color: colors.text }]} numberOfLines={1}>
                        {customer.customerName}
                      </ThemedText>
                      <View style={[styles.diTicketChip, { backgroundColor: isDark ? colors.surfaceMuted : "#F0EEF8" }]}>
                        <ThemedText style={[styles.diTicketChipText, { color: colors.primary }]}>
                          {customer.ticketNumber}
                        </ThemedText>
                      </View>
                    </View>
                    <View style={styles.diTimeRow}>
                      <ThemedText style={[styles.diWaitReg, { color: colors.textSecondary }]}>
                        {formatTime(customer.joinedAt)}
                      </ThemedText>
                      <View style={styles.diWaitPill}>
                        <ThemedText style={styles.diWaitPillText}>
                          {waitMins} min
                        </ThemedText>
                      </View>
                    </View>
                  </View>
                  <ThemedText style={styles.diPosLabel}>#{index + 1}</ThemedText>
                </View>

                {(cardData.gender || shareChip != null || splitChip != null) ? (
                  <View style={styles.diChipsRow}>
                    {cardData.gender ? (
                      <View style={[styles.diChip, { backgroundColor: getGenderColors(cardData.gender).bg }]}>
                        <ThemedText style={[styles.diChipText, { color: getGenderColors(cardData.gender).fg }]}>
                          {cardData.gender}
                        </ThemedText>
                      </View>
                    ) : null}
                    {shareChip != null ? (
                      <View style={[styles.diChip, { backgroundColor: shareChip.active ? "#D1FAE5" : "#FEE2E2" }]}>
                        <ThemedText style={[styles.diChipText, { color: shareChip.active ? "#059669" : "#DC2626" }]}>
                          {shareChip.active ? "✓ Share OK" : "No Share"}
                        </ThemedText>
                      </View>
                    ) : null}
                    {splitChip != null ? (
                      <View style={[styles.diChip, { backgroundColor: splitChip.active ? "#D1FAE5" : isDark ? colors.surfaceMuted : "#F3F4F6" }]}>
                        <ThemedText style={[styles.diChipText, { color: splitChip.active ? "#059669" : colors.textSecondary }]}>
                          {splitChip.active ? "✓ Split OK" : "No Split"}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View style={[styles.diDivider, { backgroundColor: colors.borderSubtle }]} />

                <View style={styles.diWaitingActions}>
                  <Pressable
                    style={[styles.diAssignBtn, { backgroundColor: colors.primaryDark }]}
                    onPress={() => handleOpenTableAllocation(customer)}
                    testID={`button-assign-table-${customer.id}`}
                  >
                    <ThemedText style={styles.diAssignBtnText}>Assign Table</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.diMoreBtn, { borderColor: colors.primary }]}
                    onPress={() => setMorePopupCustomer(customer)}
                    testID={`button-more-${customer.id}`}
                  >
                    <ThemedText style={[styles.diMoreBtnText, { color: colors.primary }]}>
                      ··· More
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            );
          }) : null}

          {/* ── ASSIGNED TAB ── */}
          {dineInTab === "assigned" ? getCurrentTabCustomers().map((customer) => {
            const cardData = getDineInCardData(customer);
            return (
              <View key={customer.id} style={[styles.diCard, { backgroundColor: isDark ? colors.surface : "#FFFFFF" }]}>
                <View style={styles.diCardHeader}>
                  <View style={[styles.diAvatar, { backgroundColor: colors.primary + "20" }]}>
                    {cardData.partySize != null ? (
                      <View style={styles.diAvatarInner}>
                        <Feather name="users" size={10} color={colors.primary} />
                        <ThemedText style={[styles.diAvatarText, { color: colors.primary }]}>
                          {String(cardData.partySize)}
                        </ThemedText>
                      </View>
                    ) : (
                      <ThemedText style={[styles.diAvatarText, { color: colors.primary }]}>
                        {getInitials(customer.customerName)}
                      </ThemedText>
                    )}
                  </View>
                  <View style={styles.diCardMeta}>
                    <View style={styles.diNameRow}>
                      <ThemedText style={[styles.diCustomerName, { color: colors.text }]} numberOfLines={1}>
                        {customer.customerName}
                      </ThemedText>
                      <View style={[styles.diTicketChip, { backgroundColor: isDark ? colors.surfaceMuted : "#F0EEF8" }]}>
                        <ThemedText style={[styles.diTicketChipText, { color: colors.primary }]}>
                          {customer.ticketNumber}
                        </ThemedText>
                      </View>
                    </View>
                    <View style={styles.diTimeRow}>
                      <View style={styles.diTimeRowItem}>
                        <Feather name="file-text" size={11} color={colors.textSecondary} />
                        <ThemedText style={[styles.diWaitReg, { color: colors.textSecondary }]}>
                          {formatTime(customer.joinedAt)}
                        </ThemedText>
                      </View>
                      {customer.calledAt ? (
                        <View style={styles.diTimeRowItem}>
                          <Feather name="phone-call" size={11} color={colors.primary} />
                          <ThemedText style={[styles.diWaitReg, { color: colors.primary }]}>
                            {formatTime(customer.calledAt)}
                          </ThemedText>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  {customer.tableNumber ? (
                    <View style={styles.diTablePill}>
                      <MaterialCommunityIcons name="table-furniture" size={13} color={colors.primary} />
                      <ThemedText style={[styles.diTablePillText, { color: colors.primary }]}>
                        Table {customer.tableNumber}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>

                <View style={styles.diAssignedActions}>
                  <Pressable
                    style={[styles.diAssignedBtn, { borderColor: colors.primary }]}
                    onPress={() => handleHoldCustomer(customer.id)}
                    testID={`button-hold-${customer.id}`}
                  >
                    <ThemedText style={[styles.diAssignedBtnText, { color: colors.primary }]}>Hold</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.diAssignedBtn, { borderColor: colors.primary }]}
                    onPress={() => handleDineInCallAgain(customer.id)}
                    testID={`button-call-again-${customer.id}`}
                  >
                    <ThemedText style={[styles.diAssignedBtnText, { color: colors.primary }]}>Call again</ThemedText>
                  </Pressable>
                  <Pressable
                    style={styles.diSeatedBtn}
                    onPress={() => handleMarkArrived(customer.id)}
                    testID={`button-seated-${customer.id}`}
                  >
                    <ThemedText style={styles.diSeatedBtnText}>Seated ✓</ThemedText>
                  </Pressable>
                </View>
              </View>
            );
          }) : null}

          {/* ── ON HOLD TAB ── */}
          {dineInTab === "hold" ? getCurrentTabCustomers().map((customer) => {
            const cardData = getDineInCardData(customer);
            return (
              <View key={customer.id} style={[styles.diCard, styles.diHoldCard, { backgroundColor: isDark ? colors.surface : "#FFFFFF" }]}>
                <View style={styles.diCardHeader}>
                  <View style={[styles.diAvatar, { backgroundColor: "#FEF3C7" }]}>
                    {cardData.partySize != null ? (
                      <View style={styles.diAvatarInner}>
                        <Feather name="users" size={10} color="#D97706" />
                        <ThemedText style={[styles.diAvatarText, { color: "#D97706" }]}>
                          {String(cardData.partySize)}
                        </ThemedText>
                      </View>
                    ) : (
                      <ThemedText style={[styles.diAvatarText, { color: "#D97706" }]}>
                        {getInitials(customer.customerName)}
                      </ThemedText>
                    )}
                  </View>
                  <View style={styles.diCardMeta}>
                    <View style={styles.diNameRow}>
                      <ThemedText style={[styles.diCustomerName, { color: colors.text }]} numberOfLines={1}>
                        {customer.customerName}
                      </ThemedText>
                      <View style={[styles.diTicketChip, { backgroundColor: isDark ? colors.surfaceMuted : "#F0EEF8" }]}>
                        <ThemedText style={[styles.diTicketChipText, { color: colors.primary }]}>
                          {customer.ticketNumber}
                        </ThemedText>
                      </View>
                    </View>
                    <View style={styles.diTimeRow}>
                      <View style={styles.diTimeRowItem}>
                        <Feather name="file-text" size={11} color={colors.textSecondary} />
                        <ThemedText style={[styles.diWaitReg, { color: colors.textSecondary }]}>
                          {formatTime(customer.joinedAt)}
                        </ThemedText>
                      </View>
                      {customer.holdAt ? (
                        <View style={styles.diTimeRowItem}>
                          <Feather name="pause-circle" size={11} color="#D97706" />
                          <ThemedText style={[styles.diWaitReg, { color: "#D97706" }]}>
                            {formatTime(customer.holdAt)}
                          </ThemedText>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>

                <View style={styles.diAssignedActions}>
                  <Pressable
                    style={[styles.diAssignedBtn, { borderColor: colors.primary, flex: 1 }]}
                    onPress={() => handleWalkIn(customer.id)}
                    testID={`button-walkin-hold-${customer.id}`}
                  >
                    <ThemedText style={[styles.diAssignedBtnText, { color: colors.primary }]}>Walk In</ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.diSeatedBtn, { flex: 1.4 }]}
                    onPress={() => handleResumeCustomer(customer.id)}
                    testID={`button-resume-${customer.id}`}
                  >
                    <ThemedText style={styles.diSeatedBtnText}>Resume →</ThemedText>
                  </Pressable>
                </View>
              </View>
            );
          }) : null}

          {/* ── DONE TAB ── */}
          {dineInTab === "done" ? getCurrentTabCustomers().map((customer) => {
            const cardData = getDineInCardData(customer);
            const doneStatus = getDoneStatus(customer);
            const regTime = formatTime(customer.joinedAt);
            const doneTime = formatTime((customer.completedAt || customer.arrivedAt || customer.joinedAt) as string);
            const statusLabel = doneStatus === "seated" ? "Seated" : doneStatus === "walkin" ? "Walk In" : "Cancelled";
            const statusBg = doneStatus === "seated" ? "#D1FAE5" : doneStatus === "walkin" ? "#DBEAFE" : "#FEE2E2";
            const statusColor = doneStatus === "seated" ? "#059669" : doneStatus === "walkin" ? "#2563EB" : "#DC2626";
            return (
              <View key={customer.id} style={[styles.diCard, { backgroundColor: isDark ? colors.surface : "#FFFFFF" }]}>
                <View style={styles.diCardHeader}>
                  <View style={[styles.diAvatar, { backgroundColor: doneStatus === "cancelled" ? "#FEE2E2" : "#D1FAE5" }]}>
                    {cardData.partySize != null ? (
                      <View style={styles.diAvatarInner}>
                        <Feather name="users" size={10} color={doneStatus === "cancelled" ? "#DC2626" : "#059669"} />
                        <ThemedText style={[styles.diAvatarText, { color: doneStatus === "cancelled" ? "#DC2626" : "#059669" }]}>
                          {String(cardData.partySize)}
                        </ThemedText>
                      </View>
                    ) : (
                      <ThemedText style={[styles.diAvatarText, { color: doneStatus === "cancelled" ? "#DC2626" : "#059669" }]}>
                        {getInitials(customer.customerName)}
                      </ThemedText>
                    )}
                  </View>
                  <View style={styles.diCardMeta}>
                    <View style={styles.diNameRow}>
                      <ThemedText style={[styles.diCustomerName, { color: colors.text }]} numberOfLines={1}>
                        {customer.customerName}
                      </ThemedText>
                      <View style={[styles.diTicketChip, { backgroundColor: isDark ? colors.surfaceMuted : "#F0EEF8" }]}>
                        <ThemedText style={[styles.diTicketChipText, { color: colors.primary }]}>
                          {customer.ticketNumber}
                        </ThemedText>
                      </View>
                      <View style={[styles.diStatusBadge, { backgroundColor: statusBg }]}>
                        <ThemedText style={[styles.diStatusBadgeText, { color: statusColor }]}>
                          {statusLabel}
                        </ThemedText>
                      </View>
                    </View>
                    <View style={styles.diTimeRow}>
                      <View style={styles.diTimeRowItem}>
                        <Feather name="file-text" size={11} color={colors.textSecondary} />
                        <ThemedText style={[styles.diWaitReg, { color: colors.textSecondary }]}>
                          {regTime}
                        </ThemedText>
                      </View>
                      <View style={styles.diTimeRowItem}>
                        <Feather name="check-circle" size={11} color="#059669" />
                        <ThemedText style={[styles.diWaitReg, { color: colors.textSecondary }]}>
                          {doneTime}
                        </ThemedText>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            );
          }) : null}

        </ScrollView>

        {/* FAB Buttons */}
        <View style={styles.fabContainer}>
          {/* Manual Registration Button */}
          <Pressable
            style={[styles.fabButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              handleOpenManualRegistration();
            }}
          >
            <Feather name="user-plus" size={24} color="#FFFFFF" />
          </Pressable>
          
          {/* Scan Arrival Button — hidden per product request.
              QR check-in remains reachable via the dedicated Check-In Mode
              screen (isCheckInMode), but the floating QR icon is removed
              from the dine-in queue page to declutter the FAB column. */}
        </View>

        {/* Table Allocation Modal */}
        <Modal
          visible={showTableAllocationModal}
          animationType="fade"
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
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
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
                  <View style={[styles.dineInModalCustomerInfo, { backgroundColor: colors.surfaceMuted }]}>
                    <ThemedText style={styles.dineInModalCustomerName}>
                      {selectedCustomerForTable.customerName}
                    </ThemedText>
                    <ThemedText style={[styles.dineInModalTicket, { color: colors.textSecondary }]}>
                      Ticket: {selectedCustomerForTable.ticketNumber}
                    </ThemedText>
                    {(() => {
                      const service = branchServices.find(s => s.id === selectedCustomerForTable.serviceId);
                      const serviceFields = service?.inputFields || [];
                      const getLabel = (fieldId: string) => {
                        const field = serviceFields.find((f: any) => f.id === fieldId);
                        return field?.label || fieldId;
                      };
                      return Object.entries(selectedCustomerForTable.formData || {}).filter(
                        ([key, value]) => value !== undefined && value !== null && value !== "" && !HIDDEN_FORM_KEYS.includes(key)
                      ).map(([key, value]) => (
                        <ThemedText key={key} style={[styles.dineInModalFormData, { color: colors.textSecondary }]}>
                          {getLabel(key)}: {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
                        </ThemedText>
                      ));
                    })()}
                  </View>

                  <View style={styles.inputGroup}>
                    <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                      Table Number *
                    </ThemedText>
                    <TextInput
                      style={[
                        styles.modalInput,
                        {
                          backgroundColor: colors.surfaceMuted,
                          color: colors.text,
                          borderColor: colors.borderSubtle,
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
          animationType="fade"
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
            <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
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
                {(() => {
                  const currentService = effectiveService || branchServices[0];
                  const fields = currentService?.inputFields || [];
                  const showNameField = !serviceHasNameField(currentService);
                  // Only render the fields the admin configured for this
                  // service. If the admin defined a party-size field, it anchors
                  // the form as a stepper and the rest collapse behind "More
                  // details"; otherwise we render the admin fields directly with
                  // no hardcoded Party Size.
                  const partyField = fields.find((f: any) => isPartySizeField(f.label, f.id));
                  const partyKey = partyField?.id || "partySize";
                  const collapsibleFields = fields.filter((f: any) => f.id !== partyField?.id);
                  const partyValue = Number(manualRegistrationFormData[partyKey]) || 1;
                  const setPartySize = (n: number) => {
                    const next = Math.max(1, Math.min(50, n));
                    setManualRegistrationFormData(prev => ({ ...prev, [partyKey]: next, partySize: next }));
                  };
                  const renderField = (field: any) => (
                    <View key={field.id} style={styles.inputGroup}>
                      <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                        {field.label}{field.required ? " *" : ""}
                      </ThemedText>
                      {field.type === "select" && field.options ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          <View style={{ flexDirection: "row", gap: 8 }}>
                            {field.options.map((opt: string) => (
                              <Pressable key={opt} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: manualRegistrationFormData[field.id] === opt ? colors.primary : (colors.borderSubtle), backgroundColor: manualRegistrationFormData[field.id] === opt ? colors.primary + "15" : (colors.surfaceMuted) }} onPress={() => setManualRegistrationFormData(prev => ({ ...prev, [field.id]: opt }))}>
                                <ThemedText style={{ fontSize: 13, fontWeight: manualRegistrationFormData[field.id] === opt ? "700" : "500", color: manualRegistrationFormData[field.id] === opt ? colors.primary : colors.text }}>{opt}</ThemedText>
                              </Pressable>
                            ))}
                          </View>
                        </ScrollView>
                      ) : field.type === "checkbox" ? (
                        <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }} onPress={() => setManualRegistrationFormData(prev => ({ ...prev, [field.id]: !prev[field.id] }))}>
                          <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: manualRegistrationFormData[field.id] ? colors.primary : (colors.borderSubtle), backgroundColor: manualRegistrationFormData[field.id] ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
                            {manualRegistrationFormData[field.id] ? <Feather name="check" size={14} color="#FFF" /> : null}
                          </View>
                          <ThemedText style={{ fontSize: 14 }}>{field.label}</ThemedText>
                        </Pressable>
                      ) : (
                        <TextInput
                          style={[styles.modalInput, { backgroundColor: colors.surfaceMuted, color: colors.text, borderColor: colors.borderSubtle }]}
                          placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                          placeholderTextColor={colors.textSecondary}
                          value={manualRegistrationFormData[field.id] || ""}
                          onChangeText={(text) => setManualRegistrationFormData(prev => ({ ...prev, [field.id]: text }))}
                          keyboardType={field.type === "phone" ? "phone-pad" : field.type === "number" ? "numeric" : field.type === "email" ? "email-address" : "default"}
                          autoCapitalize={field.type === "email" ? "none" : "sentences"}
                        />
                      )}
                    </View>
                  );
                  return (
                  <>
                  {showNameField ? (
                    <View style={styles.inputGroup}>
                      <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Full Name *</ThemedText>
                      <TextInput
                        style={[styles.modalInput, { backgroundColor: colors.surfaceMuted, color: colors.text, borderColor: colors.borderSubtle }]}
                        placeholder="Enter customer's full name"
                        placeholderTextColor={colors.textSecondary}
                        value={manualRegistrationFormData[MANUAL_NAME_FIELD_KEY] || ""}
                        onChangeText={(text) => setManualRegistrationFormData(prev => ({ ...prev, [MANUAL_NAME_FIELD_KEY]: text }))}
                        autoCapitalize="words"
                        testID="input-manual-fullname"
                      />
                    </View>
                  ) : null}

                  {/* WhatsApp number for booking notifications */}
                  <View style={styles.inputGroup}>
                    <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>WhatsApp Number</ThemedText>
                    <TextInput
                      style={[styles.modalInput, { backgroundColor: colors.surfaceMuted, color: colors.text, borderColor: colors.borderSubtle }]}
                      placeholder="e.g. 919876543210 (with country code)"
                      placeholderTextColor={colors.textSecondary}
                      value={manualRegistrationWhatsApp}
                      onChangeText={setManualRegistrationWhatsApp}
                      keyboardType="phone-pad"
                      testID="input-manual-whatsapp"
                    />
                  </View>

                  {/* Notification language picker */}
                  <View style={styles.inputGroup}>
                    <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Notification Language</ThemedText>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {([{ code: "en", label: "English" }, { code: "ta", label: "தமிழ்" }] as const).map((l) => (
                        <Pressable
                          key={l.code}
                          style={{
                            flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 2,
                            borderColor: manualRegistrationLang === l.code ? colors.primary : colors.borderSubtle,
                            backgroundColor: manualRegistrationLang === l.code ? colors.primary + "15" : colors.surfaceMuted,
                            alignItems: "center",
                          }}
                          onPress={() => setManualRegistrationLang(l.code)}
                        >
                          <ThemedText style={{ fontSize: 13, fontWeight: manualRegistrationLang === l.code ? "700" : "500", color: manualRegistrationLang === l.code ? colors.primary : colors.text }}>
                            {l.label}
                          </ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  {partyField ? (
                    <>
                      <View style={styles.inputGroup}>
                        <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>{partyField.label}{partyField.required ? " *" : ""}</ThemedText>
                        <View style={styles.partyStepper}>
                          <Pressable
                            style={[styles.partyStepperBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surfaceMuted }]}
                            onPress={() => setPartySize(partyValue - 1)}
                            testID="button-party-decrement"
                          >
                            <Feather name="minus" size={18} color={colors.text} />
                          </Pressable>
                          <View style={styles.partyStepperValue}>
                            <Feather name="users" size={16} color={colors.primary} />
                            <ThemedText style={[styles.partyStepperValueText, { color: colors.text }]} testID="text-party-size">{partyValue}</ThemedText>
                          </View>
                          <Pressable
                            style={[styles.partyStepperBtn, { borderColor: colors.borderSubtle, backgroundColor: colors.surfaceMuted }]}
                            onPress={() => setPartySize(partyValue + 1)}
                            testID="button-party-increment"
                          >
                            <Feather name="plus" size={18} color={colors.text} />
                          </Pressable>
                        </View>
                      </View>
                      {/* All additional fields shown immediately — no "More details" toggle */}
                      {collapsibleFields.map(renderField)}
                    </>
                  ) : (
                    fields.map(renderField)
                  )}
                  </>
                  );
                })()}
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

        <Modal
          visible={morePopupCustomer !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setMorePopupCustomer(null)}
        >
          <Pressable style={styles.morePopupOverlay} onPress={() => setMorePopupCustomer(null)}>
            <Pressable style={[styles.morePopupCard, { backgroundColor: isDark ? colors.surface : "#FFFFFF" }]}>
              <ThemedText style={[styles.morePopupTitle, { color: colors.text }]} numberOfLines={1}>
                {morePopupCustomer?.customerName}
              </ThemedText>
              <Pressable
                style={[styles.morePopupBtn, { backgroundColor: colors.primaryDark }]}
                onPress={() => {
                  const c = morePopupCustomer;
                  setMorePopupCustomer(null);
                  if (c) handleWalkIn(c.id);
                }}
                testID="button-popup-walkin"
              >
                <Feather name="user-check" size={18} color="#FFFFFF" />
                <ThemedText style={styles.morePopupBtnText}>Walk In</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.morePopupBtn, styles.morePopupBtnOutline, { borderColor: colors.primary }]}
                onPress={() => { if (morePopupCustomer) handleOpenEdit(morePopupCustomer); }}
                testID="button-popup-edit"
              >
                <Feather name="edit-2" size={18} color={colors.primary} />
                <ThemedText style={[styles.morePopupBtnText, { color: colors.primary }]}>Edit</ThemedText>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <BottomSheetModal
          visible={editCustomer !== null}
          onClose={() => { setEditCustomer(null); setEditFormData({}); }}
          title="Edit Details"
          onConfirm={handleSaveEdit}
          confirmLabel="Save Changes"
          confirmLoading={isSavingEdit}
        >
          {(() => {
            if (!editCustomer) return null;
            const service = branchServices.find(s => s.id === editCustomer.serviceId);
            const fields = service?.inputFields || [];
            const showNameField = !serviceHasNameField(service);
            const renderEditField = (field: any) => (
              <View key={field.id} style={styles.inputGroup}>
                <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>
                  {field.label}{field.required ? " *" : ""}
                </ThemedText>
                {field.type === "select" && field.options ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {field.options.map((opt: string) => (
                        <Pressable key={opt} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: editFormData[field.id] === opt ? colors.primary : colors.borderSubtle, backgroundColor: editFormData[field.id] === opt ? colors.primary + "15" : colors.surfaceMuted }} onPress={() => setEditFormData(prev => ({ ...prev, [field.id]: opt }))}>
                          <ThemedText style={{ fontSize: 13, fontWeight: editFormData[field.id] === opt ? "700" : "500", color: editFormData[field.id] === opt ? colors.primary : colors.text }}>{opt}</ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                ) : field.type === "checkbox" ? (
                  <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }} onPress={() => setEditFormData(prev => ({ ...prev, [field.id]: !prev[field.id] }))}>
                    <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: editFormData[field.id] ? colors.primary : colors.borderSubtle, backgroundColor: editFormData[field.id] ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
                      {editFormData[field.id] ? <Feather name="check" size={14} color="#FFF" /> : null}
                    </View>
                    <ThemedText style={{ fontSize: 14 }}>{field.label}</ThemedText>
                  </Pressable>
                ) : (
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: colors.surfaceMuted, color: colors.text, borderColor: colors.borderSubtle }]}
                    placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                    placeholderTextColor={colors.textSecondary}
                    value={editFormData[field.id] != null ? String(editFormData[field.id]) : ""}
                    onChangeText={(text) => setEditFormData(prev => ({ ...prev, [field.id]: text }))}
                    keyboardType={field.type === "phone" ? "phone-pad" : field.type === "number" ? "numeric" : field.type === "email" ? "email-address" : "default"}
                    autoCapitalize={field.type === "email" ? "none" : "sentences"}
                  />
                )}
              </View>
            );
            return (
              <>
                {showNameField ? (
                  <View style={styles.inputGroup}>
                    <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Full Name *</ThemedText>
                    <TextInput
                      style={[styles.modalInput, { backgroundColor: colors.surfaceMuted, color: colors.text, borderColor: colors.borderSubtle }]}
                      placeholder="Enter customer's full name"
                      placeholderTextColor={colors.textSecondary}
                      value={editFormData[MANUAL_NAME_FIELD_KEY] || ""}
                      onChangeText={(text) => setEditFormData(prev => ({ ...prev, [MANUAL_NAME_FIELD_KEY]: text }))}
                      autoCapitalize="words"
                      testID="input-edit-fullname"
                    />
                  </View>
                ) : null}
                {fields.map(renderEditField)}
              </>
            );
          })()}
        </BottomSheetModal>
      </ThemedView>
    );
  }

  // Multi-Stage Mode UI
  if (isMultiStageMode) {
    const handleMSCall = async (customerId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await callSpecificCustomer(customerId, selectedDesk?.id, selectedDesk?.name);
    };

    const handleMSServe = async (customerId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await markAsServing(customerId);
    };

    const handleMSCallAgain = async (customerId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await callAgainCustomer(customerId, selectedDesk?.id, selectedDesk?.name);
    };

    const handleMSMoveToNextStage = async (customerId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await moveToStage(customerId, selectedStageIndex + 1);
    };

    const handleMSCompleteJourney = async (customerId: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await completeJourney(customerId);
    };

    const handleMSCancel = async (customerId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        const { apiRequest } = await import("@/lib/query-client");
        await apiRequest("POST", `/api/tickets/${customerId}/cancel`, {});
        if (currentBranchId) await refreshQueueForBranch(currentBranchId);
      } catch (err) {
        logHandledError("Error cancelling ticket", err);
      }
    };

    const openMoveStageModal = (customerId: string) => {
      setMoveStageTargetId(customerId);
      setShowMoveStageModal(true);
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

    const nextStage = selectedJourney?.stages[selectedStageIndex + 1];
    const isLastStage = selectedStageIndex === (selectedJourney?.stages.length || 1) - 1;

    // Waiting tab: active customers at this stage (waiting / called / serving)
    const msWaiting = customersAtStage.filter(
      (c) => c.status === "waiting" || c.status === "called" || c.status === "serving"
    );

    // Completed tab: finished-at-last-stage + moved-forward customers
    const msCompletedHere = queue.filter(
      (c) =>
        c.journeyId === selectedJourney?.id &&
        c.status === "completed" &&
        (c.currentStageIndex || 0) === selectedStageIndex
    );
    const msMovedPast = queue.filter(
      (c) =>
        c.journeyId === selectedJourney?.id &&
        (c.currentStageIndex || 0) > selectedStageIndex &&
        c.stageHistory?.some((h) => h.stageIndex === selectedStageIndex && h.completedAt)
    );
    const msCancelled = queue.filter(
      (c) =>
        c.journeyId === selectedJourney?.id &&
        c.status === "cancelled" &&
        (c.currentStageIndex || 0) === selectedStageIndex
    );
    const msCompleted = [...msCompletedHere, ...msMovedPast, ...msCancelled];

    const msCurList = msTab === "completed" ? msCompleted : msWaiting;
    const msFilters: { key: "waiting" | "completed"; label: string; count: number }[] = [
      { key: "waiting", label: "Active", count: msWaiting.length },
      { key: "completed", label: "Completed", count: msCompleted.length },
    ];

    const getMovedToService = (c: QueueCustomer): string | undefined => {
      if (msMovedPast.some((m) => m.id === c.id)) {
        const nextEntry = c.stageHistory?.find((h) => h.stageIndex === selectedStageIndex + 1);
        return nextEntry?.serviceName || nextStage?.serviceName;
      }
      return undefined;
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
      <ThemedView style={[styles.container, styles.fifoContainer]}>

        {/* Journey selector */}
        {journeys.length > 1 ? (
          <View style={styles.journeySelector}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.journeyTabs}>
                {journeys.map((journey) => (
                  <Pressable
                    key={journey.id}
                    style={[styles.journeyTab, { backgroundColor: selectedJourney?.id === journey.id ? colors.primary : (isDark ? "#2A2A2A" : "#F1F5F9") }]}
                    onPress={() => { setSelectedJourneyId(journey.id); setSelectedStageIndex(0); }}
                  >
                    <ThemedText style={[styles.journeyTabText, { color: selectedJourney?.id === journey.id ? "#FFFFFF" : colors.text }]}>
                      {journey.name}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        ) : null}

        {/* Stage flow */}
        <View style={styles.stageFlowContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stageFlowContent}>
            {stageTabs.map((tab, index) => (
              <React.Fragment key={tab.key}>
                <Pressable
                  style={[
                    styles.stageTab,
                    { backgroundColor: selectedStageIndex === tab.key ? colors.primary : (isDark ? "#2A2A2A" : "#F1F5F9") },
                    tab.isOptional && selectedStageIndex !== tab.key ? { borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderSubtle } : undefined,
                  ]}
                  onPress={() => { Haptics.selectionAsync(); setSelectedStageIndex(tab.key); setMsTab("waiting"); }}
                >
                  <View style={styles.stageTabContent}>
                    <View style={styles.stageTabHeader}>
                      <ThemedText style={[styles.stageTabIndex, { color: selectedStageIndex === tab.key ? "rgba(255,255,255,0.7)" : colors.textSecondary }]}>
                        Stage {tab.key + 1}
                      </ThemedText>
                      {tab.isOptional ? (
                        <View style={[styles.optionalBadge, { backgroundColor: selectedStageIndex === tab.key ? "rgba(255,255,255,0.2)" : (isDark ? "#3D3D00" : "#FEF3C7") }]}>
                          <ThemedText style={[styles.optionalBadgeText, { color: selectedStageIndex === tab.key ? "#FFFFFF" : colors.warning }]}>Opt</ThemedText>
                        </View>
                      ) : null}
                    </View>
                    <ThemedText style={[styles.stageTabLabel, { color: selectedStageIndex === tab.key ? "#FFFFFF" : colors.text }]} numberOfLines={1}>
                      {tab.label}
                    </ThemedText>
                    <View style={[styles.stageTabCount, { backgroundColor: selectedStageIndex === tab.key ? "rgba(255,255,255,0.3)" : (isDark ? "#444" : "#E2E8F0") }]}>
                      <ThemedText style={[styles.stageTabCountText, { color: selectedStageIndex === tab.key ? "#FFFFFF" : colors.textSecondary }]}>
                        {tab.count}
                      </ThemedText>
                    </View>
                  </View>
                </Pressable>
                {index < stageTabs.length - 1 ? (
                  <Feather name="chevron-right" size={18} color={colors.textSecondary} style={styles.stageArrow} />
                ) : null}
              </React.Fragment>
            ))}
          </ScrollView>
        </View>

        {/* Caption */}
        <View style={styles.fifoCaption}>
          <Feather name="git-branch" size={13} color={OrgDesign.muted} />
          <ThemedText style={styles.fifoCaptionText}>
            {currentStage?.serviceName} — Stage {selectedStageIndex + 1} of {selectedJourney?.stages.length}
            {isLastStage ? "  (final stage)" : nextStage ? `  →  ${nextStage.serviceName}` : ""}
          </ThemedText>
        </View>

        {/* Active / Completed tabs */}
        <View style={styles.fifoTabsRow}>
          {msFilters.map((f) => {
            const active = msTab === f.key;
            return (
              <Pressable key={f.key} style={styles.fifoTab} onPress={() => { Haptics.selectionAsync(); setMsTab(f.key); }} testID={`ms-tab-${f.key}`}>
                <View style={styles.fifoTabInner}>
                  <ThemedText style={[styles.fifoTabText, active ? styles.fifoTabTextActive : undefined]}>{f.label}</ThemedText>
                  <View style={[styles.fifoTabBadge, active ? styles.fifoTabBadgeActive : undefined]}>
                    <ThemedText style={[styles.fifoTabBadgeText, active ? styles.fifoTabBadgeTextActive : undefined]}>{f.count}</ThemedText>
                  </View>
                </View>
                <View style={[styles.fifoTabUnderline, active ? styles.fifoTabUnderlineActive : undefined]} />
              </Pressable>
            );
          })}
        </View>

        {/* Customer list */}
        <ScrollView
          style={styles.queueList}
          contentContainerStyle={[styles.queueContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {msCurList.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Feather name={msTab === "completed" ? "check-circle" : "users"} size={26} color={colors.textSecondary} />
              </View>
              <ThemedText style={styles.emptyTitle}>
                {msTab === "completed" ? "No completed customers" : "No customers at this stage"}
              </ThemedText>
              <ThemedText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                {msTab === "completed"
                  ? "Completed and forwarded customers appear here."
                  : `${currentStage?.serviceName || "Stage"} is currently empty.`}
              </ThemedText>
            </View>
          ) : (
            msCurList.map((customer, index) => {
              const svcInputFields = (organization?.services.find((s) => s.id === customer.serviceId)?.inputFields || []).map((f) => ({ id: f.id, label: f.label }));
              const movedTo = getMovedToService(customer);
              return (
                <FifoCard
                  key={customer.id}
                  customer={customer}
                  expanded={msTab === "waiting" && index === 0}
                  tab={msTab === "completed" ? "completed" : "waiting"}
                  displayPosition={index + 1}
                  inputFields={svcInputFields}
                  callLabel="Call"
                  onCallNow={customer.status === "waiting"
                    ? () => handleMSCall(customer.id)
                    : () => handleMSCallAgain(customer.id)}
                  onStart={() => handleMSServe(customer.id)}
                  onDone={() => handleMSCompleteJourney(customer.id)}
                  onMoveStage={customer.status === "serving"
                    ? () => openMoveStageModal(customer.id)
                    : undefined}
                  moveStageLabel="Move to"
                  onNoShow={() => handleNoShow(customer.id)}
                  onResume={() => handleResumeFifo(customer.id)}
                  onSkip={() => handleSkip(customer.id)}
                  onTransfer={() => handleTransferFifo(customer.id)}
                  onCancel={() => handleMSCancel(customer.id)}
                  movedToService={movedTo}
                />
              );
            })
          )}
        </ScrollView>

        {/* FAB - Add Customer */}
        <Pressable
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleOpenAddToQueue(); }}
          testID="fab-add-customer-multistage"
        >
          <Feather name="user-plus" size={24} color="#FFFFFF" />
        </Pressable>

        {/* FIFO Transfer Modal */}
        <Modal visible={!!transferTarget} animationType="fade" transparent onRequestClose={() => setTransferTarget(null)}>
          <Pressable style={styles.fifoTransferBackdrop} onPress={() => setTransferTarget(null)}>
            <Pressable style={[styles.fifoTransferSheet, { paddingBottom: insets.bottom + Spacing.lg }]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.fifoTransferHandle} />
              <ThemedText style={styles.fifoTransferTitle}>Assign to counter</ThemedText>
              <ThemedText style={styles.fifoTransferSub}>
                {transferTarget ? `${transferTarget.customerName || "Guest"}  •  ${transferTarget.ticketNumber}` : ""}
              </ThemedText>
              {(() => {
                const transferDesks = transferTarget
                  ? (currentBranch?.services?.find((s) => s.id === transferTarget.serviceId)?.desks || []).filter((d) => d.isActive)
                  : [];
                if (transferDesks.length === 0) {
                  return (
                    <View style={styles.fifoTransferEmpty}>
                      <Feather name="monitor" size={22} color={OrgDesign.muted} />
                      <ThemedText style={styles.fifoTransferEmptyText}>No active counters for this service.</ThemedText>
                    </View>
                  );
                }
                return (
                  <ScrollView style={styles.fifoTransferList}>
                    {transferDesks.map((desk) => (
                      <Pressable key={desk.id} style={styles.fifoTransferRow} onPress={() => handleAssignToDesk(desk.id, desk.name)}>
                        <View style={styles.fifoTransferRowIcon}><Feather name="monitor" size={16} color={OrgDesign.primary} /></View>
                        <ThemedText style={styles.fifoTransferRowText} numberOfLines={1}>{desk.name}</ThemedText>
                        <Feather name="chevron-right" size={18} color={OrgDesign.muted} />
                      </Pressable>
                    ))}
                  </ScrollView>
                );
              })()}
              <Pressable style={styles.fifoTransferCancel} onPress={() => setTransferTarget(null)}>
                <ThemedText style={styles.fifoTransferCancelText}>Cancel</ThemedText>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Manual Add to Queue Modal (shared) */}
        <Modal
          visible={showAddToQueueModal}
          animationType="none"
          transparent={true}
          onRequestClose={() => setShowAddToQueueModal(false)}
        >
          <Pressable style={styles.addToQueueOverlay} onPress={() => { Keyboard.dismiss(); setShowAddToQueueModal(false); }}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              pointerEvents="box-none"
            >
              <Animated.View
                entering={SlideInDown.duration(300)}
                exiting={SlideOutDown.duration(220)}
                style={[styles.addToQueueCard, { backgroundColor: colors.surface }]}
              >
                <View onStartShouldSetResponder={() => true}>
                  <View style={styles.modalHandle} />
                  <View style={styles.modalHeader}>
                    <ThemedText style={styles.modalTitle}>Add Customer to Queue</ThemedText>
                    <Pressable onPress={() => setShowAddToQueueModal(false)} hitSlop={8} style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted }}>
                      <Feather name="x" size={18} color={colors.text} />
                    </Pressable>
                  </View>
                <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View style={styles.modalBody}>
                    {!serviceHasNameField(selectedAddService) ? (
                      <View style={styles.inputGroup}>
                        <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Full Name *</ThemedText>
                        <TextInput
                          style={[styles.modalInput, { backgroundColor: "#F7F5FE", color: colors.text, borderColor: colors.borderSubtle }]}
                          placeholder="Enter customer's full name"
                          placeholderTextColor={colors.textSecondary}
                          value={addToQueueFormData[MANUAL_NAME_FIELD_KEY] || ""}
                          onChangeText={(text) => setAddToQueueFormData(prev => ({ ...prev, [MANUAL_NAME_FIELD_KEY]: text }))}
                          autoCapitalize="words"
                          testID="input-addqueue-fullname"
                        />
                      </View>
                    ) : null}

                    {/* WhatsApp number — used to send booking notifications */}
                    <View style={styles.inputGroup}>
                      <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>WhatsApp Number</ThemedText>
                      <TextInput
                        style={[styles.modalInput, { backgroundColor: "#F7F5FE", color: colors.text, borderColor: colors.borderSubtle }]}
                        placeholder="e.g. 919876543210 (with country code)"
                        placeholderTextColor={colors.textSecondary}
                        value={addToQueueWhatsApp}
                        onChangeText={setAddToQueueWhatsApp}
                        keyboardType="phone-pad"
                        testID="input-addqueue-whatsapp2"
                      />
                    </View>

                    {/* Notification language picker */}
                    <View style={styles.inputGroup}>
                      <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Notification Language</ThemedText>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {([{ code: "en", label: "English" }, { code: "ta", label: "தமிழ்" }] as const).map((l) => (
                          <Pressable
                            key={l.code}
                            style={{
                              flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 2,
                              borderColor: addToQueueLang === l.code ? colors.primary : colors.borderSubtle,
                              backgroundColor: addToQueueLang === l.code ? colors.primary + "15" : colors.surfaceMuted,
                              alignItems: "center",
                            }}
                            onPress={() => setAddToQueueLang(l.code)}
                          >
                            <ThemedText style={{ fontSize: 13, fontWeight: addToQueueLang === l.code ? "700" : "500", color: addToQueueLang === l.code ? colors.primary : colors.text }}>
                              {l.label}
                            </ThemedText>
                          </Pressable>
                        ))}
                      </View>
                    </View>

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
                                  style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: addToQueueFormData[field.id] === opt ? colors.primary : colors.borderSubtle, backgroundColor: addToQueueFormData[field.id] === opt ? colors.primary + "15" : colors.surfaceMuted }}
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
                            <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: addToQueueFormData[field.id] ? colors.primary : colors.borderSubtle, backgroundColor: addToQueueFormData[field.id] ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
                              {addToQueueFormData[field.id] ? <Feather name="check" size={14} color="#FFF" /> : null}
                            </View>
                            <ThemedText style={{ fontSize: 14 }}>{field.label}</ThemedText>
                          </Pressable>
                        ) : (
                          <TextInput
                            style={[styles.modalInput, { backgroundColor: "#F7F5FE", color: colors.text, borderColor: colors.borderSubtle }]}
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
              </Animated.View>
            </KeyboardAvoidingView>
          </Pressable>
        </Modal>

        {/* Move to Stage Modal */}
        <Modal
          visible={showMoveStageModal}
          animationType="fade"
          transparent
          onRequestClose={() => setShowMoveStageModal(false)}
        >
          <Pressable style={styles.addToQueueOverlay} onPress={() => setShowMoveStageModal(false)}>
            <Pressable
              style={[styles.addToQueueCard, { backgroundColor: colors.surface, paddingBottom: insets.bottom + Spacing.lg }]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>Move Customer To</ThemedText>
                <Pressable onPress={() => setShowMoveStageModal(false)} hitSlop={8} style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted }}>
                  <Feather name="x" size={18} color={colors.text} />
                </Pressable>
              </View>
              <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                {(selectedJourney?.stages || []).map((stage, idx) => {
                  if (idx === selectedStageIndex) return null;
                  return (
                    <Pressable
                      key={stage.id || idx}
                      style={[styles.stationOptionCard, { borderColor: colors.borderSubtle, backgroundColor: colors.surfaceMuted, marginBottom: 8 }]}
                      onPress={async () => {
                        setShowMoveStageModal(false);
                        if (moveStageTargetId) {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          await moveToStage(moveStageTargetId, idx);
                          setMoveStageTargetId(null);
                        }
                      }}
                      testID={`ms-moveto-stage-${idx}`}
                    >
                      <View style={[styles.stationOptionIcon, { backgroundColor: colors.primary + "15" }]}>
                        <Feather name="arrow-right-circle" size={18} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={[styles.stationOptionTitle, { color: colors.primary }]}>{stage.serviceName}</ThemedText>
                        <ThemedText style={[styles.stationOptionMeta, { color: colors.textSecondary }]}>Stage {idx + 1}</ThemedText>
                      </View>
                      <Feather name="chevron-right" size={18} color={colors.textSecondary} />
                    </Pressable>
                  );
                })}
                <Pressable
                  style={[styles.stationOptionCard, { borderColor: "#16A34A40", backgroundColor: "#16A34A0A", marginBottom: 8 }]}
                  onPress={async () => {
                    setShowMoveStageModal(false);
                    if (moveStageTargetId) {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      await completeJourney(moveStageTargetId);
                      setMoveStageTargetId(null);
                    }
                  }}
                  testID="ms-moveto-complete"
                >
                  <View style={[styles.stationOptionIcon, { backgroundColor: "#16A34A15" }]}>
                    <Feather name="check-circle" size={18} color="#16A34A" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={[styles.stationOptionTitle, { color: "#16A34A" }]}>Complete</ThemedText>
                    <ThemedText style={[styles.stationOptionMeta, { color: colors.textSecondary }]}>Mark journey as finished</ThemedText>
                  </View>
                  <Feather name="chevron-right" size={18} color="#16A34A" />
                </Pressable>
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, (isFifoMode || isSelectiveMode) ? styles.fifoContainer : undefined]}>

      {(isFifoMode || isSelectiveMode) ? null : (
        <Pressable
          style={[styles.stationIndicator, { backgroundColor: colors.surfaceMuted, borderColor: colors.primary + "30" }]}
          onPress={() => { Haptics.selectionAsync(); openStationModal(); }}
          testID="button-station-selector"
        >
          <View style={styles.stationIndicatorContent}>
            <Feather name="sliders" size={16} color={colors.primary} />
            <ThemedText style={[styles.stationIndicatorText, { color: colors.text }]} numberOfLines={1}>{stationSummary}</ThemedText>
          </View>
          <Feather name="chevron-right" size={16} color={colors.textSecondary} />
        </Pressable>
      )}

      <Modal
        visible={showStationModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowStationModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowStationModal(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: colors.surface }]} onPress={() => {}}>
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
                      { backgroundColor: idx <= currentStepIndex ? colors.primary : (colors.borderSubtle) },
                    ]} />
                    {idx < stationSteps.length - 1 ? (
                      <View style={[styles.stepLine, { backgroundColor: idx < currentStepIndex ? colors.primary : (colors.borderSubtle) }]} />
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
                          borderColor: selectedBranchId === branch.id ? colors.primary : (colors.borderSubtle),
                          backgroundColor: selectedBranchId === branch.id ? colors.primary + "10" : (colors.surfaceMuted),
                        }]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSelectedBranchId(branch.id);
                          // Re-anchor the shared service to one that belongs to the
                          // new branch (preferring a front-desk assigned service when
                          // one exists here) so we never carry a cross-branch service.
                          const branchServices = branch.services?.filter((s) => s.isActive) ?? [];
                          const assigned = currentUser?.assignedServiceIds ?? [];
                          const preferred = assigned.length > 0
                            ? branchServices.find((s) => assigned.includes(s.id))
                            : undefined;
                          const nextService = preferred ?? branchServices[0];
                          setSelectedServiceId(nextService ? nextService.id : null);
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
                          <View style={[styles.stationCheckCircle, { borderWidth: 2, borderColor: colors.borderSubtle }]} />
                        )}
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {stationStep === "service" ? (
                  <View style={{ gap: 8 }}>
                    {servicesForBranch.map((svc) => {
                      const svcDesks = (svc.desks || []).filter(d => d.isActive);
                      return (
                        <Pressable
                          key={svc.id}
                          style={[styles.stationOptionCard, {
                            borderColor: selectedServiceId === svc.id ? colors.primary : (colors.borderSubtle),
                            backgroundColor: selectedServiceId === svc.id ? colors.primary + "10" : (colors.surfaceMuted),
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
                            <View style={[styles.stationCheckCircle, { borderWidth: 2, borderColor: colors.borderSubtle }]} />
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
                        borderColor: !selectedDeskId ? colors.primary : (colors.borderSubtle),
                        backgroundColor: !selectedDeskId ? colors.primary + "10" : (colors.surfaceMuted),
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
                        <View style={[styles.stationCheckCircle, { borderWidth: 2, borderColor: colors.borderSubtle }]} />
                      )}
                    </Pressable>
                    {desksForSelection.map((desk) => {
                      const parentSvc = currentBranch?.services?.find(s => s.id === desk.serviceId);
                      return (
                        <Pressable
                          key={desk.id}
                          style={[styles.stationOptionCard, {
                            borderColor: selectedDeskId === desk.id ? colors.primary : (colors.borderSubtle),
                            backgroundColor: selectedDeskId === desk.id ? colors.primary + "10" : (colors.surfaceMuted),
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
                            <View style={[styles.stationCheckCircle, { borderWidth: 2, borderColor: colors.borderSubtle }]} />
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

      {(isFifoMode || isSelectiveMode) ? (
        <View style={styles.fifoCaption}>
          <Feather name="info" size={13} color={OrgDesign.muted} />
          <ThemedText style={styles.fifoCaptionText}>
            {isSelectiveMode
              ? "Selective mode — call customers in any order"
              : "Customers are called in registered order"}
          </ThemedText>
        </View>
      ) : null}

      {(isFifoMode || isSelectiveMode) ? (
        <View style={styles.fifoTabsRow}>
          {fifoFilters.map((filter) => {
            const isActive = fifoTab === filter.key;
            return (
              <Pressable
                key={filter.key}
                style={styles.fifoTab}
                onPress={() => { Haptics.selectionAsync(); setFifoTab(filter.key); }}
                testID={`fifo-tab-${filter.key}`}
              >
                <View style={styles.fifoTabInner}>
                  <ThemedText style={[styles.fifoTabText, isActive ? styles.fifoTabTextActive : undefined]}>
                    {filter.label}
                  </ThemedText>
                  <View style={[styles.fifoTabBadge, isActive ? styles.fifoTabBadgeActive : undefined]}>
                    <ThemedText style={[styles.fifoTabBadgeText, isActive ? styles.fifoTabBadgeTextActive : undefined]}>
                      {filter.count}
                    </ThemedText>
                  </View>
                </View>
                <View style={[styles.fifoTabUnderline, isActive ? styles.fifoTabUnderlineActive : undefined]} />
              </Pressable>
            );
          })}
        </View>
      ) : (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersContainer}
        style={styles.filtersScroll}
      >
        {filters.map((filter) => {
          const isActive = filterStatus === filter.key;
          return (
            <Pressable
              key={filter.key}
              style={[
                styles.filterChip,
                isActive && styles.filterChipActive,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setFilterStatus(filter.key);
              }}
            >
              <View style={styles.filterTextRow}>
                <ThemedText
                  style={[
                    styles.filterText,
                    { color: isActive ? colors.text : colors.textSecondary },
                    isActive && styles.filterTextActive,
                  ]}
                >
                  {filter.label}
                </ThemedText>
                <ThemedText style={styles.filterCount}>{filter.count}</ThemedText>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      )}

      <ScrollView
        style={styles.queueList}
        contentContainerStyle={[styles.queueContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {(isFifoMode || isSelectiveMode) ? (
          fifoList.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Feather name="inbox" size={26} color={colors.textSecondary} />
              </View>
              <ThemedText style={styles.emptyTitle}>All caught up</ThemedText>
              <ThemedText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                {fifoTab === "completed"
                  ? "No completed customers yet."
                  : fifoTab === "hold"
                  ? "No customers on hold."
                  : "No customers in the queue right now."}
              </ThemedText>
            </View>
          ) : (
            fifoList.map((customer, index) => (
              <FifoCard
                key={customer.id}
                customer={customer}
                expanded={fifoTab === "waiting" && index === 0}
                isAllExpanded={isSelectiveMode}
                tab={fifoTab}
                displayPosition={index + 1}
                callLabel={isSelectiveMode ? "Call" : undefined}
                inputFields={(organization?.services.find((s) => s.id === customer.serviceId)?.inputFields || []).map((f) => ({ id: f.id, label: f.label }))}
                onCallNow={customer.status === "waiting"
                  ? (isSelectiveMode ? () => handleCall(customer.id) : handleCallNext)
                  : () => handleCallAgain(customer.id)}
                onStart={() => handleServe(customer.id)}
                onDone={() => handleComplete(customer.id)}
                onNoShow={() => handleNoShow(customer.id)}
                onResume={() => handleResumeFifo(customer.id)}
                onSkip={() => handleSkip(customer.id)}
                onTransfer={() => handleTransferFifo(customer.id)}
                onCancel={() => handleNoShow(customer.id)}
              />
            ))
          )
        ) : filteredQueue.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Feather name="inbox" size={26} color={colors.textSecondary} />
            </View>
            <ThemedText style={styles.emptyTitle}>All caught up</ThemedText>
            <ThemedText style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {filterStatus === "completed" ? "No completed customers yet." : "No customers in the queue right now."}
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
        <Feather name={isFifoMode ? "plus" : "user-plus"} size={24} color="#FFFFFF" />
      </Pressable>

      {/* FIFO Transfer / Assign-to-counter Modal */}
      <Modal
        visible={!!transferTarget}
        animationType="fade"
        transparent
        onRequestClose={() => setTransferTarget(null)}
      >
        <Pressable style={styles.fifoTransferBackdrop} onPress={() => setTransferTarget(null)}>
          <Pressable style={[styles.fifoTransferSheet, { paddingBottom: insets.bottom + Spacing.lg }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.fifoTransferHandle} />
            <ThemedText style={styles.fifoTransferTitle}>Assign to counter</ThemedText>
            <ThemedText style={styles.fifoTransferSub}>
              {transferTarget ? `${transferTarget.customerName || "Guest"}  •  ${transferTarget.ticketNumber}` : ""}
            </ThemedText>
            {(() => {
              const transferDesks = transferTarget
                ? (currentBranch?.services?.find((s) => s.id === transferTarget.serviceId)?.desks || []).filter((d) => d.isActive)
                : [];
              if (transferDesks.length === 0) {
                return (
                  <View style={styles.fifoTransferEmpty}>
                    <Feather name="monitor" size={22} color={OrgDesign.muted} />
                    <ThemedText style={styles.fifoTransferEmptyText}>No active counters for this service.</ThemedText>
                  </View>
                );
              }
              return (
                <ScrollView style={styles.fifoTransferList}>
                  {transferDesks.map((desk) => (
                    <Pressable
                      key={desk.id}
                      style={styles.fifoTransferRow}
                      onPress={() => handleAssignToDesk(desk.id, desk.name)}
                      testID={`fifo-assign-desk-${desk.id}`}
                    >
                      <View style={styles.fifoTransferRowIcon}>
                        <Feather name="monitor" size={16} color={OrgDesign.primary} />
                      </View>
                      <ThemedText style={styles.fifoTransferRowText} numberOfLines={1}>{desk.name}</ThemedText>
                      <Feather name="chevron-right" size={18} color={OrgDesign.muted} />
                    </Pressable>
                  ))}
                </ScrollView>
              );
            })()}
            <Pressable style={styles.fifoTransferCancel} onPress={() => setTransferTarget(null)} testID="fifo-assign-cancel">
              <ThemedText style={styles.fifoTransferCancelText}>Cancel</ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Manual Add to Queue Modal */}
      <Modal
        visible={showAddToQueueModal}
        animationType="none"
        transparent={true}
        onRequestClose={() => setShowAddToQueueModal(false)}
      >
        <Pressable style={styles.addToQueueOverlay} onPress={() => { Keyboard.dismiss(); setShowAddToQueueModal(false); }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            pointerEvents="box-none"
          >
            <Animated.View
              entering={SlideInDown.duration(300)}
              exiting={SlideOutDown.duration(220)}
              style={[styles.addToQueueCard, { backgroundColor: colors.surface }]}
            >
              <View onStartShouldSetResponder={() => true}>
                <View style={styles.modalHandle} />
                <View style={styles.modalHeader}>
                  <ThemedText style={styles.modalTitle}>Add Customer to Queue</ThemedText>
                  <Pressable
                    onPress={() => setShowAddToQueueModal(false)}
                    hitSlop={8}
                    style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted }}
                  >
                    <Feather name="x" size={18} color={colors.text} />
                  </Pressable>
                </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.modalBody}>
                {!serviceHasNameField(selectedAddService) ? (
                  <View style={styles.inputGroup}>
                    <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Full Name *</ThemedText>
                    <TextInput
                      style={[styles.modalInput, { backgroundColor: "#F7F5FE", color: colors.text, borderColor: colors.borderSubtle }]}
                      placeholder="Enter customer's full name"
                      placeholderTextColor={colors.textSecondary}
                      value={addToQueueFormData[MANUAL_NAME_FIELD_KEY] || ""}
                      onChangeText={(text) => setAddToQueueFormData(prev => ({ ...prev, [MANUAL_NAME_FIELD_KEY]: text }))}
                      autoCapitalize="words"
                      testID="input-addqueue-fullname"
                    />
                  </View>
                ) : null}

                {/* WhatsApp number — used to send booking notifications */}
                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>WhatsApp Number</ThemedText>
                  <TextInput
                    style={[styles.modalInput, { backgroundColor: "#F7F5FE", color: colors.text, borderColor: colors.borderSubtle }]}
                    placeholder="e.g. 919876543210 (with country code)"
                    placeholderTextColor={colors.textSecondary}
                    value={addToQueueWhatsApp}
                    onChangeText={setAddToQueueWhatsApp}
                    keyboardType="phone-pad"
                    testID="input-addqueue-whatsapp"
                  />
                </View>

                {/* Notification language picker */}
                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Notification Language</ThemedText>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {([{ code: "en", label: "English" }, { code: "ta", label: "தமிழ்" }] as const).map((l) => (
                      <Pressable
                        key={l.code}
                        style={{
                          flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 2,
                          borderColor: addToQueueLang === l.code ? colors.primary : colors.borderSubtle,
                          backgroundColor: addToQueueLang === l.code ? colors.primary + "15" : colors.surfaceMuted,
                          alignItems: "center",
                        }}
                        onPress={() => setAddToQueueLang(l.code)}
                      >
                        <ThemedText style={{ fontSize: 13, fontWeight: addToQueueLang === l.code ? "700" : "500", color: addToQueueLang === l.code ? colors.primary : colors.text }}>
                          {l.label}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                </View>

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
                                  borderColor: addToQueueFormData[field.id] === opt ? colors.primary : (colors.borderSubtle),
                                  backgroundColor: addToQueueFormData[field.id] === opt ? colors.primary + "15" : (colors.surfaceMuted),
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
                          borderColor: addToQueueFormData[field.id] ? colors.primary : (colors.borderSubtle),
                          backgroundColor: addToQueueFormData[field.id] ? colors.primary : "transparent",
                          alignItems: "center", justifyContent: "center",
                        }}>
                          {addToQueueFormData[field.id] ? <Feather name="check" size={14} color="#FFF" /> : null}
                        </View>
                        <ThemedText style={{ fontSize: 14 }}>{field.label}</ThemedText>
                      </Pressable>
                    ) : (
                      <TextInput
                        style={[styles.modalInput, { backgroundColor: "#F7F5FE", color: colors.text, borderColor: colors.borderSubtle }]}
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
            </Animated.View>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const createStyles = (colors: typeof Colors.light) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F5FE",
  },
  fifoContainer: {
    backgroundColor: "#F7F5FE",
  },
  fifoTabsRow: {
    flexDirection: "row",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8E2EE",
  },
  fifoTab: {
    flex: 1,
    alignItems: "center",
  },
  fifoTabInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
  },
  fifoTabText: {
    fontFamily: OrgDesign.fonts.medium,
    fontSize: 13.5,
    color: OrgDesign.muted,
  },
  fifoTabTextActive: {
    fontFamily: OrgDesign.fonts.bold,
    color: OrgDesign.primary,
  },
  fifoTabBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: "#ECECEF",
    alignItems: "center",
    justifyContent: "center",
  },
  fifoTabBadgeActive: {
    backgroundColor: OrgDesign.primary,
  },
  fifoTabBadgeText: {
    fontFamily: OrgDesign.fonts.semibold,
    fontSize: 11,
    color: "#6B7280",
  },
  fifoTabBadgeTextActive: {
    color: "#FFFFFF",
  },
  fifoTabUnderline: {
    height: 2.5,
    width: "70%",
    borderRadius: 2,
    backgroundColor: "transparent",
  },
  fifoTabUnderlineActive: {
    backgroundColor: OrgDesign.primary,
  },
  fifoCaption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  fifoCaptionText: {
    fontFamily: OrgDesign.fonts.regular,
    fontSize: 12,
    color: OrgDesign.muted,
  },
  fifoTransferBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  fifoTransferSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  fifoTransferHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    marginBottom: Spacing.md,
  },
  fifoTransferTitle: {
    fontFamily: OrgDesign.fonts.bold,
    fontSize: 17,
    color: OrgDesign.text,
  },
  fifoTransferSub: {
    fontFamily: OrgDesign.fonts.regular,
    fontSize: 13,
    color: OrgDesign.muted,
    marginTop: 4,
    marginBottom: Spacing.md,
  },
  fifoTransferList: {
    maxHeight: 320,
  },
  fifoTransferEmpty: {
    alignItems: "center",
    gap: 10,
    paddingVertical: Spacing.xl,
  },
  fifoTransferEmptyText: {
    fontFamily: OrgDesign.fonts.regular,
    fontSize: 13,
    color: OrgDesign.muted,
    textAlign: "center",
  },
  fifoTransferRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#FAF9FC",
    marginBottom: 8,
  },
  fifoTransferRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: OrgDesign.primaryTint,
    alignItems: "center",
    justifyContent: "center",
  },
  fifoTransferRowText: {
    flex: 1,
    fontFamily: OrgDesign.fonts.semibold,
    fontSize: 14.5,
    color: OrgDesign.text,
  },
  fifoTransferCancel: {
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.sm,
    backgroundColor: "#F3F4F6",
  },
  fifoTransferCancelText: {
    fontFamily: OrgDesign.fonts.semibold,
    fontSize: 15,
    color: OrgDesign.text,
  },
  callNextButton: {
    width: "100%",
  },
  filtersScroll: {
    maxHeight: 52,
    marginTop: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  processBar: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  processBarPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...Shadows.subtle,
  },
  processBarIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary + "12",
    justifyContent: "center",
    alignItems: "center",
  },
  processBarPrimaryText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  processBarBadge: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 10,
    backgroundColor: colors.primary + "12",
    justifyContent: "center",
    alignItems: "center",
  },
  processBarBadgeText: {
    color: colors.primary,
    fontSize: 11.5,
    fontWeight: "700",
  },
  processBarHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  processBarHintText: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
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
  queueStatusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  queueStatusBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  queueStatusRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
  },
  queueStatusBarInRow: {
    flex: 1,
    marginHorizontal: 0,
    marginTop: 0,
  },
  completeAllInlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: "#EF4444",
  },
  completeAllInlineText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  completeAllWarning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  completeAllWarningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  completeAllConfirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  completeAllConfirmText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  queueStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  queueStatusLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  queueStatusDivider: {
    width: 1,
    height: 14,
  },
  queueStatusTarget: {
    fontSize: 12,
    fontWeight: "500",
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
    gap: Spacing.xl,
    alignItems: "flex-end",
  },
  filterChip: {
    paddingHorizontal: 2,
    paddingTop: Spacing.sm,
    paddingBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  filterChipActive: {
    borderBottomColor: colors.primary,
  },
  filterText: {
    fontSize: 13.5,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  filterTextActive: {
    color: colors.text,
    fontWeight: "700",
  },
  filterTextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  filterCount: {
    fontSize: 10.5,
    fontWeight: "600",
    color: colors.textSecondary,
    opacity: 0.7,
  },
  callNextSolid: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    borderRadius: 10,
    width: "100%",
    ...Shadows.subtle,
  },
  callNextSolidText: {
    color: "#FFFFFF",
    fontSize: 14.5,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  queueList: {
    flex: 1,
  },
  queueContent: {
    padding: Spacing.lg,
    gap: 14,
  },
  customerCard: {
    padding: Spacing.xl,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 0,
    ...Shadows.small,
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#F1F3F8",
  },
  ticketNumber: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.6,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace" }) as any,
    color: colors.text,
  },
  priorityBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: "600",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: "#F1F3F8",
  },
  statusText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: colors.textSecondary,
    letterSpacing: 0.1,
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
    flexWrap: "wrap",
    gap: 6,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#F4F6FA",
  },
  metaText: {
    fontSize: 11.5,
    fontWeight: "500",
  },
  serviceTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.primary + "10",
    alignSelf: "flex-start",
    marginTop: 4,
  },
  serviceText: {
    fontSize: 11.5,
    fontWeight: "600",
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
    borderRadius: BorderRadius.full,
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
    color: colors.accent,
  },
  waitingNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
  },
  waitingText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: Spacing["5xl"],
    paddingHorizontal: Spacing.xl,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#F1F3F8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 0,
  },
  emptySubtitle: {
    fontSize: 13.5,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: "center",
  },
  prominentCard: {
    padding: Spacing.xl,
    backgroundColor: "#FFFFFF",
    ...Shadows.card,
  },
  calledCard: {
    backgroundColor: "#FFFFFF",
    ...Shadows.card,
  },
  calledBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 10,
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
    alignSelf: "flex-start",
    backgroundColor: "transparent",
    paddingVertical: 0,
    paddingHorizontal: 0,
    marginBottom: Spacing.md,
    gap: 6,
  },
  nextUpBannerText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  callNextButtonInCard: {
    width: "100%",
  },
  detailsToggle: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingVertical: 4,
    marginTop: -2,
    marginBottom: Spacing.sm,
  },
  detailsToggleText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    letterSpacing: 0.1,
  },
  formDataSection: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
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
    color: colors.primary,
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
    color: colors.textSecondary,
    flex: 1,
  },
  formDataValue: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
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
    fontWeight: "700",
    fontFamily: "Nunito_700Bold",
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
    borderRadius: BorderRadius.sm,
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
    backgroundColor: "#F1F3F8",
    borderRadius: 10,
    padding: 4,
  },
  takeawayTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  takeawayTabActive: {
    backgroundColor: "#FFFFFF",
    ...Shadows.subtle,
  },
  takeawayTabText: {
    fontSize: 13.5,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  takeawayStats: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  takeawayStat: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...Shadows.subtle,
  },
  takeawayStatIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  takeawayStatNumber: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    lineHeight: 22,
  },
  takeawayStatLabel: {
    fontSize: 11.5,
    fontWeight: "600",
    color: colors.textSecondary,
    letterSpacing: 0.2,
    textTransform: "uppercase",
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
  twCard: {
    borderRadius: 14,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...Shadows.subtle,
  },
  twCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  twAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  twAvatarText: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  twCardMeta: {
    flex: 1,
    gap: 2,
  },
  twNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexWrap: "wrap",
  },
  twCustomerName: {
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
  },
  twTicketNumber: {
    fontSize: 16,
    fontWeight: "700",
    flexShrink: 1,
  },
  twOrderId: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  twTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  twTimeText: {
    fontSize: 12,
  },
  twWaitPill: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    flexShrink: 0,
  },
  twWaitPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#D97706",
  },
  twReadyTime: {
    fontSize: 12,
    fontWeight: "600",
    color: "#059669",
    marginTop: 1,
  },
  twPhoneBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  twItemsList: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing.sm,
    marginTop: 2,
  },
  twActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  twOutlineBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  twOutlineBtnText: {
    fontSize: 13.5,
    fontWeight: "600",
  },
  twMarkReadyBtn: {
    flex: 2,
    backgroundColor: "#16A34A",
    borderRadius: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  twMarkReadyBtnText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  twDeliveredBtn: {
    flex: 2,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  twDeliveredBtnText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  twSwipeHint: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 6,
  },
  twDeliveredTimes: {
    alignItems: "flex-end",
    gap: 2,
    flexShrink: 0,
  },
  twDeliveredTimestamp: {
    fontSize: 11.5,
    fontWeight: "500",
  },
  orderCard: {
    padding: Spacing.lg,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    ...Shadows.small,
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
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#F1F3F8",
    minWidth: 44,
    alignItems: "center",
  },
  orderTicketNumber: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.5,
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
    borderRadius: BorderRadius.full,
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
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    ...Shadows.subtle,
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
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    ...Shadows.card,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  modalDismissArea: {
    flex: 1,
  },
  modalContent: {
    borderRadius: 32,
    paddingTop: Spacing.lg,
  },
  addToQueueRoot: {
    flex: 1,
  },
  addToQueueScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  addToQueueFloat: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  addToQueueOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  addToQueueCard: {
    borderRadius: 32,
    paddingBottom: Spacing.lg,
  },
  modalHandle: {
    width: 44,
    height: 5,
    backgroundColor: "rgba(0,0,0,0.12)",
    borderRadius: 3,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: Spacing.md,
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
    fontWeight: "800",
    fontFamily: "Nunito_800ExtraBold",
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
    borderRadius: 16,
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
    borderRadius: 16,
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
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  dineInTabActive: {
    borderColor: colors.primary + "40",
    backgroundColor: colors.primary + "08",
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
    padding: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#1A1A1A",
    minWidth: 44,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  dineInTicketNumber: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.5,
  },
  dineInCustomerInfo: {
    flex: 1,
    gap: 2,
  },
  dineInCustomerName: {
    fontSize: 18,
    fontWeight: "600",
    flexShrink: 1,
  },
  dineInMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 3,
  },
  dineInMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  dineInMetaText: {
    fontSize: 12,
  },
  dineInFormDataText: {
    fontSize: 12,
    marginTop: 2,
  },
  dineInHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  dineInMoreButton: {
    padding: 4,
    borderRadius: BorderRadius.full,
  },
  dineInChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: Spacing.md,
  },
  dineInChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  dineInPartyChip: {
    paddingHorizontal: 12,
  },
  dineInTableChip: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
  },
  dineInChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  dineInChipLabel: {
    fontSize: 12,
    fontWeight: "600",
    opacity: 0.85,
  },
  dineInExtraSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E4E7EF",
    paddingTop: Spacing.sm,
    marginBottom: Spacing.md,
    gap: 6,
  },
  dineInExtraRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.md,
  },
  dineInExtraLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  dineInExtraLabel: {
    fontSize: 13,
    flexShrink: 1,
  },
  dineInExtraValue: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
    flexShrink: 1,
  },
  partyStepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  partyStepperBtn: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  partyStepperValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 64,
    justifyContent: "center",
  },
  partyStepperValueText: {
    fontSize: 20,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  moreDetailsToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  moreDetailsText: {
    fontSize: 14,
    fontWeight: "600",
  },
  dineInCallCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    gap: 4,
    backgroundColor: "#F4F6FA",
  },
  dineInCallCountText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  // ── New Dine-In Redesign Styles ──
  diTabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  diTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: Spacing.sm,
    gap: 6,
    borderBottomWidth: 2.5,
    borderBottomColor: "transparent",
    flex: 1,
    justifyContent: "center",
  },
  diTabText: {
    fontSize: 13,
  },
  diTabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  diTabBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  diCard: {
    borderRadius: 16,
    padding: 18,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  diHoldCard: {},
  diCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
  },
  diAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  diAvatarText: {
    fontSize: 16,
    fontWeight: "800",
    fontFamily: headingFont("heavy"),
  },
  diPosLabel: {
    fontSize: 12,
    fontWeight: "400",
    color: "#9CA3AF",
    alignSelf: "flex-start",
  },
  diTablePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F7F5FE",
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  diTablePillText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: headingFont("semibold"),
  },
  diAvatarInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  diCardMeta: {
    flex: 1,
  },
  diNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  diCustomerName: {
    fontSize: 16,
    fontWeight: "800",
    fontFamily: headingFont("heavy"),
    flexShrink: 1,
  },
  diGenderIcon: {
    fontSize: 14,
  },
  diTicketChip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  diTicketChipText: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: headingFont("bold"),
  },
  diGuestBadge: {
    backgroundColor: "#FCE7F3",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    minWidth: 36,
  },
  diGuestBadgeText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#DB2777",
  },
  diPosBadge: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    alignSelf: "flex-start",
    flexShrink: 0,
  },
  diPosBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  diGenderText: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 4,
  },
  diPosCol: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  diTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    flexWrap: "wrap",
  },
  diTimeRowItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  diWaitReg: {
    fontSize: 11,
    fontWeight: "500",
  },
  diWaitPill: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  diWaitPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#D97706",
  },
  diChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  diChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  diChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  diDivider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  diWaitingActions: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    marginBottom: 8,
  },
  diAssignBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  diAssignBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  diMoreBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  diMoreBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  morePopupOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  morePopupCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 18,
    padding: 18,
    gap: 12,
  },
  morePopupTitle: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  morePopupBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  morePopupBtnOutline: {
    borderWidth: 1.5,
  },
  morePopupBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  diAssignedActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  diAssignedBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  diAssignedBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  diSeatedBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },
  diSeatedBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  diStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    flexShrink: 0,
  },
  diStatusBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  diDoneMeta: {
    fontSize: 12,
    marginTop: 4,
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
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: 12,
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
    ...Shadows.medium,
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
    paddingHorizontal: 10,
    paddingBottom: 20,
    zIndex: 1000,
  },
  stageSelectorBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  stageSelectorModal: {
    borderRadius: 32,
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

  // ── Check-In mode ────────────────────────────────────────────────────────
  ciScanCard: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  ciScanHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ciScanIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  ciScanLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.9,
    fontFamily: "Nunito_800ExtraBold",
  },
  ciInputRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  ciTextInput: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: "Nunito_600SemiBold",
  },
  ciCheckInBtn: {
    height: 46,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  ciCheckInBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Nunito_700Bold",
  },
  ciDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  ciDivider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  ciDividerText: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
  },
  ciCameraBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 16,
    borderWidth: 1,
  },
  ciCameraBtnText: {
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Nunito_700Bold",
  },
  ciTabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ciTab: {
    flex: 1,
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 0,
  },
  ciTabInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 10,
  },
  ciTabText: {
    fontSize: 13,
    fontWeight: "500",
    fontFamily: "Nunito_600SemiBold",
  },
  ciTabBadge: {
    minWidth: 22,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  ciTabBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Nunito_700Bold",
  },
  ciTabUnderline: {
    height: 3,
    width: "70%",
    borderRadius: 2,
    backgroundColor: "transparent",
  },
  ciList: {
    flex: 1,
  },
  ciListContent: {
    padding: 16,
    gap: 12,
  },
  ciEmptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 32,
  },
  ciEmptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  ciEmptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    fontFamily: "Nunito_700Bold",
    textAlign: "center",
  },
  ciEmptySubtitle: {
    fontSize: 13,
    fontFamily: "Nunito_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  ciCard: {
    borderRadius: 20,
    flexDirection: "row",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  ciCardAccent: {
    width: 4,
    alignSelf: "stretch",
  },
  ciCardBody: {
    flex: 1,
    padding: 14,
    gap: 10,
  },
  ciCardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  ciAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  ciAvatarText: {
    fontSize: 15,
    fontWeight: "800",
    fontFamily: "Nunito_800ExtraBold",
  },
  ciNameBlock: {
    flex: 1,
    gap: 4,
  },
  ciNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  ciCustomerName: {
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Nunito_700Bold",
  },
  ciTicketChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  ciTicketChipText: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Nunito_700Bold",
  },
  ciMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  ciMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ciMetaSep: {
    fontSize: 13,
  },
  ciMeta: {
    fontSize: 12,
    fontFamily: "Nunito_400Regular",
  },
  ciStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  ciStatusText: {
    fontSize: 11,
    fontWeight: "700",
    fontFamily: "Nunito_700Bold",
  },
  ciTicketIdRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  ciTicketId: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "Nunito_700Bold",
  },
  ciCardActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  ciActionCheckIn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 13,
  },
  ciActionCheckInText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "Nunito_700Bold",
  },
  ciActionNoShow: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  ciActionNoShowText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Nunito_600SemiBold",
  },
});
