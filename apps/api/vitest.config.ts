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
