# Stylists Center

A location-based beauty-services marketplace for Harare, Zimbabwe: clients find a stylist by
browsing or a smart-match request, book a slot, pay by EcoCash or cash, chat, and navigate to the
appointment. Full-stack Expo React Native + NestJS monorepo.

## Repository layout

```
stylists-center/
├── packages/
│   ├── tokens/   @sc/tokens  — design system as data (colors, type scale, spacing, motion)
│   ├── shared/   @sc/shared  — zod DTOs, domain rules, typed Socket.IO event map
│   └── ui/       @sc/ui      — the RN component library and the MapLibre wrapper
├── apps/
│   ├── mobile/   Expo Router client app (dev client required — see Maps below)
│   └── api/      NestJS + Prisma + BullMQ + Socket.IO
└── infra/docker/initdb/   Postgres extension bootstrap for docker-compose
```

`@sc/tokens` and `@sc/ui` are consumed as source (no build step) by Metro and Vitest. `@sc/shared`
is the one package with a real build step (`pnpm --filter @sc/shared build`) — the API's compiled
Node output needs actual `.js` files on disk, not TypeScript source, so it must be built (and
rebuilt after every change to it) before `apps/api` will boot.

## Prerequisites

- Node 22, pnpm 10 (`packageManager` in `package.json` pins the exact version)
- PostgreSQL 16 with the `postgis` and `pg_trgm` extensions, and Redis 7
- For the mobile app: Expo dev client (not Expo Go — MapLibre is native code), so an Android
  emulator/device or Xcode simulator with `expo run:android` / `expo run:ios` at least once

## Getting started

```bash
pnpm install

# Postgres + Redis, via Docker (ports 5433/6380 so they don't collide with a local install):
pnpm dev:infra

# apps/api/.env and apps/mobile/.env from the templates in .env.example:
cp .env.example apps/api/.env   # then fill in JWT_ACCESS_SECRET / JWT_REFRESH_PEPPER
# apps/mobile/.env only needs EXPO_PUBLIC_MAP_TILE_URL/EXPO_PUBLIC_MAP_ENGINE if you're
# overriding the defaults — see .env.example for both apps' variables in one file.

pnpm --filter @sc/shared build
pnpm --filter @sc/api prisma:migrate   # `prisma migrate deploy`, applies apps/api/prisma/migrations
pnpm --filter @sc/api seed             # seeds one city, categories, providers, demo bookings, an agent

pnpm dev   # turbo runs `apps/api`'s `nest start --watch` and `apps/mobile`'s `expo start` in parallel
```

Then, once (per device): `pnpm --filter @sc/mobile android` (or `ios`) to build and install the
dev client — after that, `expo start` alone is enough for subsequent runs.

### Migrations: hand-written only, never `prisma migrate dev`

This schema has two things Prisma can't express directly — a PostGIS `geography` generated column
and a plain `SEQUENCE` for booking references — added via raw SQL in their own migration folders.
`prisma migrate dev`'s auto-diff wizard doesn't know about either and will try to "fix" them (e.g.
generate a migration that drops the geography column) the moment it's run. Always create a new
migration folder by hand and apply with `prisma migrate deploy` — never `migrate dev` or `db push`
on this project.

## Testing and quality gates

```bash
pnpm typecheck   # turbo run typecheck — strict TS across every package/app
pnpm lint        # ESLint 9 flat config; react-native/no-inline-styles and no-color-literals
                 # are errors, which is what actually enforces the @sc/tokens system
pnpm test        # turbo run test — Vitest everywhere
```

`apps/api`'s test suite is integration-style against a real Postgres (a separate `sc_test`
database — see `TEST_DATABASE_URL` in each `*.spec.ts`), not mocks: it proves PostGIS radius
queries, the smart-match state machine, BullMQ job scheduling, the cash double-confirmation rule,
and the double-booking race guard actually work against a real database, not just against a
plausible-looking mock.

## Architecture notes

- **Money** is always integer USD cents, on both sides of the wire (`@sc/shared/domain/money.ts`).
- **Every timestamp** is ISO-8601 UTC; the only place one becomes display text is
  `formatInHarare()`/`formatBookingWhen()` in `@sc/shared` — an ESLint rule bans
  `toLocaleString`/`toLocaleDateString` elsewhere in `apps/mobile` specifically to force this.
- **Validation** is the same zod schemas on both sides: the mobile app validates a form with them,
  the API validates the request body with them via `nestjs-zod`, so a rule (radius ladder, budget
  range, attempt cap) cannot silently drift between client and server.
- **Sockets are a latency optimisation, never the source of truth.** Every mobile hook that listens
  for a Socket.IO event (`useMatchRealtime`, `useChatRealtime`, …) treats the event only as a cue to
  refetch the real HTTP resource — a dropped event never leaves the client permanently wrong, only
  slower to update.
- **The smart-match engine** (`apps/api/src/modules/matching`) uses BullMQ delayed jobs as the
  authority for a request's 5-minute expiry and each offer's 30-second response window — not Redis
  keyspace-expiry notifications, which are lossy across a restart or failover. Confirming a booking
  against an accepted offer locks the `MatchRequest` row (`SELECT … FOR UPDATE`) and supersedes
  every sibling accepted offer in the same transaction — the double-booking race a marketplace like
  this has to get right.
- **Payments** go through a `PaymentGatewayPort` interface with a `FakeEcoCashAdapter` (auto-succeeds,
  holds instantly) standing in for a real EcoCash aggregator integration — swapping it later is a
  provider binding change, not a rewrite of `BookingsService`. The ledger itself (`Payment` rows) is
  append-only: a release or refund is always a new row referencing the same booking, never an
  update of the held one.
- **Offline reads**: the mobile app persists its TanStack Query cache to `AsyncStorage`
  (`apps/mobile/src/api/queryClient.ts`), so a screen shows the last-known-good server state
  immediately on a cold start before the first real fetch resolves — mutations are never persisted,
  to avoid replaying a queued write twice after a restart.

## Known gaps (by design, for this milestone)

- **No Provider-role UI.** Every screen in this repo is the client's. A few flows that would
  normally need a provider to act (accepting a smart-match offer, confirming a booking from
  `awaiting_provider` to `confirmed`) are exercised in tests and via a dev-only
  `POST /v1/dev/simulate/accept-offer` endpoint instead of a real second app.
- **EcoCash, SMS/WhatsApp OTP, and push notifications are all stubbed.** `AUTH_DEV_OTP` short-circuits
  OTP verification in development and is rejected by env validation in production.
- **Map tiles**: `tile.openstreetmap.org` is fine for development but its usage policy forbids the
  bulk downloading the offline tile pack does — a real tile vendor (MapTiler, Protomaps) is needed
  before launch.
- **Real turn-by-turn routing** isn't wired up; the Directions screen uses a static ETA lookup table
  and a canned step list instead of a routing engine.
