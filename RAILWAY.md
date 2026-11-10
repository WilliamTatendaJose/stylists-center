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
- Variables: `POSTGRES_USER=sc`, `POSTGRES_PASSWORD=<generate>`, `POSTGRES_DB=sc_prod`,
  `PGDATA=/var/lib/postgresql/data/pgdata`
- **Attach a Volume** at `/var/lib/postgresql/data` (data is lost on redeploy without one)

**`PGDATA` must be exactly `/var/lib/postgresql/data/pgdata`, inside the
volume.** It has to be a subdirectory because the volume's root contains
`lost+found`, and `initdb` refuses a non-empty directory. **Don't set it
from Git Bash on Windows:** Git Bash rewrites any argument starting with `/`
into a Windows path, so `railway variables --set PGDATA=/var/...` stores
`C:/Users/<you>/AppData/Local/Programs/Git/var/...`. Postgres then writes
its data outside the volume, and **every restart of `db` silently wipes the
database** (this happened in November 2026). Set it in the dashboard, from
PowerShell, or prefix the command with `MSYS_NO_PATHCONV=1`. To check, the
`db` deploy log must not show `initdb` running on a normal restart.

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
- **No volume needed** once uploads are in R2 (`STORAGE_DRIVER=s3`, below).
  Only with `STORAGE_DRIVER=local` does it need a Volume at
  `/app/apps/api/uploads` (`UPLOAD_DIR=uploads` resolved against the
  container's cwd).

Variables:

```
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://${{db.POSTGRES_USER}}:${{db.POSTGRES_PASSWORD}}@${{db.RAILWAY_PRIVATE_DOMAIN}}:5432/${{db.POSTGRES_DB}}
REDIS_URL=redis://${{redis.RAILWAY_PRIVATE_DOMAIN}}:6379
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<cloudflare account id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=sc-uploads
S3_ACCESS_KEY_ID=<R2 token for sc-uploads only>
S3_SECRET_ACCESS_KEY=<R2 token secret>
JWT_ACCESS_SECRET=<openssl rand -base64 48>
JWT_REFRESH_PEPPER=<openssl rand -base64 48>
ADMIN_JWT_ACCESS_SECRET=<openssl rand -base64 48>
ADMIN_JWT_REFRESH_PEPPER=<openssl rand -base64 48>
ADMIN_WEB_ORIGIN=https://<admin service's public domain>

# Real values before going live — see apps/api/.env.example for what each does
FIREBASE_PROJECT_ID=style-center-5162a
FIREBASE_CLIENT_EMAIL=...iam.gserviceaccount.com  # required for admin user CRUD and revocation checks
FIREBASE_PRIVATE_KEY=...   # required with client email; keep escaped \\n sequences
PAYMENT_PROVIDER=paynow   # or pesepay — only the chosen gateway's variables below are required
# Optional. Which payment methods the app offers, comma-separated, from:
# ecocash, onemoney, innbucks, omari, card. Unset offers everything the gateway
# supports (Paynow: all five; Pesepay: ecocash, card). Trim it to what the
# merchant account actually has activated — no app release needed.
# PAYMENT_CHANNELS=ecocash,onemoney,innbucks,omari,card

# If PAYMENT_PROVIDER=paynow. Paynow's test integration IDs reject transactions
# with an email field — never add one to the checkout request.
PAYNOW_INTEGRATION_ID=...
PAYNOW_INTEGRATION_KEY=...
PAYNOW_RETURN_URL=https://<api public domain>/v1/payments/paynow/return
PAYNOW_RESULT_URL=https://<api public domain>/v1/payments/paynow/callback
PAYNOW_AUTH_EMAIL=<a login email on the Paynow merchant account>   # required for the EcoCash phone-prompt checkout

# If PAYMENT_PROVIDER=pesepay. Set the same two URLs on the Pesepay dashboard.
PESEPAY_INTEGRATION_KEY=...
PESEPAY_ENCRYPTION_KEY=...   # exactly 32 characters — the AES-256 key for every request and response body
PESEPAY_RETURN_URL=https://<api public domain>/v1/payments/pesepay/return
PESEPAY_RESULT_URL=https://<api public domain>/v1/payments/pesepay/callback
PESEPAY_SANDBOX=false   # true points at api.test.sandbox.pesepay.com and moves no real money
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

### Uploads in Cloudflare R2

Provider photos, ID/selfie checks and chat attachments go to a **private** R2
bucket. Postgres keeps storing `/uploads/<name>` paths, exactly as before;
`GET /uploads/<name>` on the API now answers with a 302 to a presigned link
that is valid for an hour (`apps/api/src/modules/storage/`). So:

- no mobile or admin change, and no data migration — old and new rows use
  the same URL shape;
- the bucket is never public, so ID documents can't be listed or linked
  permanently, and nobody needs to set up a public R2 domain;
- the bytes go straight from R2 to the phone. R2 doesn't charge for
  downloads, and they no longer count against Railway egress.

Setup, in the Cloudflare dashboard → R2:

1. Create a bucket `sc-uploads` (leave public access **off**).
2. Manage R2 API Tokens → Create API token → **Object Read & Write**,
   restricted to `sc-uploads` only. Copy the Access Key ID, Secret Access
   Key and the S3 endpoint (`https://<account id>.r2.cloudflarestorage.com`)
   into the `api` variables above.
3. Redeploy `api`. Nothing else needs a CORS rule: images and file links are
   plain GETs following a redirect, not script requests.

**Moving files off an existing volume.** If the old `api` volume still holds
uploads, copy them into the bucket _before_ removing it, from inside the
running service (where the volume is mounted) with the S3 variables set:

```bash
railway ssh --service api -- pnpm storage:migrate
```

It skips anything already in the bucket, so it is safe to re-run, and it
deletes nothing locally. Check a few old photos in the admin console, then
detach the volume. If the volume is already gone, those files are lost and
the rows pointing at them will show broken images until users re-upload.

For local development nothing changes: `STORAGE_DRIVER` defaults to `local`
and files stay under `apps/api/uploads`.

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

## 5. `backup` — nightly Postgres dump to R2

`db` is a self-managed container on a volume, so nothing backs it up unless
this service does. It runs `pg_dump` over the private network, checks the dump
is readable (`pg_restore --list`), uploads it to a second, private R2 bucket,
and exits. Railway only bills while it runs.

In Cloudflare → R2:

1. Create a bucket `sc-backups` (public access off), separate from
   `sc-uploads`, so the API's credentials can't touch backups.
2. Create an API token with **Object Read & Write** on `sc-backups` only.
3. Bucket → Settings → **Object lifecycle rules** → delete objects with
   prefix `postgres/` after e.g. 30 days. Without this, backups pile up
   forever. That is cheap (a dump of a database this size is a few MB), but
   it is untidy.

In Railway:

- **New service → Empty Service → Deploy from Dockerfile**
- Root Directory: `infra/docker/backup`, Dockerfile Path: `Dockerfile`
- Settings → **Cron Schedule**: `0 1 * * *` (01:00 UTC, 03:00 in Harare)
- No volume, no public domain, no healthcheck
- Variables:

```
DATABASE_URL=postgresql://${{db.POSTGRES_USER}}:${{db.POSTGRES_PASSWORD}}@${{db.RAILWAY_PRIVATE_DOMAIN}}:5432/${{db.POSTGRES_DB}}
BACKUP_S3_ENDPOINT=https://<cloudflare account id>.r2.cloudflarestorage.com
BACKUP_S3_BUCKET=sc-backups
AWS_ACCESS_KEY_ID=<R2 token for sc-backups only>
AWS_SECRET_ACCESS_KEY=<R2 token secret>
```

Trigger one run by hand straight after setup, and confirm a
`postgres/sc-<timestamp>.dump` object shows up in the bucket. A failed run
exits non-zero and shows as failed in the service's deployment history.
Railway won't alert you about it, so look at that history now and then.

**Restoring** (practise this once before you need it). Download a dump from
the R2 dashboard, then:

```bash
# Into a scratch database first, to check it:
createdb -h localhost -p 5433 -U sc sc_restore_check
psql -h localhost -p 5433 -U sc -d sc_restore_check -c 'CREATE EXTENSION postgis; CREATE EXTENSION pg_trgm;'
pg_restore --no-owner --no-privileges -h localhost -p 5433 -U sc -d sc_restore_check sc-<timestamp>.dump
```

Into production: stop `api`, restore into an empty `db` with the same
`pg_restore` command (pointing at the Railway database), then start `api`.
`prisma migrate deploy` on boot sees the restored migration history and
does nothing.

## First deploy order

1. `db`, then `redis` — wait for both to come up healthy.
2. `api`: first boot runs migrations against the empty `db`. Set
   `ADMIN_BOOTSTRAP_EMAIL`/`ADMIN_BOOTSTRAP_PASSWORD` first, so the first
   admin account is created on boot (see "Admin access and password resets"
   below). Then load the city and categories once:
   `railway ssh --service api -- pnpm seed:reference`. **Never** run
   `pnpm seed` against production: it inserts demo users, providers and
   bookings, plus an admin with a published password.
3. `admin` — needs `api`'s public domain for `VITE_API_URL` at build time,
   so it has to build after `api` has one.
4. Go back to `api` and set `ADMIN_WEB_ORIGIN` to `admin`'s public domain
   once that exists (there's a one-time chicken-and-egg here: both domains
   need to exist before both env vars are correct — redeploy `api` after
   `admin`'s domain is known).

## Admin access and password resets

There are four cases, from most to least common:

| Situation                                        | What to do                                                                                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| You want to change your own password             | **Your account** (your name, bottom left) → Password. Needs your current password; signs you out on every other device.                              |
| A staff member forgot their password             | An owner opens **Staff → Reset password**. The new password signs out that person's existing sessions.                                               |
| A staff member lost the phone with their 2FA app | An owner opens **Staff → Reset 2FA**. They're signed out and can set it up again from their account page. (Or they use one of their recovery codes.) |
| A mobile user (client or stylist) forgot theirs  | They tap **Forgot password** on the sign-in screen. Firebase emails them a reset link. Nothing to do on the server.                                  |
| No owner can sign in at all                      | Break-glass, below.                                                                                                                                  |

**Fresh or locked-out database, no shell needed.** On the `api` service set
`ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` (12+ characters) and
redeploy. On boot, if there is no usable owner (the database is empty, or
every owner is disabled or deleted), that account is created, restored or
promoted to owner. If a usable owner exists, the variables do nothing, so
leaving them set can't undo a password changed later. Delete them once
you've signed in and changed the password anyway, so a stale credential
isn't sitting in the dashboard.

**Locked out of a specific account, with a shell:**

```bash
railway ssh --service api
pnpm admin:reset-password owner@example.com             # prompts, input hidden
pnpm admin:reset-password owner@example.com --clear-mfa # also turns off 2FA (lost phone)
pnpm admin:reset-password new@example.com --create      # creates an owner if missing
```

This needs 12+ characters, re-enables the account, and signs out every
session it had.

## Admin console security

**Roles.** Every admin has one:

| Role    | Can use                                                                             |
| ------- | ----------------------------------------------------------------------------------- |
| owner   | Everything, including Staff and the Audit log                                       |
| finance | Overview, Lookup, Providers (read), Subscriptions, Payments, Cash-outs, CSV exports |
| support | Overview, Lookup, Reports, Bans, Reviews, Providers, Users, Verifications, Catalog  |

The API enforces this (`apps/api/src/modules/admin-auth/admin-roles.ts`); a
test fails if any admin route is added without a role decision. Admins who
existed before roles were introduced are owners. There must always be at
least one enabled owner, and nobody can change their own role.

**Two-factor sign-in.** Each admin turns it on from **Your account** with an
authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…)
and gets 10 one-time recovery codes. Once every admin has set it up, make it
mandatory:

```
ADMIN_MFA_REQUIRED=true
```

With that on, an admin without 2FA can only reach their account page until
they enrol. TOTP secrets are encrypted with a key derived from
`ADMIN_JWT_REFRESH_PEPPER`. **Rotating that pepper turns off everyone's 2FA**
(their stored secrets can no longer be read): after a rotation, clear each
admin's 2FA (Staff → Reset 2FA, or `--clear-mfa`) and have them enrol again.

**Brute-force protection.** Sign-in is limited to 10 attempts a minute per
client IP, and 5 wrong passwords (or 5 wrong 2FA codes) lock that account's
sign-in for 15 minutes, even with the right password. The limits key on the
real client IP, which relies on `TRUST_PROXY_HOPS=1` (the default), matching
Railway's single edge proxy. Set it to `0` only if the API is ever exposed
with no proxy in front.

**CSV exports.** Finance and owners can download the payments ledger,
recorded payouts and cash-outs for a date range (Payments and Cash-outs
pages). Dates are Harare days, inclusive, up to a year at a time. Each export
is written to the audit log with who took it. Cells that a spreadsheet would
treat as a formula (starting `=`, `+`, `-`, `@`) get a leading apostrophe, so
phone numbers appear as `'+263…`.

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
5. Deploy the `20260821120000_firebase_auth` and
   `20260830113000_user_lifecycle` migrations before directing users to the
   new build.

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

- **No emailed password-reset links for admins.** There's no email provider
  configured. Admins change their own password from Your account; an owner
  resets someone else's; break-glass covers the rest.
- **The Payments page computes payout balances in memory** from every
  released payment, then pages the result. Fine for now; if that page gets
  slow, move the balance calculation into a SQL aggregate.
- **Backups are daily, not point-in-time.** A disk loss can cost up to a
  day of bookings and wallet movements. Moving to a managed Postgres with
  PITR is the next step once that window is unacceptable.
- **Mobile app** deploys through EAS, not Railway — `apps/mobile/.env`'s
  `EXPO_PUBLIC_API_URL` needs to point at `api`'s public domain for release
  builds.
