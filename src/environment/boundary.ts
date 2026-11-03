import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module environment. */
export const moduleBoundary = {
  imports: ['catalog', 'path', 'system'],
  readsTablesOf: [],
  exposes: ['buildEnvironment.ts', 'loadEnvironment.ts'],
} satisfies ModuleBoundary;
