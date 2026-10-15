type QueueOptions<T> = {
  play: (item: T, signal: AbortSignal) => Promise<void>;
  cancelPlayback: () => Promise<void>;
  warn: (message: string, error?: unknown) => void;
  timeoutMs?: number;
  gapMs?: number;
};

/** One worker owns playback AND the gap, including when the waiting list is empty. */
export class AnnouncementQueue<T> {
  private items: T[] = [];
  private running = false;
  private epoch = 0;
  private active: AbortController | null = null;

  constructor(private readonly options: QueueOptions<T>) {}

  enqueue(item: T) {
    this.items.push(item);
    if (this.items.length > 20) {
      this.options.warn(`Announcement backlog: ${this.items.length} waiting; no items dropped.`);
    }
    this.startWorker();
  }

  discardWhere(predicate: (item: T) => boolean) {
    this.items = this.items.filter(item => !predicate(item));
  }

  stop() {
    this.epoch += 1;
    this.items = [];
    this.active?.abort();
  }

  private startWorker() {
    if (this.running || !this.items.length) return;
    this.running = true;
    void this.drain(this.epoch).finally(() => {
      this.running = false;
      this.startWorker();
    });
  }

  private async drain(epoch: number) {
    while (epoch === this.epoch && this.items.length) {
      const item = this.items.shift()!;
      const controller = new AbortController();
      this.active = controller;
      const timeoutMs = this.options.timeoutMs ?? 30000;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onAbort = () => {};
      let timedOut = false;
      const cancelled = new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error("Announcement cancelled"));
        controller.signal.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error(`Announcement exceeded ${timeoutMs} ms`));
          controller.abort();
        }, timeoutMs);
      });
      try {
        await Promise.race([this.options.play(item, controller.signal), cancelled]);
      } catch (error) {
        if (timedOut || !controller.signal.aborted) {
          this.options.warn(timedOut
            ? `Announcement timed out after ${timeoutMs} ms; stopping playback and continuing.`
            : "Announcement failed; stopping playback and continuing.", error);
        }
        controller.abort();
      } finally {
        clearTimeout(timer);
        controller.signal.removeEventListener("abort", onAbort);
        if (controller.signal.aborted) {
          try {
            await this.options.cancelPlayback();
          } catch (error) {
            this.options.warn("Announcement playback cleanup failed.", error);
          }
        }
      }
      if (epoch !== this.epoch) break;
      // A timeout aborts the playback signal, but must still keep the normal gap.
      const gap = new AbortController();
      this.active = gap;
      await new Promise<void>(resolve => {
        const finish = () => {
          clearTimeout(gapTimer);
          gap.signal.removeEventListener("abort", finish);
          resolve();
        };
        const gapTimer = setTimeout(finish, this.options.gapMs ?? 1000);
        gap.signal.addEventListener("abort", finish, { once: true });
      });
    }
    this.active = null;
  }
}

/** Completion callbacks settle once; teardown/timeout also releases pending stages. */
export function waitForAnnouncementCompletion(
  signal: AbortSignal,
  subscribe: (done: () => void, fail: (error: unknown) => void) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      if (error !== undefined) reject(error);
      else resolve();
    };
    const onAbort = () => finish(new Error("Announcement cancelled"));
    if (signal.aborted) { onAbort(); return; }
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      subscribe(() => finish(), error => finish(error ?? new Error("Announcement playback failed")));
    } catch (error) {
      finish(error);
    }
  });
}
