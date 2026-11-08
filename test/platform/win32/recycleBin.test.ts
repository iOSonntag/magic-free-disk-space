import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import type { DriveRoot } from '../../../src/path/driveRoot.js';
import { listDriveRootTexts } from '../../../src/platform/win32/listDriveRoots.js';
import {
  emptyRecycleBin,
  loadLogicalDrives,
  loadRecycleBinContent,
} from '../../../src/platform/win32/win32Api.js';
import { buildTestDriveRoot } from '../../support/parsedValueFixtures.js';
import { getWin32RecycleBinDeleteTrash } from '../../support/platformFixtures.js';
import { describeOnWindows } from '../../support/windowsOnly.js';

/** The lowest code of a failed HRESULT, read as unsigned. */
const FIRST_FAILURE_HRESULT = 0x80000000;

/**
 * Set to `1` to run the probe that empties the Recycle Bin of the drive of the temporary folder,
 * every file in it, so it runs only on a throwaway machine, such as the Windows runner of the
 * tests.
 */
const isRecycleBinProbeOptedIn = process.env.MAGIC_FREE_DISK_SPACE_RECYCLE_BIN_PROBE === '1';

/** The root of the drive of the temporary folder, whose bin the probes count and empty. */
function loadHostDriveRoot(): DriveRoot {
  return buildTestDriveRoot({ text: parse(tmpdir()).root });
}

/** The root of the last drive letter no drive of this machine has. */
function loadAbsentDriveRoot(): DriveRoot {
  const logicalDrives = loadLogicalDrives();

  if (logicalDrives.kind === 'failed') {
    throw new Error('GetLogicalDrives failed.');
  }

  const absentRootTexts = listDriveRootTexts({ logicalDrives: ~logicalDrives.value });
  const lastAbsentRootText = absentRootTexts.at(-1);

  if (lastAbsentRootText === undefined) {
    throw new Error('Every drive letter is taken.');
  }

  return buildTestDriveRoot({ text: lastAbsentRootText });
}

describeOnWindows('the Recycle Bin of Windows', () => {
  test('SHQueryRecycleBinW counts the bin of the drive of the temporary folder', () => {
    const content = loadRecycleBinContent({ driveRoot: loadHostDriveRoot() });

    expect(content.kind).toBe('succeeded');

    if (content.kind === 'succeeded') {
      expect(content.value.sizeBytes).toBeGreaterThanOrEqual(0);
      expect(content.value.itemCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('SHQueryRecycleBinW fails with its HRESULT for a drive that is not there', () => {
    const content = loadRecycleBinContent({ driveRoot: loadAbsentDriveRoot() });

    expect(content).toEqual({
      kind: 'failed',
      failure: { call: 'SHQueryRecycleBinW', code: expect.any(Number) },
    });
    expect(content.kind === 'failed' && content.failure.code >= FIRST_FAILURE_HRESULT).toBe(true);
  });

  describe.skipIf(!isRecycleBinProbeOptedIn)('on a throwaway machine', () => {
    let folder: string;

    beforeEach(async () => {
      folder = await mkdtemp(join(tmpdir(), 'magic-free-disk-space-bin-'));
    });

    afterEach(async () => {
      await rm(folder, { recursive: true, force: true });
    });

    test('SHEmptyRecycleBinW empties the bin of a binned file, then finds nothing to empty', async () => {
      const driveRoot = loadHostDriveRoot();
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

      const before = loadRecycleBinContent({ driveRoot: driveRoot });

      expect(before).toMatchObject({ kind: 'succeeded' });
      expect(before.kind === 'succeeded' && before.value.itemCount > 0).toBe(true);
      expect(emptyRecycleBin({ driveRoot: driveRoot })).toEqual({
        kind: 'succeeded',
        value: null,
      });
      expect(loadRecycleBinContent({ driveRoot: driveRoot })).toEqual({
        kind: 'succeeded',
        value: { sizeBytes: 0, itemCount: 0 },
      });
      expect(emptyRecycleBin({ driveRoot: driveRoot })).toEqual({
        kind: 'failed',
        failure: {
          call: 'SHEmptyRecycleBinW',
          code: getWin32RecycleBinDeleteTrash().nothingToEmptyCode,
        },
      });
    });
  });
});
