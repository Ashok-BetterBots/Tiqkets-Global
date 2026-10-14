export type ToastType = "success" | "info";

export const TOAST_ENTER_MS = 160;
export const TOAST_HOLD_MS = 1000;
export const TOAST_EXIT_MS = 160;
export const ROOT_TOAST_HOST = "app-root";

export interface ToastMessage {
  id: number;
  title: string;
  message: string;
  type: ToastType;
}

export interface ToastSnapshot {
  toast: ToastMessage | null;
  phase: "visible" | "exiting";
  hostId: string;
}

type Schedule = (callback: () => void, delay: number) => () => void;

const scheduleTimeout: Schedule = (callback, delay) => {
  const timer = setTimeout(callback, delay);
  return () => clearTimeout(timer);
};

/**
 * Latest message wins. The root and native-window hosts share this one clock;
 * moving between windows never replays or queues a notification.
 */
export function createToastController(schedule: Schedule = scheduleTimeout) {
  let nextId = 0;
  let nextHostOrder = 0;
  let snapshot: ToastSnapshot = {
    toast: null,
    phase: "visible",
    hostId: ROOT_TOAST_HOST,
  };
  const listeners = new Set<() => void>();
  const hosts = new Map<string, { depth: number; order: number }>();
  let cancelHold: (() => void) | undefined;
  let cancelExit: (() => void) | undefined;

  const publish = (update: Partial<ToastSnapshot>) => {
    snapshot = { ...snapshot, ...update };
    listeners.forEach((listener) => listener());
  };

  const cancelTimers = () => {
    cancelHold?.();
    cancelExit?.();
    cancelHold = undefined;
    cancelExit = undefined;
  };

  const chooseHost = () => {
    let hostId = ROOT_TOAST_HOST;
    let bestDepth = -1;
    let bestOrder = -1;
    hosts.forEach(({ depth, order }, id) => {
      if (depth > bestDepth || (depth === bestDepth && order > bestOrder)) {
        hostId = id;
        bestDepth = depth;
        bestOrder = order;
      }
    });
    if (hostId !== snapshot.hostId) publish({ hostId });
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    show(title: string, message: string, type: ToastType = "success") {
      cancelTimers();
      const id = ++nextId;
      publish({ toast: { id, title, message, type }, phase: "visible" });
      cancelHold = schedule(() => {
        if (snapshot.toast?.id !== id) return;
        publish({ phase: "exiting" });
        cancelExit = schedule(() => {
          if (snapshot.toast?.id === id) {
            publish({ toast: null, phase: "visible" });
          }
        }, TOAST_EXIT_MS);
      }, TOAST_ENTER_MS + TOAST_HOLD_MS);
    },
    clear() {
      cancelTimers();
      publish({ toast: null, phase: "visible" });
    },
    registerHost(id: string, depth: number) {
      const order = ++nextHostOrder;
      hosts.set(id, { depth, order });
      chooseHost();
      return () => {
        // A stale cleanup must not remove a later registration of this host.
        if (hosts.get(id)?.order !== order) return;
        hosts.delete(id);
        chooseHost();
      };
    },
  };
}

export const toastController = createToastController();

/** Presentation only: no queue effects, audio, haptics or navigation. */
export function showToast(
  title: string,
  message: string,
  type: ToastType = "success",
) {
  toastController.show(title, message, type);
}
