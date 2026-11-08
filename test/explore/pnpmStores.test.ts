import type { Test } from 'bun:test';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, realpath, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import type { CatalogLocation } from '../../src/catalog/catalog.js';
import type { Environment, EnvironmentFolders } from '../../src/environment/buildEnvironment.js';
import {
  buildLocationBelow,
  resolveEnvironmentLocation,
  resolveEnvironmentLocations,
} from '../../src/environment/environmentLocation.js';
import type { ExploreProbePlatform } from '../../src/explore/exploreProbe.js';
import type {
  ExploreFileUnreadable,
  ExplorePathUnitPnpmStore,
} from '../../src/explore/exploreUnit.js';
import { buildPnpmStoreFindings } from '../../src/explore/pnpmStores/buildPnpmStoreFindings.js';
import { comparePnpmStoreUnit } from '../../src/explore/pnpmStores/comparePnpmStoreUnit.js';
import type { PnpmStoreOffers } from '../../src/explore/pnpmStores/decidePnpmStoreOffers.js';
import { decidePnpmStoreOffers } from '../../src/explore/pnpmStores/decidePnpmStoreOffers.js';
import type {
  PnpmInstall,
  PnpmInstallState,
} from '../../src/explore/pnpmStores/loadPnpmInstallState.js';
import { loadPnpmInstallState } from '../../src/explore/pnpmStores/loadPnpmInstallState.js';
import type { PnpmStoreState } from '../../src/explore/pnpmStores/loadPnpmStoreState.js';
import { mapPnpmMajorToStoreVersion } from '../../src/explore/pnpmStores/mapPnpmMajorToStoreVersion.js';
import type { PnpmPins } from '../../src/explore/pnpmStores/parsePnpmPins.js';
import { parsePnpmPins } from '../../src/explore/pnpmStores/parsePnpmPins.js';
import { parsePnpmVersionMajor } from '../../src/explore/pnpmStores/parsePnpmVersionMajor.js';
import type {
  ProjectPinFile,
  ProjectPinFileKind,
} from '../../src/explore/projectPins/projectPins.js';
import { recheckExplorePathUnit } from '../../src/explore/recheckExploreUnit.js';
import type { ExploreProbeOutcome } from '../../src/explore/startExploreProbes.js';
import { startExploreProbes } from '../../src/explore/startExploreProbes.js';
import { joinAbsolutePath } from '../../src/path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import { PROJECT_SEARCH_INCOMPLETE_EVIDENCE } from '../../src/platform/darwin/projectSearchEvidence.js';
import { win32Platform } from '../../src/platform/win32/win32Platform.js';
import type { Result } from '../../src/result.js';
import { testOnDarwin } from '../support/darwinOnly.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  buildTestWin32AppDataDirs,
  createFixtureDirectory,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  noKnownFolderPaths,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import {
  buildTestAbsolutePath,
  buildTestHostPath,
  buildTestPnpmStoreVersion,
} from '../support/parsedValueFixtures.js';
import { hostPlatform } from '../support/platformFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';
import { buildTestProbePlatform } from '../support/probePlatformFixtures.js';
import { buildRunningCommandLines } from '../support/runningProcessesFixtures.js';
import { describeOnWindows } from '../support/windowsOnly.js';
import { buildTestProbeStart } from './probeStartFixtures.js';
import {
  buildFoundProjectPinsLoad,
  buildTestPinFileText,
  buildTestPinFileUnfit,
  buildTestPinFileUnreadable,
  buildTestProjectPins,
} from './projectPinsFixtures.js';

const PNPM_PROCESS_COMMAND = '/opt/homebrew/bin/pnpm install';

const PROJECT_PATH = '/projects/app';

const NO_PINS: PnpmPins = { kind: 'majors', majors: [] };

const NO_INSTALLS: PnpmInstallState = { installs: [] };

const PNPM_11_INSTALL_ID = '1375b-1a0a4cad7f8';

/** A standalone executable of Windows, which starts with `MZ` and is no script. */
const WINDOWS_EXECUTABLE_TEXT = 'MZ executable';

let fixtureRoot: FixtureRoot;
let environment: Environment;
let probePlatform: ExploreProbePlatform;
let homeDir: AbsolutePath;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
  probePlatform = buildTestProbePlatform();
  homeDir = environment.homeDir;
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

/**
 * A path below pnpm's own home of the host, the first of its homes, in the fixture environment;
 * each of `names` may hold several names joined by `/`.
 */
function buildPnpmHomePath(params: { folders: EnvironmentFolders; names: string[] }): AbsolutePath {
  const [pnpmHomePath] = resolveEnvironmentLocations({
    folders: params.folders,
    locations: hostPlatform.explore.pnpmInstallPlaces.homes,
  });

  if (pnpmHomePath === undefined) {
    throw new Error('The host has no pnpm home.');
  }

  return joinAbsolutePath({
    rules: params.folders.pathRules,
    parentPath: pnpmHomePath,
    names: params.names.flatMap((name) => name.split('/')),
  });
}

/**
 * The folders of the fixture environment with Windows' AppData folders below its home, where the
 * fixture environment of Windows has them, so the places of Windows resolve and are read on any
 * host.
 */
function buildWindowsFixtureFolders(params: { folders: EnvironmentFolders }): EnvironmentFolders {
  return {
    pathRules: params.folders.pathRules,
    homeDir: params.folders.homeDir,
    tempDir: params.folders.tempDir,
    platformFolders: {
      kind: 'win32',
      appDataDirs: buildTestWin32AppDataDirs({ homeDir: params.folders.homeDir }),
      knownFolderPaths: noKnownFolderPaths,
    },
  };
}

/** The path of `location` in the folders of `buildWindowsFixtureFolders`. */
function buildWindowsPlacePath(params: {
  folders: EnvironmentFolders;
  location: CatalogLocation;
}): AbsolutePath {
  return resolveEnvironmentLocation({
    folders: buildWindowsFixtureFolders({ folders: params.folders }),
    location: params.location,
  });
}

/**
 * How pnpm lies at a place: in folders named by its versions, or as one package with its
 * package.json.
 */
type PnpmInstallLayout = 'versionFolders' | 'packageFolder';

/** A place of Windows where pnpm installs, by the words a test title names it with. */
type WindowsPnpmInstallPlace = {
  place: string;
  location: CatalogLocation;
  layout: PnpmInstallLayout;
};

const windowsPnpmInstallPlaces = {
  corepackV1: {
    place: "corepack's v1 folder in the local AppData",
    location: { root: 'localAppData', path: 'node/corepack/v1/pnpm' },
    layout: 'versionFolders',
  },
  corepack: {
    place: "corepack's folder in the local AppData",
    location: { root: 'localAppData', path: 'node/corepack/pnpm' },
    layout: 'versionFolders',
  },
  npmGlobalPnpm: {
    place: "npm's globals in the roaming AppData",
    location: { root: 'roamingAppData', path: 'npm/node_modules/pnpm' },
    layout: 'packageFolder',
  },
  npmGlobalPnpmExe: {
    place: "npm's globals of @pnpm/exe in the roaming AppData",
    location: { root: 'roamingAppData', path: 'npm/node_modules/@pnpm/exe' },
    layout: 'packageFolder',
  },
  nvmWindows2Node: {
    place: "npm's globals of a node version of nvm-windows 2",
    location: {
      root: 'localAppData',
      path: 'Author Software/nvm/installs/v22.1.0/node_modules/pnpm',
    },
    layout: 'packageFolder',
  },
  nvmWindows12Node: {
    place: "npm's globals of a node version of nvm-windows 1.2",
    location: { root: 'localAppData', path: 'nvm/v22.1.0/node_modules/pnpm' },
    layout: 'packageFolder',
  },
  nvmWindowsBefore12Node: {
    place: "npm's globals of a node version of nvm-windows before 1.2",
    location: { root: 'roamingAppData', path: 'nvm/v22.1.0/node_modules/pnpm' },
    layout: 'packageFolder',
  },
  fnmNode: {
    place: "npm's globals of a node version of fnm",
    location: {
      root: 'roamingAppData',
      path: 'fnm/node-versions/v22.1.0/installation/node_modules/pnpm',
    },
    layout: 'packageFolder',
  },
  fnmLegacyNode: {
    place: "npm's globals of a node version in fnm's legacy folder",
    location: { root: 'home', path: '.fnm/node-versions/v22.1.0/installation/node_modules/pnpm' },
    layout: 'packageFolder',
  },
  voltaNode: {
    place: "npm's globals of a node version of Volta",
    location: { root: 'localAppData', path: 'Volta/tools/image/node/22.1.0/node_modules/pnpm' },
    layout: 'packageFolder',
  },
  voltaPnpmPackage: {
    place: "Volta's package prefix of pnpm",
    location: { root: 'localAppData', path: 'Volta/tools/image/packages/pnpm/node_modules/pnpm' },
    layout: 'packageFolder',
  },
  voltaPnpmExePackage: {
    place: "Volta's package prefix of @pnpm/exe",
    location: {
      root: 'localAppData',
      path: 'Volta/tools/image/packages/@pnpm/exe/node_modules/@pnpm/exe',
    },
    layout: 'packageFolder',
  },
  voltaVersions: {
    place: "Volta's folder of pnpm versions",
    location: { root: 'localAppData', path: 'Volta/tools/image/pnpm' },
    layout: 'versionFolders',
  },
  scoopNodePrefix: {
    place: "npm's globals of Scoop's persisted node prefix",
    location: { root: 'home', path: 'scoop/persist/nodejs/bin/node_modules/pnpm' },
    layout: 'packageFolder',
  },
  scoopNodeLtsPrefix: {
    place: "npm's globals of Scoop's persisted node LTS prefix",
    location: { root: 'home', path: 'scoop/persist/nodejs-lts/bin/node_modules/pnpm' },
    layout: 'packageFolder',
  },
  scoopVersions: {
    place: "Scoop's folder of pnpm versions",
    location: { root: 'home', path: 'scoop/apps/pnpm' },
    layout: 'versionFolders',
  },
  miseNode: {
    place: "npm's globals of a node version of mise",
    location: { root: 'localAppData', path: 'mise/installs/node/22.1.0/node_modules/pnpm' },
    layout: 'packageFolder',
  },
  miseVersions: {
    place: "mise's folder of pnpm versions",
    location: { root: 'localAppData', path: 'mise/installs/pnpm' },
    layout: 'versionFolders',
  },
} satisfies Record<string, WindowsPnpmInstallPlace>;

