import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module scan. */
export const moduleBoundary = {
  imports: ['catalog', 'environment', 'explore', 'path', 'system', 'tools'],
  readsTablesOf: [],
  exposes: [
    'buildReadIssue.ts',
    'buildSectionTotals.ts',
    'candidate.ts',
    'candidateOrigin.ts',
    'findRemovalRefusal.ts',
    'isExecutableOwnerRunning.ts',
    'issue.ts',
    'limits.ts',
    'loadPathMeasurement.ts',
    'placeCandidate.ts',
    'runScan.ts',
    'scanPlatform.ts',
  ],
} satisfies ModuleBoundary;
