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
import { dirname, join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { buildDarwinEnvironment } from '../../src/platform/darwin/loadEnvironment.js';
import { buildTestAbsolutePath, buildTestUserIdentity } from './parsedValueFixtures.js';

export type FixtureRoot = {
  rootDir: string;
  homeDir: AbsolutePath;
  tempDir: AbsolutePath;
  userCacheDir: AbsolutePath;
  applicationDir: AbsolutePath;
};

export async function createFixtureRoot(): Promise<FixtureRoot> {
  const rootDir = await mkdtemp(join(tmpdir(), 'magic-free-disk-space-test-'));
  const fixtureRoot: FixtureRoot = {
    rootDir: rootDir,
    homeDir: buildTestAbsolutePath({ text: join(rootDir, 'home') }),
    tempDir: buildTestAbsolutePath({ text: join(rootDir, 'tmp') }),
    userCacheDir: buildTestAbsolutePath({ text: join(rootDir, 'cache') }),
    applicationDir: buildTestAbsolutePath({ text: join(rootDir, 'Applications') }),
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

export async function loadTestEnvironment(params: {
  fixtureRoot: FixtureRoot;
  nowMs: number;
}): Promise<Environment> {
  const homeRealPath = await realpath(params.fixtureRoot.homeDir);
  const tempRealPath = await realpath(params.fixtureRoot.tempDir);
  const userCacheRealPath = await realpath(params.fixtureRoot.userCacheDir);
  const applicationRealPath = await realpath(params.fixtureRoot.applicationDir);

  return buildDarwinEnvironment({
    nowMs: params.nowMs,
    // The fixtures belong to the user that runs the tests.
    user: buildTestUserIdentity({ uid: process.getuid?.() ?? 0 }),
    homeDir: params.fixtureRoot.homeDir,
    homeRealPath: buildTestAbsolutePath({ text: homeRealPath }),
    tempDir: params.fixtureRoot.tempDir,
    tempRealPath: buildTestAbsolutePath({ text: tempRealPath }),
    userCacheDir: params.fixtureRoot.userCacheDir,
    userCacheRealPath: buildTestAbsolutePath({ text: userCacheRealPath }),
    applicationDirs: [params.fixtureRoot.applicationDir],
    applicationRealPaths: [buildTestAbsolutePath({ text: applicationRealPath })],
  });
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

/** Creates a file whose allocated size is at least `sizeBytes`; the filesystem rounds up to whole blocks. */
export async function createFixtureFile(params: {
  path: string;
  sizeBytes: number;
  modifiedMs: number;
  /** The modified time when left out. */
  accessedMs?: number;
}): Promise<void> {
  const accessedMs = params.accessedMs ?? params.modifiedMs;

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
