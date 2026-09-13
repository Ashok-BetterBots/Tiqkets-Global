import React, { useState, useCallback, useMemo } from "react";
import { View, StyleSheet, SectionList, RefreshControl, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { ThemedText } from "@/components/ThemedText";
import { StatsCard } from "@/components/StatsCard";
import { HistoryCard } from "@/components/HistoryCard";
import { EmptyState } from "@/components/EmptyState";
import { ActiveQueueCard } from "@/components/ActiveQueueCard";
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

    return (
      <View style={styles.activeContent}>
        <ThemedText
          style={[styles.sectionLabel, { color: theme.textSecondary }]}
        >
          Active Registration
        </ThemedText>
        <ActiveQueueCard
          queue={activeQueue}
          onPress={handleActiveQueuePress}
          testID="card-active-registration"
        />
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
      <Animated.View entering={FadeInDown.delay(50)}>
        <View style={styles.headerContent}>
          <StatsCard stats={stats} />
        </View>
        {pastSections.map((section) => (
          <View key={section.title}>
            <View style={styles.sectionHeader}>
              <ThemedText
                style={[styles.sectionLabel, { color: theme.textSecondary }]}
              >
                {section.title}
              </ThemedText>
            </View>
            {section.data.map((item) => (
              <HistoryCard key={item.id} entry={item} />
            ))}
          </View>
        ))}
      </Animated.View>
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
            <View
              style={[
                styles.tabContainer,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.borderSubtle ?? theme.border,
                },
              ]}
            >
              <Pressable
                style={[
                  styles.tab,
                  selectedTab === "active" && {
                    backgroundColor: BrandColors.primary,
                  },
                ]}
                onPress={() => handleTabChange("active")}
                testID="tab-active"
              >
                <ThemedText
                  style={[
                    styles.tabText,
                    {
                      color:
                        selectedTab === "active" ? "#FFFFFF" : theme.textSecondary,
                    },
                  ]}
                >
                  Active
                </ThemedText>
              </Pressable>
              <Pressable
                style={[
                  styles.tab,
                  selectedTab === "past" && {
                    backgroundColor: BrandColors.primary,
                  },
                ]}
                onPress={() => handleTabChange("past")}
                testID="tab-past"
              >
                <ThemedText
                  style={[
                    styles.tabText,
                    {
                      color:
                        selectedTab === "past" ? "#FFFFFF" : theme.textSecondary,
                    },
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
    borderWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    alignItems: "center",
    borderRadius: BorderRadius.full,
  },
  tabText: {
    fontWeight: "600",
    fontSize: 14,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
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
  headerContent: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
});
