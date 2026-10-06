import { apiRequest, getApiUrl } from "./query-client";

/** Database paths are permanent; native Image needs an absolute network URI. */
export function profileImageUri(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("/")) return new URL(value, getApiUrl()).href;
  // Keep old device references readable on the original device until replaced.
  return value;
}

/** Never save ImagePicker's file:// or browser blob: URI as a profile picture. */
export async function uploadProfilePicture(asset: { base64?: string | null }): Promise<string> {
  const bytes = asset.base64;
  if (!bytes) throw new Error("The selected photo could not be read. Please select it again.");
  const mime = bytes.startsWith("iVBOR") ? "png"
    : bytes.startsWith("R0lG") ? "gif"
    : bytes.startsWith("UklG") ? "webp" : "jpeg";
  const response = await apiRequest("POST", "/api/upload/profile-picture", {
    image: `data:image/${mime};base64,${bytes}`,
  });
  const data = await response.json();
  const path = typeof data.url === "string" && data.url.startsWith("https://")
    ? new URL(data.url).pathname : data.url;
  if (typeof path !== "string" || !/^\/public-objects\/profiles\/[a-zA-Z0-9_.-]+$/.test(path)) {
    throw new Error("The photo upload did not return a permanent image path. Please try again.");
  }
  return path;
}