/**
 * Installs pnpm `version` at `installPlace` below `folders`, and answers the path of the install.
 */
async function createWindowsPnpmInstall(params: {
  folders: EnvironmentFolders;
  installPlace: WindowsPnpmInstallPlace;
  version: string;
}): Promise<AbsolutePath> {
  switch (params.installPlace.layout) {
    case 'versionFolders': {
      const versionPath = resolveEnvironmentLocation({
        folders: params.folders,
        location: buildLocationBelow({
          location: params.installPlace.location,
          path: params.version,
        }),
      });
      await createFixtureDirectory({ path: versionPath });

      return versionPath;
    }
    case 'packageFolder': {
      const packagePath = resolveEnvironmentLocation({
        folders: params.folders,
        location: params.installPlace.location,
      });
      await writePnpmPackage({ packageFolder: packagePath, version: params.version });

      return packagePath;
    }
  }
}

/** A file of the example project at `PROJECT_PATH`, which no probe reads from the disk. */
function buildProjectFilePath(fileName: string): AbsolutePath {
  return buildTestAbsolutePath({ text: `${PROJECT_PATH}/${fileName}` });
}

async function createStoreFolders(params: {
  storeRoot: CatalogLocation;
  folderNames: string[];
}): Promise<AbsolutePath> {
  const storeRoot = resolveEnvironmentLocation({
    folders: environment,
    location: params.storeRoot,
  });

  for (const folderName of params.folderNames) {
    await createFixtureDirectory({ path: join(storeRoot, folderName) });
  }

  return storeRoot;
}

async function writePnpmPackage(params: { packageFolder: string; version: string }): Promise<void> {
  await writeFixtureTextFile({
    path: join(params.packageFolder, 'package.json'),
    text: JSON.stringify({ name: 'pnpm', version: params.version }),
  });
}

/** A package in `<storeRoot>/<storeFolderName>/links` and a relative link to it at `linkPath`. */
async function linkGlobalPackageIntoStore(params: {
  storeRoot: string;
  storeFolderName: string;
  packageName: string;
  linkPath: string;
}): Promise<void> {
  const packagePath = join(
    params.storeRoot,
    params.storeFolderName,
    'links/@',
    params.packageName,
    '1.0.0/0a1b2c/node_modules',
    params.packageName,
  );
  await createPackageLink({ packagePath: packagePath, linkPath: params.linkPath });
}

/** A package folder at `packagePath` and a relative link to it at `linkPath`. */
async function createPackageLink(params: { packagePath: string; linkPath: string }): Promise<void> {
  await createFixtureDirectory({ path: params.packagePath });
  await createFixtureDirectory({ path: dirname(params.linkPath) });
  await symlink(relative(dirname(params.linkPath), params.packagePath), params.linkPath);
}

function buildParsedInstall(params: { versionText: string; major: number }): PnpmInstall {
  return {
    kind: 'parsed',
    path: buildTestAbsolutePath({ text: `/installs/pnpm/${params.versionText}` }),
    versionText: params.versionText,
    major: params.major,
  };
}

/** A store at `/store`, whose folders named in `globalVirtualStoreFolderNames` hold one. */
function buildStoreState(params: {
  folderNames: string[];
  globalVirtualStoreFolderNames?: string[];
}): PnpmStoreState {
  const globalVirtualStoreFolderNames = params.globalVirtualStoreFolderNames ?? [];

  return {
    folders: params.folderNames.map((folderName) => {
      const folderPath = buildTestAbsolutePath({ text: `/store/${folderName}` });

      if (folderName === 'tmp') {
        return { kind: 'unparsed', folderPath: folderPath };
      }

      return {
        kind: 'parsed',
        folderPath: folderPath,
        storeVersion: buildTestPnpmStoreVersion({ text: folderName }),
        hasGlobalVirtualStore: globalVirtualStoreFolderNames.includes(folderName),
      };
    }),
  };
}

function listOfferedStoreVersions(params: { offers: PnpmStoreOffers }): string[] {
  return params.offers.offers.map((offer) => offer.storeVersion);
}

function parseOnePin(params: { kind: ProjectPinFileKind; text: string }): PnpmPins {
  return parsePnpmPins({
    files: [
      {
        path: buildProjectFilePath('pin'),
        kind: params.kind,
        text: params.text,
      },
    ],
  });
}

describe('parsePnpmVersionMajor', () => {
  const majorCases: { text: string; major: number }[] = [
    { text: '10.22.0_1', major: 10 },
    { text: '11.0.0-rc.1', major: 11 },
    { text: '12', major: 12 },
    { text: '11.1', major: 11 },
    { text: '10.14.0+sha512.abc', major: 10 },
  ];

  for (const majorCase of majorCases) {
    test(`reads the major of ${majorCase.text}`, () => {
      expect(parsePnpmVersionMajor({ text: majorCase.text })).toBe(majorCase.major);
    });
  }

  for (const text of ['latest', '~10', 'v10', '10.1.2.3', 'prefix:10', '']) {
    test(`reads no major of "${text}"`, () => {
      expect(parsePnpmVersionMajor({ text: text })).toBeNull();
    });
  }
});

describe('mapPnpmMajorToStoreVersion', () => {
  const storeVersionCases: { major: number; storeVersion: string }[] = [
    { major: 7, storeVersion: 'v3' },
    { major: 9, storeVersion: 'v3' },
    { major: 10, storeVersion: 'v10' },
    { major: 11, storeVersion: 'v11' },
    { major: 12, storeVersion: 'v11' },
  ];

  for (const storeVersionCase of storeVersionCases) {
    test(`maps ${storeVersionCase.major} to ${storeVersionCase.storeVersion}`, () => {
      expect(mapPnpmMajorToStoreVersion({ major: storeVersionCase.major })).toBe(
        buildTestPnpmStoreVersion({ text: storeVersionCase.storeVersion }),
      );
    });
  }

  for (const major of [6, 13]) {
    test(`maps ${major}, outside the table, to null`, () => {
      expect(mapPnpmMajorToStoreVersion({ major: major })).toBeNull();
    });
  }
});

