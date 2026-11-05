import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module path. */
export const moduleBoundary = {
  imports: [],
  readsTablesOf: [],
  exposes: [
    'formatHomeRelativePath.ts',
    'isSameOrInsidePath.ts',
    'joinAbsolutePath.ts',
    'parseAbsolutePath.ts',
    'pathRules.ts',
  ],
} satisfies ModuleBoundary;
