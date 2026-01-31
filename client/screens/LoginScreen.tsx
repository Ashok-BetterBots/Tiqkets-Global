import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Image,
  Pressable,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface AuthButtonProps {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  delay: number;
  variant?: "default" | "primary";
}

function AuthButton({ icon, label, onPress, delay, variant = "default" }: AuthButtonProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.97);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1);
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isPrimary = variant === "primary";

  return (
    <AnimatedPressable
      entering={FadeInDown.delay(delay).springify()}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.authButton,
        isPrimary
          ? { backgroundColor: theme.primary }
          : { backgroundColor: theme.backgroundDefault, borderWidth: 1, borderColor: theme.border },
        animatedStyle,
      ]}
    >
      <Feather
        name={icon}
        size={20}
        color={isPrimary ? "#FFFFFF" : theme.text}
      />
      <ThemedText
        type="body"
        style={styles.authButtonText}
        lightColor={isPrimary ? "#FFFFFF" : theme.text}
        darkColor={isPrimary ? "#FFFFFF" : theme.text}
      >
        {label}
      </ThemedText>
    </AnimatedPressable>
  );
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { login } = useAuth();
  const { loginOrganization } = useOrganization();
  const [isLoading, setIsLoading] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const handleOrgLogin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);
    try {
      await loginOrganization("demo@org.com", "password");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = async (method: string) => {
    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await login(method, { name: "Demo User", email: "demo@tiqkets.app" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailLogin = async () => {
    if (!email.trim() || !name.trim()) return;
    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await login("email", { name: name.trim(), email: email.trim(), phone: phone.trim() });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={isDark ? ["#1A1A2E", "#16213E"] : ["#F8F9FA", "#EBF4FF"]}
      style={[styles.container, { paddingTop: insets.top + Spacing["4xl"] }]}
    >
      <View style={styles.logoContainer}>
        <Image
          source={require("../../assets/images/icon.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <ThemedText type="h1" style={styles.appName}>
            TIQKETS
          </ThemedText>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <ThemedText
            type="body"
            style={[styles.tagline, { color: theme.textSecondary }]}
          >
            Skip the wait, not the service
          </ThemedText>
        </Animated.View>
      </View>

      <View style={[styles.authContainer, { paddingBottom: insets.bottom + Spacing.xl }]}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <ThemedText type="body" style={{ marginTop: Spacing.lg, color: theme.textSecondary }}>
              Signing you in...
            </ThemedText>
          </View>
        ) : showEmailForm ? (
          <Animated.View
            entering={FadeInDown.springify()}
            style={styles.emailForm}
          >
            <Pressable
              onPress={() => setShowEmailForm(false)}
              style={styles.backButton}
            >
              <Feather name="arrow-left" size={20} color={theme.text} />
              <ThemedText type="body" style={{ marginLeft: Spacing.sm }}>
                Back
              </ThemedText>
            </Pressable>

            <TextInput
              placeholder="Your name"
              placeholderTextColor={theme.textSecondary}
              value={name}
              onChangeText={setName}
              style={[
                styles.input,
                {
                  backgroundColor: theme.backgroundDefault,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              autoCapitalize="words"
            />

            <TextInput
              placeholder="Email address"
              placeholderTextColor={theme.textSecondary}
              value={email}
              onChangeText={setEmail}
              style={[
                styles.input,
                {
                  backgroundColor: theme.backgroundDefault,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <TextInput
              placeholder="Phone number (optional)"
              placeholderTextColor={theme.textSecondary}
              value={phone}
              onChangeText={setPhone}
              style={[
                styles.input,
                {
                  backgroundColor: theme.backgroundDefault,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              keyboardType="phone-pad"
            />

            <Pressable
              onPress={handleEmailLogin}
              style={[
                styles.authButton,
                { backgroundColor: theme.primary },
                (!email.trim() || !name.trim()) && { opacity: 0.5 },
              ]}
              disabled={!email.trim() || !name.trim()}
            >
              <ThemedText
                type="body"
                style={styles.authButtonText}
                lightColor="#FFFFFF"
                darkColor="#FFFFFF"
              >
                Continue
              </ThemedText>
            </Pressable>
          </Animated.View>
        ) : (
          <>
            {Platform.OS === "ios" && (
              <AuthButton
                icon="smartphone"
                label="Continue with Apple"
                onPress={() => handleSocialLogin("apple")}
                delay={300}
              />
            )}
            <AuthButton
              icon="mail"
              label="Continue with Google"
              onPress={() => handleSocialLogin("google")}
              delay={350}
            />
            <AuthButton
              icon="message-circle"
              label="Continue with WhatsApp"
              onPress={() => handleSocialLogin("whatsapp")}
              delay={400}
              variant="primary"
            />
            <AuthButton
              icon="mail"
              label="Continue with Email"
              onPress={() => setShowEmailForm(true)}
              delay={450}
            />

            <Animated.View
              entering={FadeInDown.delay(500).springify()}
              style={styles.termsContainer}
            >
              <ThemedText
                type="caption"
                style={[styles.termsText, { color: theme.textSecondary }]}
              >
                By continuing, you agree to our{" "}
                <ThemedText type="caption" style={{ color: theme.primary }}>
                  Terms of Service
                </ThemedText>
                {" "}and{" "}
                <ThemedText type="caption" style={{ color: theme.primary }}>
                  Privacy Policy
                </ThemedText>
              </ThemedText>
            </Animated.View>

            <Animated.View
              entering={FadeInDown.delay(550).springify()}
              style={styles.orgLoginContainer}
            >
              <Pressable onPress={handleOrgLogin} style={styles.orgLoginButton}>
                <Feather name="briefcase" size={16} color={theme.primary} />
                <ThemedText style={[styles.orgLoginText, { color: theme.primary }]}>
                  Organization Login
                </ThemedText>
              </Pressable>
            </Animated.View>
          </>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  logoContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: Spacing.xl,
  },
  appName: {
    textAlign: "center",
    letterSpacing: 2,
  },
  tagline: {
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  authContainer: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  authButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.sm,
    gap: Spacing.md,
  },
  authButtonText: {
    fontWeight: "600",
  },
  termsContainer: {
    marginTop: Spacing.lg,
  },
  termsText: {
    textAlign: "center",
    lineHeight: 20,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["4xl"],
  },
  emailForm: {
    gap: Spacing.md,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  input: {
    height: Spacing.inputHeight,
    borderWidth: 1,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.lg,
    fontSize: 16,
  },
  orgLoginContainer: {
    marginTop: Spacing.xl,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: Spacing.lg,
  },
  orgLoginButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  orgLoginText: {
    fontWeight: "600",
    fontSize: 14,
  },
});
