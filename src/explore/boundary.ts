import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module explore. */
export const moduleBoundary = {
  imports: ['catalog', 'environment', 'path', 'system', 'tools'],
  readsTablesOf: [],
  exposes: [
    'explorePlatform.ts',
    'exploreUnit.ts',
    'projectPins/loadProjectPins.ts',
    'projectPins/projectPins.ts',
    'recheckExploreUnit.ts',
    'startExploreProbes.ts',
  ],
} satisfies ModuleBoundary;
