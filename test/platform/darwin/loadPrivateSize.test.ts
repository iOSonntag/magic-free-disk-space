import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { link, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  attributeAnswerToPrivateBytes,
  loadPrivateBytes,
} from '../../../src/platform/darwin/loadPrivateSize.js';
import {
  loadEntryAllocatedBytes,
  loadMeasuredAllocatedBytes,
} from '../../support/entryReadsFixtures.js';
import type { FixtureRoot } from '../../support/fixtureRoot.js';
import {
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../../support/fixtureRoot.js';
import { describeOnPosix } from '../../support/posixOnly.js';

const FILE_BYTES = 1_048_576;
const MODIFIED_MS = Date.UTC(2026, 0, 1);

// The bits and offsets of <sys/attr.h> and <sys/stat.h> that an answer of `getattrlist` carries.
const ATTR_CMN_RETURNED_ATTRS = 0x80000000;
const ATTR_CMN_FLAGS = 0x00040000;
const ATTR_CMNEXT_PRIVATESIZE = 0x00000008;
const UF_COMPRESSED = 0x00000020;
const UF_HIDDEN = 0x00008000;

/**
 * An answer of `getattrlist` as the kernel packs it: the length, the returned groups, the
 * common attributes, then the extended common ones. A `null` attribute is left out.
 */
function buildAttributeAnswer(params: {
  flags: number | null;
  privateBytes: bigint | null;
}): Uint8Array {
  const answer = new Uint8Array(36);
  const view = new DataView(answer.buffer);
  let cursor = 24;

  view.setUint32(4, ATTR_CMN_RETURNED_ATTRS | (params.flags === null ? 0 : ATTR_CMN_FLAGS), true);
  view.setUint32(20, params.privateBytes === null ? 0 : ATTR_CMNEXT_PRIVATESIZE, true);

  if (params.flags !== null) {
    view.setUint32(cursor, params.flags, true);
    cursor += 4;
  }

  if (params.privateBytes !== null) {
    view.setBigInt64(cursor, params.privateBytes, true);
    cursor += 8;
  }

  view.setUint32(0, cursor, true);

  return answer;
}

describe('attributeAnswerToPrivateBytes', () => {
  test('reads the private size after the flags of an entry not compressed', () => {
    const answer = buildAttributeAnswer({ flags: UF_HIDDEN, privateBytes: 8192n });

    expect(attributeAnswerToPrivateBytes(answer)).toBe(8192);
  });

  test('is null for a compressed file, so its allocated blocks count', () => {
    const answer = buildAttributeAnswer({ flags: UF_COMPRESSED | UF_HIDDEN, privateBytes: 0n });

    expect(attributeAnswerToPrivateBytes(answer)).toBeNull();
  });

  test('is null when the flags did not come back', () => {
    const answer = buildAttributeAnswer({ flags: null, privateBytes: 8192n });

    expect(attributeAnswerToPrivateBytes(answer)).toBeNull();
  });

  test('is null when the private size did not come back', () => {
    const answer = buildAttributeAnswer({ flags: 0, privateBytes: null });

    expect(attributeAnswerToPrivateBytes(answer)).toBeNull();
  });
});

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

/** Copies the file to `compressedPath` with decmpfs compression, as an installed app ships. */
async function copyCompressedFile(params: {
  sourcePath: string;
  compressedPath: string;
}): Promise<void> {
  const copy = Bun.spawn([
    '/usr/bin/ditto',
    '--hfsCompression',
    params.sourcePath,
    params.compressedPath,
  ]);

  expect(await copy.exited).toBe(0);
}

describeOnPosix('loadPrivateBytes', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  testOnApfs('reads a file no clone shares as its allocated blocks', async () => {
    const filePath = join(fixtureRoot.homeDir, 'plain.bin');

    await createFixtureFile({ path: filePath, sizeBytes: FILE_BYTES, modifiedMs: MODIFIED_MS });

    expect(loadPrivateBytes(filePath)).toBe(await loadEntryAllocatedBytes({ path: filePath }));
  });

  testOnApfs('counts a compressed file by its allocated blocks', async () => {
    const sourcePath = join(fixtureRoot.homeDir, 'source.txt');
    const compressedPath = join(fixtureRoot.homeDir, 'compressed.txt');

    // Hex text compresses to about half, too large to sit inline in the decmpfs attribute.
    await writeFile(sourcePath, randomBytes(FILE_BYTES / 2).toString('hex'));
    await copyCompressedFile({ sourcePath: sourcePath, compressedPath: compressedPath });

    const allocatedBytes = await loadEntryAllocatedBytes({ path: compressedPath });

    expect(allocatedBytes).toBeGreaterThan(0);
    expect(allocatedBytes).toBeLessThan(FILE_BYTES);
    expect(await loadMeasuredAllocatedBytes({ paths: [compressedPath] })).toBeGreaterThanOrEqual(
      allocatedBytes,
    );
  });

  testOnApfs('reads 0 for a file and its clone while they share every block', async () => {
    const originalPath = join(fixtureRoot.homeDir, 'original.bin');
    const clonePath = join(fixtureRoot.homeDir, 'clone.bin');

    await createFixtureFile({ path: originalPath, sizeBytes: FILE_BYTES, modifiedMs: MODIFIED_MS });
    await cloneFile({ sourcePath: originalPath, clonePath: clonePath });

    expect(loadPrivateBytes(originalPath)).toBe(0);
    expect(loadPrivateBytes(clonePath)).toBe(0);
    expect(await loadEntryAllocatedBytes({ path: clonePath })).toBeGreaterThanOrEqual(FILE_BYTES);
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

    const allocatedBytes = await loadEntryAllocatedBytes({ path: firstPath });

    expect(loadPrivateBytes(firstPath)).toBe(allocatedBytes);
    expect(loadPrivateBytes(secondPath)).toBe(allocatedBytes);
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
