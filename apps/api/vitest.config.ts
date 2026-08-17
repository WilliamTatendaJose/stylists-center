import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

/**
 * NestJS's dependency injection reads constructor parameter TYPES via
 * `reflect-metadata`, which requires `emitDecoratorMetadata` — and Vitest's
 * default esbuild transform does not implement that TS feature. Without this
 * plugin, DI silently resolves an injected constructor param to `undefined`
 * instead of throwing (as AuditInterceptor's tests caught: `this.prisma` was
 * `undefined` in every test that actually exercised it). SWC's transform
 * implements emitDecoratorMetadata correctly, so it replaces esbuild here.
 */
export default defineConfig({
  test: {
    root: './',
    passWithNoTests: true,
    /**
     * These specs are integration tests against one shared Postgres database,
     * not isolated unit tests, and Vitest's default is to run test *files* in
     * parallel worker threads. That makes any row not owned by exactly one
     * spec a race: AuthService assigns a new user's city with
     * `city.findFirstOrThrow()` (deliberate for the single-city M1 build), so
     * auth.service.spec can attach a user to whichever city another spec
     * happens to have created, and that spec's `afterAll` then cannot delete
     * its own city — "Foreign key constraint violated on the constraint:
     * User_cityId_fkey".
     *
     * It surfaces as flakiness rather than a hard failure, because it depends
     * on worker interleaving: the same commit passed CI on one run and failed
     * on the next with no code change between them. Per-spec cleanup fixes
     * have been attempted before and keep being outrun by the next pair of
     * specs to share a row; serialising the files removes the interleaving
     * that all of those races need. Tests within a file are already
     * sequential, so this makes the whole suite deterministic.
     *
     * Isolating per worker instead — a database each, so the files could run
     * in parallel again — was measured rather than assumed, and does not pay
     * for itself. There is no `template_postgis` to clone from (compose's
     * initdb installs the extensions into sc_dev/sc_test directly), so each
     * worker has to create a database, add postgis + pg_trgm, and apply all 24
     * migrations: ~21s per worker locally, of which ~19s is `migrate deploy`.
     * Parallelism was only worth ~60s of CI wall clock (1m38s vs 2m43s), so
     * four workers spend most of the saving on setup — and buy provisioning
     * code, stale-database cleanup and N concurrent migrate runs against one
     * server with it. Serial is both simpler and roughly the same speed.
     *
     * What would change that calculation: a prebuilt template database (clone
     * in ~0.5s instead of migrating), or enough new specs that the suite's own
     * runtime dwarfs a one-off 20s setup.
     */
    fileParallelism: false,
  },
  plugins: [
    swc.vite({
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        // legacyDecorator + decoratorMetadata together are what make SWC
        // emit the same design:paramtypes metadata `emitDecoratorMetadata`
        // does — matching apps/api/tsconfig.json's experimentalDecorators +
        // emitDecoratorMetadata pairing rather than the TC39 decorators SWC
        // defaults to.
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
      module: { type: 'es6' },
    }),
  ],
});
