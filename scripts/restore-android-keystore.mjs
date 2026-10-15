import { writeFileSync, appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";
if (!process.env.RUNNER_TEMP) throw new Error("RUNNER_TEMP is required.");
const path = join(process.env.RUNNER_TEMP, "tiqkets-upload.jks");
if (process.argv.includes("--cleanup")) {
  rmSync(path, { force: true });
} else {
  const value = process.env.ANDROID_KEYSTORE_BASE64;
  if (!value) throw new Error("ANDROID_KEYSTORE_BASE64 is missing.");
  writeFileSync(path, Buffer.from(value, "base64"), { mode: 0o600 });
  appendFileSync(process.env.GITHUB_ENV, `TIQKETS_UPLOAD_STORE_FILE=${path}\n`);
}
