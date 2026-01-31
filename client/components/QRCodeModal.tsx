import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
// @ts-ignore - cacheDirectory exists at runtime
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

interface QRCodeModalProps {
  visible: boolean;
  onClose: () => void;
  branchId: string;
  branchName: string;
  organizationName: string;
}

export function QRCodeModal({
  visible,
  onClose,
  branchId,
  branchName,
  organizationName,
}: QRCodeModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();

  const qrUrl = `${getApiUrl()}/join/${branchId}`;
  const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrUrl)}&margin=20&format=png`;

  const handleSaveToGallery = async () => {
    try {
      setIsSaving(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (Platform.OS !== "web") {
        if (!mediaPermission?.granted) {
          const permission = await requestMediaPermission();
          if (!permission.granted) {
            if (!permission.canAskAgain) {
              Alert.alert(
                "Permission Required",
                "Please enable photo library access in your device settings to save QR codes.",
                [{ text: "OK" }]
              );
            }
            setIsSaving(false);
            return;
          }
        }

        const fileName = `TIQKETS_QR_${branchId}_${Date.now()}.png`;
        // @ts-ignore - cacheDirectory exists at runtime in expo-file-system
        const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
        // @ts-ignore - downloadAsync exists at runtime
        const downloadResult = await FileSystem.downloadAsync(qrCodeImageUrl, fileUri);

        if (downloadResult.status === 200) {
          await MediaLibrary.saveToLibraryAsync(downloadResult.uri);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert("Saved!", "QR code has been saved to your photo gallery.", [{ text: "OK" }]);
        } else {
          throw new Error("Failed to download QR code");
        }
      } else {
        const link = document.createElement("a");
        link.href = qrCodeImageUrl;
        link.download = `TIQKETS_QR_${branchId}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        Alert.alert("Download Started", "QR code download has started.", [{ text: "OK" }]);
      }
    } catch (error) {
      console.error("Error saving QR code:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", "Failed to save QR code. Please try again.", [{ text: "OK" }]);
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (Platform.OS === "web") {
        if (navigator.share) {
          await navigator.share({
            title: `${organizationName} - ${branchName} Queue`,
            text: `Join the queue at ${branchName}`,
            url: qrUrl,
          });
        } else {
          await navigator.clipboard.writeText(qrUrl);
          Alert.alert("Copied!", "Queue link has been copied to clipboard.", [{ text: "OK" }]);
        }
        return;
      }

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert("Sharing not available", "Sharing is not available on this device.", [{ text: "OK" }]);
        return;
      }

      const fileName = `TIQKETS_QR_${branchId}_${Date.now()}.png`;
      // @ts-ignore - cacheDirectory exists at runtime in expo-file-system
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      // @ts-ignore - downloadAsync exists at runtime
      const downloadResult = await FileSystem.downloadAsync(qrCodeImageUrl, fileUri);

      if (downloadResult.status === 200) {
        await Sharing.shareAsync(downloadResult.uri, {
          mimeType: "image/png",
          dialogTitle: `Share QR Code - ${branchName}`,
        });
      }
    } catch (error) {
      console.error("Error sharing QR code:", error);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <Card style={styles.modalContent}>
          <View style={styles.header}>
            <View style={styles.headerTitleContainer}>
              <Feather name="grid" size={20} color={Colors.light.primary} />
              <ThemedText type="body" style={styles.headerTitle}>
                QR Code
              </ThemedText>
            </View>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Feather name="x" size={24} color={Colors.light.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.branchInfo}>
            <ThemedText type="body" style={styles.organizationName}>
              {organizationName}
            </ThemedText>
            <ThemedText style={styles.branchName}>{branchName}</ThemedText>
          </View>

          <View style={styles.qrContainer}>
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.light.primary} />
                <ThemedText style={styles.loadingText}>Generating QR code...</ThemedText>
              </View>
            ) : (
              <View style={styles.qrImageWrapper}>
                <Image
                  source={{ uri: qrCodeImageUrl }}
                  style={styles.qrImage}
                  resizeMode="contain"
                  onLoadStart={() => setIsLoading(true)}
                  onLoad={() => setIsLoading(false)}
                  onError={() => {
                    setIsLoading(false);
                    Alert.alert("Error", "Failed to generate QR code. Please try again.");
                  }}
                />
              </View>
            )}
          </View>

          <View style={styles.urlContainer}>
            <ThemedText style={styles.urlLabel}>Queue Join URL</ThemedText>
            <View style={styles.urlBox}>
              <ThemedText style={styles.urlText} numberOfLines={1}>
                {qrUrl}
              </ThemedText>
            </View>
          </View>

          <View style={styles.instructions}>
            <Feather name="info" size={16} color={Colors.light.primary} />
            <ThemedText style={styles.instructionText}>
              Print this QR code and display it at your entrance or front desk. Customers can scan it to join the queue instantly.
            </ThemedText>
          </View>

          <View style={styles.actions}>
            <Button
              title={isSaving ? "Saving..." : "Save to Gallery"}
              onPress={handleSaveToGallery}
              disabled={isSaving || isLoading}
              icon={<Feather name="download" size={18} color="#FFFFFF" />}
              style={styles.actionButton}
            />
            <Button
              title="Share"
              onPress={handleShare}
              variant="secondary"
              disabled={isLoading}
              icon={<Feather name="share-2" size={18} color={Colors.light.primary} />}
              style={styles.actionButton}
            />
          </View>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.lg,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    padding: Spacing.lg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  headerTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  headerTitle: {
    fontWeight: "700",
  },
  closeButton: {
    padding: Spacing.xs,
  },
  branchInfo: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  organizationName: {
    fontWeight: "600",
    color: Colors.light.primary,
    marginBottom: 4,
  },
  branchName: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  qrContainer: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  loadingContainer: {
    width: 250,
    height: 250,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: BorderRadius.lg,
  },
  loadingText: {
    marginTop: Spacing.sm,
    color: Colors.light.textSecondary,
    fontSize: 14,
  },
  qrImageWrapper: {
    padding: Spacing.md,
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  qrImage: {
    width: 250,
    height: 250,
  },
  urlContainer: {
    marginBottom: Spacing.lg,
  },
  urlLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginBottom: Spacing.xs,
    fontWeight: "500",
  },
  urlBox: {
    backgroundColor: "#F1F5F9",
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  urlText: {
    fontSize: 12,
    color: Colors.light.text,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  instructions: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    backgroundColor: Colors.light.primary + "10",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  instructionText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.primary,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
