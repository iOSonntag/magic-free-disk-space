import type { ModuleBoundary } from '../../moduleBoundary.js';

/** The edges and the surface of the module platform/win32. */
export const moduleBoundary = {
  imports: [
    'catalog',
    'delete',
    'environment',
    'explore',
    'path',
    'platform',
    'report',
    'scan',
    'system',
    'tools',
  ],
  readsTablesOf: [],
  exposes: ['win32Platform.ts'],
} satisfies ModuleBoundary;
