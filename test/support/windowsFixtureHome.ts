import { dirname, join } from 'node:path';
import type { CatalogEntry } from '../../src/catalog/catalog.js';
import type { DeletePlatformTrashRecycleBins } from '../../src/delete/deletePlatform.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { resolveEnvironmentLocation } from '../../src/environment/environmentLocation.js';
import type { DriveRoot } from '../../src/path/driveRoot.js';
import { isSameOrInsidePath } from '../../src/path/isSameOrInsidePath.js';
import type { Platform } from '../../src/platform/platform.js';
import { win32Platform } from '../../src/platform/win32/win32Platform.js';
import type { Result } from '../../src/result.js';
import type { RecycleBinContent } from '../../src/scan/candidate.js';
import { DAY_MS, SCAN_LIMITS } from '../../src/scan/limits.js';
import type { ScanReport } from '../../src/scan/runScan.js';
import { runScan } from '../../src/scan/runScan.js';
import type {
  AdvisedApp,
  RecycleBinLoad,
  ScanPlatformAppsAdvised,
  ScanPlatformTrashRecycleBins,
} from '../../src/scan/scanPlatform.js';
import type { SystemCallFailure } from '../../src/system/systemCallFailure.js';
import type { FixtureRoot } from './fixtureRoot.js';
import {
  createFixtureFile,
  loadTestWin32Environment,
  updateModifiedMs,
  writeFixtureTextFile,
} from './fixtureRoot.js';
import { buildRunningImagePaths } from './runningProcessesFixtures.js';

/** The paths of the items a Windows fixture home holds, each named for what the scan makes of it. */
export type WindowsFixturePaths = {
  staleTempFilePath: string;
  staleTempFolderPath: string;
  freshTempFilePath: string;
  npmCachePath: string;
  chromeCachePath: string;
  edgeCachePath: string;
  teamsCacheChildPath: string;
  dotnetBinPath: string;
  dotnetObjPath: string;
  nodeModulesPath: string;
  largeFilePath: string;
};

export type WindowsFixtureHome = { environment: Environment; paths: WindowsFixturePaths };

export type WindowsFixturePlatform = {
  platform: Platform;
  /** The ids of the catalog entries left out of the scan, since they lie outside the fixture. */
  leftOutEntryIds: string[];
  /** The drive roots whose Recycle Bin the deletion emptied, in the order it emptied them. */
  emptiedDriveRoots: DriveRoot[];
};

type FakeRecycleBins = {
  emptiedDriveRoots: DriveRoot[];
  loadRecycleBin: RecycleBinLoad;
  emptyRecycleBin: (params: { driveRoot: DriveRoot }) => Result<null, SystemCallFailure>;
};

/** The apps the Uninstall keys list, as the fake listing answers them, the largest first. */
export const WINDOWS_FIXTURE_ADVISED_APPS: AdvisedApp[] = [
  {
    displayName: 'Contoso Studio',
    installFolderPath: 'C:\\Program Files\\Contoso Studio',
    estimatedBytes: 734_003_200,
  },
  { displayName: 'Fabrikam Notes', installFolderPath: null, estimatedBytes: null },
];

/** The image paths of the running processes: new Teams runs, Chrome and Edge do not. */
export const WINDOWS_FIXTURE_RUNNING_IMAGE_PATHS = [
  'C:\\Windows\\explorer.exe',
  'C:\\Program Files\\WindowsApps\\MSTeams_25031.805.3440.5290_x64__8wekyb3d8bbwe\\ms-teams.exe',
];

/** What the fake bin of each fixed drive holds until the deletion empties it. */
export const WINDOWS_FIXTURE_RECYCLE_BIN_CONTENT: RecycleBinContent = {
  sizeBytes: 64 * SCAN_LIMITS.minOfferedBytes,
  itemCount: 3,
};

const FIXTURE_ITEM_BYTES = 2 * SCAN_LIMITS.minOfferedBytes;
const FIXTURE_AGE_DAYS = 400;

/**
 * Creates a home in `fixtureRoot` laid out as a Windows profile, with the Downloads known folder,
 * an item for each section of the scan, and the files beside them that no section offers.
 * Call it on Windows only.
 */
