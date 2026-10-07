import {
  readFileSync,
  appendFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { execFileSync } from "node:child_process";

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
let release = event.release;
if (!release) {
  const tag = process.env.INPUT_TAG;
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag || ""))
    throw new Error("Select an existing GitHub Release tag, such as v1.0.0.");
  const selected = JSON.parse(
    execFileSync(
      "gh",
      [
        "release",
        "view",
        tag,
        "--repo",
        process.env.GITHUB_REPOSITORY,
        "--json",
        "body,tagName,isDraft,isPrerelease,targetCommitish",
      ],
      { encoding: "utf8" },
    ),
  );
  // GitHub's REST release-by-tag endpoint omits drafts; gh's GraphQL lookup includes them.
  release = {
    body: selected.body,
    tag_name: selected.tagName,
    draft: selected.isDraft,
    prerelease: selected.isPrerelease,
    target_commitish: selected.targetCommitish,
  };
}
const match = /^v(\d+\.\d+\.\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(release.tag_name);
if (!match) throw new Error("Release tags must use vX.Y.Z or vX.Y.Z-rc.N.");
const destination = event.release
  ? release.prerelease
    ? "testing"
    : "production"
  : process.env.INPUT_DESTINATION;
if (!["build", "testing", "production"].includes(destination))
  throw new Error("Invalid release destination.");
if (destination !== "build" && release.draft)
  throw new Error("Publish the GitHub Release before uploading it to a store.");
if (
  destination === "production" &&
  (release.prerelease || release.tag_name.includes("-"))
)
  throw new Error("Production requires a stable GitHub Release.");
if (!release.body?.trim())
  throw new Error("GitHub Release notes are required.");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
let sha;
try {
  git(
    "fetch",
    "origin",
    `refs/tags/${release.tag_name}:refs/tags/${release.tag_name}`,
  );
  sha = git("rev-parse", `refs/tags/${release.tag_name}^{commit}`);
} catch (error) {
  // Draft releases do not create their Git tag until they are published.
  // Resolve their configured target instead, which should be a full commit
  // SHA for an immutable build. Published releases always take the tag path.
  if (!release.draft || !/^[0-9a-f]{40}$/i.test(release.target_commitish || "")) {
    throw error;
  }
  git("fetch", "origin", release.target_commitish);
  sha = git("rev-parse", "FETCH_HEAD^{commit}");
}
const code = Math.floor(Date.now() / 1000) - 1577836800;
const build = `${process.env.GITHUB_RUN_NUMBER}.${process.env.GITHUB_RUN_ATTEMPT}`;
if (!/^[1-9]\d{0,3}\.[1-9]\d{0,1}$/.test(build))
  throw new Error(
    "iOS build number exceeds Apple's limits; update the numbering scheme.",
  );
mkdirSync("release-output", { recursive: true });
writeFileSync("release-output/release.json", JSON.stringify(release));
const outputs = {
  tag: release.tag_name,
  version: match[1],
  sha,
  code,
  build,
  destination,
  platforms: process.env.INPUT_PLATFORMS || "both",
};
for (const [key, value] of Object.entries(outputs))
  appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
console.log(`TIQKETS ${match[1]}: ${destination}, source ${sha.slice(0, 12)}.`);
