# Build context is the monorepo root (Railway "Root Directory" = ., "Dockerfile
# Path" = apps/api/Dockerfile) — @sc/api depends on @sc/shared via the pnpm
# workspace, so the whole repo has to be in the build context, not just this
# directory.

FROM node:22-alpine AS build
RUN npm install -g pnpm@10.33.0
WORKDIR /app

# Installing from just the manifests first lets Docker cache this layer across
# rebuilds that only change application source, not dependencies.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/tokens/package.json packages/tokens/package.json
RUN pnpm install --frozen-lockfile

COPY . .

# @sc/shared must build before @sc/api (its CJS dist is a real runtime
# dependency, not just types) and the Prisma client (WASM query compiler, no
# native binary — see PrismaService) must exist before `nest build`, since
# nest-cli.json copies generated/prisma/**/* into dist as a build asset.
RUN pnpm --filter @sc/shared run build
RUN pnpm --filter @sc/api exec prisma generate
RUN pnpm --filter @sc/api run build

FROM node:22-alpine AS runtime
RUN npm install -g pnpm@10.33.0
WORKDIR /app
COPY --from=build /app ./
WORKDIR /app/apps/api

ENV NODE_ENV=production
EXPOSE 4000

# Hand-written migrations only (see prisma/migrations) — always `deploy`,
# never `dev`. Runs on every boot; each migration is applied at most once
# (Prisma tracks this in _prisma_migrations), so this is safe on redeploys
# with no schema change.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
