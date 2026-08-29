import React, { useState, useCallback } from "react";
import { View, StyleSheet, Pressable, Platform, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import { OrgStackParamList } from "@/navigation/OrgStackNavigator";

type NavigationProp = NativeStackNavigationProp<OrgStackParamList, "CheckInScanner">;
type RouteProps = RouteProp<OrgStackParamList, "CheckInScanner">;

const SUPPORTED_BARCODE_TYPES = [
  "qr",
  "aztec",
  "ean13",
  "ean8",
  "pdf417",
  "upc_e",
  "datamatrix",
  "code39",
  "code93",
  "itf14",
  "codabar",
  "code128",
  "upc_a",
] as const;

export default function CheckInScannerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { theme, isDark } = useTheme();

  if (Platform.OS === "web") {
    return (
      <ThemedView
        style={[
          styles.container,
          styles.permissionContainer,
          { paddingTop: insets.top + Spacing["4xl"] },
        ]}
      >
        <View style={[styles.permissionIcon, { backgroundColor: theme.primary + "15" }]}>
          <Feather name="smartphone" size={48} color={theme.primary} />
        </View>
        <ThemedText type="h4" style={styles.permissionTitle}>
          Scanner Not Available on Web
        </ThemedText>
        <ThemedText
          type="body"
          style={[styles.permissionText, { color: theme.textSecondary }]}
        >
          The barcode scanner requires a mobile device. Please use Expo Go on your phone to scan tickets.
        </ThemedText>
        <ThemedText
          type="small"
          style={[styles.supportedFormats, { color: theme.textSecondary }]}
        >
          Supported formats: QR codes, barcodes (Code128, EAN-13, UPC-A, Code39, and more)
        </ThemedText>
        <Button onPress={() => navigation.goBack()} style={styles.permissionButton}>
          Go Back
        </Button>
      </ThemedView>
    );
  }

  return <CheckInScannerNative />;
}