describe('parsePnpmPins', () => {
  const majorsCases: { kind: ProjectPinFileKind; text: string; majors: number[] }[] = [
    { kind: 'packageJson', text: '{"packageManager": "pnpm@10.14.0"}', majors: [10] },
    { kind: 'packageJson', text: '{"packageManager": "pnpm@11.1.2+sha512.0a1b"}', majors: [11] },
    { kind: 'packageJson', text: '{"packageManager": "yarn@4.1.0"}', majors: [] },
    { kind: 'packageJson', text: '{"name": "app"}', majors: [] },
    {
      kind: 'packageJson',
      text: JSON.stringify({
        devEngines: { packageManager: { name: 'pnpm', version: '10.14.0' } },
      }),
      majors: [10],
    },
    {
      kind: 'packageJson',
      text: JSON.stringify({
        devEngines: {
          packageManager: [
            { name: 'npm', version: '10.9.0' },
            { name: 'pnpm', version: '11.1.2', onFail: 'download' },
          ],
        },
      }),
      majors: [11],
    },
    {
      kind: 'packageJson',
      text: JSON.stringify({ devEngines: { packageManager: { name: 'npm', version: '10.9.0' } } }),
      majors: [],
    },
    {
      kind: 'packageJson',
      text: JSON.stringify({ devEngines: { runtime: { name: 'node', version: '22.1.0' } } }),
      majors: [],
    },
    {
      kind: 'packageJson',
      text: JSON.stringify({
        packageManager: 'pnpm@11.1.2',
        devEngines: { packageManager: { name: 'pnpm', version: '10.14.0' } },
      }),
      majors: [10, 11],
    },
    { kind: 'toolVersions', text: 'nodejs 22.1.0\npnpm 10.8.1 9.15.9 # two\n', majors: [9, 10] },
    { kind: 'miseConfig', text: '[tools]\npnpm = "12"\n', majors: [12] },
    { kind: 'miseConfig', text: '[tools]\n"npm:pnpm" = ["11.1", "12"] # both\n', majors: [11, 12] },
    { kind: 'miseConfig', text: "[tools]\n'aqua:pnpm/pnpm' = '10.22.0'\n", majors: [10] },
    {
      kind: 'miseConfig',
      text: '[tools."npm:pnpm"]\nversion = "10"\nos = ["macos"]\n',
      majors: [10],
    },
    { kind: 'miseConfig', text: '[tools]\nnode = "22"\n[env]\npnpm = "latest"\n', majors: [] },
    { kind: 'miseConfig', text: 'tools.pnpm = "10"\n[env]\nNODE_ENV = "dev"\n', majors: [10] },
    { kind: 'miseConfig', text: 'tools."npm:pnpm" = ["11.1"]\n', majors: [11] },
    { kind: 'miseConfig', text: '[settings]\ntools.pnpm = "latest"\n', majors: [] },
    { kind: 'nvmrc', text: 'pnpm@latest', majors: [] },
  ];
  const pluginKeyCases: { key: string; version: string }[] = [
    { key: '"asdf:jonathanmorley/asdf-pnpm"', version: '8.15.9' },
    { key: '"ubi:pnpm/pnpm[exe=pnpm]"', version: '8' },
    { key: '"vfox:version-fox/vfox-pnpm"', version: '8' },
  ];

  for (const pluginKeyCase of pluginKeyCases) {
    majorsCases.push(
      {
        kind: 'miseConfig',
        text: `[tools]\n${pluginKeyCase.key} = "${pluginKeyCase.version}"\n`,
        majors: [8],
      },
      {
        kind: 'miseConfig',
        text: `[tools.${pluginKeyCase.key}]\nversion = "${pluginKeyCase.version}"\n`,
        majors: [8],
      },
    );
  }

  for (const majorsCase of majorsCases) {
    test(`reads the ${majorsCase.kind} ${JSON.stringify(majorsCase.text)}`, () => {
      expect(parseOnePin({ kind: majorsCase.kind, text: majorsCase.text })).toEqual({
        kind: 'majors',
        majors: majorsCase.majors,
      });
    });
  }

  const everyStoreVersionCases: { kind: ProjectPinFileKind; text: string }[] = [
    { kind: 'packageJson', text: '{"packageManager": "pnpm"}' },
    { kind: 'packageJson', text: '{"packageManager": "pnpm@latest"}' },
    { kind: 'packageJson', text: '{"packageManager": 10}' },
    { kind: 'packageJson', text: '{ not json' },
    {
      kind: 'packageJson',
      text: JSON.stringify({
        devEngines: {
          packageManager: { name: 'pnpm', version: '>=12.0.0 <13.0.0', onFail: 'download' },
        },
      }),
    },
    {
      kind: 'packageJson',
      text: JSON.stringify({ devEngines: { packageManager: { name: 'pnpm' } } }),
    },
    {
      kind: 'packageJson',
      text: JSON.stringify({ devEngines: { packageManager: { name: 'PNPM', version: '^10' } } }),
    },
    { kind: 'packageJson', text: JSON.stringify({ devEngines: { packageManager: 'pnpm' } }) },
    {
      kind: 'packageJson',
      text: JSON.stringify({ devEngines: { packageManager: { version: '10.14.0' } } }),
    },
    { kind: 'packageJson', text: JSON.stringify({ devEngines: 1 }) },
    { kind: 'toolVersions', text: 'pnpm latest' },
    { kind: 'toolVersions', text: 'pnpm ref:main' },
    { kind: 'toolVersions', text: 'pnpm system' },
    { kind: 'miseConfig', text: '[tools]\npnpm = "latest"\n' },
    { kind: 'miseConfig', text: 'tools = { pnpm = "10" }\n' },
    { kind: 'miseConfig', text: 'tools = { "aqua:PNPM/PNPM" = "10" }\n' },
    { kind: 'miseConfig', text: '[tools]\npnpm = "prefix:10"\n' },
    { kind: 'miseConfig', text: '[tools]\npnpm = { version = "10" }\n' },
    { kind: 'miseConfig', text: '[tools]\npnpm = [\n  "10",\n]\n' },
    { kind: 'miseConfig', text: '[tools."npm:pnpm"]\nos = ["macos"]\n' },
    { kind: 'miseConfig', text: '[tools."npm:pnpm"]\n[tools.node]\nversion = "22"\n' },
  ];

  for (const everyCase of everyStoreVersionCases) {
    test(`pins every store version for the ${everyCase.kind} ${JSON.stringify(everyCase.text)}`, () => {
      expect(parseOnePin({ kind: everyCase.kind, text: everyCase.text })).toEqual({
        kind: 'everyStoreVersion',
      });
    });
  }
});

describe('decidePnpmStoreOffers', () => {
  test('offers each store version no installed or pinned pnpm uses', () => {
    const offers = decidePnpmStoreOffers({
      storeState: buildStoreState({ folderNames: ['v2', 'v3'] }),
      installState: NO_INSTALLS,
      pins: NO_PINS,
    });

    expect(listOfferedStoreVersions({ offers: offers })).toEqual(['v2', 'v3']);
    expect(offers.isComplete).toBe(true);
  });

  test('keeps a store version an installed pnpm uses, and is not complete', () => {
    const offers = decidePnpmStoreOffers({
      storeState: buildStoreState({ folderNames: ['v3', 'v10'] }),
      installState: {
        installs: [
          buildParsedInstall({ versionText: '10.14.0', major: 10 }),
          buildParsedInstall({ versionText: '10.14.0', major: 10 }),
        ],
      },
      pins: NO_PINS,
    });

    expect(offers).toEqual({
      offers: [
        {
          folderPath: buildTestAbsolutePath({ text: '/store/v3' }),
          storeVersion: buildTestPnpmStoreVersion({ text: 'v3' }),
        },
      ],
      installedVersions: [
        { versionText: '10.14.0', storeVersion: buildTestPnpmStoreVersion({ text: 'v10' }) },
      ],
      isComplete: false,
    });
  });

  test('keeps a store version a pinned pnpm uses', () => {
    const offers = decidePnpmStoreOffers({
      storeState: buildStoreState({ folderNames: ['v3', 'v11'] }),
      installState: NO_INSTALLS,
      pins: { kind: 'majors', majors: [12] },
    });

    expect(listOfferedStoreVersions({ offers: offers })).toEqual(['v3']);
    expect(offers.isComplete).toBe(false);
  });

  test('never offers a folder whose name is no store version, and is not complete', () => {
    const offers = decidePnpmStoreOffers({
      storeState: buildStoreState({ folderNames: ['tmp', 'v2'] }),
      installState: NO_INSTALLS,
      pins: NO_PINS,
    });

    expect(listOfferedStoreVersions({ offers: offers })).toEqual(['v2']);
    expect(offers.isComplete).toBe(false);
  });

  test('keeps a store folder that holds a global virtual store, and is not complete', () => {
    const offers = decidePnpmStoreOffers({
      storeState: buildStoreState({
        folderNames: ['v10', 'v11'],
        globalVirtualStoreFolderNames: ['v11'],
      }),
      installState: NO_INSTALLS,
      pins: NO_PINS,
    });

    expect(listOfferedStoreVersions({ offers: offers })).toEqual(['v10']);
    expect(offers.isComplete).toBe(false);
  });

  const heldBackCases: { name: string; installState: PnpmInstallState; pins: PnpmPins }[] = [
    {
      name: 'an installed version that does not parse',
      installState: {
        installs: [
          { kind: 'unparsed', path: buildTestAbsolutePath({ text: '/installs/pnpm/odd' }) },
        ],
      },
      pins: NO_PINS,
    },
    {
      name: 'an installed major outside the table',
      installState: { installs: [buildParsedInstall({ versionText: '13.0.0', major: 13 })] },
      pins: NO_PINS,
    },
    {
      name: 'a pinned major outside the table',
      installState: NO_INSTALLS,
      pins: { kind: 'majors', majors: [6] },
    },
    {
      name: 'a pin of every store version',
      installState: NO_INSTALLS,
      pins: { kind: 'everyStoreVersion' },
    },
  ];

  for (const heldBackCase of heldBackCases) {
    test(`holds back every folder for ${heldBackCase.name}`, () => {
      const offers = decidePnpmStoreOffers({
        storeState: buildStoreState({ folderNames: ['v2'] }),
        installState: heldBackCase.installState,
        pins: heldBackCase.pins,
      });

      expect(offers).toEqual({ offers: [], installedVersions: [], isComplete: false });
    });
  }

  test('is complete for an empty store, whatever is held back', () => {
    const offers = decidePnpmStoreOffers({
      storeState: { folders: [] },
      installState: NO_INSTALLS,
      pins: { kind: 'everyStoreVersion' },
    });

    expect(offers).toEqual({ offers: [], installedVersions: [], isComplete: true });
  });
});

