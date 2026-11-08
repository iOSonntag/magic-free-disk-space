import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module path. */
export const moduleBoundary = {
  imports: [],
  readsTablesOf: [],
  exposes: [
    'driveRoot.ts',
    'formatHomeRelativePath.ts',
    'isOverlappingPath.ts',
    'isSameOrInsidePath.ts',
    'isStrictlyInsidePath.ts',
    'joinAbsolutePath.ts',
    'parseAbsolutePath.ts',
    'pathRules.ts',
  ],
} satisfies ModuleBoundary;