function CheckInScannerNative() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { theme, isDark } = useTheme();
  const { checkInCustomer, organization } = useOrganization();
  
  const CameraModule = require("expo-camera");
  const { CameraView, useCameraPermissions } = CameraModule;
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    message: string;
    ticketNumber?: string;
    customerName?: string;
  } | null>(null);

  const handleBarCodeScanned = useCallback(async (result: { data: string; type: string }) => {
    if (scanned) return;
    setScanned(true);
    
    const scannedData = result.data.trim().toUpperCase();
    
    let ticketNumber = scannedData;
    if (scannedData.includes("/")) {
      const parts = scannedData.split("/");
      ticketNumber = parts[parts.length - 1];
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    const checkInResult = await checkInCustomer(ticketNumber);
    
    if (checkInResult.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScanResult({
        success: true,
        message: "Check-in successful!",
        ticketNumber: checkInResult.customer?.ticketNumber,
        customerName: checkInResult.customer?.customerName,
      });
      
      setTimeout(() => {
        navigation.goBack();
      }, 1500);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setScanResult({
        success: false,
        message: checkInResult.error || "Invalid ticket",
      });
      
      setTimeout(() => {
        setScanned(false);
        setScanResult(null);
      }, 2000);
    }
  }, [scanned, checkInCustomer, navigation]);

  if (!permission) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ThemedText type="body">Loading camera...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!permission.granted) {
    return (
      <ThemedView
        style={[
          styles.container,
          styles.permissionContainer,
          { paddingTop: insets.top },
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
          To scan tickets and check in customers, TIQKETS needs access to your camera.
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
        
        <Pressable onPress={() => navigation.goBack()} style={styles.cancelLink}>
          <ThemedText type="body" style={{ color: theme.primary }}>
            Cancel
          </ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#000" }]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: SUPPORTED_BARCODE_TYPES,
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
          <View style={styles.headerBadge}>
            <Feather name="check-circle" size={16} color="#FFFFFF" />
            <ThemedText
              type="small"
              style={styles.headerBadgeText}
              lightColor="#FFFFFF"
              darkColor="#FFFFFF"
            >
              Check-in Mode
            </ThemedText>
          </View>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.scanArea}>
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.topLeft, { borderColor: theme.primary }]} />
            <View style={[styles.corner, styles.topRight, { borderColor: theme.primary }]} />
            <View style={[styles.corner, styles.bottomLeft, { borderColor: theme.primary }]} />
            <View style={[styles.corner, styles.bottomRight, { borderColor: theme.primary }]} />
          </View>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing["2xl"] }]}>
          <View style={styles.iconRow}>
            <View style={styles.formatIcon}>
              <Feather name="grid" size={20} color="rgba(255,255,255,0.8)" />
            </View>
            <View style={styles.formatIcon}>
              <Feather name="minus" size={20} color="rgba(255,255,255,0.8)" />
            </View>
          </View>
          <ThemedText
            type="body"
            style={styles.instruction}
            lightColor="#FFFFFF"
            darkColor="#FFFFFF"
          >
            Scan ticket QR code or barcode
          </ThemedText>
          <ThemedText
            type="small"
            style={styles.subInstruction}
            lightColor="rgba(255,255,255,0.7)"
            darkColor="rgba(255,255,255,0.7)"
          >
            Supports QR codes, Code128, EAN-13, UPC, and more
          </ThemedText>
        </View>
      </View>

      {scanResult ? (
        <View style={styles.resultOverlay}>
          <View
            style={[
              styles.resultCard,
              {
                backgroundColor: scanResult.success ? Colors.light.success : Colors.light.error,
              },
            ]}
          >
            <View style={styles.resultIconContainer}>
              <Feather
                name={scanResult.success ? "check-circle" : "x-circle"}
                size={48}
                color="#FFFFFF"
              />
            </View>
            <ThemedText
              type="h4"
              style={styles.resultTitle}
              lightColor="#FFFFFF"
              darkColor="#FFFFFF"
            >
              {scanResult.success ? "Check-in Successful!" : "Check-in Failed"}
            </ThemedText>
            {scanResult.success && scanResult.ticketNumber ? (
              <View style={styles.resultDetails}>
                <ThemedText
                  type="body"
                  style={styles.resultTicket}
                  lightColor="rgba(255,255,255,0.9)"
                  darkColor="rgba(255,255,255,0.9)"
                >
                  Ticket: {scanResult.ticketNumber}
                </ThemedText>
                {scanResult.customerName ? (
                  <ThemedText
                    type="body"
                    style={styles.resultName}
                    lightColor="rgba(255,255,255,0.9)"
                    darkColor="rgba(255,255,255,0.9)"
                  >
                    {scanResult.customerName}
                  </ThemedText>
                ) : null}
              </View>
            ) : (
              <ThemedText
                type="body"
                style={styles.resultMessage}
                lightColor="rgba(255,255,255,0.9)"
                darkColor="rgba(255,255,255,0.9)"
              >
                {scanResult.message}
              </ThemedText>
            )}
          </View>
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
    marginBottom: Spacing.lg,
  },
  supportedFormats: {
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
    justifyContent: "space-between",
    alignItems: "center",
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
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: Spacing.xs,
  },
  headerBadgeText: {
    fontWeight: "600",
  },
  scanArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scanFrame: {
    width: 280,
    height: 280,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 50,
    height: 50,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: BorderRadius.md,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: BorderRadius.md,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: BorderRadius.md,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: BorderRadius.md,
  },
  footer: {
    alignItems: "center",
    paddingHorizontal: Spacing["2xl"],
  },
  iconRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  formatIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  instruction: {
    textAlign: "center",
    fontWeight: "600",
    marginBottom: Spacing.sm,
  },
  subInstruction: {
    textAlign: "center",
  },
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing["2xl"],
  },
  resultCard: {
    width: "100%",
    padding: Spacing["2xl"],
    borderRadius: BorderRadius.lg,
    alignItems: "center",
  },
  resultIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  resultTitle: {
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  resultDetails: {
    alignItems: "center",
    gap: Spacing.xs,
  },
  resultTicket: {
    fontWeight: "700",
    fontSize: 18,
  },
  resultName: {
    fontWeight: "500",
  },
  resultMessage: {
    textAlign: "center",
  },
});
