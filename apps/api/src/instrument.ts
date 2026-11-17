import * as Sentry from '@sentry/nestjs';

/**
 * Error and performance reporting (Sentry). Imported first in main.ts so it
 * can hook the HTTP server and database driver before they load.
 *
 * Off unless SENTRY_DSN is set, so local runs, tests and a deploy without the
 * variable behave exactly as before. No request bodies, cookies or IP
 * addresses are sent (the SDK's default): errors carry the route, the
 * status and the stack only.
 */
const dsn = process.env.SENTRY_DSN?.trim();
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV ?? 'development',
    // Railway sets this on every deploy, which ties an error to the commit.
    ...(process.env.RAILWAY_GIT_COMMIT_SHA ? { release: process.env.RAILWAY_GIT_COMMIT_SHA } : {}),
    // One request in ten is timed: enough to see slow endpoints, small
    // enough to stay inside the free plan.
    tracesSampleRate: 0.1,
  });
}
