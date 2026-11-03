import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module cli. */
export const moduleBoundary = {
  imports: ['catalog', 'delete', 'environment', 'report', 'scan', 'tools'],
  readsTablesOf: [],
  exposes: ['exitCodes.ts', 'runCli.ts', 'terminalIo.ts'],
} satisfies ModuleBoundary;
