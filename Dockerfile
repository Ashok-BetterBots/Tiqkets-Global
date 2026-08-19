FROM node:20-alpine AS builder

WORKDIR /app

# Install all dependencies (including devDependencies needed for Expo/Metro bundling)
COPY package*.json ./
RUN npm ci

COPY . .

# ── Server build ────────────────────────────────────────────────────────────────
RUN npm run server:build && \
    node_modules/.bin/esbuild server/migrate.ts \
      --platform=node \
      --packages=external \
      --bundle \
      --format=esm \
      --outdir=server_dist

# ── Expo static bundle build ────────────────────────────────────────────────────
# APP_DOMAIN is required so Metro bakes the correct API base URL into the JS
# bundle (EXPO_PUBLIC_DOMAIN). The manifest's asset/bundle download URLs are
# re-written at serve-time by the server, so the same image works even if the
# domain is later changed via the APP_DOMAIN env var — but the internal API
# calls inside the bundle will still use the domain set here.
#
# Build with: docker build --build-arg APP_DOMAIN=yourdomain.com .
ARG APP_DOMAIN
RUN if [ -n "$APP_DOMAIN" ]; then \
      echo "==> Building Expo bundles for $APP_DOMAIN ..."; \
      EXPO_PUBLIC_DOMAIN="$APP_DOMAIN" node scripts/build.js; \
    else \
      echo "==> WARNING: APP_DOMAIN build-arg not set."; \
      echo "    Expo mobile bundles will NOT be included in this image."; \
      echo "    Rebuild with: docker build --build-arg APP_DOMAIN=yourdomain.com ."; \
      mkdir -p static-build/ios static-build/android; \
    fi


# ── Production image ────────────────────────────────────────────────────────────
FROM node:20-alpine

# Chromium + its runtime dependencies for Playwright-based ticket image
# rendering (event boarding-pass PNG sent on WhatsApp).
# Alpine's apk installs the binary as /usr/bin/chromium-browser;
# ticket-image.ts's resolveChromiumPath() checks that path automatically.
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      font-noto \
      font-noto-emoji

WORKDIR /app

# Create a non-root user to run the application.
# Running as root with Chromium's Linux namespace sandbox disabled (--no-sandbox)
# would let a compromised renderer escape directly to the host. A non-root user
# preserves the setuid sandbox fallback so Chromium can still create a
# restricted namespace even without user-namespace support in the kernel.
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/server_dist        ./server_dist
COPY --from=builder /app/migrations         ./migrations
COPY --from=builder /app/server/templates   ./server/templates
COPY --from=builder /app/assets             ./assets
COPY --from=builder /app/app.json           ./app.json
COPY --from=builder /app/shared             ./shared
# Ship the pre-built Expo bundles so Expo Go can load them immediately
COPY --from=builder /app/static-build       ./static-build

RUN mkdir -p server/uploads && chown -R appuser:appgroup /app

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

USER appuser

ENTRYPOINT ["/entrypoint.sh"]
