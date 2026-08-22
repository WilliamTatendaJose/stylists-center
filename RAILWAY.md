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

### Deliberately not using Railway's infrastructure-as-code

The services below are configured in the Railway dashboard and deployed with
`railway up --service <name>`; there is no `.railway/railway.ts`. A
`railway config init` scaffold used to sit in this repo declaring a single
`web` service, which described none of the four services that actually exist.
It was never wired into CI (nothing runs `railway config`) and could not have
run anyway — `railway/iac` was not a dependency — but `railway config apply`
against it would have treated `db`, `redis`, `api` and `admin` as undeclared,
and `db`/`redis` own the volumes holding production data. It was deleted
rather than corrected: hand-maintaining a second, untested description of the
topology earns nothing while the dashboard remains the source of truth.

If you do want IaC later, `railway config pull` imports the real project
instead of starting from a scaffold that has to be made true by hand.

Both workflows need a GitHub Actions secret that only your own dashboard
login can create (the CLI is deliberately blocked from minting these):

- **`RAILWAY_TOKEN`** — a _project_ token, not an account token. In the
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
FIREBASE_PROJECT_ID=style-center-5162a
FIREBASE_CLIENT_EMAIL=...iam.gserviceaccount.com  # optional; set with private key
FIREBASE_PRIVATE_KEY=...   # optional revocation checks; keep escaped \\n sequences
PAYMENT_PROVIDER=paynow   # Paynow's test integration IDs reject transactions with an email field — never add one to the checkout request
PAYNOW_INTEGRATION_ID=...
PAYNOW_INTEGRATION_KEY=...
PAYNOW_RETURN_URL=https://<api public domain>/v1/payments/paynow/return
PAYNOW_RESULT_URL=https://<api public domain>/v1/payments/paynow/callback
PAYNOW_AUTH_EMAIL=<a login email on the Paynow merchant account>   # required for the EcoCash phone-prompt checkout
COIN_USD_CENTS=20
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
VITE_API_URL=https://<api service's public domain>
```

**The bare origin, with no `/v1` and no trailing slash.** Every request the
admin client makes already begins with `/v1`, so a base ending in `/v1` sends
`/v1/v1/...` and returns 404 for everything — including login, so the console
looks dead rather than misconfigured. This file previously documented the
`/v1` form; if the deployed `admin` service still has it, correct the variable
and redeploy (Vite inlines it at build time, so a rebuild is required). The
client now strips a trailing `/v1` defensively, so either form works once
`admin` is rebuilt from a commit that includes that change.

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

## Firebase authentication

The client now uses Firebase for Google and email/password credentials. The
API verifies a Firebase ID token once, then issues the app's existing rotating
session so API guards and realtime sockets keep the same authorization model.

Before the first auth-enabled build:

1. In Firebase Authentication, enable **Email/Password** and **Google**.
2. Register a Firebase **Web app** and copy its public config into the mobile
   EAS environment as `EXPO_PUBLIC_FIREBASE_API_KEY`,
   `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, and
   `EXPO_PUBLIC_FIREBASE_APP_ID`.
3. Create an Android OAuth client with the release/debug SHA-1 and SHA-256
   fingerprints. Put its Web client id in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`,
   then download a fresh `google-services.json`; its `oauth_client` list must
   not be empty for native Google sign-in.
4. Generate a Firebase Admin service-account JSON. Set its `project_id`,
   `client_email`, and `private_key` on the API as `FIREBASE_PROJECT_ID`,
   `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`. Keep the private key's
   newlines escaped as `\\n` in Railway.
5. Deploy the `20260821120000_firebase_auth` migration before directing users
   to the new build.

These mobile values are public identifiers, but the Admin private key is an
API-only secret and must never use an `EXPO_PUBLIC_` variable.

## Android push notifications (FCM)

The API sends notifications through Expo's push service (`PushService`), and
the app registers a device token on launch. Neither works on Android until
Firebase credentials exist, and the failure is silent by design of the
platform: the app just never obtains a token, so the server has nowhere to
send. `_layout.tsx` logs `[push] could not register this device…` when that
happens — check the device log first if notifications are missing.

Two separate credentials, both required, neither in this repo:

1. **`google-services.json`** — lets Firebase initialise inside the app, which
   is what allows a push token to be minted at all. From the Firebase console:
   Project settings → Your apps → Android app for `zw.co.stylistscenter.app` →
   download. It must come from the same Firebase project as the key in step 2.

   A local copy at `apps/mobile/google-services.json` only serves
   `expo run:android`. It is gitignored, and eas-cli builds its upload archive
   through the repo's `.gitignore` rules (`makeShallowCopyAsync`), so a
   gitignored file never reaches the builder — an EAS build needs it as a file
   variable instead:

   ```bash
   cd apps/mobile
   eas env:set --name GOOGLE_SERVICES_JSON --type file \
     --value ./google-services.json --visibility secret \
     --environment preview --environment production
   ```

   Already done for this project, in both environments. Variables are scoped
   per environment, and a build profile resolves its environment from
   `distribution`/`developmentClient` unless it sets `environment` explicitly:
   `preview` (internal) resolves to preview, `production` (store) to
   production. `development` is deliberately not covered — add it if you ever
   need push in a dev-client build.

   `app.config.ts` prefers the file variable, falls back to a local copy, and
   omits `googleServicesFile` when neither exists rather than failing the build.

2. **FCM V1 service account key** — lets Expo's servers actually deliver to
   FCM. Firebase console → Project settings → Service accounts → Generate new
   private key, then `eas credentials` → Android → the build profile → push
   notifications, and upload the JSON.

Both are build-time, so a build made before they existed will never receive
notifications no matter what the server does — rebuild after configuring.

iOS needs an APNs key instead, through the same `eas credentials` flow; nothing
in this repo has been set up for it yet.

## Known gaps, deliberately not solved here

- **Uploads are on a single-instance Volume**, not object storage. Fine at
  one `api` replica; if this ever needs to scale horizontally, provider
  photos need to move to S3/R2 first — `ImageStorageService` is the only
  place that would need to change.
- **Mobile app** deploys through EAS, not Railway — `apps/mobile/.env`'s
  `EXPO_PUBLIC_API_URL` needs to point at `api`'s public domain for release
  builds.
