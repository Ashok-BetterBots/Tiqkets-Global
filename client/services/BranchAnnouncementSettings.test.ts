import assert from "node:assert/strict";
import { test } from "node:test";
import { observeBranchAnnouncementSettings } from "./BranchAnnouncementSettings";

async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
test("branch observer loads, live-syncs both directions, and ignores other branches and audio messages", async () => {
  const listeners: Record<string, (event: any) => void> = {};
  const values: boolean[] = [];
  let foreground = () => {};
  let closed = false;
  let saved = false;
  const stop = observeBranchAnnouncementSettings({
    branchId: "A", load: async () => saved, apply: value => values.push(value),
    createSource: () => ({ addEventListener: (type, cb) => { listeners[type] = cb; }, close: () => { closed = true; } }),
    subscribeForeground: cb => { foreground = cb; return () => { foreground = () => {}; }; },
  });
  await flush();
  assert.deepEqual(values, [false]);
  const emit = (branchId: string, value: unknown) => listeners.branch_settings_changed({
    data: JSON.stringify({ branchId, announcementsEnabled: value }),
  });
  emit("B", true);
  emit("A", "true");
  emit("A", true);
  emit("A", false);
  assert.deepEqual(values, [false, true, false]);
  assert.equal(listeners.message, undefined);
  assert.equal(listeners.queue_update, undefined);
  saved = true; foreground(); await flush();
  assert.equal(values.at(-1), true);
  saved = false; listeners.open({}); await flush();
  assert.equal(values.at(-1), false);
  stop(); emit("A", true); await flush();
  assert.equal(closed, true);
  assert.equal(values.at(-1), false);
});

test("a snapshot started before a live event cannot overwrite it or survive cleanup", async () => {
  let resolve!: (enabled: boolean) => void;
  const values: boolean[] = [];
  const listeners: Record<string, (event: any) => void> = {};
  const stop = observeBranchAnnouncementSettings({
    branchId: "A", load: () => new Promise(r => { resolve = r; }), apply: value => values.push(value),
    createSource: () => ({ addEventListener: (type, cb) => { listeners[type] = cb; }, close() {} }),
    subscribeForeground: () => () => {},
  });
  listeners.branch_settings_changed({ data: '{"branchId":"A","announcementsEnabled":true}' });
  resolve(false); await flush();
  assert.deepEqual(values, [true]);
  listeners.open({});
  stop(); resolve(false); await flush();
  assert.deepEqual(values, [true]);
});

test("offline refresh errors keep the last value and malformed events do nothing", async () => {
  const values: boolean[] = [];
  const listeners: Record<string, (event: any) => void> = {};
  const stop = observeBranchAnnouncementSettings({
    branchId: "A", load: async () => { throw new Error("offline"); }, apply: value => values.push(value),
    createSource: () => ({ addEventListener: (type, cb) => { listeners[type] = cb; }, close() {} }),
    subscribeForeground: () => () => {},
  });
  await flush();
  listeners.branch_settings_changed({ data: "bad json" });
  assert.deepEqual(values, []);
  stop();
});
