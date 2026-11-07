import { afterEach, beforeEach, expect, test } from 'bun:test';
import { chmod, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import type { CandidateDecision } from '../../src/scan/candidate.js';
import type { TargetsMeasurement } from '../../src/scan/loadMeasuredTargetsPhase.js';
import {
  buildFoundTargets,
  loadMeasuredTargetsPhase,
} from '../../src/scan/loadMeasuredTargetsPhase.js';
import { createConcurrencyLimit } from '../../src/system/createConcurrencyLimit.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureFile, createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';
import { testOnPosix } from '../support/posixOnly.js';

const FILE_SIZE_BYTES = 8192;

const MODIFIED_MS = Date.UTC(2026, 0, 1);

let fixtureRoot: FixtureRoot;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

async function createTargetFile(name: string): Promise<string> {
  const path = join(fixtureRoot.homeDir, 'Downloads', name);

  await mkdir(join(fixtureRoot.homeDir, 'Downloads'), { recursive: true });
  await createFixtureFile({ path: path, sizeBytes: FILE_SIZE_BYTES, modifiedMs: MODIFIED_MS });

  return path;
}

/** Loads the phase of `paths` and keeps each measurement its decide was given. */
async function loadPhase(paths: [string, ...string[]]) {
  const measurements: TargetsMeasurement[] = [];
  const phase = await loadMeasuredTargetsPhase({
    found: buildFoundTargets(paths),
    carve: null,
    measureTimeoutMs: 10_000,
    runItemMeasurement: createConcurrencyLimit({ maxConcurrent: 1 }),
    entryReads: darwinPlatform.system.entryReads,
    privacyDenialCode: darwinPlatform.system.privacyDenialCode,
    decide: async (measurement): Promise<CandidateDecision> => {
      measurements.push(measurement);

      return { kind: 'skip', path: paths[0], reason: 'belowSizeThreshold' };
    },
  });

  return { phase: phase, measurements: measurements };
}

describeAwaitingWin32Platform('loadMeasuredTargetsPhase', () => {
  test('measures every found path as one tally, each target with its identity', async () => {
    const firstPath = await createTargetFile('first.dmg');
    const secondPath = await createTargetFile('second.pkg');

    const { phase, measurements } = await loadPhase([firstPath, secondPath]);

    expect(phase).toEqual({
      decisions: [{ kind: 'skip', path: firstPath, reason: 'belowSizeThreshold' }],
      issues: [],
    });
    expect(measurements).toHaveLength(1);
    expect(measurements[0]?.targets.map((target) => [target.path, target.identity.kind])).toEqual([
      [firstPath, 'file'],
      [secondPath, 'file'],
    ]);
    expect(measurements[0]?.allocatedBytes).toBeGreaterThanOrEqual(2 * FILE_SIZE_BYTES);
    expect(measurements[0]?.latestModifiedMs).toBe(MODIFIED_MS);
  });

  test('leaves a vanished path out of the targets', async () => {
    const firstPath = await createTargetFile('kept.dmg');
    const vanishedPath = join(fixtureRoot.homeDir, 'Downloads', 'vanished.dmg');

    const { measurements } = await loadPhase([vanishedPath, firstPath]);

    expect(measurements[0]?.targets.map((target) => target.path)).toEqual([firstPath]);
  });

  test('adds nothing when every found path vanished', async () => {
    const { phase, measurements } = await loadPhase([
      join(fixtureRoot.homeDir, 'Downloads', 'gone.dmg'),
    ]);

    expect(phase).toEqual({ decisions: [], issues: [] });
    expect(measurements).toEqual([]);
  });

  testOnPosix('adds an issue and no decision when a found path cannot be read', async () => {
    const firstPath = await createTargetFile('readable.dmg');
    const lockedFolder = join(fixtureRoot.homeDir, 'Downloads', 'locked');
    const lockedPath = join(lockedFolder, 'inside.pkg');

    await mkdir(lockedFolder);
    await createFixtureFile({ path: lockedPath, sizeBytes: 16, modifiedMs: MODIFIED_MS });
    await chmod(lockedFolder, 0o000);

    const { phase, measurements } = await loadPhase([firstPath, lockedPath]);

    expect(phase.decisions).toEqual([]);
    expect(phase.issues).toEqual([
      expect.objectContaining({ path: lockedPath, reason: 'permissionDenied' }),
    ]);
    expect(measurements).toEqual([]);
  });
});
