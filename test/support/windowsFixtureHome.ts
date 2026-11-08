import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { CatalogEntry } from '../../src/catalog/catalog.js';
import type { DeletePlatformTrashRecycleBins } from '../../src/delete/deletePlatform.js';
import type { Environment, EnvironmentFolders } from '../../src/environment/buildEnvironment.js';
import { resolveEnvironmentLocation } from '../../src/environment/environmentLocation.js';
import type { DriveRoot } from '../../src/path/driveRoot.js';
import { isSameOrInsidePath } from '../../src/path/isSameOrInsidePath.js';
import type { Platform } from '../../src/platform/platform.js';
import { win32Platform } from '../../src/platform/win32/win32Platform.js';
import type { ScanView } from '../../src/report/buildScanView.js';
import { buildScanView } from '../../src/report/buildScanView.js';
import type { RecycleBinContent } from '../../src/scan/candidate.js';
import { DAY_MS, SCAN_LIMITS } from '../../src/scan/limits.js';
import type { ScanReport } from '../../src/scan/runScan.js';
import type { AdvisedApp, RecycleBinLoad } from '../../src/scan/scanPlatform.js';
import type { FixtureRoot } from './fixtureRoot.js';
import {
  createFixtureFile,
  createTestWin32Environment,
  updateModifiedMs,
  writeFixtureTextFile,
} from './fixtureRoot.js';
import type { HomeFolder } from './parsedValueFixtures.js';
import { buildTestWindowsPath } from './parsedValueFixtures.js';
import { buildTestWin32Platform, loadEmptyRecycleBin } from './platformFixtures.js';
import { buildRunningImagePaths } from './runningProcessesFixtures.js';

/**
 * The paths of the items a Windows fixture home holds, each named for what the scan makes of it.
 */
export type WindowsFixturePaths = {
  staleTempFilePath: string;
  staleTempFolderPath: string;
  freshTempFilePath: string;
  npmCachePath: string;
  chromeCachePath: string;
  edgeCachePath: string;
  teamsCacheChildPath: string;
  teamsClassicLogsPath: string;
  teamsClassicBackgroundsPath: string;
  dotnetBinPath: string;
  dotnetObjPath: string;
  nodeModulesPath: string;
  vscodeExtensionPath: string;
  pnpmStorePath: string;
  androidSystemImagePath: string;
  androidPlatformPath: string;
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
  emptyRecycleBin: DeletePlatformTrashRecycleBins['emptyRecycleBin'];
};

/** The apps the Uninstall keys list, as the fake listing answers them, the largest first. */
export const windowsFixtureAdvisedApps: AdvisedApp[] = [
  {
    displayName: 'Contoso Studio',
    installFolderPath: buildTestWindowsPath({ text: 'C:\\Program Files\\Contoso Studio' }),
    estimatedBytes: 734_003_200,
  },
  { displayName: 'Fabrikam Notes', installFolderPath: null, estimatedBytes: null },
];

/**
 * The image paths of the running processes: new Teams runs; classic Teams, Chrome and Edge do not.
 */
const windowsFixtureRunningImagePaths = [
  'C:\\Windows\\explorer.exe',
  'C:\\Program Files\\WindowsApps\\MSTeams_25031.805.3440.5290_x64__8wekyb3d8bbwe\\ms-teams.exe',
];

/** What the fake bin of each fixed drive holds until the deletion empties it. */
export const windowsFixtureRecycleBinContent: RecycleBinContent = {
  sizeBytes: 64 * SCAN_LIMITS.minOfferedBytes,
  itemCount: 3,
};

const fixtureItemBytes = 2 * SCAN_LIMITS.minOfferedBytes;
const FIXTURE_AGE_DAYS = 400;
const VSCODE_EXTENSION_FOLDER_NAME = 'contoso.formatter-1.2.0';
const ANDROID_SYSTEM_IMAGE_PACKAGE_PATH = 'system-images;android-34;google_apis;x86_64';
const ANDROID_PLATFORM_PACKAGE_PATH = 'platforms;android-33';

