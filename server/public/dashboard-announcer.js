/* Local dashboard audio state only. SSE and queue_update handling stay in dashboard.html. */
(function (root) {
  "use strict";
  const LOCK = "tiqkets-dashboard-announcement-audio";
  const eventTimestamp = event => event.type === "serve"
    ? event.servedAt || event.calledAt : event.calledAt || event.servedAt;
  function eventKey(event) {
    const stamp = eventTimestamp(event);
    return event.id && stamp ? `${event.branchId}|${event.id}|${event.type}|${stamp}` : null;
  }
  class DashboardAnnouncer {
    constructor(options) {
      this.options = options;
      this.scope = {};
      this.state = { selected: false, active: false, wanted: false, otherTab: false, busy: false,
        message: "", text: "", languages: [], connected: false, masterEnabled: false };
      this.queue = [];
      this.seen = new Set();
      this.epoch = 0;
      this.worker = false;
      this.controller = null;
      this.releaseLock = null;
      this.lockAttempt = false;
      this.wake = null;
      this.wakePending = false;
      this.inspectBusy = false;
      this.inspectPromise = null;
      this.lastInspect = 0;
      this.lastEvent = null;
      this.audio = options.audio || new root.TiqketsAnnouncementAudio.BrowserAnnouncementAudio({
        resolveUtterances: options.resolveUtterances,
        onBlocked: message => { if (this.state.wanted) this.block(message); },
        notice: message => this.publish({ message }),
        languages: languages => this.publish({ languages }),
      });
      this.tick = setInterval(() => {
        const local = options.getScope();
        if (local.key !== this.scope.key) this.syncScope(local);
        if (this.scope.key && (this.state.selected || Date.now() - this.lastInspect >= 10000)) void this.inspect();
        if (this.state.wanted && !this.releaseLock) void this.acquire();
      }, 2000);
      this.visibility = () => { void this.updateWake(); if (!root.document.hidden) void this.inspect(); };
      this.exit = () => this.stop();
      root.document.addEventListener("visibilitychange", this.visibility);
      root.addEventListener("pagehide", this.exit);
      this.voicesChanged = () => {
        this.publish({ languages: [...new Set(this.audio.voices().map(v => v.lang))].sort() });
      };
      root.speechSynthesis?.addEventListener("voiceschanged", this.voicesChanged);
    }
    publish(update) {
      Object.assign(this.state, update);
      this.options.onState({ ...this.state });
    }
    syncScope(scope) {
      const key = scope?.key || "";
      if (key !== this.scope.key || !scope?.selected || !scope?.enabled) {
        if (key !== this.scope.key || (this.state.selected && !scope?.selected) ||
          (this.state.wanted && !scope?.enabled)) {
          this.stop();
          this.lastEvent = null;
          this.seen.clear();
          this.publish({ message: "", languages: [] });
        }
      }
      this.scope = { ...scope };
      this.publish({ selected: !!scope?.selected, masterEnabled: !!scope?.enabled });
    }
    inspect() {
      if (this.inspectPromise) return this.inspectPromise;
      this.inspectPromise = this.performInspect().finally(() => { this.inspectPromise = null; });
      return this.inspectPromise;
    }
    async performInspect() {
      if (!this.scope.key) return false;
      this.inspectBusy = true;
      this.lastInspect = Date.now();
      const key = this.scope.key;
      try {
        const scope = await this.options.inspectScope();
        if (key !== this.scope.key) return false;
        this.syncScope(scope);
        return true;
      } catch (error) {
        if (key !== this.scope.key) return false;
        // Fail closed if the session/selection cannot be verified. Queue SSE
        // continues independently; Enable can retry after connectivity returns.
        if (this.state.wanted || this.state.busy) this.block("Could not verify announcer access. Click Enable announcements to retry.");
        return false;
      } finally { this.inspectBusy = false; }
    }
    async enable() {
      const local = this.options.getScope();
      if (local.key !== this.scope.key) this.syncScope(local);
      if (!this.state.selected || !this.scope.enabled || this.state.busy) return;
      this.publish({ busy: true, message: "" });
      const epoch = this.epoch;
      try {
        // Keep user activation: unlock before awaiting selection verification.
        await this.audio.unlock();
        if (epoch !== this.epoch) return;
        const verified = await this.inspect();
        if (!verified || epoch !== this.epoch || !this.state.selected || !this.scope.enabled) return;
        this.publish({ wanted: true });
        await this.acquire();
      } catch (error) {
        this.block(error.message || "Browser blocked audio. Click Enable announcements again.");
      } finally { this.publish({ busy: false }); }
    }
    async acquire() {
      if (this.lockAttempt || this.releaseLock || !this.state.wanted) return;
      if (!root.navigator.locks) {
        this.block("This browser cannot safely coordinate announcement tabs. Use a current Chrome, Edge, Safari or Firefox.");
        return;
      }
      this.lockAttempt = true;
      const epoch = this.epoch;
      // ifAvailable never steals a playing tab's lock. A surviving enabled tab
      // retries every two seconds; Web Locks release automatically on tab close.
      void root.navigator.locks.request(LOCK, { ifAvailable: true }, async lock => {
        if (epoch !== this.epoch || !this.state.wanted) return;
        if (!lock) { this.publish({ otherTab: true, active: false }); return; }
        await new Promise(resolve => {
          this.releaseLock = resolve;
          this.publish({ otherTab: false, active: true, message: "" });
          void this.updateWake();
        });
      }).catch(error => {
        if (epoch === this.epoch) this.block(`Could not claim announcement tab: ${error.message}`);
      }).finally(() => { this.lockAttempt = false; });
    }
    connection(connected) { this.publish({ connected }); }
    receive(event) {
      if (event.branchId !== this.scope.branchId) return;
      const key = eventKey(event);
      if (!key) { console.warn("[dashboard-announcer] Ignoring event without ticket/call timestamp."); return; }
      if (this.seen.has(key)) return;
      this.seen.add(key);
      if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value);
      this.lastEvent = event;
      // Do not retain announcements arriving before Enable or in standby tabs.
      if (!this.state.selected || !this.state.active || !this.state.wanted) return;
      const stamp = Date.parse(eventTimestamp(event));
      if (Number.isFinite(stamp) && Date.now() - stamp > 60000) return;
      this.queue.push(event);
      this.drain();
    }
    async test() {
      if (!await this.inspect()) return;
      if (!this.state.active) return;
      const text = "This is a test announcement. Speaker announcements are working.";
      this.queue.push({ spokenText: text, spokenTextEn: text, language: "en", languageBcp47: "en-US",
        alertSoundUrl: this.lastEvent?.alertSoundUrl || null, test: true });
      this.drain();
    }
    async drain() {
      if (this.worker || !this.state.active || !this.queue.length) return;
      this.worker = true;
      const epoch = this.epoch;
      try {
        while (epoch === this.epoch && this.state.active && this.queue.length) {
          const event = this.queue.shift();
          const controller = new AbortController();
          this.controller = controller;
          this.publish({ text: this.options.resolveUtterances(event).map(u => u.text).join(" — ") });
          let timer;
          try {
            await Promise.race([
              this.audio.play(event, controller.signal),
              new Promise((_, reject) => {
                timer = setTimeout(() => {
                  reject(new Error("Announcement exceeded 30 seconds; stopped and continued."));
                  controller.abort();
                }, 30000);
                controller.signal.addEventListener("abort", () => reject(new Error("Cancelled")), { once: true });
              }),
            ]);
          } catch (error) {
            controller.abort();
            this.audio.stop();
            if (epoch !== this.epoch) break;
            console.warn("[dashboard-announcer]", error);
            if (root.TiqketsAnnouncementAudio.blocked(error)) {
              this.block("Browser blocked audio. Click Enable announcements again.");
              break;
            }
            this.publish({ message: error.message || "Announcement failed; continuing with the next ticket." });
          } finally { clearTimeout(timer); }
          if (epoch !== this.epoch || !this.state.active) break;
          // The worker owns this gap even when the queue is temporarily empty.
          this.controller = new AbortController();
          await root.TiqketsAnnouncementAudio.completion(this.controller.signal, done => {
            const gap = setTimeout(done, 1000);
            this.controller.signal.addEventListener("abort", () => clearTimeout(gap), { once: true });
          }).catch(() => {});
        }
      } finally {
        this.worker = false;
        this.controller = null;
        if (this.queue.length && this.state.active) void this.drain();
      }
    }
    block(message) {
      this.stop();
      this.publish({ message });
    }
    stop() {
      this.epoch++;
      this.queue = [];
      this.controller?.abort();
      // A standby tab must never cancel the owner's browser-global speech.
      if (this.releaseLock || this.state.active || this.state.busy) this.audio.stop();
      const release = this.releaseLock;
      this.releaseLock = null;
      release?.();
      void this.releaseWake();
      this.publish({ active: false, wanted: false, otherTab: false, text: "", busy: false });
    }
    async releaseWake() {
      const wake = this.wake;
      this.wake = null;
      try { await wake?.release(); } catch (_) {}
    }
    async updateWake() {
      if (!this.state.active || root.document.hidden) { await this.releaseWake(); return; }
      if (!root.navigator.wakeLock || this.wake || this.wakePending) return;
      this.wakePending = true;
      const epoch = this.epoch;
      try {
        const wake = await root.navigator.wakeLock.request("screen");
        if (epoch !== this.epoch || !this.state.active || root.document.hidden) { await wake.release(); return; }
        this.wake = wake;
        wake.addEventListener("release", () => { if (this.wake === wake) this.wake = null; });
      } catch (_) { /* Optional power-management aid, not an audio prerequisite. */ }
      finally { this.wakePending = false; }
    }
    destroy() {
      this.stop();
      this.scope = {};
      clearInterval(this.tick);
      root.document.removeEventListener("visibilitychange", this.visibility);
      root.removeEventListener("pagehide", this.exit);
      root.speechSynthesis?.removeEventListener("voiceschanged", this.voicesChanged);
      void this.audio.dispose();
    }
  }
  root.TiqketsDashboardAnnouncer = { create: options => new DashboardAnnouncer(options), eventKey };
})(typeof window !== "undefined" ? window : globalThis);
