import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module catalog. */
export const moduleBoundary = {
  imports: [],
  readsTablesOf: [],
  exposes: ['catalog.ts', 'catalogOwner.ts', 'catalogPlatform.ts', 'projectArtifactRules.ts'],
} satisfies ModuleBoundary;
