import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createToastController,
  ROOT_TOAST_HOST,
  TOAST_ENTER_MS,
  TOAST_EXIT_MS,
  TOAST_HOLD_MS,
} from "./toast-controller";

function setup() {
  let now = 0;
  const tasks: { at: number; callback: () => void; cancelled: boolean }[] = [];
  const controller = createToastController((callback, delay) => {
    const task = { at: now + delay, callback, cancelled: false };
    tasks.push(task);
    return () => { task.cancelled = true; };
  });
  const advance = (milliseconds: number) => {
    const until = now + milliseconds;
    for (;;) {
      const task = tasks
        .filter((candidate) => !candidate.cancelled && candidate.at <= until)
        .sort((a, b) => a.at - b.at)[0];
      if (!task) break;
      now = task.at;
      task.cancelled = true;
      task.callback();
    }
    now = until;
  };
  return { controller, advance, tasks };
}

test("holds for 2.5 seconds after entry, then exits and removes the message", () => {
  assert.equal(TOAST_HOLD_MS, 2500);
  const { controller, advance } = setup();
  controller.show("Arrived", "Customer has arrived.");
  advance(TOAST_ENTER_MS + TOAST_HOLD_MS - 1);
  assert.equal(controller.getSnapshot().phase, "visible");
  advance(1);
  assert.equal(controller.getSnapshot().phase, "exiting");
  advance(TOAST_EXIT_MS - 1);
  assert.ok(controller.getSnapshot().toast);
  advance(1);
  assert.equal(controller.getSnapshot().toast, null);
});

test("preserves full title/message and defaults to success", () => {
  const { controller } = setup();
  controller.show("Customer Registered", "Thiagu has been added to the queue.\n\nTicket: S001");
  assert.deepEqual(controller.getSnapshot().toast, {
    id: 1,
    title: "Customer Registered",
    message: "Thiagu has been added to the queue.\n\nTicket: S001",
    type: "success",
  });
  controller.show("No Customers", "There are no customers waiting in the queue.", "info");
  assert.equal(controller.getSnapshot().toast?.type, "info");
});

test("latest message replaces, rather than overlaps or queues, earlier messages", () => {
  const { controller, advance, tasks } = setup();
  controller.show("First", "First action");
  advance(600);
  controller.show("Second", "Second action");
  assert.equal(controller.getSnapshot().toast?.title, "Second");
  assert.equal(tasks.filter((task) => !task.cancelled).length, 1);
  advance(TOAST_ENTER_MS + TOAST_HOLD_MS - 1);
  assert.equal(controller.getSnapshot().phase, "visible");
  advance(1 + TOAST_EXIT_MS);
  assert.equal(controller.getSnapshot().toast, null);
});

test("an already-queued old hold callback cannot dismiss a replacement", () => {
  const { controller, tasks } = setup();
  controller.show("First", "Old");
  const oldCallback = tasks[0].callback;
  controller.show("Second", "New");
  oldCallback();
  assert.equal(controller.getSnapshot().toast?.title, "Second");
  assert.equal(controller.getSnapshot().phase, "visible");
});

test("replacement during slide-out cancels the old final removal", () => {
  const { controller, advance, tasks } = setup();
  controller.show("First", "Old");
  advance(TOAST_ENTER_MS + TOAST_HOLD_MS);
  const oldExit = tasks[1].callback;
  controller.show("Second", "New");
  oldExit();
  assert.equal(controller.getSnapshot().toast?.title, "Second");
  assert.equal(controller.getSnapshot().phase, "visible");
  advance(TOAST_ENTER_MS + TOAST_HOLD_MS + TOAST_EXIT_MS);
  assert.equal(controller.getSnapshot().toast, null);
});

test("a burst of 100 messages leaves one timer and no stuck toast", () => {
  const { controller, advance, tasks } = setup();
  for (let i = 0; i < 100; i++) controller.show(`Action ${i}`, `${i}`);
  assert.equal(controller.getSnapshot().toast?.title, "Action 99");
  assert.equal(tasks.filter((task) => !task.cancelled).length, 1);
  advance(TOAST_ENTER_MS + TOAST_HOLD_MS + TOAST_EXIT_MS);
  assert.equal(controller.getSnapshot().toast, null);
  assert.equal(tasks.filter((task) => !task.cancelled).length, 0);
});

test("only the topmost registered native window owns presentation", () => {
  const { controller } = setup();
  const closeFirst = controller.registerHost("first", 1);
  const closeNested = controller.registerHost("nested", 2);
  const closeOther = controller.registerHost("other", 1);
  controller.show("Held", "Customer on hold");
  assert.equal(controller.getSnapshot().hostId, "nested");
  closeNested();
  assert.equal(controller.getSnapshot().hostId, "other");
  closeOther();
  assert.equal(controller.getSnapshot().hostId, "first");
  closeFirst();
  assert.equal(controller.getSnapshot().hostId, ROOT_TOAST_HOST);
});

test("host handoff preserves message identity and the original dismissal deadline", () => {
  const { controller, advance } = setup();
  controller.show("Registered", "Customer registered");
  const original = controller.getSnapshot().toast;
  advance(500);
  const close = controller.registerHost("form", 1);
  assert.equal(controller.getSnapshot().toast, original);
  close();
  assert.equal(controller.getSnapshot().toast, original);
  advance(TOAST_ENTER_MS + TOAST_HOLD_MS + TOAST_EXIT_MS - 500);
  assert.equal(controller.getSnapshot().toast, null);
});

test("stale native-host cleanup cannot remove a remounted host", () => {
  const { controller } = setup();
  const staleClose = controller.registerHost("form", 1);
  const close = controller.registerHost("form", 1);
  staleClose();
  assert.equal(controller.getSnapshot().hostId, "form");
  close();
  assert.equal(controller.getSnapshot().hostId, ROOT_TOAST_HOST);
});

test("background/unmount clear cancels callbacks and publishes dismissal", () => {
  const { controller, advance, tasks } = setup();
  controller.show("Done", "Completed");
  controller.clear();
  assert.equal(controller.getSnapshot().toast, null);
  assert.equal(tasks.filter((task) => !task.cancelled).length, 0);
  tasks[0].callback();
  advance(5000);
  assert.equal(controller.getSnapshot().toast, null);
});

test("subscriptions receive replacements and stop receiving after cleanup", () => {
  const { controller } = setup();
  let updates = 0;
  const unsubscribe = controller.subscribe(() => { updates++; });
  controller.show("First", "One");
  controller.show("Second", "Two");
  assert.equal(updates, 2);
  unsubscribe();
  controller.clear();
  assert.equal(updates, 2);
});
