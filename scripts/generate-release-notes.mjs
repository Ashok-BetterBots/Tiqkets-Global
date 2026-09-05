import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// Release text is data, never shell code. Both stores use the same approved notes.
const [releasePath, versionCode, outputRoot = "."] = process.argv.slice(2);
if (!releasePath || !/^\d+$/.test(versionCode || "")) {
  throw new Error(
    "Usage: node scripts/generate-release-notes.mjs <release.json> <android-version-code> [output-root]",
  );
}
const release = JSON.parse(readFileSync(releasePath, "utf8"));
const body = (release.body || "").trim();
if (!body)
  throw new Error("Add release notes to the GitHub Release before publishing.");
// A short Store notes section can accompany longer engineering notes on GitHub.
const lines = body.split(/\r?\n/);
const start = lines.findIndex((line) => /^## Store notes\s*$/.test(line));
let selected = body;
if (start !== -1) {
  const remaining = lines.slice(start + 1);
  const end = remaining.findIndex((line) => /^##\s/.test(line));
  selected = (end === -1 ? remaining : remaining.slice(0, end)).join("\n");
}
const notes = selected
  .replace(/<!--[^]*?-->/g, "")
  .replace(/^#{1,6}\s+/gm, "")
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/[*`]/g, "")
  .replace(/\r\n/g, "\n")
  .trim();
if (!notes || [...notes].length > 500) {
  throw new Error(
    "Store notes must contain 1–500 characters. Add a '## Store notes' section to the GitHub Release for concise customer-facing notes.",
  );
}
const android = `${outputRoot}/fastlane/metadata/android/en-US/changelogs`;
const ios = `${outputRoot}/fastlane/metadata/ios/en-US`;
mkdirSync(android, { recursive: true });
mkdirSync(ios, { recursive: true });
writeFileSync(`${android}/${versionCode}.txt`, `${notes}\n`);
writeFileSync(`${android}/default.txt`, `${notes}\n`);
writeFileSync(`${ios}/release_notes.txt`, `${notes}\n`);
writeFileSync(`${outputRoot}/RELEASE_NOTES.md`, `${body}\n`);
console.log(
  `Prepared identical store notes (${[...notes].length} characters) from the GitHub Release.`,
);
