import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(
  new URL("./templates/dashboard.html", import.meta.url),
  "utf8",
);

test("web exit scanner carries and renders the confirmed checkout alert", () => {
  assert.match(
    dashboard,
    /alert:\s*this\.eventsScanAction === 'exit' \? \(data\.checkoutAlert \|\| null\) : null/,
  );
  assert.match(dashboard, /data-testid="web-checkout-duration-alert"/);
  assert.match(dashboard, /eventsScanResult\.alert\.iconUrl/);
  assert.match(dashboard, /eventsScanResult\.alert\.title/);
  assert.match(dashboard, /eventsScanResult\.alert\.message/);
  assert.match(dashboard, /eventsScanResult\.alert\.elapsedMinutes/);
  assert.match(dashboard, /eventsScanResult\.alert\.maxDurationMinutes/);
});