import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeTree } from '../../../src/platform/win32/removeTree.js';
import { loadFileAttributes, setFileAttributes } from '../../../src/platform/win32/win32Api.js';
import { isPresent } from '../../support/fixtureRoot.js';
import { buildTestHostPath } from '../../support/parsedValueFixtures.js';

const FILE_ATTRIBUTE_READONLY = 0x1;

const HELD_LINE = 'held';

/**
 * Opens `path` in PowerShell with no sharing, so no other program may delete it, until `release`
 * is called; resolves once the file is held.
 */
async function holdFile(params: { path: string }): Promise<{ release: () => Promise<void> }> {
  // The path goes through the environment, so no text of it is read as PowerShell.
  const holder = Bun.spawn(
    [
      'powershell',
      '-NoProfile',
      '-Command',
      `$file = [System.IO.File]::Open($env:HELD_FILE_PATH, 'Open', 'Read', 'None'); [Console]::Out.WriteLine('${HELD_LINE}'); [Console]::Out.Flush(); [void][Console]::In.ReadLine(); $file.Close()`,
    ],
    {
      env: { ...process.env, HELD_FILE_PATH: params.path },
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'ignore',
    },
  );
  const reader = holder.stdout.getReader();
  let output = '';

  while (!output.includes(HELD_LINE)) {
    const chunk = await reader.read();

    if (chunk.done) {
      throw new Error('PowerShell ended before it held the file.');
    }

    output += new TextDecoder().decode(chunk.value);
  }

  return {
    release: async () => {
      holder.stdin.write('\n');
      await holder.stdin.end();
      await holder.exited;
    },
  };
}

describe.skipIf(process.platform !== 'win32')('the removal of a tree on NTFS', () => {
  let folder: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'magic-free-disk-space-remove-'));
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  test('SetFileAttributesW sets and clears the read-only bit that GetFileAttributesW reads', async () => {
    const filePath = buildTestHostPath({ text: join(folder, 'file.txt') });
    await writeFile(filePath, 'text');

    expect(setFileAttributes({ path: filePath, attributes: FILE_ATTRIBUTE_READONLY })).toEqual({
      kind: 'succeeded',
      value: null,
    });

    const readOnly = loadFileAttributes({ path: filePath });

    expect(readOnly.kind === 'succeeded' && (readOnly.value & FILE_ATTRIBUTE_READONLY) !== 0).toBe(
      true,
    );
    expect(setFileAttributes({ path: filePath, attributes: 0 })).toEqual({
      kind: 'succeeded',
      value: null,
    });

    const cleared = loadFileAttributes({ path: filePath });

    expect(cleared.kind === 'succeeded' && (cleared.value & FILE_ATTRIBUTE_READONLY) === 0).toBe(
      true,
    );
  });

  test('removes a tree whose file and folder are read-only', async () => {
    const treePath = join(folder, 'tree');
    const innerPath = join(treePath, 'inner');
    const filePath = join(innerPath, 'locked.txt');
    await mkdir(innerPath, { recursive: true });
    await writeFile(filePath, 'text');
    setFileAttributes({ path: buildTestHostPath({ text: filePath }), attributes: 0x21 });
    setFileAttributes({ path: buildTestHostPath({ text: innerPath }), attributes: 0x11 });

    expect(await removeTree({ path: treePath })).toEqual({
      kind: 'succeeded',
      value: { kind: 'removed' },
    });
    expect(await isPresent(treePath)).toBe(false);
  });

  test('removes a junction in the tree without entering it, and keeps its target', async () => {
    const targetPath = join(folder, 'target');
    const treePath = join(folder, 'tree');
    await mkdir(targetPath);
    await writeFile(join(targetPath, 'kept.txt'), 'kept');
    await mkdir(treePath);
    await symlink(targetPath, join(treePath, 'junction'), 'junction');

    expect(await removeTree({ path: treePath })).toEqual({
      kind: 'succeeded',
      value: { kind: 'removed' },
    });
    expect(await isPresent(treePath)).toBe(false);
    expect(await readFile(join(targetPath, 'kept.txt'), 'utf8')).toBe('kept');
  });

  test('leaves a file another program holds without sharing, and removes the rest', async () => {
    const treePath = join(folder, 'tree');
    const heldPath = join(treePath, 'held.bin');
    const freePath = join(treePath, 'free.bin');
    await mkdir(treePath);
    await writeFile(heldPath, 'held');
    await writeFile(freePath, 'free');
    const holder = await holdFile({ path: heldPath });

    try {
      expect(await removeTree({ path: treePath })).toEqual({
        kind: 'succeeded',
        value: { kind: 'partlyRemoved', stayedEntryCount: 1 },
      });
      expect((await stat(heldPath)).isFile()).toBe(true);
      expect(await isPresent(freePath)).toBe(false);
    } finally {
      await holder.release();
    }
  });
});
