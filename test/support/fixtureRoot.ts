import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, parse, relative, sep } from 'node:path';
import type {
  Environment,
  PlatformFoldersWin32,
  WindowsKnownFolder,
  WindowsKnownFolderPaths,
} from '../../src/environment/buildEnvironment.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { buildDarwinEnvironment } from '../../src/platform/darwin/loadEnvironment.js';
import { buildWin32Environment } from '../../src/platform/win32/loadEnvironment.js';
import {
  buildTestAbsolutePath,
  buildTestDriveRoot,
  buildTestHostPath,
  buildTestUserIdentity,
  exampleWindowsUser,
} from './parsedValueFixtures.js';

export type FixtureRoot = {
  rootDir: string;
  homeDir: AbsolutePath;
  tempDir: AbsolutePath;
  userCacheDir: AbsolutePath;
  applicationDir: AbsolutePath;
};

/** A folder of a fixture environment by its path and its real path. */
type TestFolder = { path: AbsolutePath; realPath: AbsolutePath };

/** A known folder of Windows that a fixture creates below its home, at `pathBelowHome`. */
export type TestKnownFolder = { folder: WindowsKnownFolder; pathBelowHome: string };

/** Windows names no path for a known folder that a fixture did not create. */
export const noKnownFolderPaths: WindowsKnownFolderPaths = {
  desktop: null,
  documents: null,
  downloads: null,
  videos: null,
  music: null,
  pictures: null,
  localAppDataLow: null,
  skyDrive: null,
};

export async function createFixtureRoot(): Promise<FixtureRoot> {
  const rootDir = await mkdtemp(join(await loadFixtureParentDir(), 'magic-free-disk-space-test-'));
  const fixtureRoot: FixtureRoot = {
    rootDir: rootDir,
    homeDir: buildTestHostPath({ text: join(rootDir, 'home') }),
    tempDir: buildTestHostPath({ text: join(rootDir, 'tmp') }),
    userCacheDir: buildTestHostPath({ text: join(rootDir, 'cache') }),
    applicationDir: buildTestHostPath({ text: join(rootDir, 'Applications') }),
  };

  await mkdir(fixtureRoot.homeDir);
  await mkdir(fixtureRoot.tempDir);
  await mkdir(fixtureRoot.userCacheDir);
  await mkdir(fixtureRoot.applicationDir);

  return fixtureRoot;
}

export async function deleteFixtureRoot(params: { fixtureRoot: FixtureRoot }): Promise<void> {
  await restoreWritableDirectories({ path: params.fixtureRoot.rootDir });
  await rm(params.fixtureRoot.rootDir, { recursive: true });
}

/** Runs `run` in a fresh fixture root, deleted afterwards whether `run` resolves or rejects. */
export async function withFixtureRoot(params: {
  run: (fixtureRoot: FixtureRoot) => Promise<void>;
}): Promise<void> {
  const fixtureRoot = await createFixtureRoot();

  try {
    await params.run(fixtureRoot);
  } finally {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  }
}

/**
 * The environment of a run on the host's platform, with its folders in the fixture root. Windows
 * has no folder of the system's caches, so the fixture's cache folder is unused there.
 */
export async function loadTestEnvironment(params: {
  fixtureRoot: FixtureRoot;
  nowMs: number;
}): Promise<Environment> {
  if (process.platform === 'win32') {
    return loadTestWin32Environment({
      fixtureRoot: params.fixtureRoot,
      nowMs: params.nowMs,
      knownFolders: [],
    });
  }

  const home = await loadTestFolder({ path: params.fixtureRoot.homeDir });
  const temp = await loadTestFolder({ path: params.fixtureRoot.tempDir });
  const userCache = await loadTestFolder({ path: params.fixtureRoot.userCacheDir });
  const application = await loadTestFolder({ path: params.fixtureRoot.applicationDir });

  return buildDarwinEnvironment({
    nowMs: params.nowMs,
    // The fixtures belong to the user that runs the tests.
    user: buildTestUserIdentity({ uid: process.getuid?.() ?? 0 }),
    homeDir: home.path,
    homeRealPath: home.realPath,
    tempDir: temp.path,
    tempRealPath: temp.realPath,
    userCacheDir: userCache.path,
    userCacheRealPath: userCache.realPath,
    applicationDirs: [application.path],
    applicationRealPaths: [application.realPath],
  });
}

/**
 * The environment of a run on Windows, with its folders in the fixture root and each of
 * `knownFolders` created below the fixture home. Call it on Windows only.
 */
