import { afterEach, beforeEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import { loadVolumeSpace } from '../../../src/platform/darwin/loadVolumeSpace.js';
import type { FixtureRoot } from '../../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../../support/fixtureRoot.js';
import { describeOnPosix } from '../../support/posixOnly.js';

/** The volume's size in KiB as `df -k` reports it, from its own `statfs` read. */
function loadDfCapacityKibibytes(path: string): number {
  const dfLines = Bun.spawnSync(['/bin/df', '-k', '-P', path]).stdout.toString().trim().split('\n');

  return Number((dfLines.at(-1) ?? '').split(/\s+/)[1]);
}

let fixtureRoot: FixtureRoot;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

describeOnPosix('loadVolumeSpace', () => {
  test('reads the capacity df reports and an available part of it', async () => {
    const space = await loadVolumeSpace(fixtureRoot.homeDir);

    expect(space).not.toBeNull();
    expect((space?.capacityBytes ?? 0) / 1024).toBe(loadDfCapacityKibibytes(fixtureRoot.homeDir));
    expect(space?.availableBytes).toBeGreaterThan(0);
    expect(space?.availableBytes).toBeLessThanOrEqual(space?.capacityBytes ?? 0);
  });

  test('is null for a path that does not exist', async () => {
    expect(await loadVolumeSpace(join(fixtureRoot.homeDir, 'absent'))).toBeNull();
  });
});
