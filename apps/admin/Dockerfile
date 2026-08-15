# Build context is the monorepo root (Railway "Root Directory" = ., "Dockerfile
# Path" = apps/admin/Dockerfile) — @sc/admin depends on @sc/shared and
# @sc/tokens via the pnpm workspace.

FROM node:22-alpine AS build
RUN npm install -g pnpm@10.33.0
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/tokens/package.json packages/tokens/package.json
RUN pnpm install --frozen-lockfile

COPY . .

# @sc/shared needs its ESM build (dist-esm/, see its package.json "exports"
# .import condition) for Vite/Rollup's production bundling — the CJS-only
# dist/ that the API and mobile consume doesn't statically expose named
# exports through its `__exportStar` barrel re-exports.
RUN pnpm --filter @sc/shared run build

# Vite inlines import.meta.env.VITE_API_URL at build time, not runtime — this
# must be set as a build-time variable on the Railway service (Railway passes
# service variables to Docker builds as build args automatically).
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @sc/admin run build

FROM nginx:alpine AS runtime
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html
COPY apps/admin/nginx/default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 8080
ENV PORT=8080
