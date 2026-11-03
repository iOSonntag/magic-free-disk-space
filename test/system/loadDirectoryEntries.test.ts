import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadDirectoryEntries } from '../../src/system/loadDirectoryEntries.js';
import { AWAITS_WIN32_PLATFORM } from '../support/awaitsWin32Platform.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';

let fixtureRoot: FixtureRoot;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

/** Skips on Windows a test that needs symbolic links. */
const testOnPosix = test.skipIf(process.platform === 'win32');

describe.skipIf(AWAITS_WIN32_PLATFORM)('loadDirectoryEntries', () => {
  testOnPosix('lists each entry with its own kind, sorted, never following a link', async () => {
    const folder = join(fixtureRoot.homeDir, 'listing');

    await mkdir(join(folder, 'b-folder'), { recursive: true });
    await writeFile(join(folder, 'c-file.txt'), 'text');
    await symlink(join(folder, 'b-folder'), join(folder, 'a-link'));

    expect(await loadDirectoryEntries({ path: folder })).toEqual({
      kind: 'succeeded',
      value: [
        { name: 'a-link', kind: 'symbolicLink' },
        { name: 'b-folder', kind: 'directory' },
        { name: 'c-file.txt', kind: 'file' },
      ],
    });
  });

  test('reports a missing path and a file', async () => {
    const filePath = join(fixtureRoot.homeDir, 'plain.txt');

    await writeFile(filePath, 'text');

    expect(await loadDirectoryEntries({ path: join(fixtureRoot.homeDir, 'absent') })).toMatchObject(
      {
        kind: 'failed',
        failure: { reason: 'missing' },
      },
    );
    expect(await loadDirectoryEntries({ path: filePath })).toMatchObject({
      kind: 'failed',
      failure: { reason: 'notDirectory' },
    });
  });
});
