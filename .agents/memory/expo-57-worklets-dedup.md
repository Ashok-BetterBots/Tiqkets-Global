---
name: Expo SDK 57 Worklets deduplication
description: Prevents native Hermes crashes caused by nested react-native-worklets versions that Expo Doctor may miss.
---

Expo SDK 57 Expo Go projects must resolve every `react-native-worklets` peer to the exact version in Expo's bundled-native map. A compatible root dependency is not enough: npm can auto-install a newer nested patch under Expo because `expo-modules-core` accepts a range. The resulting JSI/native mismatch can leave Android on “Loading from …” after Metro bundles, with no JavaScript error.

**Why:** Android Expo Go fetched the complete bundle but never executed the entry point. The tree contained the expected Worklets version at root and a newer nested copy under Expo; deduplicating to the bundled version removed the incompatible code.

**How to apply:** After Expo/package installs, inspect the full npm tree and filesystem for duplicate Worklets copies. Use an exact direct dependency plus npm’s `$dependency` override form, then dedupe and clear Metro. Expo Doctor alone does not detect this nested peer mismatch.