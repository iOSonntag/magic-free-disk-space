import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module platform. */
export const moduleBoundary = {
  imports: ['catalog', 'delete', 'environment', 'explore', 'report', 'scan', 'system', 'tools'],
  readsTablesOf: [],
  exposes: ['platform.ts'],
} satisfies ModuleBoundary;
