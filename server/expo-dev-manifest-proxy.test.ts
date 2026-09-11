import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("development Expo manifests preserve Expo's native response contract", () => {
  const server = readFileSync("server/index.ts", "utf8");

  assert.match(
    server,
    /upstream\.headers\.get\("content-type"\) \|\| "application\/expo\+json"/,
  );
  assert.match(
    server,
    /upstream\.headers\.get\("expo-protocol-version"\) \|\| "1"/,
  );
  assert.match(server, /res\.send\(rewriteExpoManifest\(manifestStr, req\)\)/);
});