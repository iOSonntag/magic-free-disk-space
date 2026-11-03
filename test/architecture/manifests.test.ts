import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatManifestPath, placeSourceFile } from './findBoundaryViolations.js';
import { loadSourcePaths } from './loadSourceImports.js';
import { boundaryConfig, moduleRegistry } from './moduleRegistry.js';

const repositoryDir = join(import.meta.dir, '../..');

const SOURCE_DIR_PREFIX = 'src/';
const MANIFEST_SUFFIX = '/boundary.ts';

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

async function createFixtureRepository(paths: string[]): Promise<string> {
  const fixtureDir = await mkdtemp(join(tmpdir(), 'manifests-'));

  for (const path of paths) {
    await mkdir(dirname(join(fixtureDir, path)), { recursive: true });
    await writeFile(join(fixtureDir, path), '');
  }

  return fixtureDir;
}

describe('the checks of the manifests', () => {
  const strayFilePaths = [
    'src/main.ts',
    'src/.DS_Store',
    'src/.main.ts.swp',
    'src/stale/.DS_Store',
  ];

  test('miss no manifest of a folder that holds no TypeScript file', async () => {
    const fixtureDir = await createFixtureRepository(strayFilePaths);

    try {
      expect(await findMissingManifestPaths({ repositoryDir: fixtureDir })).toEqual([]);
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  test('take no file of the root that is no TypeScript file, such as a .DS_Store', async () => {
    const fixtureDir = await createFixtureRepository(strayFilePaths);

    try {
      expect(await loadRootFileNames({ repositoryDir: fixtureDir })).toEqual(['main.ts']);
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  test('miss the manifest of a folder that holds a TypeScript file', async () => {
    const fixtureDir = await createFixtureRepository(['src/main.ts', 'src/scan/runScan.ts']);

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
    const manifestPaths = sourcePaths.filter((sourcePath) => sourcePath.endsWith(MANIFEST_SUFFIX));
    const loadedManifests: Record<string, unknown> = {};

    for (const manifestPath of manifestPaths) {
      const moduleName = manifestPath.slice(SOURCE_DIR_PREFIX.length, -MANIFEST_SUFFIX.length);
      const manifestModule: Record<string, unknown> = await import(
        pathToFileURL(join(repositoryDir, manifestPath)).href
      );

      loadedManifests[moduleName] = manifestModule.moduleBoundary;
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
