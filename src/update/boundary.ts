import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module update. */
export const moduleBoundary = {
  imports: ['system'],
  readsTablesOf: [],
  exposes: [
    'fetchLatestReleaseVersion.ts',
    'githubRelease.ts',
    'releaseVersion.ts',
    'runUpdateCheck.ts',
  ],
} satisfies ModuleBoundary;