export async function createWindowsFixtureHome(params: {
  fixtureRoot: FixtureRoot;
  nowMs: number;
}): Promise<WindowsFixtureHome> {
  const environment = await loadTestWin32Environment({
    fixtureRoot: params.fixtureRoot,
    nowMs: params.nowMs,
    knownFolders: [{ folder: 'downloads', pathBelowHome: 'Downloads' }],
  });
  const homeDir = environment.homeDir;
  const localAppDataDir = join(homeDir, 'AppData', 'Local');
  const dotnetProjectPath = join(homeDir, 'source', 'repos', 'ContosoApp');
  const paths: WindowsFixturePaths = {
    staleTempFilePath: join(environment.tempDir, 'wct3F2A.tmp'),
    staleTempFolderPath: join(environment.tempDir, '7zO1A2B3C4D'),
    freshTempFilePath: join(environment.tempDir, 'wct9C1E.tmp'),
    npmCachePath: join(localAppDataDir, 'npm-cache', '_cacache'),
    chromeCachePath: join(localAppDataDir, 'Google', 'Chrome', 'User Data', 'Default', 'Cache'),
    edgeCachePath: join(localAppDataDir, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cache'),
    teamsCacheChildPath: join(
      localAppDataDir,
      'Packages',
      'MSTeams_8wekyb3d8bbwe',
      'LocalCache',
      'Microsoft',
      'MSTeams',
      'EBWebView',
    ),
    dotnetBinPath: join(dotnetProjectPath, 'Bin'),
    dotnetObjPath: join(dotnetProjectPath, 'obj'),
    nodeModulesPath: join(homeDir, 'code', 'web-shop', 'node_modules'),
    largeFilePath: join(homeDir, 'Downloads', 'recording-2024.mp4'),
  };
  const oldMs = params.nowMs - FIXTURE_AGE_DAYS * DAY_MS;

  await createOldFile({ path: paths.staleTempFilePath, oldMs: oldMs });
  await createOldFile({ path: join(paths.staleTempFolderPath, 'payload.bin'), oldMs: oldMs });
  await updateModifiedMs({ path: paths.staleTempFolderPath, modifiedMs: oldMs });
  await createFixtureFile({
    path: paths.freshTempFilePath,
    sizeBytes: FIXTURE_ITEM_BYTES,
    modifiedMs: params.nowMs,
  });

  await createOldFile({ path: join(paths.npmCachePath, 'content-v2', '9f86'), oldMs: oldMs });
  await writeFixtureTextFile({
    path: join(localAppDataDir, 'npm-cache', '_logs', 'debug-0.log'),
    text: '0 verbose cli npm\n',
  });
  await createOldFile({ path: join(paths.chromeCachePath, 'Cache_Data', 'data_1'), oldMs: oldMs });
  await createOldFile({ path: join(paths.edgeCachePath, 'Cache_Data', 'data_1'), oldMs: oldMs });
  await createOldFile({
    path: join(paths.teamsCacheChildPath, 'Default', 'Cache', 'Cache_Data', 'data_1'),
    oldMs: oldMs,
  });

  await createOldFile({ path: join(paths.dotnetBinPath, 'Debug', 'ContosoApp.dll'), oldMs: oldMs });
  await createOldFile({ path: join(paths.dotnetObjPath, 'Debug', 'ContosoApp.dll'), oldMs: oldMs });
  await createOldProjectFiles({
    projectPath: dotnetProjectPath,
    files: [
      { name: 'ContosoApp.csproj', text: '<Project Sdk="Microsoft.NET.Sdk" />\n' },
      { name: 'Program.cs', text: 'Console.WriteLine("Hello");\n' },
    ],
    oldMs: oldMs,
  });
  await createOldFile({ path: join(paths.nodeModulesPath, 'left-pad', 'index.js'), oldMs: oldMs });
  await createOldProjectFiles({
    projectPath: dirname(paths.nodeModulesPath),
    files: [
      { name: 'package.json', text: '{ "name": "web-shop", "private": true }\n' },
      { name: 'index.js', text: 'console.log("web-shop");\n' },
    ],
    oldMs: oldMs,
  });
  await createOldFile({ path: join(homeDir, 'tools', 'bin', 'helper.exe'), oldMs: oldMs });

  await createFixtureFile({
    path: paths.largeFilePath,
    sizeBytes: SCAN_LIMITS.minUserFileBytes + SCAN_LIMITS.minOfferedBytes,
    modifiedMs: oldMs,
  });
  await writeFixtureTextFile({ path: join(homeDir, 'Downloads', 'notes.txt'), text: 'A note.\n' });

  return { environment: environment, paths: paths };
}

/**
 * The Windows platform with the processes, the installed apps and the Recycle Bins answered by
 * fakes, so no scan or deletion lists the real processes, reads the registry, or touches a real
 * bin. Its catalog leaves out each entry that lies outside the fixture home and temp folder.
 */
export function buildWindowsFixturePlatform(params: {
  environment: Environment;
}): WindowsFixturePlatform {
  const leftOutEntries = win32Platform.catalog.entries.filter(
    (entry) => !isEntryInsideFixture({ entry: entry, environment: params.environment }),
  );
  const fakeRecycleBins = createFakeRecycleBins(WINDOWS_FIXTURE_RECYCLE_BIN_CONTENT);
  const platform: Platform = {
    ...win32Platform,
    catalog: {
      ...win32Platform.catalog,
      entries: win32Platform.catalog.entries.filter((entry) => !leftOutEntries.includes(entry)),
    },
    scan: {
      ...win32Platform.scan,
      apps: {
        ...getAdvisedAppsSection(),
        loadAdvisedApps: async () => ({ apps: WINDOWS_FIXTURE_ADVISED_APPS, issues: [] }),
      },
      trash: {
        ...getRecycleBinScanTrash(),
        loadRecycleBin: fakeRecycleBins.loadRecycleBin,
      },
    },
    delete: {
      ...win32Platform.delete,
      trash: {
        ...getRecycleBinDeleteTrash(),
        loadRecycleBin: fakeRecycleBins.loadRecycleBin,
        emptyRecycleBin: fakeRecycleBins.emptyRecycleBin,
      },
    },
    system: {
      ...win32Platform.system,
      loadRunningProcesses: async () => ({
        kind: 'succeeded',
        value: buildRunningImagePaths(WINDOWS_FIXTURE_RUNNING_IMAGE_PATHS),
      }),
    },
  };

  return {
    platform: platform,
    leftOutEntryIds: leftOutEntries.map((entry) => entry.id),
    emptiedDriveRoots: fakeRecycleBins.emptiedDriveRoots,
  };
}

/** Scans `environment` through `platform` with the default ages of the command line. */
export function runWindowsFixtureScan(params: {
  environment: Environment;
  platform: Platform;
}): Promise<ScanReport> {
  return runScan({
    environment: params.environment,
    catalog: params.platform.catalog,
    tools: params.platform.tools,
    scan: params.platform.scan,
    system: params.platform.system,
    explore: params.platform.explore,
    options: {
      staleDays: SCAN_LIMITS.defaultStaleDays,
      unusedDays: SCAN_LIMITS.defaultUnusedDays,
    },
    onProgress: () => undefined,
  });
}

async function createOldFile(params: { path: string; oldMs: number }): Promise<void> {
  await createFixtureFile({
    path: params.path,
    sizeBytes: FIXTURE_ITEM_BYTES,
    modifiedMs: params.oldMs,
  });
}

/** Writes the files of a project unchanged since `oldMs`, then dates the project folder itself. */
async function createOldProjectFiles(params: {
  projectPath: string;
  files: { name: string; text: string }[];
  oldMs: number;
}): Promise<void> {
  for (const file of params.files) {
    const filePath = join(params.projectPath, file.name);

    await writeFixtureTextFile({ path: filePath, text: file.text });
    await updateModifiedMs({ path: filePath, modifiedMs: params.oldMs });
  }

  await updateModifiedMs({ path: params.projectPath, modifiedMs: params.oldMs });
}

function isEntryInsideFixture(params: { entry: CatalogEntry; environment: Environment }): boolean {
  const entryPath = resolveEnvironmentLocation({
    folders: params.environment,
    location: { root: params.entry.root, path: params.entry.path },
  });

  return [params.environment.homeDir, params.environment.tempDir].some((folderPath) =>
    isSameOrInsidePath({
      rules: params.environment.pathRules,
      path: entryPath,
      parentPath: folderPath,
    }),
  );
}

/** Bins that hold `content` on every drive until a deletion empties one, which then holds none. */
function createFakeRecycleBins(content: RecycleBinContent): FakeRecycleBins {
  const emptiedDriveRoots: DriveRoot[] = [];

  return {
    emptiedDriveRoots: emptiedDriveRoots,
    loadRecycleBin(params) {
      if (emptiedDriveRoots.includes(params.driveRoot)) {
        return { kind: 'succeeded', value: { sizeBytes: 0, itemCount: 0 } };
      }

      return { kind: 'succeeded', value: content };
    },
    emptyRecycleBin(params) {
      emptiedDriveRoots.push(params.driveRoot);

      return { kind: 'succeeded', value: null };
    },
  };
}

function getAdvisedAppsSection(): ScanPlatformAppsAdvised {
  const apps = win32Platform.scan.apps;

  if (apps.appSection !== 'adviseOnly') {
    throw new Error('The scan of Windows only advises on the installed apps.');
  }

  return apps;
}

function getRecycleBinScanTrash(): ScanPlatformTrashRecycleBins {
  const trash = win32Platform.scan.trash;

  if (trash.kind !== 'recycleBins') {
    throw new Error('The scan of Windows measures a Recycle Bin per drive.');
  }

  return trash;
}

function getRecycleBinDeleteTrash(): DeletePlatformTrashRecycleBins {
  const trash = win32Platform.delete.trash;

  if (trash.kind !== 'recycleBins') {
    throw new Error('The deletion of Windows empties a Recycle Bin per drive.');
  }

  return trash;
}
