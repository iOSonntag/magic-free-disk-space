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
    rootDir,
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

/** Creates a file whose allocated size is at least `sizeBytes`; the filesystem rounds up to whole blocks. */
export async function createFixtureFile(params: {
  path: string;
  sizeBytes: number;
  modifiedMs: number;
}): Promise<void> {
  await writeFile(params.path, Buffer.alloc(params.sizeBytes));
  await updateModifiedMs({ path: params.path, modifiedMs: params.modifiedMs });
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
