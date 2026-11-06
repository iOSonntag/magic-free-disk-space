import type { ModuleBoundary } from '../../moduleBoundary.js';

/** The edges and the surface of the module platform/darwin. */
export const moduleBoundary = {
  imports: ['catalog', 'environment', 'explore', 'path', 'platform', 'scan', 'system', 'tools'],
  readsTablesOf: [],
  exposes: ['darwinPlatform.ts'],
} satisfies ModuleBoundary;
