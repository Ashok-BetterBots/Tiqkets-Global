---
name: Nix env needs system chromium for Playwright
description: Why Playwright's own downloaded browser binaries fail to launch on this Replit/Nix image, and what to use instead.
---

`npx playwright install chromium` downloads a generic Linux Chrome-for-Testing build assembled against a standard glibc/apt filesystem layout. On this Nix-based image it fails to launch with `error while loading shared libraries: libglib-2.0.so.0` (or similar) because the required shared libraries aren't on the standard system paths, and there's no `--with-deps`/apt equivalent to install them here.

**Why:** Nix binaries need libraries wired via `rpath` into the Nix store; a plain downloaded browser binary has no such rpath and can't find libs even though "equivalent" packages exist somewhere in `/nix/store`.

**How to apply:** Add `chromium` as a real system/Nix package dependency (`installSystemDependencies({ packages: ["chromium"] })`), then resolve it at runtime via `which chromium` (or scan `/nix/store` for a `*-chromium-*/bin/chromium` if you need it earlier in boot). This binary is correctly linked against the Nix closure and works in both the dev workspace and any deployment built from the same `.replit`/`replit.nix` config — unlike:
- `REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` — a dev-workspace-only convenience env var, not present in deployed VM containers.
- Downloaded Playwright browsers — fail to launch here regardless of environment (dev or prod) due to the missing-shared-libs issue above.
