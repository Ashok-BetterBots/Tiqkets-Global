import React from "react";
import { View, StyleSheet } from "react-native";
import MapView, { Marker, Region, PROVIDER_DEFAULT } from "react-native-maps";
import { Feather } from "@expo/vector-icons";
import { BrandColors } from "@/constants/theme";

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
  initialRegion: Region;
  showsUserLocation: boolean;
  organizations: MapOrganization[];
  selectedOrgIndex: number;
  onMapReady: () => void;
  onMarkerPress: (org: MapOrganization, index: number) => void;
  getCategoryIcon: (category: string) => keyof typeof Feather.glyphMap;
  getMarkerColor: (category: string, isOpen: boolean) => string;
}

export function MapViewWrapper({
  mapRef,
  initialRegion,
  showsUserLocation,
  organizations,
  selectedOrgIndex,
  onMapReady,
  onMarkerPress,
  getCategoryIcon,
  getMarkerColor,
}: MapViewWrapperProps) {
  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      provider={PROVIDER_DEFAULT}
      initialRegion={initialRegion}
      showsUserLocation={showsUserLocation}
      showsMyLocationButton={false}
      showsCompass={false}
      onMapReady={onMapReady}
      testID="map-view"
    >
      {organizations.map((org, index) => (
        <Marker
          key={org.id}
          coordinate={{
            latitude: org.latitude,
            longitude: org.longitude,
          }}
          onPress={() => onMarkerPress(org, index)}
          testID={`marker-${org.id}`}
        >
          <View style={[
            styles.customMarker,
            { backgroundColor: getMarkerColor(org.category, org.isOpen) },
            selectedOrgIndex === index && styles.selectedMarker,
          ]}>
            <Feather 
              name={getCategoryIcon(org.category)} 
              size={selectedOrgIndex === index ? 18 : 14} 
              color="#FFFFFF" 
            />
          </View>
        </Marker>
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  customMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  selectedMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 4,
  },
});
