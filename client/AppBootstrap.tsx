import React, { ComponentType, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function AppBootstrap() {
  const [AppComponent, setAppComponent] = useState<ComponentType | null>(null);
  const [startupError, setStartupError] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const App = require("./App").default as ComponentType;
        setAppComponent(() => App);
      } catch (error) {
        console.error("App startup import failed:", error);
        setStartupError(true);
        SplashScreen.hideAsync().catch(() => {});
      }
    }, 250);

    return () => clearTimeout(timer);
  }, []);

  if (startupError) {
    return (
      <View style={styles.error}>
        <Text style={styles.errorTitle}>Unable to start TIQKETS</Text>
        <Text style={styles.errorMessage}>Please close Expo Go and open the app again.</Text>
      </View>
    );
  }

  if (!AppComponent) {
    return <View style={styles.bootstrap} />;
  }

  return <AppComponent />;
}

const styles = StyleSheet.create({
  bootstrap: {
    flex: 1,
    backgroundColor: "#8c1867",
  },
  error: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#FFFFFF",
  },
  errorTitle: {
    color: "#8c1867",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  errorMessage: {
    color: "#555555",
    fontSize: 15,
    textAlign: "center",
  },
});