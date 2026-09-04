import React, { ComponentType, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function AppBootstrap() {
  const [AppComponent, setAppComponent] = useState<ComponentType | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const App = require("./App").default as ComponentType;
      setAppComponent(() => App);
    }, 250);

    return () => clearTimeout(timer);
  }, []);

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
});