import React, { useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type DiagnosticMode = "minimal" | "reanimated" | "keyboard" | "audio" | "app";

function DiagnosticButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.button} onPress={onPress}>
      <Text style={styles.buttonText}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function StartupDiagnostic() {
  const [mode, setMode] = useState<DiagnosticMode>("minimal");

  if (mode === "app") {
    const App = require("./App").default;
    return <App />;
  }

  let testContent: React.ReactNode = null;

  if (mode === "reanimated") {
    const Animated = require("react-native-reanimated").default;
    testContent = (
      <Animated.View style={styles.successBox}>
        <Text style={styles.successText}>Reanimated loaded successfully.</Text>
      </Animated.View>
    );
  }

  if (mode === "keyboard") {
    const { KeyboardProvider } = require("react-native-keyboard-controller");
    testContent = (
      <KeyboardProvider>
        <View style={styles.successBox}>
          <Text style={styles.successText}>KeyboardProvider mounted successfully.</Text>
        </View>
      </KeyboardProvider>
    );
  }

  if (mode === "audio") {
    require("expo-audio");
    testContent = (
      <View style={styles.successBox}>
        <Text style={styles.successText}>Expo Audio loaded successfully.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>SDK 57 startup diagnostic</Text>
        <Text style={styles.description}>
          If this screen stays open, the base Expo Go runtime is healthy. Test one
          native subsystem at a time; if Expo Go returns Home, note the last button
          pressed.
        </Text>

        <View style={styles.successBox}>
          <Text style={styles.successText}>Minimal React Native app is running.</Text>
        </View>

        <DiagnosticButton label="1. Test Reanimated" onPress={() => setMode("reanimated")} />
        <DiagnosticButton
          label="2. Test Keyboard Controller"
          onPress={() => setMode("keyboard")}
        />
        <DiagnosticButton label="3. Test Expo Audio" onPress={() => setMode("audio")} />
        <DiagnosticButton label="4. Launch Full App" onPress={() => setMode("app")} />

        {testContent}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8f3f6",
  },
  container: {
    flexGrow: 1,
    padding: 24,
    gap: 14,
    justifyContent: "center",
  },
  title: {
    color: "#8c1867",
    fontSize: 26,
    fontWeight: "800",
  },
  description: {
    color: "#463942",
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 6,
  },
  button: {
    backgroundColor: "#8c1867",
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  successBox: {
    backgroundColor: "#e8f7ed",
    borderColor: "#8bc79d",
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  successText: {
    color: "#1f6335",
    fontSize: 15,
    fontWeight: "600",
  },
});