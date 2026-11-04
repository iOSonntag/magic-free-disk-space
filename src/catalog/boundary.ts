import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module catalog. */
export const moduleBoundary = {
  imports: ['environment', 'path'],
  readsTablesOf: [],
  exposes: [
    'catalog.ts',
    'catalogOwner.ts',
    'catalogPlatform.ts',
    'projectArtifactRules.ts',
    'resolveCatalogLocation.ts',
  ],
} satisfies ModuleBoundary;