describe('buildPnpmStoreFindings', () => {
  const storeRoot = buildTestAbsolutePath({ text: '/store' });
  const folderPath = buildTestAbsolutePath({ text: '/store/v3' });
  const storeVersion = buildTestPnpmStoreVersion({ text: 'v3' });

  test('builds a careful finding with its evidence and the incomplete-search line', () => {
    const pinFile = buildTestPinFileText({
      path: buildProjectFilePath('package.json'),
      kind: 'packageJson',
      text: '{}',
    });
    const findings = buildPnpmStoreFindings({
      offers: {
        offers: [{ folderPath: folderPath, storeVersion: storeVersion }],
        installedVersions: [
          { versionText: '10.14.0', storeVersion: buildTestPnpmStoreVersion({ text: 'v10' }) },
          { versionText: '11.1.2', storeVersion: buildTestPnpmStoreVersion({ text: 'v11' }) },
        ],
        isComplete: false,
      },
      storeRoot: storeRoot,
      pinFiles: [{ path: pinFile.path, kind: pinFile.kind }],
      projectPins: buildTestProjectPins({ files: [pinFile], isWalkComplete: false }),
      runningProcesses: buildRunningCommandLines([]),
      projectSearchIncompleteEvidence: PROJECT_SEARCH_INCOMPLETE_EVIDENCE,
    });

    expect(findings).toEqual({
      findings: [
        {
          unit: {
            kind: 'pnpmStore',
            storeRoot: storeRoot,
            folderPath: folderPath,
            storeVersion: storeVersion,
            pinFiles: [{ path: pinFile.path, kind: 'packageJson' }],
          },
          title: 'pnpm store v3',
          explanation: expect.stringContaining('the space freed can be less than shown'),
          regeneration: expect.any(String),
          risk: 'careful',
          evidenceLines: [
            'Installed pnpm: 10.14.0 (store v10), 11.1.2 (store v11).',
            'None of the `package.json`, `.tool-versions`, and mise configs found (1) pins a pnpm that uses v3.',
            PROJECT_SEARCH_INCOMPLETE_EVIDENCE,
          ],
          displayPath: '/store/v3',
          activity: 'idle',
        },
      ],
      isComplete: false,
    });
  });

  test('says no pnpm was found, and is busy while pnpm runs', () => {
    const findings = buildPnpmStoreFindings({
      offers: {
        offers: [{ folderPath: folderPath, storeVersion: storeVersion }],
        installedVersions: [],
        isComplete: true,
      },
      storeRoot: storeRoot,
      pinFiles: [],
      projectPins: buildTestProjectPins({ files: [] }),
      runningProcesses: buildRunningCommandLines([PNPM_PROCESS_COMMAND]),
      projectSearchIncompleteEvidence: PROJECT_SEARCH_INCOMPLETE_EVIDENCE,
    });

    expect(findings.findings).toEqual([
      expect.objectContaining({
        evidenceLines: [
          'Installed pnpm: none found.',
          'None of the `package.json`, `.tool-versions`, and mise configs found (0) pins a pnpm that uses v3.',
        ],
        activity: 'busy',
      }),
    ]);
  });
});

