import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module cli. */
export const moduleBoundary = {
  imports: ['catalog', 'delete', 'environment', 'explore', 'report', 'scan', 'system', 'tools'],
  readsTablesOf: [],
  exposes: ['exitCodes.ts', 'runCli.ts', 'terminalIo.ts'],
} satisfies ModuleBoundary;
