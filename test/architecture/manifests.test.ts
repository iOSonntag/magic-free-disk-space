import { describe, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  formatManifestPath,
  parseManifestModuleName,
  placeSourceFile,
  SOURCE_DIR_PREFIX,
} from './findBoundaryViolations.js';
import { createFixtureRepository } from './fixtureRepository.js';
import { loadSourcePaths } from './loadSourceImports.js';
import { boundaryConfig, moduleRegistry } from './moduleRegistry.js';

const repositoryDir = join(import.meta.dir, '../..');

/** The manifest path of each folder right below `src/` that holds a TypeScript file but no manifest. */
async function findMissingManifestPaths(params: { repositoryDir: string }): Promise<string[]> {
  const sourcePaths = await loadSourcePaths({ repositoryDir: params.repositoryDir });
  const folderNames = new Set(
    sourcePaths.flatMap((sourcePath) => {
      const sourceRelativePath = sourcePath.slice(SOURCE_DIR_PREFIX.length);
      const separatorIndex = sourceRelativePath.indexOf('/');

      return separatorIndex === -1 ? [] : [sourceRelativePath.slice(0, separatorIndex)];
    }),
  );

  return [...folderNames]
    .map((folderName) => formatManifestPath(folderName))
    .filter((manifestPath) => !sourcePaths.includes(manifestPath));
}

/** The names of the TypeScript files at the root of `src/`, sorted. */
async function loadRootFileNames(params: { repositoryDir: string }): Promise<string[]> {
  const sourcePaths = await loadSourcePaths({ repositoryDir: params.repositoryDir });

  return sourcePaths
    .map((sourcePath) => sourcePath.slice(SOURCE_DIR_PREFIX.length))
    .filter((sourceRelativePath) => !sourceRelativePath.includes('/'));
}

describe('the checks of the manifests', () => {
  const strayFilesByPath = {
    'src/main.ts': '',
    'src/.DS_Store': '',
    'src/.main.ts.swp': '',
    'src/stale/.DS_Store': '',
  };

  test('miss no manifest of a folder that holds no TypeScript file', async () => {
    const fixtureDir = await createFixtureRepository(strayFilesByPath);

    try {
      expect(await findMissingManifestPaths({ repositoryDir: fixtureDir })).toEqual([]);
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  test('take no file of the root that is no TypeScript file, such as a .DS_Store', async () => {
    const fixtureDir = await createFixtureRepository(strayFilesByPath);

    try {
      expect(await loadRootFileNames({ repositoryDir: fixtureDir })).toEqual(['main.ts']);
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  test('miss the manifest of a folder that holds a TypeScript file', async () => {
    const fixtureDir = await createFixtureRepository({
      'src/main.ts': '',
      'src/scan/runScan.ts': '',
    });

    try {
      expect(await findMissingManifestPaths({ repositoryDir: fixtureDir })).toEqual([
        'src/scan/boundary.ts',
      ]);
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });
});

describe('the manifests of src/', () => {
  test('stand in every folder of src/', async () => {
    const missingManifestPaths = await findMissingManifestPaths({ repositoryDir: repositoryDir });

    expect(
      missingManifestPaths.map(
        (manifestPath) =>
          `${manifestPath} is missing: declare the module's edges and surface there, and register it in test/architecture/moduleRegistry.ts`,
      ),
    ).toEqual([]);
  });

  test('are each registered under the folder that holds them', async () => {
    const sourcePaths = await loadSourcePaths({ repositoryDir: repositoryDir });
    const manifests = sourcePaths.flatMap((sourcePath) => {
      const moduleName = parseManifestModuleName(sourcePath);

      return moduleName === null ? [] : [{ moduleName: moduleName, sourcePath: sourcePath }];
    });
    const loadedManifests: Record<string, unknown> = {};

    for (const manifest of manifests) {
      const manifestModule: Record<string, unknown> = await import(
        pathToFileURL(join(repositoryDir, manifest.sourcePath)).href
      );

      loadedManifests[manifest.moduleName] = manifestModule.moduleBoundary;
    }

    expect(Object.keys(loadedManifests).toSorted()).toEqual(Object.keys(moduleRegistry).toSorted());
    expect(loadedManifests).toEqual(moduleRegistry);
  });

  test('leave no root file of src/ outside the composition root and the shared root files', async () => {
    expect(await loadRootFileNames({ repositoryDir: repositoryDir })).toEqual(
      [...boundaryConfig.compositionRootFiles, ...boundaryConfig.sharedRootFiles].toSorted(),
    );
  });

  test('expose only files of their own module', async () => {
    const sourcePaths = await loadSourcePaths({ repositoryDir: repositoryDir });
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
