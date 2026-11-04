import { beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { SuppressionBaseline } from '../../scripts/check/suppressionBaseline.js';
import {
  BOUNDARY_SUPPRESSIONS_PATH,
  findUnneededSuppressions,
  findUnsuppressedViolations,
  loadSuppressionBaseline,
} from '../../scripts/check/suppressionBaseline.js';
import type { BoundaryViolation } from './findBoundaryViolations.js';
import {
  findBoundaryViolations,
  findUnusedModuleEdges,
  findUnusedModuleExposes,
  formatManifestPath,
} from './findBoundaryViolations.js';
import type { SourceImport } from './loadSourceImports.js';
import { loadSourceImports } from './loadSourceImports.js';
import { boundaryConfig } from './moduleRegistry.js';

const repositoryDir = join(import.meta.dir, '../..');

describe('the module boundaries of src/', () => {
  let imports: SourceImport[];
  let violations: BoundaryViolation[];
  let baseline: SuppressionBaseline;

  beforeAll(async () => {
    imports = await loadSourceImports({ repositoryDir: repositoryDir });
    violations = findBoundaryViolations({ imports: imports, config: boundaryConfig });

    const loadedBaseline = await loadSuppressionBaseline(
      join(repositoryDir, BOUNDARY_SUPPRESSIONS_PATH),
    );

    if (loadedBaseline.kind === 'failed') {
      throw new Error(`${BOUNDARY_SUPPRESSIONS_PATH} is no baseline: ${loadedBaseline.failure}`);
    }

    baseline = loadedBaseline.value;
  });

  test(`every import across modules follows a declared edge into the surface of its target, or is frozen in ${BOUNDARY_SUPPRESSIONS_PATH}`, () => {
    const unsuppressed = findUnsuppressedViolations({ violations: violations, baseline: baseline });

    expect(unsuppressed.map((violation) => violation.message)).toEqual([]);
  });

  test(`${BOUNDARY_SUPPRESSIONS_PATH} counts no violation the code no longer holds`, () => {
    const unneeded = findUnneededSuppressions({ violations: violations, baseline: baseline });

    expect(
      unneeded.map(
        (suppression) =>
          `${BOUNDARY_SUPPRESSIONS_PATH} counts ${suppression.count} of ${suppression.rule} in ${suppression.filePath}, which holds ${suppression.violationCount}: lower the count, or remove the entry at 0`,
      ),
    ).toEqual([]);
  });

  test('every edge a manifest declares is followed by an import', () => {
    const unusedEdges = findUnusedModuleEdges({ imports: imports, config: boundaryConfig });

    expect(
      unusedEdges.map(
        (edge) =>
          `${formatManifestPath(edge.importerName)} declares '${edge.importedName}', which no file of ${edge.importerName} imports: remove it from its imports`,
      ),
    ).toEqual([]);
  });

  test('every file a manifest exposes is imported by another module or by an entry point', () => {
    const unusedExposes = findUnusedModuleExposes({ imports: imports, config: boundaryConfig });

    expect(
      unusedExposes.map(
        (expose) =>
          `${formatManifestPath(expose.moduleName)} exposes '${expose.internalPath}', which no other module and no entry point imports: remove it from its exposes`,
      ),
    ).toEqual([]);
  });
});
