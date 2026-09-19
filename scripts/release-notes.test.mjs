import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const script = resolve("scripts/generate-release-notes.mjs");
function generate(body) {
  const dir = mkdtempSync(join(tmpdir(), "tiqkets-release-test-"));
  writeFileSync(join(dir, "release.json"), JSON.stringify({ body }));
  const result = spawnSync(
    process.execPath,
    [script, join(dir, "release.json"), "123", dir],
    { encoding: "utf8" },
  );
  return { dir, ...result };
}
test("both stores receive the same multiline customer notes, not engineering notes", () => {
  const result = generate(
    "## Store notes\n- Faster queues\n- Clearer [reports](https://example.com)\n\n## Engineering\n" +
      "Details ".repeat(200),
  );
  assert.equal(result.status, 0, result.stderr);
  const expected = "- Faster queues\n- Clearer reports\n";
  assert.equal(
    readFileSync(
      join(result.dir, "fastlane/metadata/android/en-US/changelogs/123.txt"),
      "utf8",
    ),
    expected,
  );
  assert.equal(
    readFileSync(
      join(result.dir, "fastlane/metadata/ios/en-US/release_notes.txt"),
      "utf8",
    ),
    expected,
  );
});
test("notes are never silently truncated or replaced with invented claims", () => {
  for (const text of [
    "",
    "x".repeat(501),
    "## Store notes\n\n## Engineering\nSome text",
  ])
    assert.notEqual(generate(text).status, 0);
  assert.equal(generate("x".repeat(500)).status, 0);
});
test("shell metacharacters in release bodies remain literal text", () => {
  const result = generate(
    "Improved handling of $(commands) and $VARIABLE input.",
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    readFileSync(
      join(result.dir, "fastlane/metadata/ios/en-US/release_notes.txt"),
      "utf8",
    ),
    /\$\(commands\)/,
  );
});
