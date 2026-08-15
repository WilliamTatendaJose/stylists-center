import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  optimizeDeps: {
    // @sc/shared is a symlinked workspace package built to CommonJS (for
    // the NestJS API and Metro, which both expect it) — the browser's
    // native ES module loader can't execute `exports.foo = ...` directly.
    // Listing it here forces esbuild's pre-bundler to do the CJS→ESM
    // interop it already does for every node_modules dependency, which
    // Vite doesn't do automatically for a symlinked workspace package.
    include: ['@sc/shared'],
  },
});
