import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, link, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { findLargeUserFiles } from '../../src/scan/findLargeUserFiles.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../support/fixtureRoot.js';

const MIN_ALLOCATED_BYTES = 1024 * 1024;
const LARGE_FILE_BYTES = 2 * 1024 * 1024;
const SMALL_FILE_BYTES = 1024;
const TEST_MODIFIED_MS = 1_600_000_000_000;
const FAR_FUTURE_DEADLINE_MS = Number.MAX_SAFE_INTEGER;

describe('findLargeUserFiles', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot });
  });

  test('finds large files at any depth and skips small ones', async () => {
    const largePath = join(fixtureRoot.homeDir, 'large.bin');
    const nestedDir = join(fixtureRoot.homeDir, 'Downloads/archive');
    const nestedPath = join(nestedDir, 'nested.zip');
    await createFixtureDirectory({ path: nestedDir });
    await createFixtureFile({
      path: largePath,
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });
    await createFixtureFile({
      path: nestedPath,
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });
    await createFixtureFile({
      path: join(fixtureRoot.homeDir, 'small.txt'),
      sizeBytes: SMALL_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });

    const result = await findLargeUserFiles({
      rootDirs: [fixtureRoot.homeDir],
      minAllocatedBytes: MIN_ALLOCATED_BYTES,
      deadlineMs: FAR_FUTURE_DEADLINE_MS,
    });

    expect(result.issues).toEqual([]);
    expect(result.findings.map((finding) => finding.path).toSorted()).toEqual(
      [largePath, nestedPath].toSorted(),
    );
  });

  test('a finding carries its identity, size, and modified time', async () => {
    const largePath = join(fixtureRoot.homeDir, 'large.bin');
    await createFixtureFile({
      path: largePath,
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });

    const result = await findLargeUserFiles({
      rootDirs: [fixtureRoot.homeDir],
      minAllocatedBytes: MIN_ALLOCATED_BYTES,
      deadlineMs: FAR_FUTURE_DEADLINE_MS,
    });

    const [finding] = result.findings;

    expect(result.findings).toHaveLength(1);
    expect(finding?.path).toBe(largePath);
    expect(finding?.identity.kind).toBe('file');
    expect(finding?.allocatedBytes).toBeGreaterThanOrEqual(LARGE_FILE_BYTES);
    expect(finding?.modifiedMs).toBe(TEST_MODIFIED_MS);
  });

  test('files of a git working tree, a hidden folder, or a framework are not found', async () => {
    const hiddenPaths = [
      'Documents/sdk/.git/objects/pack.bin',
      'Documents/sdk/bin/cache/engine.bin',
      'Documents/.tool/blob.bin',
      'Documents/Kit.framework/Versions/A/Kit',
      'Documents/Effects.vst3/Contents/effect.bin',
    ];
    const loosePath = join(fixtureRoot.homeDir, 'Documents/recording.mov');

    for (const relativePath of hiddenPaths) {
      const path = join(fixtureRoot.homeDir, relativePath);

      await createFixtureDirectory({ path: join(path, '..') });
      await createFixtureFile({
        path: path,
        sizeBytes: LARGE_FILE_BYTES,
        modifiedMs: TEST_MODIFIED_MS,
      });
    }

    await createFixtureFile({
      path: loosePath,
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });

    const result = await findLargeUserFiles({
      rootDirs: [join(fixtureRoot.homeDir, 'Documents')],
      minAllocatedBytes: MIN_ALLOCATED_BYTES,
      deadlineMs: FAR_FUTURE_DEADLINE_MS,
    });

    expect(result.findings.map((finding) => finding.path)).toEqual([loosePath]);
  });

  test('a file inside a package folder is not found', async () => {
    const originalsDir = join(fixtureRoot.homeDir, 'Pictures/Photos.photoslibrary/originals');
    await createFixtureDirectory({ path: originalsDir });
    await createFixtureFile({
      path: join(originalsDir, 'large.jpg'),
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });

    const result = await findLargeUserFiles({
      rootDirs: [fixtureRoot.homeDir],
      minAllocatedBytes: MIN_ALLOCATED_BYTES,
      deadlineMs: FAR_FUTURE_DEADLINE_MS,
    });

    expect(result).toEqual({ findings: [], issues: [] });
  });

  test('a package folder name matches its suffix case-insensitively', async () => {
    const bundleContentsDir = join(fixtureRoot.homeDir, 'Tools.APP/Contents');
    await createFixtureDirectory({ path: bundleContentsDir });
    await createFixtureFile({
      path: join(bundleContentsDir, 'large.bin'),
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });

    const result = await findLargeUserFiles({
      rootDirs: [fixtureRoot.homeDir],
      minAllocatedBytes: MIN_ALLOCATED_BYTES,
      deadlineMs: FAR_FUTURE_DEADLINE_MS,
    });

    expect(result).toEqual({ findings: [], issues: [] });
  });

  test('a symbolic link to a large file is not followed', async () => {
    const outsideDir = join(fixtureRoot.rootDir, 'outside');
    await createFixtureDirectory({ path: outsideDir });
    await createFixtureFile({
      path: join(outsideDir, 'large.bin'),
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });
    await symlink(join(outsideDir, 'large.bin'), join(fixtureRoot.homeDir, 'link.bin'));

    const result = await findLargeUserFiles({
      rootDirs: [fixtureRoot.homeDir],
      minAllocatedBytes: MIN_ALLOCATED_BYTES,
      deadlineMs: FAR_FUTURE_DEADLINE_MS,
    });

    expect(result).toEqual({ findings: [], issues: [] });
  });

  test('a root that is a symbolic link is not walked', async () => {
    const outsideDir = join(fixtureRoot.rootDir, 'outside');
    await createFixtureDirectory({ path: outsideDir });
    await createFixtureFile({
      path: join(outsideDir, 'large.bin'),
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });
    const linkedRootDir = join(fixtureRoot.rootDir, 'linked-root');
    await symlink(outsideDir, linkedRootDir);

    const result = await findLargeUserFiles({
      rootDirs: [linkedRootDir],
      minAllocatedBytes: MIN_ALLOCATED_BYTES,
      deadlineMs: FAR_FUTURE_DEADLINE_MS,
    });

    expect(result).toEqual({ findings: [], issues: [] });
  });

  test('a hard link to a large file is reported once', async () => {
    const firstPath = join(fixtureRoot.homeDir, 'first.bin');
    await createFixtureFile({
      path: firstPath,
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });
    await link(firstPath, join(fixtureRoot.homeDir, 'second.bin'));

    const result = await findLargeUserFiles({
      rootDirs: [fixtureRoot.homeDir],
      minAllocatedBytes: MIN_ALLOCATED_BYTES,
      deadlineMs: FAR_FUTURE_DEADLINE_MS,
    });

    expect(result.findings.map((finding) => finding.path)).toEqual([firstPath]);
  });

  test('an unreadable folder gives an issue while its siblings are searched', async () => {
    const lockedDir = join(fixtureRoot.homeDir, 'a-locked');
    await createFixtureDirectory({ path: lockedDir });
    await createFixtureFile({
      path: join(lockedDir, 'hidden.bin'),
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });
    await chmod(lockedDir, 0o000);
    const openDir = join(fixtureRoot.homeDir, 'b-open');
    await createFixtureDirectory({ path: openDir });
    const visiblePath = join(openDir, 'visible.bin');
    await createFixtureFile({
      path: visiblePath,
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });

    const result = await findLargeUserFiles({
      rootDirs: [fixtureRoot.homeDir],
      minAllocatedBytes: MIN_ALLOCATED_BYTES,
      deadlineMs: FAR_FUTURE_DEADLINE_MS,
    });

    expect(result.findings.map((finding) => finding.path)).toEqual([visiblePath]);
    expect(result.issues).toEqual([
      { path: lockedDir, reason: 'permissionDenied', detail: 'EACCES' },
    ]);
  });

  test('a passed deadline stops the walk with one walkStopped issue', async () => {
    await createFixtureFile({
      path: join(fixtureRoot.homeDir, 'large.bin'),
      sizeBytes: LARGE_FILE_BYTES,
      modifiedMs: TEST_MODIFIED_MS,
    });

    const result = await findLargeUserFiles({
      rootDirs: [fixtureRoot.homeDir, fixtureRoot.tempDir],
      minAllocatedBytes: MIN_ALLOCATED_BYTES,
      deadlineMs: 0,
    });

    expect(result).toEqual({
      findings: [],
      issues: [{ path: fixtureRoot.homeDir, reason: 'walkStopped', detail: 'deadline' }],
    });
  });

  test('a missing root adds nothing', async () => {
    const result = await findLargeUserFiles({
      rootDirs: [join(fixtureRoot.homeDir, 'absent')],
      minAllocatedBytes: MIN_ALLOCATED_BYTES,
      deadlineMs: FAR_FUTURE_DEADLINE_MS,
    });

    expect(result).toEqual({ findings: [], issues: [] });
  });
});
