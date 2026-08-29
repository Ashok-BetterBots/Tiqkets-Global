import assert from "node:assert/strict";
import test from "node:test";
import { checkoutAlertFor, normalizeCheckoutAlert } from "./events-routes";

const config = {
  enabled: true,
  maxDurationMinutes: 60,
  title: "Welcome back",
  message: "Please collect the guest gift.",
  iconUrl: "/public-objects/events/gift.png",
};

test("normalizes disabled defaults and validates enabled alerts", () => {
  assert.deepEqual(normalizeCheckoutAlert(undefined), {
    enabled: false,
    maxDurationMinutes: 60,
    title: "",
    message: "",
    iconUrl: "",
  });
  assert.throws(
    () => normalizeCheckoutAlert({ ...config, iconUrl: "https://example.com/icon.png" }),
    /uploaded image/,
  );
  assert.throws(
    () => normalizeCheckoutAlert({ ...config, message: "" }),
    /required when enabled/,
  );
  assert.throws(
    () => normalizeCheckoutAlert({ ...config, maxDurationMinutes: "60minutes" }),
    /whole number/,
  );
  assert.throws(
    () => normalizeCheckoutAlert({ ...config, maxDurationMinutes: 1.5 }),
    /whole number/,
  );
});

test("returns an alert at the exact duration boundary", () => {
  const checkedInAt = new Date("2026-08-29T10:00:00.000Z");
  const alert = checkoutAlertFor(
    { checkoutAlert: config },
    { checkedInAt },
    new Date("2026-08-29T11:00:00.000Z"),
  );
  assert.equal(alert?.elapsedMinutes, 60);
  assert.equal(alert?.title, config.title);
});

test("suppresses alerts after the exact limit or without check-in", () => {
  const checkedInAt = new Date("2026-08-29T10:00:00.000Z");
  assert.equal(
    checkoutAlertFor(
      { checkoutAlert: config },
      { checkedInAt },
      new Date("2026-08-29T11:00:00.001Z"),
    ),
    null,
  );
  assert.equal(
    checkoutAlertFor({ checkoutAlert: config }, { checkedInAt: null }, new Date()),
    null,
  );
  assert.equal(
    checkoutAlertFor(
      { checkoutAlert: { ...config, enabled: false } },
      { checkedInAt },
      new Date("2026-08-29T10:30:00.000Z"),
    ),
    null,
  );
});

test("preserves the first checkout snapshot after a support status correction", () => {
  const original = {
    title: "Original title",
    message: "Original message",
    iconUrl: "/public-objects/events/original.png",
    maxDurationMinutes: 60,
    elapsedMinutes: 20,
    capturedAt: "2026-08-29T10:20:00.000Z",
  };
  const alert = checkoutAlertFor(
    { checkoutAlert: { ...config, title: "Changed later" } },
    {
      checkedInAt: new Date("2026-08-29T10:00:00.000Z"),
      checkoutAlertSnapshot: original,
    },
    new Date("2026-08-29T10:30:00.000Z"),
  );
  assert.deepEqual(alert, original);
});