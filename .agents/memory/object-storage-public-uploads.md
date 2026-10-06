---
name: Public image uploads via Replit Object Storage
description: How base64 image uploads (event branding, profile pictures) persist through redeploys using object storage instead of local disk
---

Base64-body image upload routes (event banner/logo/gallery/venue map, org/profile pictures) must write to Replit Object Storage via `ObjectStorageService.uploadPublicObject(buffer, fileName, contentType, subDir)` (`server/objectStorage.ts`), not `fs.writeFileSync` under `server/uploads/*`.

**Why:** local disk is ephemeral — wiped on redeploy/restart — so previously-saved DB URLs like `/uploads/events/...` silently 404 (broken-image icon) after any restart. This bit event branding images and org/profile pictures identically.

Persistent server storage alone does not prove a mobile upload is persistent.
A photo-picker URI can display successfully on its original phone while still
referring only to a disposable device cache. Follow the actual photo bytes,
not the successful local preview, when checking profile persistence.

**Why:** earlier storage fixes did not cover the native picker path; production
still contained phone-cache references while the object-storage images remained
available on both published domains.

**How to apply:** verify native and web upload paths independently, and include
server-save failure and session-reopen checks. Old clients that only send a
device-local URI need a client update; the backend cannot retrieve those bytes.

**How to apply:** `uploadPublicObject` writes to the first `PUBLIC_OBJECT_SEARCH_PATHS` entry and returns `/public-objects/<subDir>/<fileName>`. A matching `GET /public-objects/*filePath` route (registered in `server/index.ts`) serves it via `searchPublicObject` + `downloadObject`. Note: with this Express/path-to-regexp version, wildcard params must use `*filePath` syntax, not `:filePath(*)` (the latter throws `PathError: Missing parameter name` at startup). Any *new* base64-upload route (e.g. notification alert sounds at `server/routes.ts` `/upload-sound`) should follow the same pattern rather than reintroducing disk writes — audit for `fs.writeFileSync` + `server/uploads` if adding new upload features.
