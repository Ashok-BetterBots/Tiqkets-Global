import React, { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  Dimensions,
  Platform,
  Animated as RNAnimated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInUp, FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { useTheme } from "@/hooks/useTheme";
import { Colors, Spacing, BorderRadius, BrandColors } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH * 0.85;
const CARD_MARGIN = Spacing.sm;

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface Organization {
  id: string;
  name: string;
  address: string;
  category: string;
  rating: number;
  waitTime: number;
  queueLength: number;
  distance: string;
  latitude: number;
  longitude: number;
  isOpen: boolean;
}

const MOCK_ORGANIZATIONS: Organization[] = [
  {
    id: "org-1",
    name: "City Hospital",
    address: "123 Healthcare Ave, Medical District",
    category: "Healthcare",
    rating: 4.5,
    waitTime: 25,
    queueLength: 12,
    distance: "0.5 km",
    latitude: 24.7136,
    longitude: 46.6753,
    isOpen: true,
  },
  {
    id: "org-2",
    name: "National Bank",
    address: "456 Finance St, Business Center",
    category: "Banking",
    rating: 4.2,
    waitTime: 15,
    queueLength: 8,
    distance: "0.8 km",
    latitude: 24.7156,
    longitude: 46.6783,
    isOpen: true,
  },
  {
    id: "org-3",
    name: "Government Services Center",
    address: "789 Admin Blvd, Civic Area",
    category: "Government",
    rating: 3.8,
    waitTime: 45,
    queueLength: 25,
    distance: "1.2 km",
    latitude: 24.7116,
    longitude: 46.6723,
    isOpen: true,
  },
  {
    id: "org-4",
    name: "Tech Hub Mall",
    address: "321 Digital Drive, Tech Park",
    category: "Retail",
    rating: 4.7,
    waitTime: 10,
    queueLength: 5,
    distance: "1.5 km",
    latitude: 24.7186,
    longitude: 46.6803,
    isOpen: false,
  },
  {
    id: "org-5",
    name: "Wellness Clinic",
    address: "555 Health Street, Wellness Zone",
    category: "Healthcare",
    rating: 4.9,
    waitTime: 20,
    queueLength: 6,
    distance: "2.0 km",
    latitude: 24.7096,
    longitude: 46.6693,
    isOpen: true,
  },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new RNAnimated.Value(0)).current;

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrgIndex, setSelectedOrgIndex] = useState(0);
  const [organizations] = useState(MOCK_ORGANIZATIONS);

  const handleScanQR = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("QRScanner");
  };

  const handleJoinQueue = (org: Organization) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("JoinQueue", { organizationId: org.id });
  };

  const handleCenterOnUser = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const filteredOrganizations = organizations.filter(
    (org) =>
      org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      org.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const index = viewableItems[0].index;
      setSelectedOrgIndex(index);
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const getCategoryIcon = (category: string): keyof typeof Feather.glyphMap => {
    switch (category.toLowerCase()) {
      case "healthcare":
        return "heart";
      case "banking":
        return "credit-card";
      case "government":
        return "briefcase";
      case "retail":
        return "shopping-bag";
      default:
        return "grid";
    }
  };

  const renderOrganizationCard = ({ item, index }: { item: Organization; index: number }) => {
    const inputRange = [
      (index - 1) * (CARD_WIDTH + CARD_MARGIN * 2),
      index * (CARD_WIDTH + CARD_MARGIN * 2),
      (index + 1) * (CARD_WIDTH + CARD_MARGIN * 2),
    ];

    const scale = scrollX.interpolate({
      inputRange,
      outputRange: [0.95, 1, 0.95],
      extrapolate: "clamp",
    });

    const opacity = scrollX.interpolate({
      inputRange,
      outputRange: [0.7, 1, 0.7],
      extrapolate: "clamp",
    });

    return (
      <RNAnimated.View style={{ transform: [{ scale }], opacity }}>
        <Card style={{ ...styles.orgCard, width: CARD_WIDTH }}>
          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <View style={styles.orgIconContainer}>
                <Feather 
                  name={getCategoryIcon(item.category)} 
                  size={24} 
                  color={BrandColors.primary} 
                />
              </View>
              <View style={styles.orgDetails}>
                <ThemedText style={styles.orgName} numberOfLines={1}>
                  {item.name}
                </ThemedText>
                <ThemedText style={styles.orgAddress} numberOfLines={1}>
                  {item.address}
                </ThemedText>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: item.isOpen ? "#10B981" : "#EF4444" }]}>
                <ThemedText style={styles.statusText}>
                  {item.isOpen ? "Open" : "Closed"}
                </ThemedText>
              </View>
            </View>

            <View style={styles.cardStats}>
              <View style={styles.statItem}>
                <Feather name="clock" size={14} color={BrandColors.accent} />
                <ThemedText style={styles.statValue}>{item.waitTime} min</ThemedText>
              </View>
              <View style={styles.statItem}>
                <Feather name="users" size={14} color={BrandColors.secondary} />
                <ThemedText style={styles.statValue}>{item.queueLength} in queue</ThemedText>
              </View>
              <View style={styles.statItem}>
                <Feather name="navigation" size={14} color={Colors.light.textSecondary} />
                <ThemedText style={styles.statValue}>{item.distance}</ThemedText>
              </View>
            </View>

            <Pressable
              style={[styles.joinButton, !item.isOpen && styles.joinButtonDisabled]}
              onPress={() => handleJoinQueue(item)}
              disabled={!item.isOpen}
              testID={`button-join-${item.id}`}
            >
              <ThemedText style={styles.joinButtonText}>
                {item.isOpen ? "Select & Join" : "Currently Closed"}
              </ThemedText>
            </Pressable>
          </View>
        </Card>
      </RNAnimated.View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.mapPlaceholder]}>
        <LinearGradient
          colors={[BrandColors.primary + "30", BrandColors.secondary + "20"]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.webMapContent}>
          <Feather name="map-pin" size={48} color={BrandColors.primary} />
          <ThemedText style={styles.webMapText}>Map View</ThemedText>
          <ThemedText style={styles.webMapSubtext}>
            {Platform.OS === "web" 
              ? "Open in Expo Go to see full map" 
              : "Loading map..."}
          </ThemedText>
        </View>
      </View>

      <LinearGradient
        colors={["rgba(0,0,0,0.6)", "transparent"]}
        style={[styles.topGradient, { paddingTop: insets.top }]}
      >
        <Animated.View entering={FadeInDown.delay(200)} style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Feather name="search" size={20} color={Colors.light.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name, location, or pincode"
              placeholderTextColor={Colors.light.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              testID="input-search"
            />
            {searchQuery.length > 0 ? (
              <Pressable onPress={() => setSearchQuery("")} testID="button-clear-search">
                <Feather name="x" size={18} color={Colors.light.textSecondary} />
              </Pressable>
            ) : null}
          </View>
          <Pressable style={styles.scanButton} onPress={handleScanQR} testID="button-scan-qr">
            <Feather name="maximize" size={22} color="#FFFFFF" />
          </Pressable>
        </Animated.View>
      </LinearGradient>

      <Pressable 
        style={[styles.centerButton, { bottom: 200 + insets.bottom }]} 
        onPress={handleCenterOnUser}
        testID="button-center-location"
      >
        <Feather name="crosshair" size={22} color={BrandColors.primary} />
      </Pressable>

      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.8)"]}
        style={[styles.bottomGradient, { paddingBottom: insets.bottom + 80 }]}
      >
        <Animated.View entering={FadeInUp.delay(300)}>
          <ThemedText style={styles.nearbyTitle}>
            Nearby Organizations
          </ThemedText>
          <FlatList
            ref={flatListRef}
            data={filteredOrganizations}
            renderItem={renderOrganizationCard}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContent}
            snapToInterval={CARD_WIDTH + CARD_MARGIN * 2}
            decelerationRate="fast"
            onScroll={RNAnimated.event(
              [{ nativeEvent: { contentOffset: { x: scrollX } } }],
              { useNativeDriver: true }
            )}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            getItemLayout={(data, index) => ({
              length: CARD_WIDTH + CARD_MARGIN * 2,
              offset: (CARD_WIDTH + CARD_MARGIN * 2) * index,
              index,
            })}
            testID="carousel-organizations"
          />
        </Animated.View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f0f4f8",
  },
  webMapContent: {
    alignItems: "center",
    gap: Spacing.md,
  },
  webMapText: {
    fontSize: 24,
    fontWeight: "700",
    color: BrandColors.primary,
  },
  webMapSubtext: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: "center",
  },
  topGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.light.text,
    paddingVertical: Platform.OS === "ios" ? Spacing.xs : 0,
  },
  scanButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: BrandColors.primary,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: BrandColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  centerButton: {
    position: "absolute",
    right: Spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: Spacing["2xl"],
  },
  nearbyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginLeft: Spacing.lg,
    marginBottom: Spacing.md,
  },
  carouselContent: {
    paddingHorizontal: Spacing.lg - CARD_MARGIN,
  },
  orgCard: {
    marginHorizontal: CARD_MARGIN,
    padding: 0,
    overflow: "hidden",
  },
  cardContent: {
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  orgIconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: BrandColors.primary + "15",
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.sm,
  },
  orgDetails: {
    flex: 1,
  },
  orgName: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  orgAddress: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  cardStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.light.text,
  },
  joinButton: {
    backgroundColor: BrandColors.primary,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  joinButtonDisabled: {
    backgroundColor: Colors.light.textSecondary,
  },
  joinButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
