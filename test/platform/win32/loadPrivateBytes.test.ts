import { afterEach, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import { loadPrivateBytes } from '../../../src/platform/win32/loadPrivateBytes.js';
import type { FixtureRoot } from '../../support/fixtureRoot.js';
import {
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../../support/fixtureRoot.js';
import { describeOnWindows } from '../../support/windowsOnly.js';

/** Far above the size NTFS keeps inside the file's own record, so the file takes clusters. */
const FILE_BYTES = 64 * 1024;

describeOnWindows('loadPrivateBytes on Windows', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('reads at least the bytes of a file it allocates', async () => {
    const filePath = join(fixtureRoot.homeDir, 'file.bin');
    await createFixtureFile({ path: filePath, sizeBytes: FILE_BYTES, modifiedMs: Date.now() });

    expect(loadPrivateBytes(filePath)).toBeGreaterThanOrEqual(FILE_BYTES);
  });

  test('is null for a path it cannot read', () => {
    expect(loadPrivateBytes(join(fixtureRoot.homeDir, 'missing'))).toBeNull();
  });
});
