import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import {
  emptyDriveRecycleBin,
  formatShellCallFailure,
  loadRecycleBin,
} from '../../../src/platform/win32/recycleBin.js';
import { loadLogicalDrives } from '../../../src/platform/win32/win32Api.js';
import { buildTestHostPath, buildTestWindowsPath } from '../../support/parsedValueFixtures.js';

/** An HRESULT as the shell writes it, such as `0x80070003`. */
const HRESULT_PATTERN = /^0x[0-9A-F]{8}$/;

/**
 * Set to `1` to run the probe that empties the Recycle Bin of the drive of the temporary folder,
 * every file in it, so it runs only on a throwaway machine; no workflow sets it.
 */
const IS_RECYCLE_BIN_PROBE_OPTED_IN = process.env.MAGIC_FREE_DISK_SPACE_RECYCLE_BIN_PROBE === '1';

describe('formatShellCallFailure', () => {
  test('writes the HRESULT as eight upper-case hex digits', () => {
    expect(
      formatShellCallFailure({ failure: { call: 'SHEmptyRecycleBinW', code: 0x8007_0005 } }),
    ).toBe('0x80070005');
    expect(formatShellCallFailure({ failure: { call: 'SHQueryRecycleBinW', code: 0xe } })).toBe(
      '0x0000000E',
    );
  });
});

describe('the Recycle Bin of a path that is no drive root', () => {
  test('is neither read nor emptied, before any call of the shell', () => {
    for (const text of ['C:\\Users', 'C:\\$Recycle.Bin', 'D:\\Data\\']) {
      const path = buildTestWindowsPath({ text: text });

      expect(loadRecycleBin({ driveRootPath: path })).toEqual({
        kind: 'failed',
        failure: 'notDriveRoot',
      });
      expect(emptyDriveRecycleBin({ driveRootPath: path })).toEqual({
        kind: 'failed',
        failure: 'notDriveRoot',
      });
    }
  });
});

/** The root of a drive letter no drive of this machine has, from `Z` down. */
function findAbsentDriveRoot(): string {
  const logicalDrives = loadLogicalDrives();

  if (logicalDrives.kind === 'failed') {
    throw new Error('GetLogicalDrives failed.');
  }

  for (let index = 25; index >= 0; index -= 1) {
    if ((logicalDrives.value & (1 << index)) === 0) {
      return `${String.fromCharCode(65 + index)}:\\`;
    }
  }

  throw new Error('Every drive letter is taken.');
}

describe.skipIf(process.platform !== 'win32')('the Recycle Bin of Windows', () => {
  const driveRootPath = buildTestHostPath({ text: parse(tmpdir()).root });

  test('SHQueryRecycleBinW counts the bin of the drive of the temporary folder', () => {
    const content = loadRecycleBin({ driveRootPath: driveRootPath });

    expect(content.kind).toBe('succeeded');

    if (content.kind === 'succeeded') {
      expect(content.value.sizeBytes).toBeGreaterThanOrEqual(0);
      expect(content.value.itemCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('SHQueryRecycleBinW fails with an HRESULT for a drive that is not there', () => {
    const content = loadRecycleBin({
      driveRootPath: buildTestHostPath({ text: findAbsentDriveRoot() }),
    });

    expect(content).toEqual({ kind: 'failed', failure: expect.stringMatching(HRESULT_PATTERN) });
  });

  describe.skipIf(!IS_RECYCLE_BIN_PROBE_OPTED_IN)('on a throwaway machine', () => {
    let folder: string;

    beforeEach(async () => {
      folder = await mkdtemp(join(tmpdir(), 'magic-free-disk-space-bin-'));
    });

    afterEach(async () => {
      await rm(folder, { recursive: true, force: true });
    });

    test('SHEmptyRecycleBinW empties the bin of the drive that holds a binned file', async () => {
      const filePath = join(folder, 'binned.txt');
      await writeFile(filePath, 'a file for the Recycle Bin');
      // The path goes through the environment, so no text of it is read as PowerShell.
      const binned = Bun.spawnSync(
        [
          'powershell',
          '-NoProfile',
          '-Command',
          'Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:BINNED_FILE_PATH, "OnlyErrorDialogs", "SendToRecycleBin")',
        ],
        { env: { ...process.env, BINNED_FILE_PATH: filePath }, stdout: 'ignore', stderr: 'pipe' },
      );

      expect(binned.exitCode).toBe(0);

      const before = loadRecycleBin({ driveRootPath: driveRootPath });

      expect(before).toMatchObject({ kind: 'succeeded' });
      expect(before.kind === 'succeeded' && before.value.itemCount > 0).toBe(true);
      expect(emptyDriveRecycleBin({ driveRootPath: driveRootPath })).toEqual({
        kind: 'succeeded',
        value: null,
      });
      expect(loadRecycleBin({ driveRootPath: driveRootPath })).toEqual({
        kind: 'succeeded',
        value: { sizeBytes: 0, itemCount: 0 },
      });
    });
  });
});