export async function loadTestWin32Environment(params: {
  fixtureRoot: FixtureRoot;
  nowMs: number;
  knownFolders: TestKnownFolder[];
}): Promise<Environment> {
  const home = await loadTestFolder({ path: params.fixtureRoot.homeDir });
  const temp = await loadTestFolder({ path: params.fixtureRoot.tempDir });
  const appDataDirs = buildTestWin32PlatformFolders({ homeDir: home.path }).appDataDirs;
  const knownFolderPaths = await createTestKnownFolders({
    homeDir: home.path,
    knownFolders: params.knownFolders,
  });

  return buildWin32Environment({
    nowMs: params.nowMs,
    // A made-up user serves: the owner of a fixture is never read on Windows, where no tool is trusted.
    user: exampleWindowsUser,
    home: home,
    temp: temp,
    localAppData: await createTestFolder({ path: appDataDirs.localDir }),
    roamingAppData: await createTestFolder({ path: appDataDirs.roamingDir }),
    knownFolderPaths: knownFolderPaths.paths,
    knownFolderRealPaths: knownFolderPaths.realPaths,
    fixedDriveRoots: [buildTestDriveRoot({ text: parse(params.fixtureRoot.rootDir).root })],
    oneDriveRealPaths: [],
  });
}

/**
 * The platform folders of Windows below the fixture home `homeDir`: the AppData folders where
 * `loadTestWin32Environment` creates them, and no known folder. Creates nothing on disk.
 */
export function buildTestWin32PlatformFolders(params: { homeDir: string }): PlatformFoldersWin32 {
  return {
    kind: 'win32',
    appDataDirs: {
      localDir: buildTestHostPath({ text: join(params.homeDir, 'AppData', 'Local') }),
      roamingDir: buildTestHostPath({ text: join(params.homeDir, 'AppData', 'Roaming') }),
    },
    knownFolderPaths: noKnownFolderPaths,
  };
}

/**
 * The environment of a made-up home folder that never exists on disk, whose paths are their own
 * real paths, for code that only compares paths.
 */
export function buildTestPathEnvironment(params: { homeDir: string; nowMs: number }): Environment {
  const homeDir = buildTestAbsolutePath({ text: params.homeDir });
  const tempDir = buildTestAbsolutePath({ text: '/private/var/folders/xx/example/T' });
  const userCacheDir = buildTestAbsolutePath({ text: '/private/var/folders/xx/example/C' });
  const applicationDir = buildTestAbsolutePath({ text: '/Applications' });

  return buildDarwinEnvironment({
    nowMs: params.nowMs,
    user: buildTestUserIdentity({ uid: 501 }),
    homeDir: homeDir,
    homeRealPath: homeDir,
    tempDir: tempDir,
    tempRealPath: tempDir,
    userCacheDir: userCacheDir,
    userCacheRealPath: userCacheDir,
    applicationDirs: [applicationDir],
    applicationRealPaths: [applicationDir],
  });
}

/** The made-up home folder of `buildTestMacEnvironment`. */
export const TEST_MAC_HOME_DIR = '/Users/tester';

/**
 * The environment of a made-up Mac as macOS lays it out, whose temporary and cache folders lie
 * under `/var`, a link to `/private/var`, so their real paths differ from their paths.
 */
export function buildTestMacEnvironment(): Environment {
  return buildDarwinEnvironment({
    nowMs: 0,
    user: buildTestUserIdentity({ uid: 501 }),
    homeDir: buildTestAbsolutePath({ text: TEST_MAC_HOME_DIR }),
    homeRealPath: buildTestAbsolutePath({ text: TEST_MAC_HOME_DIR }),
    tempDir: buildTestAbsolutePath({ text: '/var/folders/xy/abc/T' }),
    tempRealPath: buildTestAbsolutePath({ text: '/private/var/folders/xy/abc/T' }),
    userCacheDir: buildTestAbsolutePath({ text: '/var/folders/xy/abc/C' }),
    userCacheRealPath: buildTestAbsolutePath({ text: '/private/var/folders/xy/abc/C' }),
    applicationDirs: [buildTestAbsolutePath({ text: '/Applications' })],
    applicationRealPaths: [buildTestAbsolutePath({ text: '/Applications' })],
  });
}

/**
 * Creates a file whose allocated size is at least `sizeBytes`, creating its missing parent
 * folders; the filesystem rounds up to whole blocks.
 */
