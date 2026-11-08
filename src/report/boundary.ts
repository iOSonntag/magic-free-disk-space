import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module report. */
export const moduleBoundary = {
  imports: [
    'catalog',
    'delete',
    'environment',
    'explore',
    'path',
    'preferences',
    'scan',
    'system',
    'tools',
    'update',
  ],
  readsTablesOf: [],
  exposes: [
    'buildDeletedFacts.ts',
    'buildFullDiskAccessNotices.ts',
    'buildPlannedFacts.ts',
    'buildScanView.ts',
    'buildUpdateNotice.ts',
    'formatDeletionConfirmation.ts',
    'formatDeletionLog.ts',
    'formatEnvironmentFailure.ts',
    'formatPreferencesSaveFailure.ts',
    'formatRemovalPlan.ts',
    'formatRemovalRun.ts',
    'formatScanReport.ts',
    'formatUsage.ts',
    'noticeView.ts',
    'reportTexts.ts',
  ],
} satisfies ModuleBoundary;
