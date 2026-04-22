import React, { useState, useRef, useEffect } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  Dimensions,
  Platform,
  Animated as RNAnimated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import Animated, { FadeInUp, FadeInDown } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { MapViewWrapper, MapOrganization } from "@/components/MapViewWrapper";
import { getApiUrl } from "@/lib/query-client";

interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, BrandColors, Shadows } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import { AppointmentsStackParamList } from "@/navigation/AppointmentsStackNavigator";
import { Service } from "@/types/queue";
import { CompositeNavigationProp } from "@react-navigation/native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH * 0.85;
const CARD_MARGIN = Spacing.sm;

type NavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<AppointmentsStackParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface Organization {
  id: string;
  name: string;
  address: string;
  description: string;
  category: string;
  rating: number;
  waitTime: number;
  queueLength: number;
  distance: string;
  latitude: number;
  longitude: number;
  isOpen: boolean;
  services: Service[];
}

const DEFAULT_REGION: Region = {
  latitude: 24.7136,
  longitude: 46.6753,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

const CAROUSEL_BLOCK_HEIGHT = 220;

export default function BookingsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<NavigationProp>();
  const { theme, isDark } = useTheme();
  const flatListRef = useRef<RNAnimated.FlatList>(null);
  const mapRef = useRef<any>(null);
  const scrollX = useRef(new RNAnimated.Value(0)).current;

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrgIndex, setSelectedOrgIndex] = useState(0);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationPermission, setLocationPermission] = useState<Location.PermissionStatus | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<Array<{ address: string; latitude: number; longitude: number }>>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    requestLocationPermission();
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    try {
      setIsLoadingOrgs(true);
      const apiUrl = getApiUrl();
      const url = new URL("/api/discover", apiUrl);
      const response = await fetch(url.toString());
      if (response.ok) {
        const data = await response.json();
        if (data.organizations && data.organizations.length > 0) {
          setOrganizations(data.organizations);
        }
      }
    } catch (error) {
      console.log("Error fetching organizations:", error);
    } finally {
      setIsLoadingOrgs(false);
    }
  };

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status);
      if (status === "granted") {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      }
    } catch (error) {
      console.log("Error getting location:", error);
    }
  };

  const searchLocation = async (query: string) => {
    if (query.length < 3) {
      setLocationSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setIsSearchingLocation(true);
    try {
      const results = await Location.geocodeAsync(query);
      if (results.length > 0) {
        const suggestions = await Promise.all(
          results.slice(0, 5).map(async (result) => {
            const reverseResults = await Location.reverseGeocodeAsync({
              latitude: result.latitude,
              longitude: result.longitude,
            });
            const addr = reverseResults[0];
            const address = addr
              ? [addr.name, addr.street, addr.city, addr.region, addr.country]
                  .filter(Boolean)
                  .join(", ")
              : `${result.latitude.toFixed(4)}, ${result.longitude.toFixed(4)}`;
            return { address, latitude: result.latitude, longitude: result.longitude };
          })
        );
        setLocationSuggestions(suggestions);
        setShowSuggestions(true);
      } else {
        setLocationSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.log("Geocoding error:", error);
      setLocationSuggestions([]);
    } finally {
      setIsSearchingLocation(false);
    }
  };

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    if (searchQuery.length >= 3) {
      searchTimeoutRef.current = setTimeout(() => {
        searchLocation(searchQuery);
      }, 500);
    } else {
      setLocationSuggestions([]);
      setShowSuggestions(false);
    }
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const handleSelectSuggestion = (suggestion: { address: string; latitude: number; longitude: number }) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSearchQuery(suggestion.address);
    setShowSuggestions(false);
    setLocationSuggestions([]);
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
  };

  const handleScanQR = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("QRScanner");
  };

  const handleSelectOrganization = (org: Organization) => {
    if (!org.isOpen) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate("BookAppointment", {
      organizationId: org.id,
      organizationName: org.name,
    });
  };

  const handleCenterOnUser = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
    } else if (mapRef.current) {
      mapRef.current.animateToRegion(DEFAULT_REGION, 500);
    }
  };

  const handleMarkerPress = (org: MapOrganization, index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedOrgIndex(index);
    if (flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      });
    }
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: org.latitude,
        longitude: org.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
    }
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
      const org = filteredOrganizations[index];
      if (org && mapRef.current && mapReady) {
        mapRef.current.animateToRegion({
          latitude: org.latitude,
          longitude: org.longitude,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        }, 300);
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const getCategoryIcon = (category: string): keyof typeof Feather.glyphMap => {
    switch (category.toLowerCase()) {
      case "healthcare": return "heart";
      case "banking": return "credit-card";
      case "government": return "briefcase";
      case "retail": return "shopping-bag";
      case "restaurant": return "coffee";
      case "dining": return "coffee";
      default: return "grid";
    }
  };

  const getMarkerColor = (category: string, isOpen: boolean): string => {
    if (!isOpen) return "#9CA3AF";
    switch (category.toLowerCase()) {
      case "healthcare": return "#EF4444";
      case "banking": return "#3B82F6";
      case "government": return "#8B5CF6";
      case "retail": return "#10B981";
      default: return BrandColors.primary;
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

    const statusColor = item.isOpen ? "#10B981" : "#EF4444";

    return (
      <RNAnimated.View style={{ transform: [{ scale }], opacity }}>
        <View
          style={[
            styles.orgCard,
            {
              width: CARD_WIDTH,
              backgroundColor: theme.surface,
              borderColor: theme.borderSubtle ?? theme.border,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <View
              style={[
                styles.orgIconContainer,
                { backgroundColor: BrandColors.primary + "12" },
              ]}
            >
              <Feather
                name={getCategoryIcon(item.category)}
                size={22}
                color={BrandColors.primary}
              />
            </View>
            <View style={styles.orgDetails}>
              <View style={styles.orgNameRow}>
                <ThemedText
                  style={[styles.orgName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {item.name}
                </ThemedText>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              </View>
              <ThemedText
                style={[styles.orgAddress, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {item.address}
              </ThemedText>
            </View>
          </View>

          <View
            style={[
              styles.cardStats,
              { borderTopColor: theme.borderSubtle ?? theme.border },
            ]}
          >
            <View style={styles.statItem}>
              <Feather name="clock" size={13} color={theme.textSecondary} />
              <ThemedText style={[styles.statValue, { color: theme.text }]}>
                {item.waitTime} min
              </ThemedText>
            </View>
            <View style={styles.statItem}>
              <Feather name="users" size={13} color={theme.textSecondary} />
              <ThemedText style={[styles.statValue, { color: theme.text }]}>
                {item.queueLength} in queue
              </ThemedText>
            </View>
            <View style={styles.statItem}>
              <Feather name="navigation" size={13} color={theme.textSecondary} />
              <ThemedText style={[styles.statValue, { color: theme.text }]}>
                {item.distance}
              </ThemedText>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.bookButton,
              {
                backgroundColor: item.isOpen
                  ? BrandColors.primary
                  : theme.surfaceMuted,
                opacity: pressed ? 0.92 : 1,
              },
            ]}
            onPress={() => handleSelectOrganization(item)}
            disabled={!item.isOpen}
            testID={`button-book-${item.id}`}
          >
            <Feather
              name="calendar"
              size={15}
              color={item.isOpen ? "#FFFFFF" : theme.textSecondary}
              style={{ marginRight: 6 }}
            />
            <ThemedText
              style={[
                styles.bookButtonText,
                { color: item.isOpen ? "#FFFFFF" : theme.textSecondary },
              ]}
            >
              {item.isOpen ? "Book Reservation" : "Currently Closed"}
            </ThemedText>
          </Pressable>
        </View>
      </RNAnimated.View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <MapViewWrapper
        mapRef={mapRef}
        initialRegion={DEFAULT_REGION}
        showsUserLocation={locationPermission === "granted"}
        organizations={filteredOrganizations}
        selectedOrgIndex={selectedOrgIndex}
        onMapReady={() => setMapReady(true)}
        onMarkerPress={handleMarkerPress}
        getCategoryIcon={getCategoryIcon}
        getMarkerColor={getMarkerColor}
      />

      <LinearGradient
        colors={["rgba(0,0,0,0.55)", "transparent"]}
        style={[styles.topGradient, { paddingTop: insets.top }]}
      >
        <Animated.View entering={FadeInDown.delay(200)} style={styles.searchContainer}>
          <View
            style={[
              styles.searchBar,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderSubtle ?? theme.border,
              },
            ]}
          >
            <Feather name="search" size={18} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search organizations to book"
              placeholderTextColor={theme.textSecondary}
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                if (text.length === 0) {
                  setShowSuggestions(false);
                  setLocationSuggestions([]);
                }
              }}
              onFocus={() => {
                if (locationSuggestions.length > 0) {
                  setShowSuggestions(true);
                }
              }}
              testID="input-search-bookings"
            />
            {isSearchingLocation ? (
              <View style={styles.searchLoading}>
                <Feather name="loader" size={16} color={BrandColors.primary} />
              </View>
            ) : searchQuery.length > 0 ? (
              <Pressable onPress={() => {
                setSearchQuery("");
                setShowSuggestions(false);
                setLocationSuggestions([]);
              }} testID="button-clear-search-bookings" hitSlop={8}>
                <Feather name="x" size={18} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>
          <Pressable style={styles.scanButton} onPress={handleScanQR} testID="button-scan-qr-bookings">
            <Feather name="maximize" size={22} color="#FFFFFF" />
          </Pressable>
        </Animated.View>

        {showSuggestions && locationSuggestions.length > 0 ? (
          <View
            style={[
              styles.suggestionsContainer,
              {
                backgroundColor: theme.surface,
                borderColor: theme.borderSubtle ?? theme.border,
              },
            ]}
          >
            {locationSuggestions.map((suggestion, index) => (
              <Pressable
                key={index}
                style={[
                  styles.suggestionItem,
                  {
                    borderBottomColor:
                      index === locationSuggestions.length - 1
                        ? "transparent"
                        : theme.borderSubtle ?? theme.border,
                  },
                ]}
                onPress={() => handleSelectSuggestion(suggestion)}
                testID={`booking-suggestion-${index}`}
              >
                <Feather name="map-pin" size={16} color={BrandColors.primary} />
                <ThemedText
                  style={[styles.suggestionText, { color: theme.text }]}
                  numberOfLines={2}
                >
                  {suggestion.address}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </LinearGradient>

      <Pressable
        style={[
          styles.floatingButton,
          {
            bottom: tabBarHeight + CAROUSEL_BLOCK_HEIGHT,
            backgroundColor: theme.surface,
            borderColor: theme.borderSubtle ?? theme.border,
          },
        ]}
        onPress={handleCenterOnUser}
        testID="button-center-location-bookings"
      >
        <Feather name="crosshair" size={20} color={BrandColors.primary} />
      </Pressable>

      <Pressable
        style={[
          styles.floatingButton,
          {
            bottom: tabBarHeight + CAROUSEL_BLOCK_HEIGHT + 56,
            backgroundColor: theme.surface,
            borderColor: theme.borderSubtle ?? theme.border,
          },
        ]}
        onPress={() => navigation.navigate("AppointmentsList")}
        testID="button-my-bookings"
      >
        <Feather name="list" size={20} color={BrandColors.primary} />
      </Pressable>

      <LinearGradient
        colors={["transparent", isDark ? "rgba(15,17,21,0.96)" : "rgba(246,247,251,0.96)"]}
        style={[styles.bottomGradient, { paddingBottom: tabBarHeight }]}
      >
        <Animated.View entering={FadeInUp.delay(300)}>
          <ThemedText style={[styles.nearbyTitle, { color: theme.text }]}>
            Book a Reservation
          </ThemedText>
          <RNAnimated.FlatList
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
            testID="carousel-booking-organizations"
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
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    gap: Spacing.sm,
    borderWidth: 1,
    ...Shadows.subtle,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: Platform.OS === "ios" ? Spacing.xs : 0,
  },
  scanButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: BrandColors.primary,
    justifyContent: "center",
    alignItems: "center",
    ...Shadows.floating,
  },
  floatingButton: {
    position: "absolute",
    right: Spacing.lg,
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    ...Shadows.card,
  },
  bottomGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: Spacing["2xl"],
  },
  nearbyTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginLeft: Spacing.lg,
    marginBottom: Spacing.md,
  },
  carouselContent: {
    paddingHorizontal: Spacing.lg - CARD_MARGIN,
  },
  orgCard: {
    marginHorizontal: CARD_MARGIN,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: "hidden",
    ...Shadows.card,
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
    justifyContent: "center",
    alignItems: "center",
    marginRight: Spacing.md,
  },
  orgDetails: {
    flex: 1,
    gap: 2,
  },
  orgNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  orgName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  orgAddress: {
    fontSize: 12,
    fontWeight: "500",
  },
  cardStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 12,
    fontWeight: "600",
  },
  bookButton: {
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  bookButtonText: {
    fontSize: 14,
    fontWeight: "700",
  },
  searchLoading: {
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  suggestionsContainer: {
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    marginHorizontal: Spacing.xs,
    borderWidth: 1,
    overflow: "hidden",
    ...Shadows.medium,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    borderBottomWidth: 1,
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
  },
});
