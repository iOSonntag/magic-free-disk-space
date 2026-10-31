import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { ExplorePathUnitPnpmStore } from '../../src/explore/exploreUnit.js';
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
import {
  PNPM_STORE_ROOT_PATH_NAMES,
  PNPM_XDG_STORE_ROOT_PATH_NAMES,
} from '../../src/explore/pnpmStores/pnpmHomes.js';
import type {
  ProjectPinFile,
  ProjectPinFileKind,
} from '../../src/explore/projectPins/projectPins.js';
import { PROJECT_SEARCH_INCOMPLETE_EVIDENCE } from '../../src/explore/projectPins/projectSearchEvidence.js';
import { recheckExplorePathUnit } from '../../src/explore/recheckExploreUnit.js';
import type { ExploreProbeOutcome } from '../../src/explore/startExploreProbes.js';
import { startExploreProbes } from '../../src/explore/startExploreProbes.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import {
  buildTestAbsolutePath,
  buildTestPnpmStoreVersion,
} from '../support/parsedValueFixtures.js';
import { buildFixtureToolLocations } from './probeFakeTools.js';
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

const NO_INSTALLS: PnpmInstallState = { installs: [], globalPackageRealPaths: [] };

const PNPM_11_INSTALL_ID = '1375b-1a0a4cad7f8';

let fixtureRoot: FixtureRoot;
let environment: Environment;
let homeDir: AbsolutePath;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
  homeDir = environment.homeDir;
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

async function createStoreFolders(params: {
  rootNames: string[];
  folderNames: string[];
}): Promise<AbsolutePath> {
  const storeRoot = buildTestAbsolutePath({ text: join(homeDir, ...params.rootNames) });

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
  await createFixtureDirectory({ path: packagePath });
  await createFixtureDirectory({ path: dirname(params.linkPath) });
  await symlink(relative(dirname(params.linkPath), packagePath), params.linkPath);
}

function buildParsedInstall(params: { versionText: string; major: number }): PnpmInstall {
  return {
    kind: 'parsed',
    path: buildTestAbsolutePath({ text: `/installs/pnpm/${params.versionText}` }),
    versionText: params.versionText,
    major: params.major,
  };
}

/** A store at `/store`, which is also its real path unless `storeRootRealPath` names another. */
function buildStoreState(params: {
  folderNames: string[];
  storeRootRealPath?: string;
}): PnpmStoreState {
  const storeRootRealPath = params.storeRootRealPath ?? '/store';

  return {
    folders: params.folderNames.map((folderName) => {
      const folderPath = buildTestAbsolutePath({ text: `/store/${folderName}` });
      const realPath = buildTestAbsolutePath({ text: `${storeRootRealPath}/${folderName}` });

      if (folderName === 'tmp') {
        return { kind: 'unparsed', folderPath: folderPath };
      }

      return {
        kind: 'parsed',
        folderPath: folderPath,
        realPath: realPath,
        storeVersion: buildTestPnpmStoreVersion({ text: folderName }),
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
        path: buildTestAbsolutePath({ text: `${PROJECT_PATH}/pin` }),
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
        globalPackageRealPaths: [],
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

  const linkedFolderCases: { linkedFolderName: string; offeredFolderName: string }[] = [
    { linkedFolderName: 'v1', offeredFolderName: 'v10' },
    { linkedFolderName: 'v10', offeredFolderName: 'v1' },
  ];

  for (const linkedCase of linkedFolderCases) {
    test(`keeps ${linkedCase.linkedFolderName} a global package links into, and offers ${linkedCase.offeredFolderName}`, () => {
      const offers = decidePnpmStoreOffers({
        storeState: buildStoreState({ folderNames: ['v1', 'v10'] }),
        installState: {
          installs: [],
          globalPackageRealPaths: [
            buildTestAbsolutePath({
              text: `/store/${linkedCase.linkedFolderName}/links/@/some-cli/1.0.0/abc/node_modules/some-cli`,
            }),
          ],
        },
        pins: NO_PINS,
      });

      expect(listOfferedStoreVersions({ offers: offers })).toEqual([linkedCase.offeredFolderName]);
      expect(offers.isComplete).toBe(false);
    });
  }

  test("judges a link by the real path of the store folder, below the store root's real path", () => {
    const offers = decidePnpmStoreOffers({
      storeState: buildStoreState({
        folderNames: ['v10', 'v11'],
        storeRootRealPath: '/private/store',
      }),
      installState: {
        installs: [],
        globalPackageRealPaths: [
          buildTestAbsolutePath({ text: '/private/store/v11/links/@/some-cli/1.0.0/abc' }),
        ],
      },
      pins: NO_PINS,
    });

    expect(listOfferedStoreVersions({ offers: offers })).toEqual(['v10']);
  });

  const heldBackCases: { name: string; installState: PnpmInstallState; pins: PnpmPins }[] = [
    {
      name: 'an installed version that does not parse',
      installState: {
        installs: [
          {
            kind: 'unparsed',
            path: buildTestAbsolutePath({ text: '/installs/pnpm/odd' }),
            versionText: 'odd',
          },
        ],
        globalPackageRealPaths: [],
      },
      pins: NO_PINS,
    },
    {
      name: 'an installed major outside the table',
      installState: {
        installs: [buildParsedInstall({ versionText: '13.0.0', major: 13 })],
        globalPackageRealPaths: [],
      },
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
      path: `${PROJECT_PATH}/package.json`,
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
      processCommands: [],
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
      processCommands: [PNPM_PROCESS_COMMAND],
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
        processCommands: [],
      }),
    ).toEqual({ kind: 'unchanged' });
  });

  test('is changed once a pnpm of its store version is installed', () => {
    expect(
      comparePnpmStoreUnit({
        unit: unit,
        storeState: buildStoreState({ folderNames: ['v3'] }),
        installState: {
          installs: [buildParsedInstall({ versionText: '9.15.9', major: 9 })],
          globalPackageRealPaths: [],
        },
        pins: NO_PINS,
        processCommands: [],
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
        processCommands: [PNPM_PROCESS_COMMAND],
      }),
    ).toEqual({ kind: 'busy' });
  });
});

