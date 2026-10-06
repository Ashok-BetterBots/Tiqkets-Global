export class ProfilePictureError extends Error {}

/**
 * Persist an object path, never a picker cache URI or expiring URL.
 * Unchanged legacy values remain accepted when editing other profile fields.
 */
export function permanentProfilePicture(value: unknown, previous?: string | null): string {
  if (typeof value !== "string") throw new ProfilePictureError("Invalid profile picture.");
  if (value === "" || value === previous) return value;
  let path = value;
  if (value.startsWith("https://")) {
    try {
      const url = new URL(value);
      if (url.search || url.hash) throw new Error("Temporary URL");
      path = url.pathname;
    } catch {
      throw new ProfilePictureError("Please upload the profile picture again.");
    }
  }
  if (!/^\/public-objects\/profiles\/[a-zA-Z0-9_.-]+$/.test(path)) {
    throw new ProfilePictureError("Please update the app and upload the profile picture again. A device-local or temporary image cannot be saved.");
  }
  return path;
}
