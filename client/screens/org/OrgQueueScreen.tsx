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
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, Layout, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing } from "react-native-reanimated";
import { useEffect } from "react";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
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
      case "no_show":
        return "#EF4444";
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
}: FifoCardProps) {
  const isTerminal = tab === "completed";
  const isHold = tab === "hold";
  const isServing = customer.status === "serving";
  const [showFields, setShowFields] = useState(false);

  const getFieldLabel = (fieldId: string) => inputFields.find((f) => f.id === fieldId)?.label || fieldId;
  const formDataEntries = Object.entries(customer.formData || {}).filter(
    ([, value]) => value !== undefined && value !== null && value !== ""
  );
  const hasFields = !!customer.customerPhone || formDataEntries.length > 0;

  return (
    <Animated.View
      entering={FadeIn}
      exiting={FadeOut}
      layout={Layout}
      style={[fifoStyles.card, expanded ? fifoStyles.cardExpanded : undefined]}
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
        </View>
        <View style={fifoStyles.rightCol}>
          <View style={fifoStyles.regTimeRow}>
            <Feather name="clock" size={12} color={OrgDesign.muted} />
            <ThemedText style={fifoStyles.regTime}>{formatRegisteredTime(customer.joinedAt)}</ThemedText>
          </View>
          <View style={fifoStyles.waitPill}>
            <ThemedText style={fifoStyles.waitText}>{formatWaitDuration(customer.joinedAt)} waiting</ThemedText>
          </View>
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

      {expanded && !isTerminal && !isHold ? (
        <>
          <View style={fifoStyles.divider} />

          <View style={fifoStyles.actionRow}>
            <Pressable style={[fifoStyles.actBtn, fifoStyles.actCall]} onPress={onCallNow} testID={`fifo-call-${customer.id}`}>
              <Feather name="phone" size={15} color="#FFFFFF" />
              <ThemedText style={[fifoStyles.actText, { color: "#FFFFFF" }]}>Call Now</ThemedText>
            </Pressable>
            <Pressable
              style={[fifoStyles.actBtn, isServing ? fifoStyles.actDone : fifoStyles.actStart]}
              onPress={isServing ? onDone : onStart}
              testID={`fifo-startdone-${customer.id}`}
            >
              <Feather name={isServing ? "check" : "play"} size={15} color="#FFFFFF" />
              <ThemedText style={[fifoStyles.actText, { color: "#FFFFFF" }]}>{isServing ? "Done" : "Start"}</ThemedText>
            </Pressable>
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
  actNoShow: {
    backgroundColor: "#FEE2E2",
  },
  actStart: {
    backgroundColor: OrgDesign.primary,
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
    setQueueStatusFor,
    refreshOrganizationData,
    selectedBranchId,
    setSelectedBranchId,
    selectedServiceId,
    setSelectedServiceId,
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
  const [transferTarget, setTransferTarget] = useState<QueueCustomer | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [ticketInput, setTicketInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastCheckIn, setLastCheckIn] = useState<{ ticketNumber: string; name: string; time: string } | null>(null);

  const [takeawayTab, setTakeawayTab] = useState<"active" | "completed">("active");
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);

  const [newOrderId, setNewOrderId] = useState("");
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [counterOrderCount, setCounterOrderCount] = useState(1);
  
  // Dine In mode state
  const [dineInTab, setDineInTab] = useState<"reservation" | "waiting" | "called" | "hold" | "arrived">("waiting");
  const [showManualRegistrationModal, setShowManualRegistrationModal] = useState(false);
  const [manualRegistrationFormData, setManualRegistrationFormData] = useState<Record<string, any>>({});
  const [isRegistering, setIsRegistering] = useState(false);
  const [manualExtraExpanded, setManualExtraExpanded] = useState(false);
  const [expandedDineInCards, setExpandedDineInCards] = useState<Record<string, boolean>>({});
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

  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(null);
  const [showStationModal, setShowStationModal] = useState(false);
  const [stationStep, setStationStep] = useState<"branch" | "service" | "desk">("branch");

  // Manual Add to Queue state
  const [showAddToQueueModal, setShowAddToQueueModal] = useState(false);
  const [addToQueueServiceId, setAddToQueueServiceId] = useState<string>("");
  const [addToQueueFormData, setAddToQueueFormData] = useState<Record<string, any>>({});
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
    if (effectiveServiceId && effectiveService) {
      return (effectiveService as any)?.queueStatus || "ended";
    }
    return (currentBranch as any)?.queueStatus || "ended";
  };

  const currentQueueStatus = getCurrentQueueStatus();
  const queueStatusInfo = queueStatusConfig[currentQueueStatus] || queueStatusConfig.ended;

  const getQueueStatusTargetLabel = () => {
    if (selectedDeskId && selectedDesk) return selectedDesk.name;
    if (effectiveServiceId && effectiveService) return effectiveService.name;
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
      } else if (effectiveServiceId && effectiveService) {
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
    setAddToQueueServiceId(effectiveServiceId || branchServices[0]?.id || "");
    setAddToQueueFormData({});
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
        formData: addToQueueFormData,
        source: "manual",
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
    if (filterStatus === "completed") return c.status === "completed" || c.status === "no_show";
    return c.status !== "completed" && c.status !== "no_show" && c.status !== "cancelled";
  });

  const waitingCount = queue.filter((c) => c.status === "waiting").length;
  const calledCount = queue.filter((c) => c.status === "called").length;
  const servingCount = queue.filter((c) => c.status === "serving").length;

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
    
    const customerName = `Customer ${counterOrderCount}`;
    
    try {
      const result = await addCounterOrder(customerName, newOrderId.trim());
      
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

  const checkedInToday = queue.filter((c) => c.status === "serving" || c.status === "completed").length;

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

  const waitingCustomers = queue.filter((c) => c.status === "waiting");
  const firstWaitingId = waitingCustomers.length > 0 ? waitingCustomers[0].id : null;

  // FIFO-mode data (service-scoped). "Waiting" holds everything still in play
  // (waiting/called/serving), "On Hold" holds paused tickets, "Completed" holds
  // terminal tickets. Used only by the dedicated FIFO layout.
  const fifoScoped = (c: QueueCustomer) => !effectiveServiceId || c.serviceId === effectiveServiceId;
  const fifoWaiting = queue.filter(
    (c) => fifoScoped(c) && (c.status === "waiting" || c.status === "called" || c.status === "serving")
  );
  const fifoHold = queue.filter((c) => fifoScoped(c) && c.status === "hold");
  const fifoCompleted = queue.filter((c) => fifoScoped(c) && (c.status === "completed" || c.status === "no_show"));
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
          <Card variant="outlined" style={styles.checkInCard}>
            <View style={[styles.checkInHeader, { borderBottomColor: colors.borderSubtle }]}>
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
                      backgroundColor: colors.surfaceMuted,
                      color: colors.text,
                      borderColor: colors.borderSubtle,
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
              <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
              <ThemedText style={[styles.dividerText, { color: colors.textSecondary }]}>or</ThemedText>
              <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />
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
            <Card variant="outlined" style={styles.statCard}>
              <ThemedText style={[styles.statNumber, { color: colors.primary }]}>{queue.length}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>Registered</ThemedText>
            </Card>
            <Card variant="outlined" style={styles.statCard}>
              <ThemedText style={[styles.statNumber, { color: colors.success }]}>{checkedInToday}</ThemedText>
              <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>Checked In</ThemedText>
            </Card>
          </View>

          {lastCheckIn ? (
            <Card variant="outlined" style={styles.lastCheckInCard}>
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
            {([
              { key: "active" as const, label: "Active", count: activeOrders.length },
              { key: "completed" as const, label: "Completed", count: completedOrders.length },
            ]).map((t) => {
              const isActive = takeawayTab === t.key;
              return (
                <Pressable
                  key={t.key}
                  style={[styles.takeawayTab, isActive && styles.takeawayTabActive]}
                  onPress={() => setTakeawayTab(t.key)}
                >
                  <View style={styles.filterTextRow}>
                    <ThemedText
                      style={[
                        styles.takeawayTabText,
                        { color: isActive ? colors.text : colors.textSecondary },
                        isActive && { fontWeight: "700" },
                      ]}
                    >
                      {t.label}
                    </ThemedText>
                    <ThemedText style={styles.filterCount}>{t.count}</ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {takeawayTab === "active" ? (
          <>
            <View style={styles.takeawayStats}>
              <View style={styles.takeawayStat}>
                <View style={[styles.takeawayStatIcon, { backgroundColor: "#FEF3C7" }]}>
                  <Feather name="clock" size={14} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.takeawayStatNumber}>{preparingOrders.length}</ThemedText>
                  <ThemedText style={styles.takeawayStatLabel}>Preparing</ThemedText>
                </View>
              </View>
              <View style={styles.takeawayStat}>
                <View style={[styles.takeawayStatIcon, { backgroundColor: colors.success + "18" }]}>
                  <Feather name="check-circle" size={14} color={colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.takeawayStatNumber}>{readyOrders.length}</ThemedText>
                  <ThemedText style={styles.takeawayStatLabel}>Ready</ThemedText>
                </View>
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
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconCircle}>
                    <Feather name="package" size={26} color={colors.textSecondary} />
                  </View>
                  <ThemedText style={styles.emptyTitle}>No active orders</ThemedText>
                  <ThemedText style={styles.emptySubtitle}>
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
                    <Card key={order.id} variant="outlined" style={styles.orderCard}>
                      <View style={styles.orderHeader}>
                        <View style={styles.orderTicketSection}>
                          <View style={styles.orderTicketBadge}>
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
                            { backgroundColor: (isReady ? colors.success : "#D97706") + "15" },
                          ]}
                        >
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isReady ? colors.success : "#D97706" }} />
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
                        <View style={[styles.orderServiceRow, { borderTopColor: colors.borderSubtle }]}>
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
              <View style={styles.emptyState}>
                <View style={styles.emptyIconCircle}>
                  <Feather name="inbox" size={26} color={colors.textSecondary} />
                </View>
                <ThemedText style={styles.emptyTitle}>No completed orders yet</ThemedText>
              </View>
            ) : (
              completedOrders.slice(0, 50).map((order) => {
                const source = getOrderSource(order);
                const sourceBadge = getSourceBadge(source);
                const displayOrderId = order.formData?.orderId || order.ticketNumber;

                return (
                  <Card key={order.id} variant="outlined" style={styles.completedOrderCard}>
                    <View style={styles.completedOrderHeader}>
                      <View style={styles.orderTicketSection}>
                        <View style={styles.orderTicketBadge}>
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
    const reservationCustomers = queue.filter((c) => c.status === "reservation").sort((a, b) => 
      new Date(a.reservationTime || a.joinedAt).getTime() - new Date(b.reservationTime || b.joinedAt).getTime()
    );
    const apiReservations = branchReservations.filter((r: any) => r.status === "confirmed");
    const waitingCustomers = queue.filter((c) => c.status === "waiting").sort((a, b) => 
      new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()
    );
    const calledCustomers = queue.filter((c) => c.status === "called");
    const holdCustomers = queue.filter((c) => c.status === "hold");
    const arrivedCustomers = queue.filter((c) => c.status === "arrived" || c.status === "completed" || c.status === "no_show");

    const dineInTabs = [
      { key: "waiting" as const, label: "Waiting", count: waitingCustomers.length, icon: "clock" as const },
      { key: "called" as const, label: "Called", count: calledCustomers.length, icon: "phone" as const },
      { key: "hold" as const, label: "On Hold", count: holdCustomers.length, icon: "pause-circle" as const },
      { key: "arrived" as const, label: "Arrived", count: arrivedCustomers.length, icon: "check-circle" as const },
      { key: "reservation" as const, label: "Reservations", count: reservationCustomers.length + apiReservations.length, icon: "calendar" as const },
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
      setManualExtraExpanded(false);
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

    return (
      <ThemedView style={styles.container}>

        {/* Dine In Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dineInTabsContainer}
          style={styles.dineInTabsScroll}
        >
          {dineInTabs.map((tab) => {
            const active = dineInTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[
                  styles.dineInTab,
                  active && styles.dineInTabActive,
                ]}
                onPress={() => setDineInTab(tab.key)}
              >
                <Feather
                  name={tab.icon}
                  size={15}
                  color={active ? colors.primary : colors.textSecondary}
                />
                <ThemedText
                  style={[
                    styles.dineInTabText,
                    { color: active ? colors.text : colors.textSecondary },
                    active && { fontWeight: "700" },
                  ]}
                >
                  {tab.label}
                </ThemedText>
                <View
                  style={[
                    styles.dineInTabBadge,
                    {
                      backgroundColor: active
                        ? colors.primary + "15"
                        : "rgba(15,23,42,0.06)",
                    },
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.dineInTabBadgeText,
                      { color: active ? colors.primary : colors.textSecondary },
                    ]}
                  >
                    {tab.count}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
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
              <Card key={`api-${res.id}`} variant="outlined" style={{ padding: Spacing.md, backgroundColor: "#FFFFFF", borderLeftWidth: 3, borderLeftColor: colors.primary, ...Shadows.small }}>
                <View style={styles.dineInCardHeader}>
                  <View style={styles.dineInTicketSection}>
                    <View style={[styles.dineInTicketBadge, { backgroundColor: "#F1F3F8" }]}>
                      <ThemedText style={[styles.dineInTicketNumber, { color: colors.text }]}>
                        {res.confirmationCode?.slice(0, 3) || "R"}
                      </ThemedText>
                    </View>
                    <View style={styles.dineInCustomerInfo}>
                      <View style={styles.dineInNameRow}>
                        <ThemedText style={styles.dineInCustomerName}>
                          {res.customerName}
                        </ThemedText>
                        <View style={[styles.sourceBadge, { backgroundColor: "#F4F6FA" }]}>
                          <Feather name="calendar" size={10} color={colors.textSecondary} />
                          <ThemedText style={[styles.sourceBadgeText, { color: colors.textSecondary }]}>
                            Online
                          </ThemedText>
                        </View>
                      </View>
                      <View style={styles.dineInMeta}>
                        <Feather name="clock" size={12} color={colors.textSecondary} />
                        <ThemedText style={[styles.dineInMetaText, { color: colors.text, fontWeight: "600" }]}>
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
            <View style={styles.emptyState}>
              <View style={styles.emptyIconCircle}>
                <Feather
                  name={dineInTabs.find((t) => t.key === dineInTab)?.icon || "users"}
                  size={26}
                  color={colors.textSecondary}
                />
              </View>
              <ThemedText style={styles.emptyTitle}>
                No {dineInTab === "reservation" ? "reservations" : dineInTab === "waiting" ? "customers waiting" : dineInTab === "called" ? "customers called" : dineInTab === "hold" ? "customers on hold" : "arrived customers"}
              </ThemedText>
            </View>
          ) : null}
          {getCurrentTabCustomers().length > 0 ? (
            getCurrentTabCustomers().map((customer) => {
              const cardData = getDineInCardData(customer);
              const isExpanded = !!expandedDineInCards[customer.id];
              const timeLabel = dineInTab === "reservation" && customer.reservationTime
                ? `${formatTime(customer.reservationTime)}`
                : `${formatTime(customer.joinedAt)}`;
              const servedTime = customer.arrivedAt || customer.completedAt
                ? formatTime((customer.arrivedAt || customer.completedAt) as string)
                : "\u2014";
              return (
              <Card key={customer.id} variant="outlined" style={styles.dineInCard}>
                <View style={styles.dineInCardHeader}>
                  <View style={styles.dineInTicketSection}>
                    <View style={styles.dineInTicketBadge}>
                      <ThemedText style={styles.dineInTicketNumber}>
                        {customer.ticketNumber}
                      </ThemedText>
                    </View>
                    <View style={styles.dineInCustomerInfo}>
                      <View style={styles.dineInNameRow}>
                        <ThemedText style={styles.dineInCustomerName} numberOfLines={1}>
                          {customer.customerName}
                        </ThemedText>
                        {customer.source ? (
                          <Feather
                            name={getSourceBadge(customer.source).icon}
                            size={14}
                            color={getSourceBadge(customer.source).color}
                          />
                        ) : null}
                      </View>
                      <View style={styles.dineInMeta}>
                        <View style={styles.dineInMetaItem}>
                          <Feather name="log-in" size={11} color={colors.textSecondary} />
                          <ThemedText style={[styles.dineInMetaText, { color: colors.textSecondary }]}>
                            {timeLabel}
                          </ThemedText>
                        </View>
                        {dineInTab === "arrived" && (customer.arrivedAt || customer.completedAt) ? (
                          <View style={styles.dineInMetaItem}>
                            <Feather name="check-circle" size={11} color={colors.textSecondary} />
                            <ThemedText style={[styles.dineInMetaText, { color: colors.textSecondary }]}>
                              {servedTime}
                            </ThemedText>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                  <View style={styles.dineInHeaderRight}>
                    {customer.callCount > 0 ? (
                      <View style={styles.dineInCallCountBadge}>
                        <Feather name="phone" size={11} color={colors.textSecondary} />
                        <ThemedText style={styles.dineInCallCountText}>
                          {customer.callCount}x
                        </ThemedText>
                      </View>
                    ) : null}
                    {cardData.extraFields.length > 0 ? (
                      <Pressable
                        style={styles.dineInMoreButton}
                        hitSlop={8}
                        onPress={() => setExpandedDineInCards(prev => ({ ...prev, [customer.id]: !prev[customer.id] }))}
                        testID={`button-expand-card-${customer.id}`}
                      >
                        <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color={colors.textSecondary} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <View style={styles.dineInChipsRow}>
                  <View style={[styles.dineInChip, styles.dineInPartyChip, { backgroundColor: colors.primary }]}>
                    <Feather name="users" size={13} color="#FFFFFF" />
                    <ThemedText style={[styles.dineInChipText, { color: "#FFFFFF", fontWeight: "800" }]}>
                      {cardData.partySize != null && String(cardData.partySize) !== "" ? cardData.partySize : 1}
                    </ThemedText>
                    <ThemedText style={[styles.dineInChipLabel, { color: "#FFFFFF" }]}>
                      {Number(cardData.partySize) === 1 ? "guest" : "guests"}
                    </ThemedText>
                  </View>
                  {cardData.gender ? (
                    <View style={[styles.dineInChip, { backgroundColor: colors.surfaceMuted }]}>
                      <Feather name="user" size={12} color={colors.textSecondary} />
                      <ThemedText style={[styles.dineInChipText, { color: colors.text }]}>
                        {cardData.gender}
                      </ThemedText>
                    </View>
                  ) : null}
                  {cardData.statusChips.map((chip) => (
                    <View
                      key={chip.label}
                      style={[styles.dineInChip, { backgroundColor: colors.surfaceMuted }]}
                    >
                      <Feather name={chip.active ? "check" : "x"} size={12} color={colors.textSecondary} />
                      <ThemedText style={[styles.dineInChipText, { color: colors.text }]}>
                        {chip.label}
                      </ThemedText>
                    </View>
                  ))}
                  {customer.tableNumber ? (
                    <View style={[styles.dineInChip, styles.dineInTableChip, { borderColor: colors.primary }]}>
                      <Feather name="grid" size={12} color={colors.primary} />
                      <ThemedText style={[styles.dineInChipText, { color: colors.primary, fontWeight: "700" }]}>
                        Table {customer.tableNumber}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>

                {isExpanded && cardData.extraFields.length > 0 ? (
                  <View style={styles.dineInExtraSection}>
                    {cardData.extraFields.map((f) => (
                      <View key={f.label} style={styles.dineInExtraRow}>
                        <View style={styles.dineInExtraLabelWrap}>
                          <Feather name="tag" size={12} color={colors.textSecondary} />
                          <ThemedText style={[styles.dineInExtraLabel, { color: colors.textSecondary }]} numberOfLines={1}>{f.label}</ThemedText>
                        </View>
                        <ThemedText style={[styles.dineInExtraValue, { color: colors.text }]} numberOfLines={2}>{f.value}</ThemedText>
                      </View>
                    ))}
                  </View>
                ) : null}

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
                    <Pressable
                      testID={`button-complete-${customer.id}`}
                      style={({ pressed }) => [styles.dineInActionButton, styles.dineInActionPrimary, { backgroundColor: colors.primary }, pressed && { opacity: 0.88 }]}
                      onPress={() => handleComplete(customer.id)}
                    >
                      <Feather name="check" size={18} color="#FFFFFF" />
                      <ThemedText style={[styles.dineInActionText, { color: "#FFFFFF" }]}>
                        Complete
                      </ThemedText>
                    </Pressable>
                  )}
                </View>
              </Card>
              );
            })
          ) : null}
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
                        ([, value]) => value !== undefined && value !== null && value !== ""
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
                      {collapsibleFields.length > 0 ? (
                        <>
                          <Pressable
                            style={styles.moreDetailsToggle}
                            onPress={() => setManualExtraExpanded(v => !v)}
                            testID="button-toggle-more-fields"
                          >
                            <ThemedText style={[styles.moreDetailsText, { color: colors.primary }]}>
                              {manualExtraExpanded ? "Hide additional details" : "More details"}
                            </ThemedText>
                            <Feather name={manualExtraExpanded ? "chevron-up" : "chevron-down"} size={18} color={colors.primary} />
                          </Pressable>
                          {manualExtraExpanded ? collapsibleFields.map(renderField) : null}
                        </>
                      ) : null}
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
                      borderColor: colors.borderSubtle,
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
                <Card key={customer.id} variant="outlined" style={styles.multiStageCard}>
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
                    <View style={[styles.stageProgressBadge, { backgroundColor: colors.surfaceMuted }]}>
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
            <View style={[styles.stageSelectorModal, { backgroundColor: colors.surface }]}>
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
                        { backgroundColor: colors.surfaceMuted },
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
          animationType="none"
          transparent={true}
          onRequestClose={() => setShowAddToQueueModal(false)}
        >
          <View style={styles.addToQueueRoot}>
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(200)}
              style={styles.addToQueueScrim}
            >
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => { Keyboard.dismiss(); setShowAddToQueueModal(false); }}
              />
            </Animated.View>
            <KeyboardAvoidingView
              style={styles.addToQueueFloat}
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              pointerEvents="box-none"
            >
              <Animated.View
                entering={SlideInDown.duration(300)}
                exiting={SlideOutDown.duration(220)}
                style={[styles.addToQueueCard, { backgroundColor: colors.surface }]}
              >
                <View style={styles.modalHeader}>
                  <ThemedText style={styles.modalTitle}>Add Customer to Queue</ThemedText>
                  <Pressable onPress={() => setShowAddToQueueModal(false)} hitSlop={8} style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted }}>
                    <Feather name="x" size={18} color={colors.text} />
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
                                style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: isClosed ? (colors.borderSubtle) : addToQueueServiceId === service.id ? colors.primary : (colors.borderSubtle), backgroundColor: isClosed ? (colors.surfaceMuted) : addToQueueServiceId === service.id ? colors.primary + "15" : (colors.surfaceMuted), opacity: isClosed ? 0.5 : 1 }}
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
                    {!serviceHasNameField(selectedAddService) ? (
                      <View style={styles.inputGroup}>
                        <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Full Name *</ThemedText>
                        <TextInput
                          style={[styles.modalInput, { backgroundColor: colors.surfaceMuted, color: colors.text, borderColor: colors.borderSubtle }]}
                          placeholder="Enter customer's full name"
                          placeholderTextColor={colors.textSecondary}
                          value={addToQueueFormData[MANUAL_NAME_FIELD_KEY] || ""}
                          onChangeText={(text) => setAddToQueueFormData(prev => ({ ...prev, [MANUAL_NAME_FIELD_KEY]: text }))}
                          autoCapitalize="words"
                          testID="input-addqueue-fullname"
                        />
                      </View>
                    ) : null}
                    {selectedAddService?.inputFields?.map((field) => (
                      <View key={field.id} style={styles.inputGroup}>
                        <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>{field.label}{field.required ? " *" : ""}</ThemedText>
                        {field.type === "select" && field.options ? (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View style={{ flexDirection: "row", gap: 8 }}>
                              {field.options.map((opt) => (
                                <Pressable key={opt} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: addToQueueFormData[field.id] === opt ? colors.primary : (colors.borderSubtle), backgroundColor: addToQueueFormData[field.id] === opt ? colors.primary + "15" : (colors.surfaceMuted) }} onPress={() => setAddToQueueFormData(prev => ({ ...prev, [field.id]: opt }))}>
                                  <ThemedText style={{ fontSize: 13, fontWeight: addToQueueFormData[field.id] === opt ? "700" : "500", color: addToQueueFormData[field.id] === opt ? colors.primary : colors.text }}>{opt}</ThemedText>
                                </Pressable>
                              ))}
                            </View>
                          </ScrollView>
                        ) : field.type === "checkbox" ? (
                          <Pressable style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 }} onPress={() => setAddToQueueFormData(prev => ({ ...prev, [field.id]: !prev[field.id] }))}>
                            <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: addToQueueFormData[field.id] ? colors.primary : (colors.borderSubtle), backgroundColor: addToQueueFormData[field.id] ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
                              {addToQueueFormData[field.id] ? <Feather name="check" size={14} color="#FFF" /> : null}
                            </View>
                            <ThemedText style={{ fontSize: 14 }}>{field.label}</ThemedText>
                          </Pressable>
                        ) : (
                          <TextInput style={[styles.modalInput, { backgroundColor: colors.surfaceMuted, color: colors.text, borderColor: colors.borderSubtle }]} placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`} placeholderTextColor={colors.textSecondary} value={addToQueueFormData[field.id] || ""} onChangeText={(text) => setAddToQueueFormData(prev => ({ ...prev, [field.id]: text }))} keyboardType={field.type === "phone" ? "phone-pad" : field.type === "number" ? "numeric" : field.type === "email" ? "email-address" : "default"} autoCapitalize={field.type === "email" ? "none" : "sentences"} />
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
              </Animated.View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, isFifoMode ? styles.fifoContainer : undefined]}>

      {isFifoMode ? null : (
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

      {waitingCount > 0 && isSelectiveMode ? (
        <View style={styles.processBar}>
          <View style={[styles.processBarHint, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
            <Feather name="mouse-pointer" size={16} color={colors.primary} />
            <ThemedText style={[styles.processBarHintText, { color: colors.primary }]} numberOfLines={1}>
              Selective mode • tap a customer to call ({waitingCount} waiting)
            </ThemedText>
          </View>
        </View>
      ) : null}

      {isFifoMode ? (
        <View style={styles.fifoCaption}>
          <Feather name="info" size={13} color={OrgDesign.muted} />
          <ThemedText style={styles.fifoCaptionText}>Customers are called in registered order</ThemedText>
        </View>
      ) : null}

      {isFifoMode ? (
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
        {isFifoMode ? (
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
                tab={fifoTab}
                displayPosition={index + 1}
                inputFields={(organization?.services.find((s) => s.id === customer.serviceId)?.inputFields || []).map((f) => ({ id: f.id, label: f.label }))}
                onCallNow={customer.status === "waiting" ? handleCallNext : () => handleCallAgain(customer.id)}
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
        <View style={styles.addToQueueRoot}>
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(200)}
            style={styles.addToQueueScrim}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => { Keyboard.dismiss(); setShowAddToQueueModal(false); }}
            />
          </Animated.View>
          <KeyboardAvoidingView
            style={styles.addToQueueFloat}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            pointerEvents="box-none"
          >
            <Animated.View
              entering={SlideInDown.duration(300)}
              exiting={SlideOutDown.duration(220)}
              style={[styles.addToQueueCard, { backgroundColor: colors.surface }]}
            >
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
                                borderColor: isClosed2 ? (colors.borderSubtle) : addToQueueServiceId === service.id ? colors.primary : (colors.borderSubtle),
                                backgroundColor: isClosed2 ? (colors.surfaceMuted) : addToQueueServiceId === service.id ? colors.primary + "15" : (colors.surfaceMuted),
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

                {!serviceHasNameField(selectedAddService) ? (
                  <View style={styles.inputGroup}>
                    <ThemedText style={[styles.inputLabel, { color: colors.textSecondary }]}>Full Name *</ThemedText>
                    <TextInput
                      style={[styles.modalInput, { backgroundColor: colors.surfaceMuted, color: colors.text, borderColor: colors.borderSubtle }]}
                      placeholder="Enter customer's full name"
                      placeholderTextColor={colors.textSecondary}
                      value={addToQueueFormData[MANUAL_NAME_FIELD_KEY] || ""}
                      onChangeText={(text) => setAddToQueueFormData(prev => ({ ...prev, [MANUAL_NAME_FIELD_KEY]: text }))}
                      autoCapitalize="words"
                      testID="input-addqueue-fullname"
                    />
                  </View>
                ) : null}

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
                        style={[styles.modalInput, { backgroundColor: colors.surfaceMuted, color: colors.text, borderColor: colors.borderSubtle }]}
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
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </ThemedView>
  );
}

const createStyles = (colors: typeof Colors.light) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  fifoContainer: {
    backgroundColor: OrgDesign.pageBg,
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
    paddingBottom: 10,
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
    paddingHorizontal: 25,
    paddingBottom: 25,
  },
  modalDismissArea: {
    flex: 1,
  },
  modalContent: {
    borderRadius: 38,
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
    paddingHorizontal: 25,
    paddingBottom: 25,
  },
  addToQueueCard: {
    borderRadius: 38,
    paddingTop: Spacing.lg,
    overflow: "hidden",
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
    paddingHorizontal: 25,
    paddingBottom: 25,
    zIndex: 1000,
  },
  stageSelectorBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  stageSelectorModal: {
    borderRadius: 38,
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
