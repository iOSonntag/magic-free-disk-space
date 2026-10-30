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
import { join } from 'node:path';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { buildEnvironment } from '../../src/environment/buildEnvironment.js';

export type FixtureRoot = {
  rootDir: string;
  homeDir: string;
  tempDir: string;
  applicationDir: string;
};

export async function createFixtureRoot(): Promise<FixtureRoot> {
  const rootDir = await mkdtemp(join(tmpdir(), 'magic-free-disk-space-test-'));
  const fixtureRoot: FixtureRoot = {
    rootDir,
    homeDir: join(rootDir, 'home'),
    tempDir: join(rootDir, 'tmp'),
    applicationDir: join(rootDir, 'Applications'),
  };

  await mkdir(fixtureRoot.homeDir);
  await mkdir(fixtureRoot.tempDir);
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
  const applicationRealPath = await realpath(params.fixtureRoot.applicationDir);

  return buildEnvironment({
    platform: 'darwin',
    nowMs: params.nowMs,
    // The fixtures belong to the user that runs the tests.
    userId: process.getuid?.() ?? 0,
    homeDir: params.fixtureRoot.homeDir,
    homeRealPath,
    tempDir: params.fixtureRoot.tempDir,
    tempRealPath,
    applicationDirs: [params.fixtureRoot.applicationDir],
    applicationRealPaths: [applicationRealPath],
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
