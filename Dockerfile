# syntax=docker/dockerfile:1
FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src
COPY migrations ./migrations
COPY drizzle.config.ts ./drizzle.config.ts
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
# Producción + dev deps (drizzle-kit corre en migrate pre-deploy)
COPY package*.json ./
RUN npm ci
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
COPY drizzle.config.ts ./drizzle.config.ts
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/api-entrypoint.js"]
