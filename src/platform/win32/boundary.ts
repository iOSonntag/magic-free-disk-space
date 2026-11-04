import type { ModuleBoundary } from '../../moduleBoundary.js';

/** The edges and the surface of the module platform/win32. */
export const moduleBoundary = {
  imports: ['catalog', 'environment', 'explore', 'path', 'report', 'scan', 'system'],
  readsTablesOf: [],
  exposes: [],
} satisfies ModuleBoundary;
