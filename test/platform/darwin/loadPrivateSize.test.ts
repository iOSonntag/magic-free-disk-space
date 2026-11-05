import { afterEach, beforeEach, expect, test } from 'bun:test';
import { link, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPrivateBytes } from '../../../src/platform/darwin/loadPrivateSize.js';
import { loadEntryStats } from '../../../src/system/loadEntryStats.js';
import type { FixtureRoot } from '../../support/fixtureRoot.js';
import {
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../../support/fixtureRoot.js';
import { describeOnPosix } from '../../support/posixOnly.js';

const FILE_BYTES = 1_048_576;
const MODIFIED_MS = Date.UTC(2026, 0, 1);

/**
 * True when `path` lies on an APFS volume, by `df` for its mount point and `mount` for the
 * volume's type. `cp -c` cannot tell, since it falls back to a plain copy elsewhere.
 */
function isOnApfsVolume(path: string): boolean {
  const dfLines = Bun.spawnSync(['/bin/df', '-P', path]).stdout.toString().trim().split('\n');
  const mountPoint = (dfLines.at(-1) ?? '').split(/\s+/).slice(5).join(' ');
  const mountLines = Bun.spawnSync(['/sbin/mount']).stdout.toString().split('\n');

  return mountLines.some((line) => line.includes(` on ${mountPoint} (apfs`));
}

const isTempVolumeApfs = process.platform === 'darwin' && isOnApfsVolume(tmpdir());

if (!isTempVolumeApfs) {
  console.warn('loadPrivateSize: the clone tests are skipped, the temp volume is not APFS.');
}

const testOnApfs = test.skipIf(!isTempVolumeApfs);

async function cloneFile(params: { sourcePath: string; clonePath: string }): Promise<void> {
  const copy = Bun.spawn(['/bin/cp', '-c', params.sourcePath, params.clonePath]);

  expect(await copy.exited).toBe(0);
}

/** Overwrites the first 4 KiB of the file in place, so a clone of it stops sharing that block. */
async function overwriteFirstBlock(path: string): Promise<void> {
  const write = Bun.spawn(
    ['/bin/dd', 'if=/dev/urandom', `of=${path}`, 'bs=4096', 'count=1', 'conv=notrunc'],
    { stderr: 'ignore' },
  );

  expect(await write.exited).toBe(0);
}

async function loadAllocatedBytes(path: string): Promise<number> {
  const stats = await loadEntryStats({ path: path });

  if (stats.kind === 'failed') {
    throw new Error(`Stats failed: ${stats.failure.reason}`);
  }

  return stats.value.allocatedBytes;
}

let fixtureRoot: FixtureRoot;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

describeOnPosix('loadPrivateBytes', () => {
  testOnApfs('reads a file no clone shares as its allocated blocks', async () => {
    const filePath = join(fixtureRoot.homeDir, 'plain.bin');

    await createFixtureFile({ path: filePath, sizeBytes: FILE_BYTES, modifiedMs: MODIFIED_MS });

    expect(loadPrivateBytes(filePath)).toBe(await loadAllocatedBytes(filePath));
  });

  testOnApfs('reads 0 for a file and its clone while they share every block', async () => {
    const originalPath = join(fixtureRoot.homeDir, 'original.bin');
    const clonePath = join(fixtureRoot.homeDir, 'clone.bin');

    await createFixtureFile({ path: originalPath, sizeBytes: FILE_BYTES, modifiedMs: MODIFIED_MS });
    await cloneFile({ sourcePath: originalPath, clonePath: clonePath });

    expect(loadPrivateBytes(originalPath)).toBe(0);
    expect(loadPrivateBytes(clonePath)).toBe(0);
    expect(await loadAllocatedBytes(clonePath)).toBeGreaterThanOrEqual(FILE_BYTES);
  });

  testOnApfs('reads the blocks a clone stopped sharing once one was written', async () => {
    const originalPath = join(fixtureRoot.homeDir, 'original.bin');
    const clonePath = join(fixtureRoot.homeDir, 'clone.bin');

    await createFixtureFile({ path: originalPath, sizeBytes: FILE_BYTES, modifiedMs: MODIFIED_MS });
    await cloneFile({ sourcePath: originalPath, clonePath: clonePath });
    await overwriteFirstBlock(clonePath);

    const clonePrivateBytes = loadPrivateBytes(clonePath);

    expect(clonePrivateBytes).toBeGreaterThanOrEqual(4096);
    expect(clonePrivateBytes).toBeLessThan(FILE_BYTES);
  });

  testOnApfs('reads the whole size for each link of a hard-linked file', async () => {
    const firstPath = join(fixtureRoot.homeDir, 'first.bin');
    const secondPath = join(fixtureRoot.homeDir, 'second.bin');

    await createFixtureFile({ path: firstPath, sizeBytes: FILE_BYTES, modifiedMs: MODIFIED_MS });
    await link(firstPath, secondPath);

    expect(loadPrivateBytes(firstPath)).toBe(await loadAllocatedBytes(firstPath));
    expect(loadPrivateBytes(secondPath)).toBe(await loadAllocatedBytes(firstPath));
  });

  testOnApfs('reads a symbolic link itself, not its target', async () => {
    const targetPath = join(fixtureRoot.homeDir, 'target.bin');
    const linkPath = join(fixtureRoot.homeDir, 'link.bin');

    await createFixtureFile({ path: targetPath, sizeBytes: FILE_BYTES, modifiedMs: MODIFIED_MS });
    await symlink(targetPath, linkPath);

    expect(loadPrivateBytes(linkPath)).toBeLessThan(FILE_BYTES);
  });

  test('is null for a path that does not exist', () => {
    expect(loadPrivateBytes(join(fixtureRoot.homeDir, 'absent'))).toBeNull();
  });
});
