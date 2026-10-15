/** Observe just the branch audio flag on the existing announcement stream. */
export function observeBranchAnnouncementSettings(options: {
  branchId: string;
  createSource: () => { addEventListener: (type: string, callback: (event: any) => void) => void; close: () => void };
  load: () => Promise<boolean>;
  apply: (enabled: boolean) => void;
  subscribeForeground: (refresh: () => void) => () => void;
}) {
  let closed = false;
  let revision = 0;
  const refresh = async () => {
    const request = ++revision;
    try {
      const enabled = await options.load();
      if (!closed && request === revision) options.apply(enabled);
    } catch {
      // Offline retains the last confirmed/optimistic state; saves surface errors.
    }
  };
  let source: ReturnType<typeof options.createSource> | undefined;
  try {
    source = options.createSource();
    source.addEventListener("open", () => { void refresh(); });
    source.addEventListener("branch_settings_changed", event => {
      if (closed) return;
      try {
        const data = JSON.parse(event.data);
        if (data.branchId !== options.branchId || typeof data.announcementsEnabled !== "boolean") return;
        revision++;
        options.apply(data.announcementsEnabled);
      } catch { /* Ignore malformed or unrelated events. */ }
    });
  } catch { /* Foreground reads still work if the stream cannot be opened. */ }
  const unsubscribe = options.subscribeForeground(() => { void refresh(); });
  void refresh();
  return () => {
    closed = true;
    revision++;
    unsubscribe();
    source?.close();
  };
}
