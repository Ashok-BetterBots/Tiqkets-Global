import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("browser HTML requests take precedence over injected Expo platform headers", () => {
  const source = readFileSync("server/index.ts", "utf8");
  const htmlGuard = source.indexOf(
    'req.path === "/" && req.header("accept")?.includes("text/html")',
  );
  const platformGuard = source.indexOf('const platform = req.header("expo-platform")');

  assert.ok(htmlGuard >= 0, "expected an explicit HTML browser guard");
  assert.ok(platformGuard > htmlGuard, "HTML routing must run before Expo platform routing");
});