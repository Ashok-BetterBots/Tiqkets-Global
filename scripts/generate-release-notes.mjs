import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const version = process.argv[2]?.replace(/^v/, "");
const outputDirectory = process.argv[3] || "distribution/whatsnew";

if (!version) {
  throw new Error(
    "Usage: node scripts/generate-release-notes.mjs <version> [output-directory]",
  );
}

const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

let previousTag = "";
try {
  previousTag = git("describe", "--tags", "--abbrev=0", "HEAD^");
} catch {
  // The first release intentionally includes the available commit history.
}

const range = previousTag ? `${previousTag}..HEAD` : "HEAD";
const subjects = git("log", range, "--pretty=format:%s")
  .split("\n")
  .map((subject) => subject.trim())
  .filter(Boolean)
  .filter((subject) => !/^merge\b/i.test(subject))
  .filter((subject) => !/^release\b/i.test(subject))
  .filter((subject) => !/^deploy new version$/i.test(subject))
  .map((subject) =>
    subject
      .replace(
        /^(feat|fix|perf|refactor|docs|chore|build|ci|test)(\([^)]*\))?!?:\s*/i,
        "",
      )
      .replace(/\s*\(#\d+\)$/, ""),
  );

const uniqueSubjects = [...new Set(subjects)];
const fallback = [
  "- Improved WhatsApp notification speed",
  "- Added multilingual registration and queue updates",
  "- Bug fixes and performance improvements",
].join("\n");
let playNotes = uniqueSubjects.length
  ? uniqueSubjects.map((subject) => `- ${subject}`).join("\n")
  : fallback;

// Google Play limits each localized What's new entry to 500 characters.
if ([...playNotes].length > 500) {
  const suffix = "\n- Additional fixes and performance improvements";
  playNotes =
    [...playNotes]
      .slice(0, 500 - [...suffix].length)
      .join("")
      .trimEnd() + suffix;
}

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(join(outputDirectory, "whatsnew-en-US"), `${playNotes}\n`);
writeFileSync(
  "RELEASE_NOTES.md",
  `# TIQKETS ${version}\n\n${playNotes}\n\n` +
    (previousTag ? `Changes since ${previousTag}.\n` : "Initial release.\n"),
);

console.log(playNotes);
