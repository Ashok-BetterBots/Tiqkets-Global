import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

describe("organization QR service selection", () => {
  const template = readFileSync("server/templates/join-queue.html", "utf8");

  test("only skips service selection for a branch with one active selectable service", () => {
    assert.match(
      template,
      /if \(branchData\.services\.length === 1 && enabledEntries\.length === 1\)/,
    );
    assert.doesNotMatch(template, /if \(enabledEntries\.length === 1\) \{/);
  });

  test("renders fields from the service selected on the first screen", () => {
    assert.match(template, /selectedService = service/);
    assert.match(template, /const customFields = selectedService\.inputFields \|\| \[\]/);
    assert.match(template, /renderDynamicFields\(\)/);
  });
});