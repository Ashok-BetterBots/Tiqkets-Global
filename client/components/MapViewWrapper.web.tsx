import React from "react";
import { View, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing, BrandColors } from "@/constants/theme";

export interface MapOrganization {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  isOpen: boolean;
  [key: string]: any;
}

interface MapViewWrapperProps {
  mapRef: React.RefObject<any>;
  initialRegion: any;
  showsUserLocation: boolean;
  organizations: MapOrganization[];
  selectedOrgIndex: number;
  onMapReady: () => void;
  onMarkerPress: (org: MapOrganization, index: number) => void;
  getCategoryIcon: (category: string) => keyof typeof Feather.glyphMap;
  getMarkerColor: (category: string, isOpen: boolean) => string;
}

export function MapViewWrapper({}: MapViewWrapperProps) {
  return (
    <View style={styles.mapPlaceholder}>
      <LinearGradient
        colors={[BrandColors.primary + "30", BrandColors.secondary + "20"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.webMapContent}>
        <Feather name="map-pin" size={48} color={BrandColors.primary} />
        <ThemedText style={styles.webMapText}>Map View</ThemedText>
        <ThemedText style={styles.webMapSubtext}>
          Run in Expo Go to see the full map
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