describe('loadPnpmInstallState', () => {
  test('reads the Cellar folders and the npm globals of each Homebrew prefix', async () => {
    const prefixPath = buildTestAbsolutePath({ text: join(fixtureRoot.rootDir, 'homebrew') });
    const cellarPath = join(prefixPath, 'Cellar', 'pnpm', '10.14.0_1');
    const npmGlobalPath = join(prefixPath, 'lib', 'node_modules', 'pnpm');
    await createFixtureDirectory({ path: cellarPath });
    await writePnpmPackage({ packageFolder: npmGlobalPath, version: '9.15.4' });

    expect(
      await loadPnpmInstallState({ homeDir: homeDir, homebrewPrefixPaths: [prefixPath] }),
    ).toEqual({
      kind: 'succeeded',
      value: {
        installs: [
          {
            kind: 'parsed',
            path: buildTestAbsolutePath({ text: cellarPath }),
            versionText: '10.14.0_1',
            major: 10,
          },
          {
            kind: 'parsed',
            path: buildTestAbsolutePath({ text: npmGlobalPath }),
            versionText: '9.15.4',
            major: 9,
          },
        ],
        globalPackageRealPaths: [],
      },
    });
  });

  test('keeps a global package.json with no version as an install without a version', async () => {
    await writeFixtureTextFile({
      path: join(homeDir, 'Library/pnpm/global/5/node_modules/pnpm/package.json'),
      text: '{"name": "pnpm"}',
    });

    expect(await loadPnpmInstallState({ homeDir: homeDir, homebrewPrefixPaths: [] })).toEqual({
      kind: 'succeeded',
      value: {
        installs: [
          {
            kind: 'unparsed',
            path: expect.stringContaining('/Library/pnpm/global/5/node_modules/pnpm'),
            versionText: null,
          },
        ],
        globalPackageRealPaths: [],
      },
    });
  });
});

type StoreVersionsOffered = { storeVersions: string[]; isComplete: boolean };

const probeCases: { probeId: 'pnpmStores' | 'pnpmStoresXdg'; rootNames: string[] }[] = [
  { probeId: 'pnpmStores', rootNames: PNPM_STORE_ROOT_PATH_NAMES },
  { probeId: 'pnpmStoresXdg', rootNames: PNPM_XDG_STORE_ROOT_PATH_NAMES },
];

