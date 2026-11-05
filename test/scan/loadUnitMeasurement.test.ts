import { afterEach, beforeEach, expect, test } from 'bun:test';
import { chmod } from 'node:fs/promises';
import { join } from 'node:path';
import type { ExploreToolUnitDartPubCache } from '../../src/explore/exploreUnit.js';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import { loadPathMeasurement } from '../../src/scan/loadPathMeasurement.js';
import { loadUnitMeasurement } from '../../src/scan/loadUnitMeasurement.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../support/fixtureRoot.js';
import {
  buildTestAbsolutePath,
  buildTestMiseToolName,
  buildTestMiseToolVersion,
} from '../support/parsedValueFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';

const MODIFIED_MS = Date.parse('2026-01-01T00:00:00Z');

let fixtureRoot: FixtureRoot;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

function buildDartUnit(gcPaths: string[]): ExploreToolUnitDartPubCache {
  return {
    kind: 'dartPubCache',
    tool: { name: 'dart', path: '/opt/example/dart' },
    gcPaths: gcPaths.map((text) => buildTestAbsolutePath({ text: text })),
  };
}

async function loadAllocatedBytesOrThrow(path: string): Promise<number> {
  const measured = await loadPathMeasurement({
    path: path,
    deadlineMs: Date.now() + 10_000,
    entryReads: darwinPlatform.system.entryReads,
  });

  if (measured.kind === 'failed') {
    throw new Error(`Measurement failed: ${measured.failure.reason}`);
  }

  return measured.value.allocatedBytes;
}

describeAwaitingWin32Platform('loadUnitMeasurement', () => {
  test('sums every path of the unit and counts a missing one as 0', async () => {
    const packageFolder = join(fixtureRoot.homeDir, '.pub-cache/hosted/pub.dev/example_a-1.0.0');
    const hashFile = join(fixtureRoot.homeDir, '.pub-cache/hosted-hashes/example_a-1.0.0.sha256');

    await createFixtureDirectory({ path: packageFolder });
    await createFixtureDirectory({ path: join(fixtureRoot.homeDir, '.pub-cache/hosted-hashes') });
    await createFixtureFile({
      path: join(packageFolder, 'lib.dart'),
      sizeBytes: 20_000,
      modifiedMs: MODIFIED_MS,
    });
    await createFixtureFile({ path: hashFile, sizeBytes: 64, modifiedMs: MODIFIED_MS });

    const measurement = await loadUnitMeasurement({
      unit: buildDartUnit([packageFolder, hashFile, join(fixtureRoot.homeDir, 'gone')]),
      deadlineMs: Date.now() + 10_000,
      entryReads: darwinPlatform.system.entryReads,
    });

    expect(measurement).toEqual({
      allocatedBytes:
        (await loadAllocatedBytesOrThrow(packageFolder)) +
        (await loadAllocatedBytesOrThrow(hashFile)),
      entryCount: 3,
      privateSizeFallbackCount: 0,
      isComplete: true,
      holdsOtherVolume: false,
    });
  });

  test('holds another volume when any path does, a missing one counting false', async () => {
    const hashFile = join(fixtureRoot.homeDir, 'example.sha256');

    await createFixtureFile({ path: hashFile, sizeBytes: 64, modifiedMs: MODIFIED_MS });

    const plain = await loadUnitMeasurement({
      unit: buildDartUnit([hashFile, join(fixtureRoot.homeDir, 'gone')]),
      deadlineMs: Date.now() + 10_000,
      entryReads: darwinPlatform.system.entryReads,
    });
    const mounted = await loadUnitMeasurement({
      unit: buildDartUnit([hashFile, '/dev', join(fixtureRoot.homeDir, 'gone')]),
      deadlineMs: Date.now() + 10_000,
      entryReads: darwinPlatform.system.entryReads,
    });

    expect(plain.holdsOtherVolume).toBe(false);
    expect(mounted.holdsOtherVolume).toBe(true);
  });

  testOnPosix('is incomplete when a path cannot be read', async () => {
    const lockedFolder = join(fixtureRoot.homeDir, 'locked');
    const hiddenFile = join(lockedFolder, 'inner');

    await createFixtureDirectory({ path: lockedFolder });
    await createFixtureFile({ path: hiddenFile, sizeBytes: 100, modifiedMs: MODIFIED_MS });
    await chmod(lockedFolder, 0o000);

    const measurement = await loadUnitMeasurement({
      unit: buildDartUnit([hiddenFile]),
      deadlineMs: Date.now() + 10_000,
      entryReads: darwinPlatform.system.entryReads,
    });

    expect(measurement).toEqual({
      allocatedBytes: 0,
      entryCount: 0,
      privateSizeFallbackCount: 0,
      isComplete: false,
      holdsOtherVolume: false,
    });
  });

  testOnPosix('is incomplete when a folder of a path cannot be read in part', async () => {
    const versionFolder = join(fixtureRoot.homeDir, 'installs/node/20.1.0');

    await createFixtureDirectory({ path: join(versionFolder, 'locked') });
    await chmod(join(versionFolder, 'locked'), 0o000);

    const measurement = await loadUnitMeasurement({
      unit: {
        kind: 'miseVersion',
        tool: { name: 'mise', path: '/opt/example/mise' },
        miseToolName: buildTestMiseToolName({ text: 'node' }),
        version: buildTestMiseToolVersion({ text: '20.1.0' }),
        installPath: buildTestAbsolutePath({ text: versionFolder }),
      },
      deadlineMs: Date.now() + 10_000,
      entryReads: darwinPlatform.system.entryReads,
    });

    expect(measurement.isComplete).toBe(false);
    expect(measurement.entryCount).toBeGreaterThan(0);
  });
});
