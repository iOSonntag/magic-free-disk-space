import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod } from 'node:fs/promises';
import { join } from 'node:path';
import type { CandidateDecision, TargetsMeasurement } from '../../src/scan/candidate.js';
import type { TargetsCarve } from '../../src/scan/loadMeasuredTargetsPhase.js';
import { loadMeasuredTargetsPhase } from '../../src/scan/loadMeasuredTargetsPhase.js';
import type { ScanPhase } from '../../src/scan/scanPhase.js';
import { createConcurrencyLimit } from '../../src/system/createConcurrencyLimit.js';
import type { EntryReads } from '../../src/system/entryReads.js';
import { mapNonEmpty } from '../../src/system/nonEmptyList.js';
import { buildTestEntryReads } from '../support/entryReadsFixtures.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureFile, createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';
import { hostPathRules } from '../support/parsedValueFixtures.js';
import { hostPlatform } from '../support/platformFixtures.js';
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

/** A phase of the test with each measurement its decide was given. */
type LoadedPhase = { phase: ScanPhase; measurements: TargetsMeasurement[] };

async function createTargetFile(name: string): Promise<string> {
  const path = join(fixtureRoot.homeDir, 'Downloads', name);

  await createFixtureFile({ path: path, sizeBytes: FILE_SIZE_BYTES, modifiedMs: MODIFIED_MS });

  return path;
}

/** Loads the phase of `paths`, without a carve unless one is given. */
async function loadPhase(params: {
  paths: [string, ...string[]];
  carve?: TargetsCarve;
  entryReads?: EntryReads;
}): Promise<LoadedPhase> {
  const measurements: TargetsMeasurement[] = [];
  const phase = await loadMeasuredTargetsPhase({
    found: mapNonEmpty(params.paths, (path) => ({ path: path })),
    carve: params.carve ?? null,
    measureTimeoutMs: 10_000,
    runItemMeasurement: createConcurrencyLimit({ maxConcurrent: 1 }),
    entryReads: params.entryReads ?? hostPlatform.system.entryReads,
    recordEvictedEntry: () => undefined,
    privacyDenialCode: hostPlatform.system.privacyDenialCode,
    decide: async (measurement): Promise<CandidateDecision> => {
      measurements.push(measurement);

      return { kind: 'skip', path: params.paths[0], reason: 'belowSizeThreshold' };
    },
  });

  return { phase: phase, measurements: measurements };
}

describe('loadMeasuredTargetsPhase', () => {
  test('gives a target the entry reads call a link the kind of a symbolic link, which every decision skips', async () => {
    // As a mounted folder on Windows, which lstat calls a folder and its reparse point a link.
    const linkedPath = join(fixtureRoot.homeDir, 'Downloads', 'mounted');
    await createFixtureFile({
      path: join(linkedPath, 'inside.bin'),
      sizeBytes: FILE_SIZE_BYTES,
      modifiedMs: MODIFIED_MS,
    });
    const plainPath = await createTargetFile('plain.dmg');

    const { measurements } = await loadPhase({
      paths: [linkedPath, plainPath],
      entryReads: buildTestEntryReads({ privateBytes: null, linkPaths: [linkedPath] }),
    });

    expect(measurements[0]?.targets.map((target) => [target.path, target.identity.kind])).toEqual([
      [linkedPath, 'symbolicLink'],
      [plainPath, 'file'],
    ]);
    expect(measurements[0]?.entryCount).toBe(2);
  });

  test('measures every found path as one tally, each target with its identity', async () => {
    const firstPath = await createTargetFile('first.dmg');
    const secondPath = await createTargetFile('second.pkg');

    const { phase, measurements } = await loadPhase({ paths: [firstPath, secondPath] });

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

    const { measurements } = await loadPhase({ paths: [vanishedPath, firstPath] });

    expect(measurements[0]?.targets.map((target) => target.path)).toEqual([firstPath]);
  });

  test('keeps the identity of a carved target while its tally leaves the carved tree out', async () => {
    const userDataPath = join(fixtureRoot.homeDir, 'Library', 'Application Support', 'Example');
    const carvedPath = join(userDataPath, 'Previews');

    await createFixtureFile({
      path: join(carvedPath, 'preview.bin'),
      sizeBytes: 64 * FILE_SIZE_BYTES,
      modifiedMs: MODIFIED_MS,
    });
    await createFixtureFile({
      path: join(userDataPath, 'settings.json'),
      sizeBytes: FILE_SIZE_BYTES,
      modifiedMs: MODIFIED_MS,
    });

    const { measurements } = await loadPhase({
      paths: [userDataPath],
      carve: { pathRules: hostPathRules, carvedPaths: [carvedPath] },
    });

    expect(measurements[0]?.targets.map((target) => [target.path, target.identity.kind])).toEqual([
      [userDataPath, 'directory'],
    ]);
    expect(measurements[0]?.allocatedBytes).toBeGreaterThanOrEqual(FILE_SIZE_BYTES);
    expect(measurements[0]?.allocatedBytes).toBeLessThan(64 * FILE_SIZE_BYTES);
  });

  test('adds nothing when every found path vanished', async () => {
    const { phase, measurements } = await loadPhase({
      paths: [join(fixtureRoot.homeDir, 'Downloads', 'gone.dmg')],
    });

    expect(phase).toEqual({ decisions: [], issues: [] });
    expect(measurements).toEqual([]);
  });

  testOnPosix('adds an issue and no decision when a found path cannot be read', async () => {
    const firstPath = await createTargetFile('readable.dmg');
    const lockedFolder = join(fixtureRoot.homeDir, 'Downloads', 'locked');
    const lockedPath = join(lockedFolder, 'inside.pkg');

    await createFixtureFile({ path: lockedPath, sizeBytes: 16, modifiedMs: MODIFIED_MS });
    await chmod(lockedFolder, 0o000);

    const { phase, measurements } = await loadPhase({ paths: [firstPath, lockedPath] });

    expect(phase.decisions).toEqual([]);
    expect(phase.issues).toEqual([
      expect.objectContaining({ path: lockedPath, reason: 'permissionDenied' }),
    ]);
    expect(measurements).toEqual([]);
  });
});
