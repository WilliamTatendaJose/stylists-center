# Deploying to Railway

Four services in one Railway project: `db`, `redis`, `api`, `admin`. The
mobile app is not part of this — it ships through EAS, separately.

## Continuous deployment

Once the four services below exist, `api` and `admin` redeploy automatically
on every push to `main` (`.github/workflows/ci.yml`'s `deploy-web` job) —
gated behind the existing `verify` job, so a failing typecheck/lint/test run
blocks the deploy. `db`/`redis` are static infra and are never touched by
CI — they only change if you edit their Dockerfiles under `infra/docker/`
and redeploy manually.

The mobile app is separate and manual: `.github/workflows/mobile-build.yml`
is a `workflow_dispatch` you trigger from the Actions tab (pick a build
profile), since an EAS build takes 10-15 minutes and spends build-minute
quota — not something you want firing on every commit.

Both workflows need a GitHub Actions secret that only your own dashboard
login can create (the CLI is deliberately blocked from minting these):

- **`RAILWAY_TOKEN`** — a *project* token, not an account token. In the
  Railway dashboard: this project → Settings → Tokens → new token scoped to
  the `production` environment. An account-wide token would also work but
  grants CI far more than it needs (every project in your account, including
  the two unrelated ones already in there).
- **`EXPO_TOKEN`** — expo.dev → account settings → Access Tokens → new
  token.

Set both without ever putting the value in a commit, a chat log, or
anywhere else — run these yourself, replacing the placeholder:

```bash
gh secret set RAILWAY_TOKEN --repo WilliamTatendaJose/stylists-center
gh secret set EXPO_TOKEN --repo WilliamTatendaJose/stylists-center
```

(`gh secret set NAME` with no `--body` prompts for the value on stdin and
never echoes it back or stores it in shell history.)

## 1. `db` — Postgres + PostGIS

Railway's one-click Postgres plugin does **not** include PostGIS, which the
geo module's proximity search hard-depends on (`ST_DWithin`/`ST_Distance`
over a `geography` column). Deploy it from a Dockerfile instead:

- **New service → Empty Service → Deploy from Dockerfile**
- Root Directory: `infra/docker/postgres`
- Dockerfile Path: `Dockerfile`
- Variables: `POSTGRES_USER=sc`, `POSTGRES_PASSWORD=<generate>`, `POSTGRES_DB=sc_prod`
- **Attach a Volume** at `/var/lib/postgresql/data` (data is lost on redeploy without one)
- Internal port: `5432` (default, no need to expose publicly)

## 2. `redis`

Railway's Redis template doesn't expose `--maxmemory-policy`. BullMQ's
delayed jobs are the authority for match-offer expiry, so an evicted key
under memory pressure means a match request that never expires — this is
deployed the same way as `db`, not the plugin:

- **New service → Empty Service → Deploy from Dockerfile**
- Root Directory: `infra/docker/redis`
- Dockerfile Path: `Dockerfile`
- **Attach a Volume** at `/data`
- Internal port: `6379`

## 3. `api`

- **New service → Deploy from GitHub repo**
- Root Directory: `.` (repo root — `@sc/api` depends on `@sc/shared` via the
  pnpm workspace, so the build needs the whole monorepo as context)