describe('comparePnpmStoreUnit', () => {
  const unit: ExplorePathUnitPnpmStore = {
    kind: 'pnpmStore',
    storeRoot: buildTestAbsolutePath({ text: '/store' }),
    folderPath: buildTestAbsolutePath({ text: '/store/v3' }),
    storeVersion: buildTestPnpmStoreVersion({ text: 'v3' }),
    pinFiles: [],
  };

  test('is unchanged while the folder is still offered and no pnpm runs', () => {
    expect(
      comparePnpmStoreUnit({
        unit: unit,
        storeState: buildStoreState({ folderNames: ['v3'] }),
        installState: NO_INSTALLS,
        pins: NO_PINS,
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'unchanged' });
  });

  test('is changed once a pnpm of its store version is installed', () => {
    expect(
      comparePnpmStoreUnit({
        unit: unit,
        storeState: buildStoreState({ folderNames: ['v3'] }),
        installState: { installs: [buildParsedInstall({ versionText: '9.15.9', major: 9 })] },
        pins: NO_PINS,
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('is busy while pnpm runs', () => {
    expect(
      comparePnpmStoreUnit({
        unit: unit,
        storeState: buildStoreState({ folderNames: ['v3'] }),
        installState: NO_INSTALLS,
        pins: NO_PINS,
        runningProcesses: buildRunningCommandLines([PNPM_PROCESS_COMMAND]),
      }),
    ).toEqual({ kind: 'busy' });
  });
});

describe('loadPnpmInstallState', () => {
  testOnDarwin('reads the Cellar folders and the npm globals of each Homebrew prefix', async () => {
    const prefixPath = buildTestHostPath({ text: join(fixtureRoot.rootDir, 'homebrew') });
    const cellarPath = join(prefixPath, 'Cellar', 'pnpm', '10.14.0_1');
    const npmGlobalPath = join(prefixPath, 'lib', 'node_modules', 'pnpm');
    await createFixtureDirectory({ path: cellarPath });
    await writePnpmPackage({ packageFolder: npmGlobalPath, version: '9.15.4' });

    expect(
      await loadPnpmInstallState({
        environment: environment,
        places: probePlatform.explore.pnpmInstallPlaces,
        homebrewPrefixPaths: [prefixPath],
        privacyDenialCode: probePlatform.privacyDenialCode,
      }),
    ).toEqual({
      kind: 'succeeded',
      value: {
        installs: [
          {
            kind: 'parsed',
            path: buildTestHostPath({ text: cellarPath }),
            versionText: '10.14.0_1',
            major: 10,
          },
          {
            kind: 'parsed',
            path: buildTestHostPath({ text: npmGlobalPath }),
            versionText: '9.15.4',
            major: 9,
          },
        ],
      },
    });
  });

  test('keeps a global package.json with no version as an install without a version', async () => {
    const packageFolder = buildPnpmHomePath({
      folders: environment,
      names: ['global/5/node_modules/pnpm'],
    });
    await writeFixtureTextFile({
      path: join(packageFolder, 'package.json'),
      text: '{"name": "pnpm"}',
    });

    expect(
      await loadPnpmInstallState({
        environment: environment,
        places: probePlatform.explore.pnpmInstallPlaces,
        homebrewPrefixPaths: [],
        privacyDenialCode: probePlatform.privacyDenialCode,
      }),
    ).toEqual({
      kind: 'succeeded',
      value: {
        installs: [
          { kind: 'unparsed', path: buildTestHostPath({ text: await realpath(packageFolder) }) },
        ],
      },
    });
  });

  describe("at pnpm's places of Windows", () => {
    async function loadWindowsInstallState(): Promise<
      Result<PnpmInstallState, ExploreFileUnreadable>
    > {
      return loadPnpmInstallState({
        environment: buildWindowsFixtureFolders({ folders: environment }),
        places: win32Platform.explore.pnpmInstallPlaces,
        homebrewPrefixPaths: [],
        privacyDenialCode: probePlatform.privacyDenialCode,
      });
    }

    function createFixtureInstall(params: {
      installPlace: WindowsPnpmInstallPlace;
      version: string;
    }): Promise<AbsolutePath> {
      return createWindowsPnpmInstall({
        folders: buildWindowsFixtureFolders({ folders: environment }),
        installPlace: params.installPlace,
        version: params.version,
      });
    }

    test('reads the standalone pnpm.exe in pnpm home and in its bin as installs of no known version', async () => {
      const homeExePath = buildWindowsPlacePath({
        folders: environment,
        location: { root: 'localAppData', path: 'pnpm/pnpm.exe' },
      });
      const binExePath = buildWindowsPlacePath({
        folders: environment,
        location: { root: 'localAppData', path: 'pnpm/bin/pnpm.exe' },
      });
      await writeFixtureTextFile({ path: homeExePath, text: WINDOWS_EXECUTABLE_TEXT });
      await writeFixtureTextFile({ path: binExePath, text: WINDOWS_EXECUTABLE_TEXT });

      expect(await loadWindowsInstallState()).toEqual({
        kind: 'succeeded',
        value: {
          installs: [
            { kind: 'unparsed', path: homeExePath },
            { kind: 'unparsed', path: binExePath },
          ],
        },
      });
    });

    test("reads the pnpm.exe of winget's portable package as an install of no known version", async () => {
      const wingetExePath = buildWindowsPlacePath({
        folders: environment,
        location: {
          root: 'localAppData',
          path: 'Microsoft/WinGet/Packages/pnpm.pnpm_Microsoft.Winget.Source_8wekyb3d8bbwe/pnpm.exe',
        },
      });
      await writeFixtureTextFile({ path: wingetExePath, text: WINDOWS_EXECUTABLE_TEXT });

      expect(await loadWindowsInstallState()).toEqual({
        kind: 'succeeded',
        value: { installs: [{ kind: 'unparsed', path: wingetExePath }] },
      });
    });

    test('counts the pnpm.cmd and pnpm.ps1 shims in pnpm home for nothing', async () => {
      await writeFixtureTextFile({
        path: buildWindowsPlacePath({
          folders: environment,
          location: { root: 'localAppData', path: 'pnpm/pnpm.cmd' },
        }),
        text: '@SETLOCAL\r\n@"%~dp0\\.tools\\pnpm\\10.14.0\\bin\\pnpm.cmd" %*\r\n',
      });
      await writeFixtureTextFile({
        path: buildWindowsPlacePath({
          folders: environment,
          location: { root: 'localAppData', path: 'pnpm/pnpm.ps1' },
        }),
        text: '& "$PSScriptRoot\\.tools\\pnpm\\10.14.0\\bin\\pnpm.ps1" $args\r\n',
      });

      expect(await loadWindowsInstallState()).toEqual({ kind: 'succeeded', value: NO_INSTALLS });
    });

    test("reads npm's global pnpm and @pnpm/exe in the roaming AppData by their package.json", async () => {
      const pnpmPackagePath = await createFixtureInstall({
        installPlace: windowsPnpmInstallPlaces.npmGlobalPnpm,
        version: '10.14.0',
      });
      const exePackagePath = await createFixtureInstall({
        installPlace: windowsPnpmInstallPlaces.npmGlobalPnpmExe,
        version: '9.15.4',
      });

      expect(await loadWindowsInstallState()).toEqual({
        kind: 'succeeded',
        value: {
          installs: [
            { kind: 'parsed', path: pnpmPackagePath, versionText: '10.14.0', major: 10 },
            { kind: 'parsed', path: exePackagePath, versionText: '9.15.4', major: 9 },
          ],
        },
      });
    });

    test("reads corepack's pnpm versions in the local AppData, in either of its layouts", async () => {
      const v1VersionPath = await createFixtureInstall({
        installPlace: windowsPnpmInstallPlaces.corepackV1,
        version: '10.14.0',
      });
      const versionPath = await createFixtureInstall({
        installPlace: windowsPnpmInstallPlaces.corepack,
        version: '9.15.4',
      });

      expect(await loadWindowsInstallState()).toEqual({
        kind: 'succeeded',
        value: {
          installs: [
            { kind: 'parsed', path: v1VersionPath, versionText: '10.14.0', major: 10 },
            { kind: 'parsed', path: versionPath, versionText: '9.15.4', major: 9 },
          ],
        },
      });
    });

    test("reads the pnpm versions of Volta's, Scoop's and mise's folders of pnpm", async () => {
      const voltaVersionPath = await createFixtureInstall({
        installPlace: windowsPnpmInstallPlaces.voltaVersions,
        version: '10.14.0',
      });
      const scoopVersionPath = await createFixtureInstall({
        installPlace: windowsPnpmInstallPlaces.scoopVersions,
        version: '9.15.4',
      });
      const miseVersionPath = await createFixtureInstall({
        installPlace: windowsPnpmInstallPlaces.miseVersions,
        version: '8.15.9',
      });

      expect(await loadWindowsInstallState()).toEqual({
        kind: 'succeeded',
        value: {
          installs: [
            { kind: 'parsed', path: voltaVersionPath, versionText: '10.14.0', major: 10 },
            { kind: 'parsed', path: scoopVersionPath, versionText: '9.15.4', major: 9 },
            { kind: 'parsed', path: miseVersionPath, versionText: '8.15.9', major: 8 },
          ],
        },
      });
    });

    test("reads npm's global pnpm below Scoop's persisted prefixes and Volta's package prefixes", async () => {
      const installPlaces = [
        windowsPnpmInstallPlaces.scoopNodePrefix,
        windowsPnpmInstallPlaces.scoopNodeLtsPrefix,
        windowsPnpmInstallPlaces.voltaPnpmPackage,
        windowsPnpmInstallPlaces.voltaPnpmExePackage,
      ];
      const packagePaths = await Promise.all(
        installPlaces.map((installPlace) =>
          createFixtureInstall({ installPlace: installPlace, version: '10.14.0' }),
        ),
      );

      expect(await loadWindowsInstallState()).toEqual({
        kind: 'succeeded',
        value: {
          installs: packagePaths.map((packagePath) => ({
            kind: 'parsed',
            path: packagePath,
            versionText: '10.14.0',
            major: 10,
          })),
        },
      });
    });

    const nodeVersionPackagePlaces: { manager: string; installPlace: WindowsPnpmInstallPlace }[] = [
      { manager: 'nvm-windows 2', installPlace: windowsPnpmInstallPlaces.nvmWindows2Node },
      { manager: 'nvm-windows 1.2', installPlace: windowsPnpmInstallPlaces.nvmWindows12Node },
      {
        manager: 'nvm-windows before 1.2',
        installPlace: windowsPnpmInstallPlaces.nvmWindowsBefore12Node,
      },
      { manager: 'fnm', installPlace: windowsPnpmInstallPlaces.fnmNode },
      { manager: "fnm's legacy folder", installPlace: windowsPnpmInstallPlaces.fnmLegacyNode },
      { manager: 'Volta', installPlace: windowsPnpmInstallPlaces.voltaNode },
      { manager: 'mise', installPlace: windowsPnpmInstallPlaces.miseNode },
    ];

    for (const packagePlace of nodeVersionPackagePlaces) {
      test(`reads npm's global pnpm of a node version of ${packagePlace.manager}`, async () => {
        const packageFolder = await createFixtureInstall({
          installPlace: packagePlace.installPlace,
          version: '10.14.0',
        });

        expect(await loadWindowsInstallState()).toEqual({
          kind: 'succeeded',
          value: {
            installs: [
              {
                kind: 'parsed',
                // The probe reads each node's folder at its real path, as the fixture root may lie
                // below a link.
                path: buildTestHostPath({ text: await realpath(packageFolder) }),
                versionText: '10.14.0',
                major: 10,
              },
            ],
          },
        });
      });
    }

    const unreadablePlaces: { place: string; createUnreadablePlace: () => Promise<string> }[] = [
      {
        place: "corepack's folder of pnpm",
        createUnreadablePlace: async () => {
          const corepackPnpmPath = buildWindowsPlacePath({
            folders: environment,
            location: windowsPnpmInstallPlaces.corepackV1.location,
          });
          await createFixtureDirectory({ path: corepackPnpmPath });
          await chmod(corepackPnpmPath, 0o000);

          return corepackPnpmPath;
        },
      },
      {
        place: "npm's global pnpm",
        createUnreadablePlace: async () => {
          const packagePath = await createFixtureInstall({
            installPlace: windowsPnpmInstallPlaces.npmGlobalPnpm,
            version: '10.14.0',
          });
          await chmod(packagePath, 0o000);

          return join(packagePath, 'package.json');
        },
      },
      {
        place: 'the standalone pnpm.exe',
        createUnreadablePlace: async () => {
          const exePath = buildWindowsPlacePath({
            folders: environment,
            location: { root: 'localAppData', path: 'pnpm/pnpm.exe' },
          });
          await writeFixtureTextFile({ path: exePath, text: WINDOWS_EXECUTABLE_TEXT });
          await chmod(exePath, 0o000);

          return exePath;
        },
      },
    ];

    for (const unreadablePlace of unreadablePlaces) {
      testOnPosix(
        `fails at ${unreadablePlace.place} it cannot read, never as no pnpm`,
        async () => {
          const unreadablePath = await unreadablePlace.createUnreadablePlace();

          expect(await loadWindowsInstallState()).toEqual({
            kind: 'failed',
            failure: {
              reason: 'fileUnreadable',
              path: unreadablePath,
              failure: { reason: 'permissionDenied', code: 'EACCES' },
            },
          });
        },
      );
    }
  });
});

type StoreVersionsOffered = { storeVersions: string[]; isComplete: boolean };

type StoreProbeCase = { probeId: 'pnpmStores' | 'pnpmStoresXdg'; storeRoot: CatalogLocation };

/** The store probes of the host; the XDG store is a place only where pnpm has a default for it. */
function listHostStoreProbeCases(): StoreProbeCase[] {
  const defaultCase: StoreProbeCase = {
    probeId: 'pnpmStores',
    storeRoot: hostPlatform.explore.pnpmStoreRoot,
  };

  if (hostPlatform.explore.pnpmXdgStoreRoot === null) {
    return [defaultCase];
  }

  return [
    defaultCase,
    { probeId: 'pnpmStoresXdg', storeRoot: hostPlatform.explore.pnpmXdgStoreRoot },
  ];
}

const probeCases = listHostStoreProbeCases();

for (const probeCase of probeCases) {
  describe(`the probe ${probeCase.probeId}`, () => {
    async function runProbe(params: { files: ProjectPinFile[] }): Promise<ExploreProbeOutcome> {
      const probes = startExploreProbes(
        buildTestProbeStart({
          environment: environment,
          platform: probePlatform,
          projectPins: buildFoundProjectPinsLoad({ files: params.files }),
        }),
      );

      return probes.outcomes[probeCase.probeId];
    }

    async function loadOfferedVersions(params: {
      files: ProjectPinFile[];
    }): Promise<StoreVersionsOffered | ExploreProbeOutcome> {
      const outcome = await runProbe({ files: params.files });

      if (outcome.kind !== 'probed') {
        return outcome;
      }

      const storeVersions = outcome.findings.flatMap((finding) =>
        finding.unit.kind === 'pnpmStore' ? [finding.unit.storeVersion] : [],
      );

      return { storeVersions: storeVersions, isComplete: outcome.isComplete };
    }

    async function createStore(params: { folderNames: string[] }): Promise<AbsolutePath> {
      return createStoreFolders({
        storeRoot: probeCase.storeRoot,
        folderNames: params.folderNames,
      });
    }

    test('offers an unused store folder', async () => {
      const storeRoot = await createStore({ folderNames: ['v3'] });

      expect(await runProbe({ files: [] })).toEqual({
        kind: 'probed',
        findings: [
          expect.objectContaining({
            unit: {
              kind: 'pnpmStore',
              storeRoot: storeRoot,
              folderPath: buildTestHostPath({ text: join(storeRoot, 'v3') }),
              storeVersion: buildTestPnpmStoreVersion({ text: 'v3' }),
              pinFiles: [],
            },
            risk: 'careful',
          }),
        ],
        isComplete: true,
      });
    });

    test('is judged with no findings when the store root is missing', async () => {
      expect(await runProbe({ files: [] })).toEqual({
        kind: 'probed',
        findings: [],
        isComplete: true,
      });
    });

    // asdf, mise, nvm, corepack's cache, Homebrew, the XDG home, and the launcher script keep pnpm
    // at places of macOS, so their rows run on macOS alone; the places of Windows have tests of
    // their own.
    const installPlaces: {
      place: string;
      testOfPlace: Test<[]>;
      createInstall: () => Promise<void>;
    }[] = [
      {
        place: 'asdf',
        testOfPlace: testOnDarwin,
        createInstall: () =>
          createFixtureDirectory({ path: join(homeDir, '.asdf/installs/pnpm/10.8.1') }),
      },
      {
        place: 'mise',
        testOfPlace: testOnDarwin,
        createInstall: () =>
          createFixtureDirectory({
            path: join(homeDir, '.local/share/mise/installs/pnpm/10.22.0'),
          }),
      },
      {
        place: 'corepack v1',
        testOfPlace: testOnDarwin,
        createInstall: () =>
          createFixtureDirectory({ path: join(homeDir, '.cache/node/corepack/v1/pnpm/10.14.0') }),
      },
      {
        place: 'corepack',
        testOfPlace: testOnDarwin,
        createInstall: () =>
          createFixtureDirectory({ path: join(homeDir, '.cache/node/corepack/pnpm/10.14.0') }),
      },
      {
        place: "pnpm's .tools",
        testOfPlace: test,
        createInstall: () =>
          createFixtureDirectory({
            path: buildPnpmHomePath({
              folders: environment,
              names: ['.tools/pnpm/10.22.0'],
            }),
          }),
      },
      {
        place: "pnpm's .tools of @pnpm/exe",
        testOfPlace: test,
        createInstall: () =>
          createFixtureDirectory({
            path: buildPnpmHomePath({
              folders: environment,
              names: ['.tools/@pnpm+exe/10.22.0'],
            }),
          }),
      },
      {
        place: "pnpm's global folder",
        testOfPlace: test,
        createInstall: () =>
          writePnpmPackage({
            packageFolder: buildPnpmHomePath({
              folders: environment,
              names: ['global/5/node_modules/pnpm'],
            }),
            version: '10.14.0',
          }),
      },
      {
        place: 'the npm globals of an asdf node',
        testOfPlace: testOnDarwin,
        createInstall: () =>
          writePnpmPackage({
            packageFolder: join(homeDir, '.asdf/installs/nodejs/22.1.0/lib/node_modules/pnpm'),
            version: '10.14.0',
          }),
      },
      {
        place: 'the npm globals of a mise node',
        testOfPlace: testOnDarwin,
        createInstall: () =>
          writePnpmPackage({
            packageFolder: join(
              homeDir,
              '.local/share/mise/installs/node/22.1.0/lib/node_modules/pnpm',
            ),
            version: '10.14.0',
          }),
      },
      {
        place: 'the npm globals of an nvm node',
        testOfPlace: testOnDarwin,
        createInstall: () =>
          writePnpmPackage({
            packageFolder: join(homeDir, '.nvm/versions/node/v22.1.0/lib/node_modules/pnpm'),
            version: '10.14.0',
          }),
      },
    ];

    for (const installPlace of installPlaces) {
      installPlace.testOfPlace(
        `keeps a store version a pnpm in ${installPlace.place} uses`,
        async () => {
          await createStore({ folderNames: ['v3', 'v10'] });
          await installPlace.createInstall();

          expect(await loadOfferedVersions({ files: [] })).toEqual({
            storeVersions: ['v3'],
            isComplete: false,
          });
        },
      );
    }

    testOnDarwin(
      "offers nothing beside a pnpm in mise's folder of the backend key npm:pnpm",
      async () => {
        await createStore({ folderNames: ['v3'] });
        await createFixtureDirectory({
          path: join(homeDir, '.local/share/mise/installs/npm-pnpm/9.15.9'),
        });

        expect(await loadOfferedVersions({ files: [] })).toEqual({
          storeVersions: [],
          isComplete: false,
        });
      },
    );

    testOnDarwin("keeps a store version a pnpm in Homebrew's Cellar uses", async () => {
      await createStore({ folderNames: ['v3', 'v10'] });
      const prefixPath = buildTestHostPath({ text: join(fixtureRoot.rootDir, 'homebrew') });
      await createFixtureDirectory({ path: join(prefixPath, 'Cellar', 'pnpm', '10.14.0_1') });
      probePlatform = buildTestProbePlatform({ homebrewPrefixPaths: [prefixPath] });

      expect(await loadOfferedVersions({ files: [] })).toEqual({
        storeVersions: ['v3'],
        isComplete: false,
      });
    });

    const homebrewPrefixPlaces: { place: string; installPathNames: string[] }[] = [
      { place: "Homebrew's versioned formula", installPathNames: ['Cellar', 'pnpm@10', '10.14.0'] },
      {
        place: "Homebrew's npm globals of @pnpm/exe",
        installPathNames: ['lib', 'node_modules', '@pnpm', 'exe'],
      },
    ];

    for (const prefixPlace of homebrewPrefixPlaces) {
      testOnDarwin(`offers nothing beside a pnpm in ${prefixPlace.place}`, async () => {
        await createStore({ folderNames: ['v10'] });
        const prefixPath = buildTestHostPath({ text: join(fixtureRoot.rootDir, 'homebrew') });
        const installPath = join(prefixPath, ...prefixPlace.installPathNames);
        await writePnpmPackage({ packageFolder: installPath, version: '10.14.0' });
        probePlatform = buildTestProbePlatform({ homebrewPrefixPaths: [prefixPath] });

        expect(await loadOfferedVersions({ files: [] })).toEqual({
          storeVersions: [],
          isComplete: false,
        });
      });
    }

    const exePackagePlaces: {
      place: string;
      testOfPlace: Test<[]>;
      buildPackageFolder: () => string;
    }[] = [
      {
        place: "pnpm's global folder",
        testOfPlace: test,
        buildPackageFolder: () =>
          buildPnpmHomePath({
            folders: environment,
            names: ['global/5/node_modules/@pnpm/exe'],
          }),
      },
      {
        place: 'the npm globals of an nvm node',
        testOfPlace: testOnDarwin,
        buildPackageFolder: () =>
          join(homeDir, '.nvm/versions/node/v22.1.0/lib/node_modules/@pnpm/exe'),
      },
    ];

    for (const exePlace of exePackagePlaces) {
      exePlace.testOfPlace(`offers nothing beside a @pnpm/exe in ${exePlace.place}`, async () => {
        await createStore({ folderNames: ['v10'] });
        await writePnpmPackage({
          packageFolder: exePlace.buildPackageFolder(),
          version: '10.14.0',
        });

        expect(await loadOfferedVersions({ files: [] })).toEqual({
          storeVersions: [],
          isComplete: false,
        });
      });
    }

    testOnDarwin(
      'offers nothing and is not judged beside the standalone pnpm executable',
      async () => {
        await createStore({ folderNames: ['v10'] });
        await writeFixtureTextFile({
          path: buildPnpmHomePath({
            folders: environment,
            names: ['pnpm'],
          }),
          text: 'Ïúíþ executable',
        });

        expect(await loadOfferedVersions({ files: [] })).toEqual({
          storeVersions: [],
          isComplete: false,
        });
      },
    );

    testOnDarwin('counts a pnpm shell script in pnpm home for nothing', async () => {
      await createStore({ folderNames: ['v10'] });
      await writeFixtureTextFile({
        path: buildPnpmHomePath({
          folders: environment,
          names: ['pnpm'],
        }),
        text: '#!/bin/sh\nexec "$basedir/.tools/pnpm/10.14.0/bin/pnpm" "$@"\n',
      });

      expect(await loadOfferedVersions({ files: [] })).toEqual({
        storeVersions: ['v10'],
        isComplete: true,
      });
    });

    const pnpmHomeInstallCases: {
      place: string;
      testOfPlace: Test<[]>;
      storeFolderName: string;
      createInstall: () => Promise<void>;
    }[] = [
      {
        place: "the global folder of pnpm's XDG home",
        testOfPlace: testOnDarwin,
        storeFolderName: 'v10',
        createInstall: () =>
          writePnpmPackage({
            packageFolder: join(homeDir, '.local/share/pnpm/global/5/node_modules/pnpm'),
            version: '10.14.0',
          }),
      },
      {
        place: '.tools/pnpm-exe beside its launcher script',
        testOfPlace: testOnDarwin,
        storeFolderName: 'v10',
        createInstall: async () => {
          await writeFixtureTextFile({
            path: buildPnpmHomePath({
              folders: environment,
              names: ['.tools/pnpm-exe/10.22.0/pnpm'],
            }),
            text: 'Ïúíþ executable',
          });
          await writeFixtureTextFile({
            path: buildPnpmHomePath({
              folders: environment,
              names: ['pnpm'],
            }),
            text: '#!/bin/sh\nexec "$basedir/.tools/pnpm-exe/10.22.0/pnpm" "$@"\n',
          });
        },
      },
      {
        place: "an install folder of pnpm 11's global layout",
        testOfPlace: test,
        storeFolderName: 'v11',
        createInstall: () =>
          writePnpmPackage({
            packageFolder: buildPnpmHomePath({
              folders: environment,
              names: ['global/v11', PNPM_11_INSTALL_ID, 'node_modules/pnpm'],
            }),
            version: '11.1.2',
          }),
      },
      {
        place: "an install folder of pnpm 11's global layout as @pnpm/exe",
        testOfPlace: test,
        storeFolderName: 'v11',
        createInstall: () =>
          writePnpmPackage({
            packageFolder: buildPnpmHomePath({
              folders: environment,
              names: ['global/v11', PNPM_11_INSTALL_ID, 'node_modules/@pnpm/exe'],
            }),
            version: '11.1.2',
          }),
      },
    ];

    for (const homeInstallCase of pnpmHomeInstallCases) {
      homeInstallCase.testOfPlace(
        `offers nothing beside a pnpm in ${homeInstallCase.place}`,
        async () => {
          await createStore({ folderNames: [homeInstallCase.storeFolderName] });
          await homeInstallCase.createInstall();

          expect(await loadOfferedVersions({ files: [] })).toEqual({
            storeVersions: [],
            isComplete: false,
          });
        },
      );
    }

    for (const packageName of ['some-cli', '@scope/some-cli']) {
      testOnPosix(
        `keeps the store version the global package ${packageName} of pnpm 11 links into`,
        async () => {
          const storeRoot = await createStore({ folderNames: ['v11'] });
          const globalInstallsPath = buildPnpmHomePath({
            folders: environment,
            names: ['global/v11'],
          });
          const installFolderPath = join(globalInstallsPath, PNPM_11_INSTALL_ID);
          await linkGlobalPackageIntoStore({
            storeRoot: storeRoot,
            storeFolderName: 'v11',
            packageName: packageName,
            linkPath: join(installFolderPath, 'node_modules', packageName),
          });
          await symlink(installFolderPath, join(globalInstallsPath, 'sibling-install'));
          await createFixtureDirectory({ path: join(globalInstallsPath, 'empty-install') });

          expect(await loadOfferedVersions({ files: [] })).toEqual({
            storeVersions: [],
            isComplete: false,
          });
        },
      );

      testOnPosix(
        `keeps the store version the global package ${packageName} of pnpm 10's global virtual store links into`,
        async () => {
          const storeRoot = await createStore({ folderNames: ['v10'] });
          await linkGlobalPackageIntoStore({
            storeRoot: storeRoot,
            storeFolderName: 'v10',
            packageName: packageName,
            linkPath: buildPnpmHomePath({
              folders: environment,
              names: ['global/5/node_modules', packageName],
            }),
          });

          expect(await loadOfferedVersions({ files: [] })).toEqual({
            storeVersions: [],
            isComplete: false,
          });
        },
      );
    }

    testOnPosix(
      'keeps the store version a project with the global virtual store links into',
      async () => {
        const storeRoot = await createStore({ folderNames: ['v10'] });
        await createPackageLink({
          packagePath: join(storeRoot, 'v10/links/0a1b2c/node_modules/some-lib'),
          linkPath: join(homeDir, 'projects/app/node_modules/some-lib'),
        });

        expect(await loadOfferedVersions({ files: [] })).toEqual({
          storeVersions: [],
          isComplete: false,
        });
      },
    );

    test('offers a store folder whose links folder holds only dot names', async () => {
      const storeRoot = await createStore({ folderNames: ['v10'] });
      await writeFixtureTextFile({ path: join(storeRoot, 'v10/links/.DS_Store'), text: '' });

      expect(await loadOfferedVersions({ files: [] })).toEqual({
        storeVersions: ['v10'],
        isComplete: true,
      });
    });

    testOnPosix(
      'answers unreadable at a links folder of a store folder it cannot list',
      async () => {
        const storeRoot = await createStore({ folderNames: ['v10'] });
        const linksPath = join(storeRoot, 'v10/links');
        await createFixtureDirectory({ path: linksPath });
        await chmod(linksPath, 0o000);

        try {
          expect(await runProbe({ files: [] })).toEqual({
            kind: 'unreadable',
            path: linksPath,
            failure: { reason: 'permissionDenied', code: 'EACCES' },
          });
        } finally {
          await chmod(linksPath, 0o755);
        }
      },
    );

    const pinCases: { kind: ProjectPinFileKind; text: string }[] = [
      { kind: 'packageJson', text: '{"packageManager": "pnpm@10.14.0+sha512.0a1b"}' },
      { kind: 'toolVersions', text: 'pnpm 10.8.1\n' },
      { kind: 'miseConfig', text: '[tools]\n"npm:pnpm" = "10"\n' },
    ];

    for (const pinCase of pinCases) {
      test(`keeps a store version a ${pinCase.kind} pins`, async () => {
        await createStore({ folderNames: ['v3', 'v10'] });
        const pinFile = buildTestPinFileText({
          path: buildProjectFilePath('pin'),
          kind: pinCase.kind,
          text: pinCase.text,
        });

        expect(await loadOfferedVersions({ files: [pinFile] })).toEqual({
          storeVersions: ['v3'],
          isComplete: false,
        });
      });
    }

    test('offers nothing beside a package.json that pins pnpm 10 by devEngines.packageManager alone', async () => {
      await createStore({ folderNames: ['v10'] });
      const pinFile = buildTestPinFileText({
        path: buildProjectFilePath('package.json'),
        kind: 'packageJson',
        text: JSON.stringify({
          devEngines: { packageManager: { name: 'pnpm', version: '10.14.0' } },
        }),
      });

      expect(await loadOfferedVersions({ files: [pinFile] })).toEqual({
        storeVersions: [],
        isComplete: false,
      });
    });

    test('offers nothing while an unfit pin file pins every store version', async () => {
      await createStore({ folderNames: ['v3'] });
      const pinFile = buildTestPinFileUnfit({
        path: buildProjectFilePath('package.json'),
        kind: 'packageJson',
      });

      expect(await loadOfferedVersions({ files: [pinFile] })).toEqual({
        storeVersions: [],
        isComplete: false,
      });
    });

    testOnPosix('counts a mise link that names no version by the folder it points to', async () => {
      await createStore({ folderNames: ['v3', 'v10'] });
      const targetPath = join(homeDir, 'elsewhere', '10.1.0');
      const misePnpmPath = join(homeDir, '.local/share/mise/installs/pnpm');
      await createFixtureDirectory({ path: targetPath });
      await createFixtureDirectory({ path: misePnpmPath });
      await symlink(targetPath, join(misePnpmPath, 'latest'));

      expect(await loadOfferedVersions({ files: [] })).toEqual({
        storeVersions: ['v3'],
        isComplete: false,
      });
    });

    testOnPosix('counts a dangling link for nothing', async () => {
      await createStore({ folderNames: ['v10'] });
      const misePnpmPath = join(homeDir, '.local/share/mise/installs/pnpm');
      await createFixtureDirectory({ path: misePnpmPath });
      await symlink('./10.1.0', join(misePnpmPath, '10'));

      expect(await loadOfferedVersions({ files: [] })).toEqual({
        storeVersions: ['v10'],
        isComplete: true,
      });
    });

    test('offers nothing and is not judged for an installed pnpm of an unknown major', async () => {
      await createStore({ folderNames: ['v3'] });
      await createFixtureDirectory({
        path: buildPnpmHomePath({
          folders: environment,
          names: ['.tools/pnpm/13.0.0'],
        }),
      });

      expect(await loadOfferedVersions({ files: [] })).toEqual({
        storeVersions: [],
        isComplete: false,
      });
    });

    test('never offers a store folder whose name is no store version', async () => {
      await createStore({ folderNames: ['tmp', 'v3'] });

      expect(await loadOfferedVersions({ files: [] })).toEqual({
        storeVersions: ['v3'],
        isComplete: false,
      });
    });

    test('answers unreadable at an unreadable pin file of pnpm', async () => {
      await createStore({ folderNames: ['v3'] });
      const pinPath = buildProjectFilePath('package.json');
      const pinFile = buildTestPinFileUnreadable({ path: pinPath, kind: 'packageJson' });

      expect(await runProbe({ files: [pinFile] })).toEqual({
        kind: 'unreadable',
        path: pinPath,
        failure: { reason: 'permissionDenied', code: 'EACCES' },
      });
    });

    test('ignores an unreadable pin file of another tool', async () => {
      await createStore({ folderNames: ['v3'] });
      const pinFile = buildTestPinFileUnreadable({
        path: buildProjectFilePath('build.gradle'),
        kind: 'gradle',
      });

      expect(await loadOfferedVersions({ files: [pinFile] })).toEqual({
        storeVersions: ['v3'],
        isComplete: true,
      });
    });

    testOnPosix('answers unreadable at an install folder it cannot list', async () => {
      await createStore({ folderNames: ['v3'] });
      const asdfPnpmPath = join(homeDir, '.asdf/installs/pnpm');
      await createFixtureDirectory({ path: asdfPnpmPath });
      await chmod(asdfPnpmPath, 0o000);

      expect(await runProbe({ files: [] })).toEqual({
        kind: 'unreadable',
        path: asdfPnpmPath,
        failure: { reason: 'permissionDenied', code: 'EACCES' },
      });
    });

    const unreadableInstallPlaces: {
      place: string;
      testOfPlace: Test<[]>;
      createUnreadablePlace: () => Promise<string>;
    }[] = [
      {
        place: "corepack's folder of pnpm",
        testOfPlace: testOnDarwin,
        createUnreadablePlace: async () => {
          const corepackPnpmPath = join(homeDir, '.cache/node/corepack/v1/pnpm');
          await createFixtureDirectory({ path: corepackPnpmPath });
          await chmod(corepackPnpmPath, 0o000);

          return corepackPnpmPath;
        },
      },
      {
        place: "pnpm's .tools",
        testOfPlace: testOnPosix,
        createUnreadablePlace: async () => {
          const toolsPath = buildPnpmHomePath({
            folders: environment,
            names: ['.tools/pnpm'],
          });
          await createFixtureDirectory({ path: toolsPath });
          await chmod(toolsPath, 0o000);

          return toolsPath;
        },
      },
      {
        place: 'the launcher in pnpm home',
        testOfPlace: testOnDarwin,
        createUnreadablePlace: async () => {
          const launcherPath = buildPnpmHomePath({
            folders: environment,
            names: ['pnpm'],
          });
          await writeFixtureTextFile({ path: launcherPath, text: '#!/bin/sh\n' });
          await chmod(launcherPath, 0o000);

          return launcherPath;
        },
      },
      {
        place: "the npm globals' pnpm of an nvm node",
        testOfPlace: testOnDarwin,
        createUnreadablePlace: async () => {
          const packagePath = join(homeDir, '.nvm/versions/node/v22.1.0/lib/node_modules/pnpm');
          await writePnpmPackage({ packageFolder: packagePath, version: '10.14.0' });
          // The probe reads each node's folder at its real path, as the fixture root may lie below
          // a link.
          const packageRealPath = await realpath(packagePath);
          await chmod(packagePath, 0o000);

          return join(packageRealPath, 'package.json');
        },
      },
    ];

    for (const unreadablePlace of unreadableInstallPlaces) {
      unreadablePlace.testOfPlace(
        `answers unreadable, offering nothing, at ${unreadablePlace.place} it cannot read`,
        async () => {
          await createStore({ folderNames: ['v3'] });
          const unreadablePath = await unreadablePlace.createUnreadablePlace();

          expect(await runProbe({ files: [] })).toEqual({
            kind: 'unreadable',
            path: unreadablePath,
            failure: { reason: 'permissionDenied', code: 'EACCES' },
          });
        },
      );
    }

    describeOnWindows("at pnpm's places of Windows", () => {
      for (const installPlace of Object.values(windowsPnpmInstallPlaces)) {
        test(`keeps a store version a pnpm in ${installPlace.place} uses`, async () => {
          await createStore({ folderNames: ['v3', 'v10'] });
          await createWindowsPnpmInstall({
            folders: environment,
            installPlace: installPlace,
            version: '10.14.0',
          });

          expect(await loadOfferedVersions({ files: [] })).toEqual({
            storeVersions: ['v3'],
            isComplete: false,
          });
        });
      }

      for (const exePath of ['pnpm/pnpm.exe', 'pnpm/bin/pnpm.exe']) {
        test(`offers nothing and is not judged beside the standalone ${exePath}`, async () => {
          await createStore({ folderNames: ['v10'] });
          await writeFixtureTextFile({
            path: resolveEnvironmentLocation({
              folders: environment,
              location: { root: 'localAppData', path: exePath },
            }),
            text: WINDOWS_EXECUTABLE_TEXT,
          });

          expect(await loadOfferedVersions({ files: [] })).toEqual({
            storeVersions: [],
            isComplete: false,
          });
        });
      }

      test('counts the pnpm.cmd and pnpm.ps1 shims in pnpm home for nothing', async () => {
        await createStore({ folderNames: ['v10'] });

        for (const shimPath of ['pnpm/pnpm.cmd', 'pnpm/pnpm.ps1']) {
          await writeFixtureTextFile({
            path: resolveEnvironmentLocation({
              folders: environment,
              location: { root: 'localAppData', path: shimPath },
            }),
            text: '@SETLOCAL\r\n',
          });
        }

        expect(await loadOfferedVersions({ files: [] })).toEqual({
          storeVersions: ['v10'],
          isComplete: true,
        });
      });
    });
  });
}

describe.skipIf(hostPlatform.explore.pnpmXdgStoreRoot !== null)(
  'the probe pnpmStoresXdg where pnpm has no XDG store',
  () => {
    test('is judged with no findings beside a store of the XDG layout', async () => {
      const xdgStoreRoot = darwinPlatform.explore.pnpmXdgStoreRoot;

      if (xdgStoreRoot === null) {
        throw new Error('The darwin platform has no XDG store root.');
      }

      await createStoreFolders({ storeRoot: xdgStoreRoot, folderNames: ['v3'] });

      const probes = startExploreProbes(
        buildTestProbeStart({ environment: environment, platform: probePlatform }),
      );

      expect(await probes.outcomes.pnpmStoresXdg).toEqual({
        kind: 'probed',
        findings: [],
        isComplete: true,
      });
    });
  },
);

describe('the recheck of a pnpm store unit', () => {
  let storeRoot: AbsolutePath;
  let pinPath: AbsolutePath;
  let unit: ExplorePathUnitPnpmStore;

  beforeEach(async () => {
    storeRoot = await createStoreFolders({
      storeRoot: hostPlatform.explore.pnpmStoreRoot,
      folderNames: ['v10'],
    });
    pinPath = buildTestHostPath({ text: join(homeDir, 'projects/app/package.json') });
    await writeFixtureTextFile({ path: pinPath, text: '{"packageManager": "yarn@4.1.0"}' });
    unit = {
      kind: 'pnpmStore',
      storeRoot: storeRoot,
      folderPath: buildTestHostPath({ text: join(storeRoot, 'v10') }),
      storeVersion: buildTestPnpmStoreVersion({ text: 'v10' }),
      pinFiles: [{ path: pinPath, kind: 'packageJson' }],
    };
  });

  test('is unchanged while nothing uses the store version', async () => {
    expect(
      await recheckExplorePathUnit({
        unit: unit,
        environment: environment,
        platform: probePlatform,
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'unchanged' });
  });

  test('is changed once one of its pin files pins a pnpm of its store version', async () => {
    await writeFile(pinPath, '{"packageManager": "pnpm@10.14.0"}');

    expect(
      await recheckExplorePathUnit({
        unit: unit,
        environment: environment,
        platform: probePlatform,
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('is changed once a pnpm of its store version is installed', async () => {
    await createFixtureDirectory({
      path: buildPnpmHomePath({
        folders: environment,
        names: ['.tools/pnpm/10.14.0'],
      }),
    });

    expect(
      await recheckExplorePathUnit({
        unit: unit,
        environment: environment,
        platform: probePlatform,
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('is changed once its store folder holds a global virtual store', async () => {
    await createFixtureDirectory({ path: join(storeRoot, 'v10/links/0a1b2c') });

    expect(
      await recheckExplorePathUnit({
        unit: unit,
        environment: environment,
        platform: probePlatform,
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({ kind: 'changed' });
  });

  test('is busy while a pnpm process runs', async () => {
    expect(
      await recheckExplorePathUnit({
        unit: unit,
        environment: environment,
        platform: probePlatform,
        runningProcesses: buildRunningCommandLines([PNPM_PROCESS_COMMAND]),
      }),
    ).toEqual({ kind: 'busy' });
  });

  testOnPosix('fails at an unreadable store root', async () => {
    await chmod(storeRoot, 0o000);

    expect(
      await recheckExplorePathUnit({
        unit: unit,
        environment: environment,
        platform: probePlatform,
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({
      kind: 'failed',
      failure: {
        reason: 'fileUnreadable',
        path: storeRoot,
        failure: { reason: 'permissionDenied', code: 'EACCES' },
      },
    });
  });

  testOnPosix('fails at a place of installed pnpm it cannot read, never as no pnpm', async () => {
    const toolsPath = buildPnpmHomePath({
      folders: environment,
      names: ['.tools/pnpm'],
    });
    await createFixtureDirectory({ path: toolsPath });
    await chmod(toolsPath, 0o000);

    expect(
      await recheckExplorePathUnit({
        unit: unit,
        environment: environment,
        platform: probePlatform,
        runningProcesses: buildRunningCommandLines([]),
      }),
    ).toEqual({
      kind: 'failed',
      failure: {
        reason: 'fileUnreadable',
        path: toolsPath,
        failure: { reason: 'permissionDenied', code: 'EACCES' },
      },
    });
  });
});
