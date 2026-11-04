import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module bridge. */
export const moduleBoundary = {
  imports: [
    'catalog',
    'delete',
    'environment',
    'explore',
    'preferences',
    'report',
    'scan',
    'system',
    'tools',
    'update',
  ],
  readsTablesOf: [],
  exposes: ['bridgeIo.ts', 'runBridge.ts'],
} satisfies ModuleBoundary;
