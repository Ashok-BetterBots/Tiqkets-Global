FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run server:build && \
    node_modules/.bin/esbuild server/migrate.ts \
      --platform=node \
      --packages=external \
      --bundle \
      --format=esm \
      --outdir=server_dist


FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/server_dist        ./server_dist
COPY --from=builder /app/migrations         ./migrations
COPY --from=builder /app/server/templates   ./server/templates
COPY --from=builder /app/assets             ./assets
COPY --from=builder /app/app.json           ./app.json
COPY --from=builder /app/shared             ./shared

RUN mkdir -p server/uploads static-build

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

ENTRYPOINT ["/entrypoint.sh"]
