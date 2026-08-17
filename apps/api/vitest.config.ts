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
     * The cost is wall-clock time on a suite that is dominated by database
     * round-trips anyway. Proper per-spec isolation (a schema or database per
     * worker) would buy the parallelism back, and is the thing to do if this
     * ever gets slow enough to matter.
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
