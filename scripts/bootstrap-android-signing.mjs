import {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

// Run once by a repository maintainer. Never rotates an existing remote key.
const repo = "Ashok-BetterBots/Tiqkets-Global";
const branch = "codex/signing";
const gh = (...args) => execFileSync("gh", args, { encoding: "utf8" });
const metadata = JSON.parse(gh("repo", "view", repo, "--json", "isPrivate"));
if (!metadata.isPrivate) throw new Error("Signing storage must be private.");
const stateDir = resolve(".release-credentials");
const stateFile = join(stateDir, "android-credentials.json");
mkdirSync(stateDir, { recursive: true, mode: 0o700 });
chmodSync(stateDir, 0o700);
const existingSecrets = JSON.parse(
  gh("api", `repos/${repo}/actions/secrets`),
).secrets.map((item) => item.name);
const remoteBranch = execFileSync(
  "git",
  ["ls-remote", "origin", `refs/heads/${branch}`],
  { encoding: "utf8" },
).trim();
if (
  !existsSync(stateFile) &&
  (remoteBranch ||
    existingSecrets.some(
      (name) => name.startsWith("ANDROID_KEY") || name === "MATCH_PASSWORD",
    ))
) {
  throw new Error(
    "Signing state already exists remotely. Restore it; do not generate replacement credentials.",
  );
}
let state;
if (existsSync(stateFile)) {
  state = JSON.parse(readFileSync(stateFile, "utf8"));
} else {
  const password = randomBytes(32).toString("base64url");
  state = {
    ANDROID_KEYSTORE_PASSWORD: password,
    ANDROID_KEY_PASSWORD: password,
    ANDROID_KEY_ALIAS: "tiqkets-upload",
    MATCH_PASSWORD: randomBytes(48).toString("base64url"),
  };
  const keystore = join(stateDir, "tiqkets-upload.jks");
  if (existsSync(keystore))
    throw new Error(
      "A local keystore exists without saved credentials. Inspect it before retrying.",
    );
  execFileSync(
    process.env.KEYTOOL || "keytool",
    [
      "-genkeypair",
      "-noprompt",
      "-storetype",
      "JKS",
      "-keystore",
      keystore,
      "-alias",
      state.ANDROID_KEY_ALIAS,
      "-keyalg",
      "RSA",
      "-keysize",
      "3072",
      "-validity",
      "10000",
      "-dname",
      "CN=TIQKETS Upload, O=BetterBots AI Solutions Private Limited, C=IN",
      "-storepass:env",
      "TIQKETS_BOOTSTRAP_PASSWORD",
      "-keypass:env",
      "TIQKETS_BOOTSTRAP_PASSWORD",
    ],
    {
      env: { ...process.env, TIQKETS_BOOTSTRAP_PASSWORD: password },
      stdio: "pipe",
    },
  );
  chmodSync(keystore, 0o600);
  state.ANDROID_KEYSTORE_BASE64 = readFileSync(keystore).toString("base64");
  writeFileSync(stateFile, JSON.stringify(state), { mode: 0o600 });
}

const salt = randomBytes(32);
const iv = randomBytes(12);
const key = scryptSync(state.MATCH_PASSWORD, salt, 32);
const cipher = createCipheriv("aes-256-gcm", key, iv);
const { MATCH_PASSWORD: _, ...android } = state;
const plaintext = Buffer.from(JSON.stringify(android));
const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const authTag = cipher.getAuthTag();
// Verify recovery before saving any remote state.
const decipher = createDecipheriv("aes-256-gcm", key, iv);
decipher.setAuthTag(authTag);
if (
  !Buffer.concat([decipher.update(ciphertext), decipher.final()]).equals(
    plaintext,
  )
)
  throw new Error("Backup verification failed.");
const archive = {
  version: 1,
  algorithm: "aes-256-gcm",
  kdf: "scrypt",
  salt: salt.toString("base64"),
  iv: iv.toString("base64"),
  tag: authTag.toString("base64"),
  ciphertext: ciphertext.toString("base64"),
};

const checkout = mkdtempSync(join(tmpdir(), "tiqkets-signing-"));
const git = (...args) =>
  execFileSync("git", args, { cwd: checkout, encoding: "utf8", stdio: "pipe" });
if (remoteBranch) {
  git(
    "clone",
    "--single-branch",
    "--branch",
    branch,
    `https://github.com/${repo}.git`,
    ".",
  );
} else {
  git("init", "--initial-branch", branch);
  git("remote", "add", "origin", `https://github.com/${repo}.git`);
}
const archivePath = join(checkout, "android/credentials.json.enc");
if (!existsSync(archivePath)) {
  mkdirSync(join(checkout, "android"), { recursive: true });
  writeFileSync(archivePath, JSON.stringify(archive, null, 2));
  writeFileSync(
    join(checkout, "README.md"),
    "# TIQKETS shared signing\n\nThis private branch holds encrypted Android recovery credentials and Fastlane Match certificates.\nAndroid recovery is AES-256-GCM encrypted using the MATCH_PASSWORD GitHub secret.\nNever commit plaintext keys or passwords here. See STORE_RELEASE.md on main for recovery and team access.\n",
  );
  git("add", "android/credentials.json.enc", "README.md");
  git("commit", "-m", "Store encrypted shared Android signing credentials");
  git("push", "origin", branch);
}
for (const [name, value] of Object.entries(state)) {
  execFileSync("gh", ["secret", "set", name, "--repo", repo], {
    input: value,
    stdio: ["pipe", "pipe", "pipe"],
  });
  console.log(`Stored repository secret: ${name}`);
}
console.log(
  `Encrypted recovery backup verified and stored on ${branch}. Local recovery copy: ${stateFile}`,
);
