import type { ModuleBoundary } from '../moduleBoundary.js';

/** The edges and the surface of the module environment. */
export const moduleBoundary = {
  imports: ['path', 'system'],
  readsTablesOf: [],
  exposes: [
    'buildEnvironment.ts',
    'checkEnvironmentRoots.ts',
    'environmentPlatform.ts',
    'isTouchingProtectedPath.ts',
  ],
} satisfies ModuleBoundary;
