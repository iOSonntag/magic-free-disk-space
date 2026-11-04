import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module catalog. */
export const moduleBoundary = {
  imports: [],
  readsTablesOf: [],
  exposes: [
    'catalog.ts',
    'catalogEntries.ts',
    'catalogOwner.ts',
    'catalogPlatform.ts',
    'projectArtifactRules.ts',
    'protectedPaths.ts',
  ],
} satisfies ModuleBoundary;
