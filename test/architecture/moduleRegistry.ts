import { moduleBoundary as bridgeBoundary } from '../../src/bridge/boundary.js';
import { moduleBoundary as catalogBoundary } from '../../src/catalog/boundary.js';
import { moduleBoundary as cliBoundary } from '../../src/cli/boundary.js';
import { moduleBoundary as deleteBoundary } from '../../src/delete/boundary.js';
import { moduleBoundary as environmentBoundary } from '../../src/environment/boundary.js';
import { moduleBoundary as exploreBoundary } from '../../src/explore/boundary.js';
import type { ModuleBoundary, ModuleName } from '../../src/moduleBoundary.js';
import { moduleBoundary as pathBoundary } from '../../src/path/boundary.js';
import { moduleBoundary as platformBoundary } from '../../src/platform/boundary.js';
import { moduleBoundary as platformDarwinBoundary } from '../../src/platform/darwin/boundary.js';
import { moduleBoundary as preferencesBoundary } from '../../src/preferences/boundary.js';
import { moduleBoundary as reportBoundary } from '../../src/report/boundary.js';
import { moduleBoundary as scanBoundary } from '../../src/scan/boundary.js';
import { moduleBoundary as systemBoundary } from '../../src/system/boundary.js';
import { moduleBoundary as toolsBoundary } from '../../src/tools/boundary.js';
import { moduleBoundary as updateBoundary } from '../../src/update/boundary.js';
import type { BoundaryConfig } from './findBoundaryViolations.js';

/** Each module of `src/`, by its folder below `src/`, with the manifest of its `boundary.ts`. */
export const moduleRegistry: Record<ModuleName, ModuleBoundary> = {
  bridge: bridgeBoundary,
  catalog: catalogBoundary,
  cli: cliBoundary,
  delete: deleteBoundary,
  environment: environmentBoundary,
  explore: exploreBoundary,
  path: pathBoundary,
  platform: platformBoundary,
  'platform/darwin': platformDarwinBoundary,
  preferences: preferencesBoundary,
  report: reportBoundary,
  scan: scanBoundary,
  system: systemBoundary,
  tools: toolsBoundary,
  update: updateBoundary,
};

/** The modules of `src/` and its root files, as the boundary rules read them. */
export const boundaryConfig: BoundaryConfig<ModuleName> = {
  modules: moduleRegistry,
  compositionRootFiles: ['bridgeMain.ts', 'main.ts'],
  sharedRootFiles: ['moduleBoundary.ts', 'result.ts'],
};
