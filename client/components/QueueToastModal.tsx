import React, { useContext } from "react";
import { Modal, ModalProps, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastHost, ToastWindowDepth } from "@/components/Toast";

/**
 * Same native Modal, with a touch-transparent toast slot in its own window.
 * React Native keeps iOS children mounted until dismissal finishes; Android
 * unmounts them when visible becomes false. Host registration follows that
 * actual child lifetime, not a guessed dismissal timeout.
 */
export function QueueToastModal({ children, ...props }: ModalProps) {
  const depth = useContext(ToastWindowDepth) + 1;
  return (
    <Modal {...props}>
      <SafeAreaProvider style={styles.window}>
        <ToastWindowDepth.Provider value={depth}>
          {children}
          <ToastHost modalDepth={depth} />
        </ToastWindowDepth.Provider>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  window: { flex: 1 },
});
