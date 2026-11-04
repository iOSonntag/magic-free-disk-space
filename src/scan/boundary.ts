import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module scan. */
export const moduleBoundary = {
  imports: ['catalog', 'environment', 'explore', 'path', 'system', 'tools'],
  readsTablesOf: [],
  exposes: [
    'buildReadIssue.ts',
    'candidate.ts',
    'issue.ts',
    'limits.ts',
    'loadUnitMeasurement.ts',
    'placeCandidate.ts',
    'runScan.ts',
    'scanPlatform.ts',
  ],
} satisfies ModuleBoundary;
