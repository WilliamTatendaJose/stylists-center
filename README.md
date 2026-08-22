# Style Center

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
# Set EXPO_PUBLIC_MAPTILER_KEY for MapTiler maps/offline packs. Release builds also
# require EXPO_PUBLIC_API_URL — see .env.example for both apps' variables.

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

## Delivery status and remaining gaps

### Implemented since the original milestone report

- **Provider operations are now in the mobile app.** A stylist can create a basic provider page,
  switch roles, toggle availability, respond to smart-match offers, confirm or decline bookings,
  confirm cash-job completion, and view earnings. The API protects these actions with a provider
  guard, rather than relying on the client to decide who may act.
- **Routing now prefers OSRM.** The API requests a road-following route and turn instructions from
  `OSRM_BASE_URL`, then degrades to a clearly limited straight-line route if the routing service is
  unavailable. The public OSRM server remains suitable only for development.
- **Client booking and marketplace basics are present.** Clients can browse nearby stylists, make a
  direct or smart-match booking, chat, cancel, review completed work, and reserve marketplace stock.

### Release blockers

- **Payments are still a test double; Firebase auth needs production credentials.** `FakeEcoCashAdapter`
  immediately holds funds; no real payment initiation, webhook signature verification, reconciliation,
  retry, or payout process exists. Email/password and Google authentication are handled by Firebase;
  the mobile web configuration and API service-account values must be supplied before release.
- **Scheduling still needs a real provider calendar.** Bookings now persist their end time, slot
  availability accounts for the selected service duration, and PostgreSQL rejects overlapping active
  appointments. However, `workingHoursLabel` remains free text and the candidate window is fixed at
  07:00-20:00. Add structured weekly hours, breaks, days off, and time-off exceptions before relying
  on the scheduler as the provider's source of truth.
- **Provider management is incomplete.** Onboarding creates one service, but there is no provider
  workflow or API to edit a page, services, hours, location, portfolio, products, stock, or product
  fulfilment. The provider Shop and Profile tabs currently reuse client-facing screens, so they are
  not merchant-management tools.
- **Operational safety has no staff console.** Clients can submit reports and no-show records can
  trigger automatic bans, but there is no authenticated staff interface/API for reviewing reports,
  resolving disputes, handling appeals, correcting a strike, verifying a stylist, or reconciling
  payments. These processes need ownership, audit controls, and support playbooks before launch.
- **Notifications are absent.** Socket events improve responsiveness only while an app is running;
  there are no push notifications for a provider offer, booking response, cancellation, chat message,
  payment outcome, or appointment reminder. Background delivery and retry behaviour need to be
  designed and tested.
- **Production map and privacy operations need hardening.** Public OpenStreetMap tiles must not be
  used for offline downloads, and the public OSRM demo endpoint has no production SLA. Choose licensed
  tile and routing providers (or self-host them), define quotas and monitoring, and validate the
  location-retention/deletion policy against the deployment's privacy requirements.

### Recommended release order

1. Make scheduling correct and race-safe; it is the most direct source of failed appointments.
2. Integrate real OTP and payments with webhook/reconciliation tests.
3. Add provider self-service, verification, and staff support tooling.
4. Add push notifications, then move maps and routing to production-grade providers.
