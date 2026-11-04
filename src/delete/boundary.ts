import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module delete. */
export const moduleBoundary = {
  imports: ['catalog', 'environment', 'explore', 'path', 'scan', 'system', 'tools'],
  readsTablesOf: [],
  exposes: [
    'confirmation.ts',
    'deleteApprovedCandidates.ts',
    'deleteCandidates.ts',
    'deletePlatform.ts',
    'deletionJournal.ts',
    'isGoneOutcome.ts',
    'planRemoval.ts',
    'validateRemoval.ts',
  ],
} satisfies ModuleBoundary;