/**
 * Creates a home in `fixtureRoot` laid out as a Windows profile, with the Downloads known folder,
 * an item for each section of the scan, four Explore items, and the files beside them that no
 * section offers. Call it on Windows only.
 */
export async function createWindowsFixtureHome(params: {
  fixtureRoot: FixtureRoot;
  nowMs: number;
}): Promise<WindowsFixtureHome> {
  const environment = await createTestWin32Environment({
    fixtureRoot: params.fixtureRoot,
    nowMs: params.nowMs,
    knownFolders: [{ folder: 'downloads', pathBelowHome: 'Downloads' }],
  });

  if (environment.platformFolders.kind !== 'win32') {
    throw new Error('The Windows fixture home has the folders of Windows.');
  }

  const homeDir = environment.homeDir;
  const localAppDataDir = environment.platformFolders.appDataDirs.localDir;
  const roamingAppDataDir = environment.platformFolders.appDataDirs.roamingDir;
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
    teamsClassicLogsPath: join(roamingAppDataDir, 'Microsoft', 'Teams', 'Logs'),
    teamsClassicBackgroundsPath: join(roamingAppDataDir, 'Microsoft', 'Teams', 'Backgrounds'),
    dotnetBinPath: join(dotnetProjectPath, 'Bin'),
    dotnetObjPath: join(dotnetProjectPath, 'obj'),
    nodeModulesPath: join(homeDir, 'code', 'web-shop', 'node_modules'),
    vscodeExtensionPath: join(homeDir, '.vscode', 'extensions', VSCODE_EXTENSION_FOLDER_NAME),
    pnpmStorePath: join(localAppDataDir, 'pnpm', 'store', 'v3'),
    androidSystemImagePath: join(
      localAppDataDir,
      'Android',
      'Sdk',
      ...ANDROID_SYSTEM_IMAGE_PACKAGE_PATH.split(';'),
    ),
    androidPlatformPath: join(
      localAppDataDir,
      'Android',
      'Sdk',
      ...ANDROID_PLATFORM_PACKAGE_PATH.split(';'),
    ),
    largeFilePath: join(homeDir, 'Downloads', 'recording-2024.mp4'),
  };
  const oldMs = params.nowMs - FIXTURE_AGE_DAYS * DAY_MS;

  await createOldFile({ path: paths.staleTempFilePath, oldMs: oldMs });
  await createOldFile({ path: join(paths.staleTempFolderPath, 'payload.bin'), oldMs: oldMs });
  await updateModifiedMs({ path: paths.staleTempFolderPath, modifiedMs: oldMs });
  await createFixtureFile({
    path: paths.freshTempFilePath,
    sizeBytes: fixtureItemBytes,
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
  // Classic Teams does not run, so only the sensitive list keeps its uploaded backgrounds.
  await createOldFile({ path: join(paths.teamsClassicLogsPath, 'teams-2024.log'), oldMs: oldMs });
  await createOldFile({
    path: join(paths.teamsClassicBackgroundsPath, 'Uploads', 'holiday-2024.png'),
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

  // VS Code lists no extension and marks this one obsolete, as an uninstall leaves it.
  await writeFixtureTextFile({
    path: join(dirname(paths.vscodeExtensionPath), 'extensions.json'),
    text: '[]\n',
  });
  await writeFixtureTextFile({
    path: join(dirname(paths.vscodeExtensionPath), '.obsolete'),
    text: `${JSON.stringify({ [VSCODE_EXTENSION_FOLDER_NAME]: true })}\n`,
  });
  await writeFixtureTextFile({
    path: join(paths.vscodeExtensionPath, 'package.json'),
    text: '{ "name": "formatter", "publisher": "contoso", "version": "1.2.0" }\n',
  });
  // No pnpm is installed or pinned, so no pnpm uses the store.
  await createOldFile({ path: join(paths.pnpmStorePath, 'files', '9f', '86d0'), oldMs: oldMs });
  await writeFixtureTextFile({
    path: join(paths.androidSystemImagePath, 'package.xml'),
    text: `<localPackage path="${ANDROID_SYSTEM_IMAGE_PACKAGE_PATH}" obsolete="false"/>\n`,
  });
  // The emulator has no virtual device, so none uses the image.
  await mkdir(join(homeDir, '.android', 'avd'), { recursive: true });
  // No Gradle file of a project pins a compileSdk, so none pins the platform.
  await writeFixtureTextFile({
    path: join(paths.androidPlatformPath, 'package.xml'),
    text: `<localPackage path="${ANDROID_PLATFORM_PACKAGE_PATH}" obsolete="false"/>\n`,
  });

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
  folders: EnvironmentFolders;
}): WindowsFixturePlatform {
  const leftOutEntries = win32Platform.catalog.entries.filter(
    (entry) => !isEntryInsideFixture({ entry: entry, folders: params.folders }),
  );
  const fakeRecycleBins = buildFakeRecycleBins(windowsFixtureRecycleBinContent);
  const platform = buildTestWin32Platform({
    loadAdvisedApps: async () => ({ apps: windowsFixtureAdvisedApps, issues: [] }),
    loadRecycleBin: fakeRecycleBins.loadRecycleBin,
    emptyRecycleBin: fakeRecycleBins.emptyRecycleBin,
    loadRunningProcesses: async () => ({
      kind: 'succeeded',
      value: buildRunningImagePaths(windowsFixtureRunningImagePaths),
    }),
  });

  return {
    platform: {
      ...platform,
      catalog: {
        ...platform.catalog,
        entries: platform.catalog.entries.filter((entry) => !leftOutEntries.includes(entry)),
      },
    },
    leftOutEntryIds: leftOutEntries.map((entry) => entry.id),
    emptiedDriveRoots: fakeRecycleBins.emptiedDriveRoots,
  };
}

/** The view the command line shows in a terminal for `report`, a scan of the fixture home. */
export function buildWindowsFixtureScanView(params: {
  report: ScanReport;
  home: HomeFolder;
}): ScanView {
  return buildScanView({
    report: params.report,
    fullDiskAccessHolder: 'terminal',
    texts: win32Platform.report,
    pathRules: params.home.pathRules,
    homeDir: params.home.homeDir,
    disk: null,
  });
}

async function createOldFile(params: { path: string; oldMs: number }): Promise<void> {
  await createFixtureFile({
    path: params.path,
    sizeBytes: fixtureItemBytes,
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

function isEntryInsideFixture(params: {
  entry: CatalogEntry;
  folders: EnvironmentFolders;
}): boolean {
  const entryPath = resolveEnvironmentLocation({
    folders: params.folders,
    location: { root: params.entry.root, path: params.entry.path },
  });

  return [params.folders.homeDir, params.folders.tempDir].some((folderPath) =>
    isSameOrInsidePath({
      rules: params.folders.pathRules,
      path: entryPath,
      parentPath: folderPath,
    }),
  );
}

/** Bins that hold `content` on every drive until a deletion empties one, which then holds none. */
function buildFakeRecycleBins(content: RecycleBinContent): FakeRecycleBins {
  const emptiedDriveRoots: DriveRoot[] = [];

  return {
    emptiedDriveRoots: emptiedDriveRoots,
    loadRecycleBin(params) {
      if (emptiedDriveRoots.includes(params.driveRoot)) {
        return loadEmptyRecycleBin();
      }

      return { kind: 'succeeded', value: content };
    },
    emptyRecycleBin(params) {
      emptiedDriveRoots.push(params.driveRoot);

      return { kind: 'succeeded', value: null };
    },
  };
}
