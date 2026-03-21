FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run server:build

FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/server_dist ./server_dist
COPY --from=builder /app/server/templates ./server/templates
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/app.json ./app.json
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

RUN mkdir -p server/uploads static-build

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

CMD ["node", "server_dist/index.js"]