export async function createFixtureFile(params: {
  path: string;
  sizeBytes: number;
  modifiedMs: number;
  /** The modified time when left out. */
  accessedMs?: number;
}): Promise<void> {
  const accessedMs = params.accessedMs ?? params.modifiedMs;

  await mkdir(dirname(params.path), { recursive: true });
  await writeFile(params.path, Buffer.alloc(params.sizeBytes));
  await utimes(params.path, accessedMs / 1000, params.modifiedMs / 1000);
}

export async function createFixtureDirectory(params: { path: string }): Promise<void> {
  await mkdir(params.path, { recursive: true });
}

/** Writes `text` to the file at `path`, creating its missing parent folders. */
export async function writeFixtureTextFile(params: { path: string; text: string }): Promise<void> {
  await mkdir(dirname(params.path), { recursive: true });
  await writeFile(params.path, params.text);
}

/**
 * Every file and folder under the fixture root by its path below the root, with `/` between its
 * names on every host, except the folder of the deletion log at `deletionLogPath`, what it holds,
 * and the folders above it, which a deletion creates.
 */
export async function listFixturePathsBesideLog(params: {
  fixtureRoot: FixtureRoot;
  deletionLogPath: string;
}): Promise<string[]> {
  const entries = await readdir(params.fixtureRoot.rootDir, { recursive: true });
  const logFolderPath = buildPathBelowRoot({
    rootDir: params.fixtureRoot.rootDir,
    path: dirname(params.deletionLogPath),
  });

  return entries
    .map((entry) =>
      buildPathBelowRoot({
        rootDir: params.fixtureRoot.rootDir,
        path: join(params.fixtureRoot.rootDir, entry),
      }),
    )
    .filter(
      (path) =>
        !isSameOrBelowPathBelowRoot({ path: path, parentPath: logFolderPath }) &&
        !isSameOrBelowPathBelowRoot({ path: logFolderPath, parentPath: path }),
    )
    .toSorted();
}

/** The path of `path` below `rootDir`, with `/` between its names on every host. */
export function buildPathBelowRoot(params: { rootDir: string; path: string }): string {
  return relative(params.rootDir, params.path).split(sep).join('/');
}

/** Whether `path` is `parentPath` or lies below it, both written as `buildPathBelowRoot` writes them. */
export function isSameOrBelowPathBelowRoot(params: { path: string; parentPath: string }): boolean {
  return params.path === params.parentPath || params.path.startsWith(`${params.parentPath}/`);
}

/** Whether anything is at `path`; a symbolic link counts itself, whatever its target. */
export async function isPresent(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

/** Sets the modified time of a file or directory. Call it after a directory's children exist: adding a child changes it. */
export async function updateModifiedMs(params: {
  path: string;
  modifiedMs: number;
}): Promise<void> {
  const modifiedSeconds = params.modifiedMs / 1000;

  await utimes(params.path, modifiedSeconds, modifiedSeconds);
}

/**
 * The temp folder of the host as it names it, so a test on macOS reaches its fixtures through the
 * link `/var`; on Windows its real path, which a short name such as `RUNNER~1` in TEMP would hide.
 */
async function loadFixtureParentDir(): Promise<string> {
  if (process.platform === 'win32') {
    return realpath(tmpdir());
  }

  return tmpdir();
}

async function loadTestFolder(params: { path: AbsolutePath }): Promise<TestFolder> {
  return {
    path: params.path,
    realPath: buildTestHostPath({ text: await realpath(params.path) }),
  };
}

async function createTestFolder(params: { path: string }): Promise<TestFolder> {
  await mkdir(params.path, { recursive: true });

  return loadTestFolder({ path: buildTestHostPath({ text: params.path }) });
}

async function createTestKnownFolders(params: {
  homeDir: AbsolutePath;
  knownFolders: TestKnownFolder[];
}): Promise<{ paths: WindowsKnownFolderPaths; realPaths: WindowsKnownFolderPaths }> {
  const paths: WindowsKnownFolderPaths = { ...noKnownFolderPaths };
  const realPaths: WindowsKnownFolderPaths = { ...noKnownFolderPaths };

  for (const knownFolder of params.knownFolders) {
    const folder = await createTestFolder({
      path: join(params.homeDir, knownFolder.pathBelowHome),
    });

    paths[knownFolder.folder] = folder.path;
    realPaths[knownFolder.folder] = folder.realPath;
  }

  return { paths: paths, realPaths: realPaths };
}

async function restoreWritableDirectories(params: { path: string }): Promise<void> {
  const stats = await lstat(params.path);

  if (!stats.isDirectory()) {
    return;
  }

  await chmod(params.path, 0o700);

  const names = await readdir(params.path);

  for (const name of names) {
    await restoreWritableDirectories({ path: join(params.path, name) });
  }
}
