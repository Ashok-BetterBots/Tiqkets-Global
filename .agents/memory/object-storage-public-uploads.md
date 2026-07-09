---
name: Public image uploads via Replit Object Storage
description: How base64 image uploads (event branding, profile pictures) persist through redeploys using object storage instead of local disk
---

Base64-body image upload routes (event banner/logo/gallery/venue map, org/profile pictures) must write to Replit Object Storage via `ObjectStorageService.uploadPublicObject(buffer, fileName, contentType, subDir)` (`server/objectStorage.ts`), not `fs.writeFileSync` under `server/uploads/*`.

**Why:** local disk is ephemeral — wiped on redeploy/restart — so previously-saved DB URLs like `/uploads/events/...` silently 404 (broken-image icon) after any restart. This bit event branding images and org/profile pictures identically.

**How to apply:** `uploadPublicObject` writes to the first `PUBLIC_OBJECT_SEARCH_PATHS` entry and returns `/public-objects/<subDir>/<fileName>`. A matching `GET /public-objects/*filePath` route (registered in `server/index.ts`) serves it via `searchPublicObject` + `downloadObject`. Note: with this Express/path-to-regexp version, wildcard params must use `*filePath` syntax, not `:filePath(*)` (the latter throws `PathError: Missing parameter name` at startup). Any *new* base64-upload route (e.g. notification alert sounds at `server/routes.ts` `/upload-sound`) should follow the same pattern rather than reintroducing disk writes — audit for `fs.writeFileSync` + `server/uploads` if adding new upload features.
