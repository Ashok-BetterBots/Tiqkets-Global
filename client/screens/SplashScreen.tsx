import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { BrandColors } from "@/constants/theme";
import { ONBOARDING_SEEN_KEY } from "@/constants/storageKeys";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import logoWhite from "../assets/images/logo/logo-white-bottom-text.png";

type Props = NativeStackScreenProps<RootStackParamList, "Splash">;

const SPLASH_DURATION = 2800;

export default function SplashScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.8)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 80,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();

    const timer = setTimeout(async () => {
      let seen = false;
      try {
        seen = (await AsyncStorage.getItem(ONBOARDING_SEEN_KEY)) === "true";
      } catch {
        seen = false;
      }
      navigation.replace(seen ? "Login" : "Onboarding");
    }, SPLASH_DURATION);

    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [navigation, opacity, scale, translateY, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={styles.container} testID="screen-splash">
      <StatusBar style="light" />

      <View style={styles.glow} pointerEvents="none">
        <Svg width={300} height={300}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.12} />
              <Stop offset="70%" stopColor="#FFFFFF" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={150} cy={150} r={150} fill="url(#glow)" />
        </Svg>
      </View>

      <Animated.View
        style={[
          styles.brand,
          { opacity, transform: [{ scale }, { translateY }] },
        ]}
      >
        <Image
          source={logoWhite}
          style={styles.logo}
          resizeMode="contain"
          testID="image-splash-logo"
        />
        <Animated.Text style={styles.tagline} testID="text-splash-tagline">
          Your time, managed.
        </Animated.Text>
      </Animated.View>

      <Animated.View
        style={[
          styles.spinner,
          { bottom: insets.bottom + 40 },
          { transform: [{ rotate }] },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BrandColors.primary,
  },
  glow: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    alignItems: "center",
    gap: 20,
  },
  logo: {
    width: 200,
    height: 200,
  },
  tagline: {
    fontFamily: "Jost_400Regular",
    fontSize: 13,
    letterSpacing: 2.3,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.65)",
  },
  spinner: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2.5,
    borderColor: "rgba(255,255,255,0.25)",
    borderTopColor: "#FFFFFF",
  },
});