for (const probeCase of probeCases) {
  describe(`the probe ${probeCase.probeId}`, () => {
    async function runProbe(params: { files: ProjectPinFile[] }): Promise<ExploreProbeOutcome> {
      const probes = startExploreProbes({
        environment: environment,
        toolInstallLocations: buildFixtureToolLocations({}),
        processCommands: Promise.resolve([]),
        activeXcodeBundlePath: Promise.resolve(null),
        projectPins: buildFoundProjectPinsLoad({ files: params.files }),
        timeoutMs: 10_000,
        unusedCutoffMs: 0,
      });

      return probes[probeCase.probeId];
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
        rootNames: probeCase.rootNames,
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
              folderPath: buildTestAbsolutePath({ text: join(storeRoot, 'v3') }),
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

    const installPlaces: { place: string; createInstall: () => Promise<void> }[] = [
      {
        place: 'asdf',
        createInstall: () =>
          createFixtureDirectory({ path: join(homeDir, '.asdf/installs/pnpm/10.8.1') }),
      },
      {
        place: 'mise',
        createInstall: () =>
          createFixtureDirectory({
            path: join(homeDir, '.local/share/mise/installs/pnpm/10.22.0'),
          }),
      },
      {
        place: 'corepack v1',
        createInstall: () =>
          createFixtureDirectory({ path: join(homeDir, '.cache/node/corepack/v1/pnpm/10.14.0') }),
      },
      {
        place: 'corepack',
        createInstall: () =>
          createFixtureDirectory({ path: join(homeDir, '.cache/node/corepack/pnpm/10.14.0') }),
      },
      {
        place: "pnpm's .tools",
        createInstall: () =>
          createFixtureDirectory({ path: join(homeDir, 'Library/pnpm/.tools/pnpm/10.22.0') }),
      },
      {
        place: "pnpm's .tools of @pnpm/exe",
        createInstall: () =>
          createFixtureDirectory({
            path: join(homeDir, 'Library/pnpm/.tools/@pnpm+exe/10.22.0'),
          }),
      },
      {
        place: "pnpm's global folder",
        createInstall: () =>
          writePnpmPackage({
            packageFolder: join(homeDir, 'Library/pnpm/global/5/node_modules/pnpm'),
            version: '10.14.0',
          }),
      },
      {
        place: 'the npm globals of an asdf node',
        createInstall: () =>
          writePnpmPackage({
            packageFolder: join(homeDir, '.asdf/installs/nodejs/22.1.0/lib/node_modules/pnpm'),
            version: '10.14.0',
          }),
      },
      {
        place: 'the npm globals of a mise node',
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
        createInstall: () =>
          writePnpmPackage({
            packageFolder: join(homeDir, '.nvm/versions/node/v22.1.0/lib/node_modules/pnpm'),
            version: '10.14.0',
          }),
      },
    ];

    for (const installPlace of installPlaces) {
      test(`keeps a store version a pnpm in ${installPlace.place} uses`, async () => {
        await createStore({ folderNames: ['v3', 'v10'] });
        await installPlace.createInstall();

        expect(await loadOfferedVersions({ files: [] })).toEqual({
          storeVersions: ['v3'],
          isComplete: false,
        });
      });
    }

    test("keeps a store version a pnpm in Homebrew's Cellar uses", async () => {
      await createStore({ folderNames: ['v3', 'v10'] });
      const prefixPath = buildTestAbsolutePath({ text: join(fixtureRoot.rootDir, 'homebrew') });
      await createFixtureDirectory({ path: join(prefixPath, 'Cellar', 'pnpm', '10.14.0_1') });
      environment = { ...environment, homebrewPrefixPaths: [prefixPath] };

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
      test(`offers nothing beside a pnpm in ${prefixPlace.place}`, async () => {
        await createStore({ folderNames: ['v10'] });
        const prefixPath = buildTestAbsolutePath({ text: join(fixtureRoot.rootDir, 'homebrew') });
        const installPath = join(prefixPath, ...prefixPlace.installPathNames);
        await writePnpmPackage({ packageFolder: installPath, version: '10.14.0' });
        environment = { ...environment, homebrewPrefixPaths: [prefixPath] };

        expect(await loadOfferedVersions({ files: [] })).toEqual({
          storeVersions: [],
          isComplete: false,
        });
      });
    }

    const exePackagePlaces: { place: string; packageFolderNames: string[] }[] = [
      {
        place: "pnpm's global folder",
        packageFolderNames: ['Library/pnpm/global/5/node_modules/@pnpm/exe'],
      },
      {
        place: 'the npm globals of an nvm node',
        packageFolderNames: ['.nvm/versions/node/v22.1.0/lib/node_modules/@pnpm/exe'],
      },
    ];

    for (const exePlace of exePackagePlaces) {
      test(`offers nothing beside a @pnpm/exe in ${exePlace.place}`, async () => {
        await createStore({ folderNames: ['v10'] });
        await writePnpmPackage({
          packageFolder: join(homeDir, ...exePlace.packageFolderNames),
          version: '10.14.0',
        });

        expect(await loadOfferedVersions({ files: [] })).toEqual({
          storeVersions: [],
          isComplete: false,
        });
      });
    }

    test('offers nothing and is not judged beside the standalone pnpm executable', async () => {
      await createStore({ folderNames: ['v10'] });
      await writeFixtureTextFile({
        path: join(homeDir, 'Library/pnpm/pnpm'),
        text: 'Ïúíþ executable',
      });

      expect(await loadOfferedVersions({ files: [] })).toEqual({
        storeVersions: [],
        isComplete: false,
      });
    });

    test('counts a pnpm shell script in pnpm home for nothing', async () => {
      await createStore({ folderNames: ['v10'] });
      await writeFixtureTextFile({
        path: join(homeDir, 'Library/pnpm/pnpm'),
        text: '#!/bin/sh\nexec "$basedir/.tools/pnpm/10.14.0/bin/pnpm" "$@"\n',
      });

      expect(await loadOfferedVersions({ files: [] })).toEqual({
        storeVersions: ['v10'],
        isComplete: true,
      });
    });

    const pnpmHomeInstallCases: {
      place: string;
      storeFolderName: string;
      createInstall: () => Promise<void>;
    }[] = [
      {
        place: "the global folder of pnpm's XDG home",
        storeFolderName: 'v10',
        createInstall: () =>
          writePnpmPackage({
            packageFolder: join(homeDir, '.local/share/pnpm/global/5/node_modules/pnpm'),
            version: '10.14.0',
          }),
      },
      {
        place: '.tools/pnpm-exe beside its launcher script',
        storeFolderName: 'v10',
        createInstall: async () => {
          await writeFixtureTextFile({
            path: join(homeDir, 'Library/pnpm/.tools/pnpm-exe/10.22.0/pnpm'),
            text: 'Ïúíþ executable',
          });
          await writeFixtureTextFile({
            path: join(homeDir, 'Library/pnpm/pnpm'),
            text: '#!/bin/sh\nexec "$basedir/.tools/pnpm-exe/10.22.0/pnpm" "$@"\n',
          });
        },
      },
      {
        place: "an install folder of pnpm 11's global layout",
        storeFolderName: 'v11',
        createInstall: () =>
          writePnpmPackage({
            packageFolder: join(
              homeDir,
              'Library/pnpm/global/v11',
              PNPM_11_INSTALL_ID,
              'node_modules/pnpm',
            ),
            version: '11.1.2',
          }),
      },
      {
        place: "an install folder of pnpm 11's global layout as @pnpm/exe",
        storeFolderName: 'v11',
        createInstall: () =>
          writePnpmPackage({
            packageFolder: join(
              homeDir,
              'Library/pnpm/global/v11',
              PNPM_11_INSTALL_ID,
              'node_modules/@pnpm/exe',
            ),
            version: '11.1.2',
          }),
      },
    ];

    for (const homeInstallCase of pnpmHomeInstallCases) {
      test(`offers nothing beside a pnpm in ${homeInstallCase.place}`, async () => {
        await createStore({ folderNames: [homeInstallCase.storeFolderName] });
        await homeInstallCase.createInstall();

        expect(await loadOfferedVersions({ files: [] })).toEqual({
          storeVersions: [],
          isComplete: false,
        });
      });
    }

    for (const packageName of ['some-cli', '@scope/some-cli']) {
      test(`keeps the store version the global package ${packageName} of pnpm 11 links into`, async () => {
        const storeRoot = await createStore({ folderNames: ['v11'] });
        const globalInstallsPath = join(homeDir, 'Library/pnpm/global/v11');
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
      });

      test(`keeps the store version the global package ${packageName} of pnpm 10's global virtual store links into`, async () => {
        const storeRoot = await createStore({ folderNames: ['v10'] });
        await linkGlobalPackageIntoStore({
          storeRoot: storeRoot,
          storeFolderName: 'v10',
          packageName: packageName,
          linkPath: join(homeDir, 'Library/pnpm/global/5/node_modules', packageName),
        });

        expect(await loadOfferedVersions({ files: [] })).toEqual({
          storeVersions: [],
          isComplete: false,
        });
      });
    }

    const pinCases: { kind: ProjectPinFileKind; text: string }[] = [
      { kind: 'packageJson', text: '{"packageManager": "pnpm@10.14.0+sha512.0a1b"}' },
      { kind: 'toolVersions', text: 'pnpm 10.8.1\n' },
      { kind: 'miseConfig', text: '[tools]\n"npm:pnpm" = "10"\n' },
    ];

    for (const pinCase of pinCases) {
      test(`keeps a store version a ${pinCase.kind} pins`, async () => {
        await createStore({ folderNames: ['v3', 'v10'] });
        const pinFile = buildTestPinFileText({
          path: `${PROJECT_PATH}/pin`,
          kind: pinCase.kind,
          text: pinCase.text,
        });

        expect(await loadOfferedVersions({ files: [pinFile] })).toEqual({
          storeVersions: ['v3'],
          isComplete: false,
        });
      });
    }

    test('offers nothing while an unfit pin file pins every store version', async () => {
      await createStore({ folderNames: ['v3'] });
      const pinFile = buildTestPinFileUnfit({
        path: `${PROJECT_PATH}/package.json`,
        kind: 'packageJson',
      });

      expect(await loadOfferedVersions({ files: [pinFile] })).toEqual({
        storeVersions: [],
        isComplete: false,
      });
    });

    test('counts a mise link that names no version by the folder it points to', async () => {
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

    test('counts a dangling link for nothing', async () => {
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
      await createFixtureDirectory({ path: join(homeDir, '.cache/node/corepack/v1/pnpm/13.0.0') });

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
      const pinPath = `${PROJECT_PATH}/package.json`;
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
        path: `${PROJECT_PATH}/build.gradle`,
        kind: 'gradle',
      });

      expect(await loadOfferedVersions({ files: [pinFile] })).toEqual({
        storeVersions: ['v3'],
        isComplete: true,
      });
    });

    test('answers unreadable at an install folder it cannot list', async () => {
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
  });
}

describe('the recheck of a pnpm store unit', () => {
  let storeRoot: AbsolutePath;
  let pinPath: AbsolutePath;
  let unit: ExplorePathUnitPnpmStore;

  beforeEach(async () => {
    storeRoot = await createStoreFolders({
      rootNames: PNPM_STORE_ROOT_PATH_NAMES,
      folderNames: ['v10'],
    });
    pinPath = buildTestAbsolutePath({ text: join(homeDir, 'projects/app/package.json') });
    await writeFixtureTextFile({ path: pinPath, text: '{"packageManager": "yarn@4.1.0"}' });
    unit = {
      kind: 'pnpmStore',
      storeRoot: storeRoot,
      folderPath: buildTestAbsolutePath({ text: join(storeRoot, 'v10') }),
      storeVersion: buildTestPnpmStoreVersion({ text: 'v10' }),
      pinFiles: [{ path: pinPath, kind: 'packageJson' }],
    };
  });

  test('is unchanged while nothing uses the store version', async () => {
    expect(
      await recheckExplorePathUnit({ unit: unit, environment: environment, processCommands: [] }),
    ).toEqual({ kind: 'unchanged' });
  });

  test('is changed once one of its pin files pins a pnpm of its store version', async () => {
    await writeFile(pinPath, '{"packageManager": "pnpm@10.14.0"}');

    expect(
      await recheckExplorePathUnit({ unit: unit, environment: environment, processCommands: [] }),
    ).toEqual({ kind: 'changed' });
  });

  test('is changed once a pnpm of its store version is installed', async () => {
    await createFixtureDirectory({ path: join(homeDir, '.cache/node/corepack/v1/pnpm/10.14.0') });

    expect(
      await recheckExplorePathUnit({ unit: unit, environment: environment, processCommands: [] }),
    ).toEqual({ kind: 'changed' });
  });

  test('is busy while a pnpm process runs', async () => {
    expect(
      await recheckExplorePathUnit({
        unit: unit,
        environment: environment,
        processCommands: [PNPM_PROCESS_COMMAND],
      }),
    ).toEqual({ kind: 'busy' });
  });

  test('fails at an unreadable store root', async () => {
    await chmod(storeRoot, 0o000);

    expect(
      await recheckExplorePathUnit({ unit: unit, environment: environment, processCommands: [] }),
    ).toEqual({
      kind: 'failed',
      failure: {
        reason: 'fileUnreadable',
        path: storeRoot,
        failure: { reason: 'permissionDenied', code: 'EACCES' },
      },
    });
  });
});
