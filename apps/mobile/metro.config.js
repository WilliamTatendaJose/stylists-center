// Metro config for a pnpm monorepo.
//
// This is the single most common source of "module not found" errors in an
// Expo + pnpm setup, and the fix has two parts that both matter:
//
//  1. `.npmrc` at the workspace root sets `node-linker=hoisted`, so
//     node_modules is a flat, non-symlinked tree Metro can walk normally —
//     this alone removes the reason most guides reach for
//     `resolver.disableHierarchicalLookup`, and `expo-doctor` flags that
//     override as a deviation from Expo's recommended config, so it's
//     deliberately NOT set here.
//  2. Metro still needs to know the monorepo root is watchable and
//     resolvable — `watchFolders` so it sees changes in ../../packages/*,
//     and `nodeModulesPaths` so it resolves @sc/* and third-party deps
//     hoisted to the workspace root, not just apps/mobile/node_modules.
//
// Both are required together. Either alone still breaks resolution for
// @sc/tokens, @sc/ui, @sc/shared, which are consumed as source (no build
// step) directly from packages/*/src.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Every relative import in this repo carries a `.js` extension — the NodeNext
// convention TypeScript requires, and what `@sc/shared`'s emitted ESM needs to
// be loadable by the API at runtime. Metro resolves `./client.js` literally,
// finds no such file next to `client.ts`, and fails the bundle. Retrying
// without the extension lets Metro's normal sourceExts order (.ts/.tsx/.js)
// pick the real file.
//
// Deliberately a fallback in `catch` rather than an unconditional rewrite:
// anything that already resolves keeps resolving exactly as before, so a
// third-party package shipping a genuine `./foo.js` next to a `./foo.ts` can't
// be silently redirected to the wrong one.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  try {
    return context.resolveRequest(context, moduleName, platform);
  } catch (error) {
    const isRelative = moduleName.startsWith('./') || moduleName.startsWith('../');
    if (isRelative && moduleName.endsWith('.js')) {
      return context.resolveRequest(context, moduleName.slice(0, -'.js'.length), platform);
    }
    throw error;
  }
};

module.exports = config;
