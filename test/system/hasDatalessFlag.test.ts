import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hasDatalessFlag } from '../../src/system/hasDatalessFlag.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';

let fixtureRoot: FixtureRoot;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

// A test cannot create an iCloud placeholder; the flag offset was checked against `ls -lO` on one.
describe('hasDatalessFlag', () => {
  test('is false for a folder and a file on this disk', async () => {
    const folder = join(fixtureRoot.homeDir, 'local');
    const file = join(folder, 'file.txt');

    await mkdir(folder);
    await writeFile(file, 'on disk');

    expect(hasDatalessFlag({ path: folder })).toBe(false);
    expect(hasDatalessFlag({ path: file })).toBe(false);
  });

  test('is false for a path that does not exist', () => {
    expect(hasDatalessFlag({ path: join(fixtureRoot.homeDir, 'absent') })).toBe(false);
  });
});
