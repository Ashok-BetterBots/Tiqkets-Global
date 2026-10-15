import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { scryptSync, createDecipheriv } from "node:crypto";
import { join } from "node:path";

const [archivePath, destination] = process.argv.slice(2);
if (!archivePath || !destination || !process.env.MATCH_PASSWORD)
  throw new Error(
    "Usage: MATCH_PASSWORD=... node scripts/recover-android-signing.mjs <encrypted-backup> <private-output-directory>",
  );
const archive = JSON.parse(readFileSync(archivePath, "utf8"));
if (
  archive.version !== 1 ||
  archive.algorithm !== "aes-256-gcm" ||
  archive.kdf !== "scrypt"
)
  throw new Error("Unsupported backup format.");
const key = scryptSync(
  process.env.MATCH_PASSWORD,
  Buffer.from(archive.salt, "base64"),
  32,
);
const decipher = createDecipheriv(
  "aes-256-gcm",
  key,
  Buffer.from(archive.iv, "base64"),
);
decipher.setAuthTag(Buffer.from(archive.tag, "base64"));
const value = Buffer.concat([
  decipher.update(Buffer.from(archive.ciphertext, "base64")),
  decipher.final(),
]);
const credentials = JSON.parse(value);
mkdirSync(destination, { recursive: true, mode: 0o700 });
chmodSync(destination, 0o700);
writeFileSync(
  join(destination, "tiqkets-upload.jks"),
  Buffer.from(credentials.ANDROID_KEYSTORE_BASE64, "base64"),
  { mode: 0o600 },
);
writeFileSync(join(destination, "android-credentials.json"), value, {
  mode: 0o600,
});
console.log(
  "Recovered signing files into the private output directory. Credential values have not been printed.",
);
