import React, { useState } from "react";
import { View, StyleSheet, Pressable, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { RootStackParamList } from "@/navigation/RootStackNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function QRScannerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { theme } = useTheme();

  const handleManualEntry = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.replace("JoinQueue");
  };

  if (Platform.OS === "web") {
    return (
      <View
        style={[
          styles.container,
          styles.permissionContainer,
          { backgroundColor: theme.backgroundRoot, paddingTop: insets.top + Spacing["4xl"] },
        ]}
      >
        <View style={[styles.permissionIcon, { backgroundColor: theme.primary + "15" }]}>
          <Feather name="smartphone" size={48} color={theme.primary} />
        </View>
        <ThemedText type="h4" style={styles.permissionTitle}>
          QR Scanner Not Available
        </ThemedText>
        <ThemedText
          type="body"
          style={[styles.permissionText, { color: theme.textSecondary }]}
        >
          The QR scanner feature requires a mobile device. Please use Expo Go on your phone to scan QR codes.
        </ThemedText>
        <Button onPress={handleManualEntry} style={styles.permissionButton}>
          Join Queue Manually
        </Button>
        <Pressable onPress={() => navigation.goBack()} style={styles.cancelLink}>
          <ThemedText type="body" style={{ color: theme.primary }}>
            Cancel
          </ThemedText>
        </Pressable>
      </View>
    );
  }

  const CameraModule = require("expo-camera");
  const { CameraView, useCameraPermissions, BarcodeScanningResult } = CameraModule;

  return <QRScannerNative navigation={navigation} />;
}

function QRScannerNative({ navigation }: { navigation: NativeStackNavigationProp<RootStackParamList> }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const CameraModule = require("expo-camera");
  const { CameraView, useCameraPermissions } = CameraModule;
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleBarCodeScanned = (result: any) => {
    if (scanned) return;
    setScanned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    setTimeout(() => {
      navigation.replace("JoinQueue");
    }, 500);
  };

  if (!permission) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={styles.loadingContainer}>
          <ThemedText type="body">Loading camera...</ThemedText>
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View
        style={[
          styles.container,
          styles.permissionContainer,
          { backgroundColor: theme.backgroundRoot, paddingTop: insets.top },
        ]}
      >
        <View style={[styles.permissionIcon, { backgroundColor: theme.primary + "15" }]}>
          <Feather name="camera" size={48} color={theme.primary} />
        </View>
        <ThemedText type="h4" style={styles.permissionTitle}>
          Camera Access Required
        </ThemedText>
        <ThemedText
          type="body"
          style={[styles.permissionText, { color: theme.textSecondary }]}
        >
          To scan QR codes and join queues quickly, TIQKETS needs access to your camera.
        </ThemedText>

        {permission.status === "denied" && !permission.canAskAgain ? (
          <Button
            onPress={async () => {
              try {
                await Linking.openSettings();
              } catch (error) {
                console.error("Could not open settings");
              }
            }}
            style={styles.permissionButton}
          >
            Open Settings
          </Button>
        ) : (
          <Button onPress={requestPermission} style={styles.permissionButton}>
            Enable Camera
          </Button>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      <View style={[styles.overlay, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.closeButton}
            hitSlop={12}
          >
            <Feather name="x" size={24} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.scanArea}>
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
        </View>

        <View style={styles.footer}>
          <ThemedText
            type="body"
            style={styles.instruction}
            lightColor="#FFFFFF"
            darkColor="#FFFFFF"
          >
            Point your camera at a TIQKETS QR code
          </ThemedText>
          <ThemedText
            type="small"
            style={styles.subInstruction}
            lightColor="rgba(255,255,255,0.7)"
            darkColor="rgba(255,255,255,0.7)"
          >
            The QR code is usually displayed at the service counter
          </ThemedText>
        </View>
      </View>

      {scanned ? (
        <View style={styles.scannedOverlay}>
          <View style={[styles.successBadge, { backgroundColor: theme.success }]}>
            <Feather name="check" size={32} color="#FFFFFF" />
          </View>
          <ThemedText
            type="h4"
            style={{ marginTop: Spacing.lg }}
            lightColor="#FFFFFF"
            darkColor="#FFFFFF"
          >
            QR Code Scanned!
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["3xl"],
  },
  permissionIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing["2xl"],
  },
  permissionTitle: {
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  permissionText: {
    textAlign: "center",
    marginBottom: Spacing["2xl"],
  },
  permissionButton: {
    paddingHorizontal: Spacing["3xl"],
  },
  cancelLink: {
    marginTop: Spacing.xl,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    flexDirection: "row",
    justifyContent: "flex-start",
    padding: Spacing.lg,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  scanArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scanFrame: {
    width: 250,
    height: 250,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 40,
    height: 40,
    borderColor: "#FFFFFF",
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: BorderRadius.sm,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: BorderRadius.sm,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: BorderRadius.sm,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: BorderRadius.sm,
  },
  footer: {
    alignItems: "center",
    paddingHorizontal: Spacing["2xl"],
    paddingBottom: Spacing["5xl"],
  },
  instruction: {
    textAlign: "center",
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  subInstruction: {
    textAlign: "center",
  },
  scannedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  successBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