- Dockerfile Path: `apps/api/Dockerfile`
- Healthcheck Path: `/healthz`
- **Attach a Volume** at `/app/apps/api/uploads` (matches `UPLOAD_DIR=uploads`
  resolved against the container's cwd — see the note on object storage below)

Variables:

```
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://${{db.POSTGRES_USER}}:${{db.POSTGRES_PASSWORD}}@${{db.RAILWAY_PRIVATE_DOMAIN}}:5432/${{db.POSTGRES_DB}}
REDIS_URL=redis://${{redis.RAILWAY_PRIVATE_DOMAIN}}:6379
UPLOAD_DIR=uploads
JWT_ACCESS_SECRET=<openssl rand -base64 48>
JWT_REFRESH_PEPPER=<openssl rand -base64 48>
ADMIN_JWT_ACCESS_SECRET=<openssl rand -base64 48>
ADMIN_JWT_REFRESH_PEPPER=<openssl rand -base64 48>
ADMIN_WEB_ORIGIN=https://<admin service's public domain>

# Real values before going live — see apps/api/.env.example for what each does
INFOBIP_API_KEY=...
INFOBIP_BASE_URL=...
INFOBIP_WHATSAPP_SENDER=...
INFOBIP_WHATSAPP_TEMPLATE_NAME=...
INFOBIP_DEFAULT_CHANNEL=whatsapp
PAYMENT_PROVIDER=fake   # do not flip until the Paynow checkout/refund model is chosen
PAYNOW_INTEGRATION_ID=...
PAYNOW_INTEGRATION_KEY=...
PAYNOW_RETURN_URL=https://<api public domain>/v1/payments/paynow/return
PAYNOW_RESULT_URL=https://<api public domain>/v1/payments/paynow/callback
COIN_USD_CENTS=50
CASH_OUT_MIN_USD_CENTS=500
```

`${{db.VARIABLE}}` is Railway's cross-service variable reference syntax —
it resolves at deploy time once both services exist, and uses Railway's
private network rather than the public internet between services in the
same project.

The container runs `prisma migrate deploy` before `node dist/main.js` on
every boot (see the Dockerfile `CMD`) — safe on redeploys, since Prisma
tracks applied migrations and each one runs at most once.

## 4. `admin`

- **New service → Deploy from GitHub repo**
- Root Directory: `.`
- Dockerfile Path: `apps/admin/Dockerfile`
- Healthcheck Path: `/healthz`

Variables (build-time — Vite inlines these into the bundle, so they must be
set as **build** variables, not just runtime):

```
VITE_API_URL=https://<api service's public domain>/v1
```

## First deploy order

1. `db`, then `redis` — wait for both to come up healthy.
2. `api` — first boot runs migrations against the empty `db` and seeds
   nothing automatically. Create the bootstrap admin account once with
   `railway run --service api pnpm --filter @sc/api seed:admin` — **not**
   `pnpm seed`, which also inserts `prisma/seed.ts`'s demo categories,
   providers, and bookings (fixture data meant for a dev database, tied to
   ids the mobile app's local fixtures reference). Set
   `ADMIN_BOOTSTRAP_EMAIL`/`ADMIN_BOOTSTRAP_PASSWORD` as `api` service
   variables first if you don't want the default
   `admin@stylistscenter.local` / `ChangeMe123!` (change the password
   immediately after first login either way).
3. `admin` — needs `api`'s public domain for `VITE_API_URL` at build time,
   so it has to build after `api` has one.
4. Go back to `api` and set `ADMIN_WEB_ORIGIN` to `admin`'s public domain
   once that exists (there's a one-time chicken-and-egg here: both domains
   need to exist before both env vars are correct — redeploy `api` after
   `admin`'s domain is known).

## Verify

- `curl https://<api domain>/healthz` → `{"status":"ok"}`
- `curl https://<api domain>/readyz` → `{"status":"ok","db":"ok","redis":"ok"}`
- Load the admin console, log in, refresh the page (session should persist
  via the cookie — this only works because of the `sameSite: 'none'` fix in
  `apps/api/src/modules/admin-auth/cookies.ts`, needed specifically because
  `admin` and `api` sit on different `*.up.railway.app` subdomains, a
  cross-site relationship browsers treat strictly).

## Known gaps, deliberately not solved here

- **Uploads are on a single-instance Volume**, not object storage. Fine at
  one `api` replica; if this ever needs to scale horizontally, provider
  photos need to move to S3/R2 first — `ImageStorageService` is the only
  place that would need to change.
- **`PAYMENT_PROVIDER=fake`** — real money movement needs the Paynow
  integration finished first (see `apps/api/.env.example`'s comment on this).
- **Mobile app** deploys through EAS, not Railway — `apps/mobile/.env`'s
  `EXPO_PUBLIC_API_URL` needs to point at `api`'s public domain for release
  builds.
