import { describe, expect, test } from 'bun:test';
import type { CatalogEntry } from '../../src/catalog/catalog.js';
import { decideCatalogCandidate } from '../../src/scan/decideCatalogCandidate.js';
import type { Measurement } from '../../src/scan/loadPathMeasurement.js';
import type { ActivityProbe } from '../../src/scan/loadTreeActivity.js';
import type { OwnerState } from '../../src/scan/resolveOwnerState.js';
import { buildTestCatalogEntry, buildTestMeasurement } from '../support/candidateFixtures.js';

const MIB = 1_048_576;
const PATH = '/home/Library/Caches/com.example.app';

function decide(params: {
  entry?: CatalogEntry;
  measurement?: Measurement;
  ownerBundleId?: string | null;
  ownerState?: OwnerState;
  activity?: ActivityProbe | null;
}) {
  return decideCatalogCandidate({
    entry: params.entry ?? buildTestCatalogEntry({}),
    path: PATH,
    measurement:
      params.measurement ?? buildTestMeasurement({ realPath: PATH, allocatedBytes: 5 * MIB }),
    ownerBundleId: params.ownerBundleId ?? null,
    ownerBundlePaths: ['/Applications/Example.app'],
    ownerState: params.ownerState ?? 'stopped',
    activity: params.activity === undefined ? null : params.activity,
    minOfferedBytes: MIB,
  });
}

describe('decideCatalogCandidate', () => {
  test('offers a large entry with its catalog texts', () => {
    const decision = decide({});

    expect(decision).toEqual({
      kind: 'offer',
      candidate: {
        path: PATH,
        title: 'Test cache',
        category: 'caches',
        risk: 'safe',
        origin: 'catalog',
        explanation: 'A cache for tests.',
        regeneration: 'Rebuilt by the test.',
        allocatedBytes: 5 * MIB,
        entryCount: 3,
        isComplete: true,
        removal: {
          kind: 'deletePath',
          identity: expect.any(Object),
          ownerBundlePaths: ['/Applications/Example.app'],
        },
      },
    });
  });

  test('carries an incomplete measurement into the candidate', () => {
    const decision = decide({
      measurement: buildTestMeasurement({
        realPath: PATH,
        allocatedBytes: 5 * MIB,
        isComplete: false,
      }),
    });

    expect(decision.kind === 'offer' && decision.candidate.isComplete).toBe(false);
  });

  test('turns an advice entry into advice, never an offer', () => {
    const decision = decide({
      entry: buildTestCatalogEntry({ removal: { kind: 'advice', advice: 'Run the tool.' } }),
    });

    expect(decision).toEqual({
      kind: 'advice',
      advice: {
        path: PATH,
        title: 'Test cache',
        category: 'caches',
        risk: 'safe',
        explanation: 'A cache for tests.',
        advice: 'Run the tool.',
        allocatedBytes: 5 * MIB,
        isComplete: true,
      },
    });
  });

  test('turns an explore entry into its advice, as when its probe did not run', () => {
    const decision = decide({
      entry: buildTestCatalogEntry({
        removal: { kind: 'explore', probe: 'miseVersions', advice: 'Run mise prune.' },
      }),
    });

    expect(decision.kind === 'advice' && decision.advice.advice).toBe('Run mise prune.');
  });

  test('skips a symbolic link before anything else', () => {
    const decision = decide({
      measurement: buildTestMeasurement({
        realPath: PATH,
        allocatedBytes: 0,
        kind: 'symbolicLink',
      }),
      ownerState: 'running',
    });

    expect(decision).toEqual({ kind: 'skip', path: PATH, reason: 'symbolicLink' });
  });

  test('skips an Apple-owned child of a children entry', () => {
    const decision = decide({
      entry: buildTestCatalogEntry({ scope: 'children' }),
      ownerBundleId: 'com.apple.Safari',
    });

    expect(decision).toEqual({ kind: 'skip', path: PATH, reason: 'systemOwned' });
  });

  test('withholds a path whose owner runs or cannot be checked', () => {
    expect(decide({ ownerBundleId: 'com.example.app', ownerState: 'running' })).toEqual({
      kind: 'skip',
      path: PATH,
      reason: 'ownerRunning',
    });
    expect(decide({ ownerBundleId: 'com.example.app', ownerState: 'unknown' })).toEqual({
      kind: 'skip',
      path: PATH,
      reason: 'runningUnknown',
    });
  });

  test('skips an entry below the size threshold', () => {
    const decision = decide({
      measurement: buildTestMeasurement({ realPath: PATH, allocatedBytes: MIB - 1 }),
    });

    expect(decision).toEqual({ kind: 'skip', path: PATH, reason: 'belowSizeThreshold' });
  });

  test('applies the stale rule only to staleDays entries', () => {
    const staleEntry = buildTestCatalogEntry({ scope: 'children', ageRule: 'staleDays' });

    expect(decide({ entry: staleEntry, activity: 'recent' })).toEqual({
      kind: 'skip',
      path: PATH,
      reason: 'recentActivity',
    });
    expect(decide({ entry: staleEntry, activity: 'unknown' })).toEqual({
      kind: 'skip',
      path: PATH,
      reason: 'activityUnknown',
    });
    expect(decide({ entry: staleEntry, activity: 'quiet' }).kind).toBe('offer');
  });

  test('throws when the probe and the age rule disagree', () => {
    expect(() =>
      decide({ entry: buildTestCatalogEntry({ ageRule: 'staleDays' }), activity: null }),
    ).toThrow();
    expect(() =>
      decide({ entry: buildTestCatalogEntry({ ageRule: 'none' }), activity: 'quiet' }),
    ).toThrow();
  });
});
