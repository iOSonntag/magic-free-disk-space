import { describe, expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatManifestPath, placeSourceFile } from './findBoundaryViolations.js';
import { listSourcePaths } from './loadSourceImports.js';
import { boundaryConfig, moduleRegistry } from './moduleRegistry.js';

const repositoryDir = join(import.meta.dir, '../..');
const sourceDir = join(repositoryDir, 'src');

describe('the manifests of src/', () => {
  test('stand in every folder of src/', async () => {
    const entries = await readdir(sourceDir, { withFileTypes: true });
    const folderNames = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    const missingManifestPaths: string[] = [];

    for (const folderName of folderNames) {
      const manifestPath = formatManifestPath(folderName);

      if (!(await Bun.file(join(repositoryDir, manifestPath)).exists())) {
        missingManifestPaths.push(manifestPath);
      }
    }

    expect(
      missingManifestPaths.map(
        (manifestPath) =>
          `${manifestPath} is missing: declare the module's edges and surface there, and register it in test/architecture/moduleRegistry.ts`,
      ),
    ).toEqual([]);
  });

  test('are each registered under the folder that holds them', async () => {
    const manifestPaths = await Array.fromAsync(
      new Bun.Glob('**/boundary.ts').scan({ cwd: sourceDir }),
    );
    const loadedManifests: Record<string, unknown> = {};

    for (const manifestPath of manifestPaths) {
      const moduleName = manifestPath.split(/[\\/]/).slice(0, -1).join('/');
      const manifestModule: Record<string, unknown> = await import(
        pathToFileURL(join(sourceDir, manifestPath)).href
      );

      loadedManifests[moduleName] = manifestModule.moduleBoundary;
    }

    expect(Object.keys(loadedManifests).toSorted()).toEqual(Object.keys(moduleRegistry).toSorted());
    expect(loadedManifests).toEqual(moduleRegistry);
  });

  test('leave no root file of src/ outside the composition root and the shared root files', async () => {
    const entries = await readdir(sourceDir, { withFileTypes: true });
    const rootFileNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);

    expect(rootFileNames.toSorted()).toEqual(
      [...boundaryConfig.compositionRootFiles, ...boundaryConfig.sharedRootFiles].toSorted(),
    );
  });

  test('expose only files of their own module', async () => {
    const sourcePaths = await listSourcePaths({ repositoryDir: repositoryDir });
    const moduleFileKeys = new Set(
      sourcePaths.flatMap((sourcePath) => {
        const place = placeSourceFile({ path: sourcePath, config: boundaryConfig });

        return place.kind === 'module' ? [`${place.name}/${place.internalPath}`] : [];
      }),
    );
    const strayExposes = Object.entries(moduleRegistry).flatMap(([moduleName, boundary]) =>
      boundary.exposes
        .filter((internalPath) => !moduleFileKeys.has(`${moduleName}/${internalPath}`))
        .map(
          (internalPath) =>
            `${formatManifestPath(moduleName)} exposes '${internalPath}', which is no file of the module ${moduleName}`,
        ),
    );

    expect(strayExposes).toEqual([]);
  });
});
