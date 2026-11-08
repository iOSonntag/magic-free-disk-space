import { afterEach, beforeEach, expect, test } from 'bun:test';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadFullDiskAccess } from '../../../src/platform/darwin/loadFullDiskAccess.js';
import { describeOnDarwin } from '../../support/darwinOnly.js';
import type { FixtureRoot } from '../../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../../support/fixtureRoot.js';
import { testOnPosix } from '../../support/posixOnly.js';

describeOnDarwin('loadFullDiskAccess', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('is unknown when neither the TCC database nor the Safari folder exists', async () => {
    expect(await loadFullDiskAccess({ homeDir: fixtureRoot.homeDir })).toBe('unknown');
  });

  test('is granted when the TCC database opens', async () => {
    const tccDir = join(fixtureRoot.homeDir, 'Library/Application Support/com.apple.TCC');
    await mkdir(tccDir, { recursive: true });
    await writeFile(join(tccDir, 'TCC.db'), '');

    expect(await loadFullDiskAccess({ homeDir: fixtureRoot.homeDir })).toBe('granted');
  });

  test('is granted when the TCC database is missing but the Safari folder opens', async () => {
    await mkdir(join(fixtureRoot.homeDir, 'Library/Safari'), { recursive: true });

    expect(await loadFullDiskAccess({ homeDir: fixtureRoot.homeDir })).toBe('granted');
  });

  testOnPosix(
    'is unknown when the TCC database is missing and the Safari folder refuses the open by its permissions',
    async () => {
      const safariDir = join(fixtureRoot.homeDir, 'Library/Safari');
      await mkdir(safariDir, { recursive: true });
      await chmod(safariDir, 0o000);

      try {
        expect(await loadFullDiskAccess({ homeDir: fixtureRoot.homeDir })).toBe('unknown');
      } finally {
        await chmod(safariDir, 0o755);
      }
    },
  );
});
