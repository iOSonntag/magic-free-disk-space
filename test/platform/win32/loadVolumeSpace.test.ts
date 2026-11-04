import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { loadVolumeSpace } from '../../../src/platform/win32/loadVolumeSpace.js';
import type { FixtureRoot } from '../../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../../support/fixtureRoot.js';

describe.skipIf(process.platform !== 'win32')('loadVolumeSpace on Windows', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('reads a capacity and an available part of it for a folder on the volume', async () => {
    const space = await loadVolumeSpace(fixtureRoot.homeDir);

    expect(space).not.toBeNull();
    expect(space?.capacityBytes).toBeGreaterThan(0);
    expect(space?.availableBytes).toBeGreaterThan(0);
    expect(space?.availableBytes).toBeLessThanOrEqual(space?.capacityBytes ?? 0);
  });

  test('is null for a path that is no absolute Windows path', async () => {
    expect(await loadVolumeSpace('relative\\folder')).toBeNull();
  });
});
