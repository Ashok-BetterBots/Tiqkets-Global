import React, { useState, useCallback, useMemo } from "react";
import { View, StyleSheet, SectionList, RefreshControl, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { StatsCard } from "@/components/StatsCard";
import { HistoryCard } from "@/components/HistoryCard";
import { EmptyState } from "@/components/EmptyState";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { useQueue } from "@/contexts/QueueContext";
import { Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { HistoryEntry } from "@/types/queue";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface Section {
  title: string;
  data: HistoryEntry[];
}

type TabType = "active" | "past";

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const { activeQueue, history, stats } = useQueue();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState<TabType>("active");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setRefreshing(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleTabChange = (tab: TabType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTab(tab);
  };

  const handleActiveQueuePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("QueueDetails");
  };

  const pastSections = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const todayItems: HistoryEntry[] = [];
    const thisWeekItems: HistoryEntry[] = [];
    const earlierItems: HistoryEntry[] = [];

    history.forEach((entry) => {
      const entryDate = new Date(entry.completedAt);
      if (entryDate >= today) {
        todayItems.push(entry);
      } else if (entryDate >= weekAgo) {
        thisWeekItems.push(entry);
      } else {
        earlierItems.push(entry);
      }
    });

    const result: Section[] = [];
    if (todayItems.length > 0) {
      result.push({ title: "Today", data: todayItems });
    }
    if (thisWeekItems.length > 0) {
      result.push({ title: "This Week", data: thisWeekItems });
    }
    if (earlierItems.length > 0) {
      result.push({ title: "Earlier", data: earlierItems });
    }

    return result;
  }, [history]);

  const renderActiveContent = () => {
    if (!activeQueue) {
      return (
        <View style={styles.emptyActiveContainer}>
          <EmptyState
            title="No Active Queue"
            description="You're not currently in any queue. Join a queue to see your active registration here."
          />
        </View>
      );
    }

    const getProgressPercentage = () => {
      if (activeQueue.totalInQueue === 0) return 100;
      const progress = ((activeQueue.totalInQueue - activeQueue.position) / activeQueue.totalInQueue) * 100;
      return Math.min(Math.max(progress, 5), 100);
    };

    const getExpiryTime = () => {
      const joinedAt = new Date(activeQueue.joinedAt);
      const expiryTime = new Date(joinedAt.getTime() + activeQueue.estimatedWaitTime * 60 * 1000);
      return expiryTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    return (
      <View style={styles.activeContent}>
        <ThemedText type="small" style={[styles.sectionLabel, { color: theme.textSecondary }]}>
          Active Registration
        </ThemedText>
        
        <Animated.View entering={FadeInDown.springify()}>
            <Card style={styles.activeCard} onPress={handleActiveQueuePress} testID="card-active-registration">
              <View style={styles.activeCardHeader}>
                <View style={styles.orgInfo}>
                  <ThemedText type="body" style={styles.orgName}>
                    {activeQueue.organizationName}
                  </ThemedText>
                  <View style={styles.locationRow}>
                    <Feather name="map-pin" size={12} color={theme.textSecondary} />
                    <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: 4 }}>
                      {activeQueue.serviceName}
                    </ThemedText>
                  </View>
                  <View style={styles.dateRow}>
                    <Feather name="calendar" size={12} color={theme.textSecondary} />
                    <ThemedText type="caption" style={{ color: theme.textSecondary, marginLeft: 4 }}>
                      {new Date(activeQueue.joinedAt).toLocaleDateString()}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.activeCardImage}>
                  <View style={[styles.orgIconLarge, { backgroundColor: BrandColors.primary + "15" }]}>
                    <Feather name="briefcase" size={32} color={BrandColors.primary} />
                  </View>
                </View>
              </View>

              <View style={styles.activeCardDetails}>
                <View style={styles.ticketInfo}>
                  <View style={[styles.ticketBadge, { backgroundColor: BrandColors.primary + "20" }]}>
                    <Feather name="hash" size={14} color={BrandColors.primary} />
                    <ThemedText style={[styles.ticketText, { color: BrandColors.primary }]}>
                      {activeQueue.ticketNumber}
                    </ThemedText>
                  </View>
                </View>
                <View style={styles.positionInfo}>
                  <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                    Position
                  </ThemedText>
                  <ThemedText style={[styles.positionNumber, { color: BrandColors.primary }]}>
                    #{activeQueue.position}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.waitInfo}>
                <ThemedText style={[styles.waitTime, { color: theme.text }]}>
                  ~{activeQueue.estimatedWaitTime} min wait
                </ThemedText>
                <ThemedText type="caption" style={{ color: theme.textSecondary }}>
                  Est. call at {getExpiryTime()}
                </ThemedText>
              </View>

              <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${getProgressPercentage()}%`, backgroundColor: BrandColors.primary }
                  ]} 
                />
              </View>
            </Card>
        </Animated.View>
      </View>
    );
  };

  const renderPastContent = () => {
    if (history.length === 0) {
      return (
        <View style={styles.emptyActiveContainer}>
          <EmptyState
            title="No Queue History"
            description="Your completed queues will appear here. Join a queue to start building your history."
          />
        </View>
      );
    }

    return (
      <>
        <View style={styles.headerContent}>
          <StatsCard stats={stats} />
        </View>
        {pastSections.map((section) => (
          <View key={section.title}>
            <View style={[styles.sectionHeader, { backgroundColor: theme.backgroundRoot }]}>
              <ThemedText type="small" style={{ color: theme.textSecondary, fontWeight: "600" }}>
                {section.title}
              </ThemedText>
            </View>
            {section.data.map((item) => (
              <HistoryCard key={item.id} entry={item} />
            ))}
          </View>
        ))}
      </>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <SectionList
        sections={[]}
        renderItem={() => null}
        renderSectionHeader={() => null}
        ListHeaderComponent={
          <View>
            <View style={[styles.tabContainer, { backgroundColor: theme.surfaceMuted }]}>
              <Pressable
                style={[
                  styles.tab,
                  selectedTab === "active" && [styles.activeTab, { backgroundColor: BrandColors.primary }],
                ]}
                onPress={() => handleTabChange("active")}
                testID="tab-active"
              >
                <ThemedText
                  style={[
                    styles.tabText,
                    { color: selectedTab === "active" ? "#FFFFFF" : theme.textSecondary },
                  ]}
                >
                  Active
                </ThemedText>
              </Pressable>
              <Pressable
                style={[
                  styles.tab,
                  selectedTab === "past" && [styles.activeTab, { backgroundColor: BrandColors.primary }],
                ]}
                onPress={() => handleTabChange("past")}
                testID="tab-past"
              >
                <ThemedText
                  style={[
                    styles.tabText,
                    { color: selectedTab === "past" ? "#FFFFFF" : theme.textSecondary },
                  ]}
                >
                  Past
                </ThemedText>
              </Pressable>
            </View>

            {selectedTab === "active" ? renderActiveContent() : renderPastContent()}
          </View>
        }
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: headerHeight + Spacing.xl,
            paddingBottom: tabBarHeight + Spacing.xl,
          },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
  },
  tabContainer: {
    flexDirection: "row",
    borderRadius: BorderRadius.full,
    padding: 4,
    marginBottom: Spacing.xl,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
    borderRadius: BorderRadius.full,
  },
  activeTab: {},
  tabText: {
    fontWeight: "600",
    fontSize: 15,
  },
  sectionLabel: {
    fontWeight: "600",
    marginBottom: Spacing.md,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  emptyActiveContainer: {
    paddingVertical: Spacing["2xl"],
  },
  activeContent: {
    marginBottom: Spacing.lg,
  },
  activeCard: {
    padding: Spacing.lg,
  },
  activeCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  orgInfo: {
    flex: 1,
  },
  orgName: {
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  activeCardImage: {
    marginLeft: Spacing.md,
  },
  orgIconLarge: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  activeCardDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  ticketInfo: {
    flexDirection: "row",
    alignItems: "center",
  },
  ticketBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.xs,
    gap: 4,
  },
  ticketText: {
    fontWeight: "700",
    fontSize: 14,
  },
  positionInfo: {
    alignItems: "flex-end",
  },
  positionNumber: {
    fontWeight: "700",
    fontSize: 18,
  },
  waitInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  waitTime: {
    fontWeight: "600",
    fontSize: 16,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
  },
  headerContent: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
});
