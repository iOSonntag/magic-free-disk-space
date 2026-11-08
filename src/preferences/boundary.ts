import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module preferences. */
export const moduleBoundary = {
  imports: ['environment', 'system'],
  readsTablesOf: [],
  exposes: ['preferencesFile.ts'],
} satisfies ModuleBoundary;
