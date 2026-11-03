import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module tools. */
export const moduleBoundary = {
  imports: ['path', 'system'],
  readsTablesOf: [],
  exposes: [
    'decideToolTrust.ts',
    'findTrustedTool.ts',
    'limits.ts',
    'runToolCommand.ts',
    'toolInstallLocations.ts',
  ],
} satisfies ModuleBoundary;
