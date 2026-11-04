import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module scan. */
export const moduleBoundary = {
  imports: ['catalog', 'environment', 'explore', 'path', 'system', 'tools'],
  readsTablesOf: [],
  exposes: [
    'candidate.ts',
    'issue.ts',
    'limits.ts',
    'loadProcessCommands.ts',
    'loadUnitMeasurement.ts',
    'placeCandidate.ts',
    'runScan.ts',
    'scanPlatform.ts',
  ],
} satisfies ModuleBoundary;
