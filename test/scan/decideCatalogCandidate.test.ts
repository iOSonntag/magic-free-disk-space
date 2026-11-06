import { expect, test } from 'bun:test';
import type { CatalogEntry } from '../../src/catalog/catalog.js';
import { decideCatalogCandidate } from '../../src/scan/decideCatalogCandidate.js';
import type { TargetsMeasurement } from '../../src/scan/loadMeasuredTargetsPhase.js';
import type { ActivityProbe } from '../../src/scan/loadTreeActivity.js';
import type { OwnerState } from '../../src/scan/resolveOwnerState.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import {
  buildTestCatalogEntry,
  buildTestTargetsMeasurement,
} from '../support/candidateFixtures.js';
import { buildTestCatalogOwner } from '../support/parsedValueFixtures.js';

const MIB = 1_048_576;
const PATH = '/home/Library/Caches/com.example.app';

const UNCHANGED_30_DAYS = { kind: 'unchangedDays', days: 30 } as const;

function decide(params: {
  entry?: CatalogEntry;
  measurement?: TargetsMeasurement;
  ownerBundleId?: string | null;
  ownerState?: OwnerState;
  activity?: ActivityProbe | null;
}) {
  return decideCatalogCandidate({
    entry: params.entry ?? buildTestCatalogEntry({}),
    path: PATH,
    measurement:
      params.measurement ?? buildTestTargetsMeasurement({ path: PATH, allocatedBytes: 5 * MIB }),
    owner: buildTestCatalogOwner({ bundleId: params.ownerBundleId ?? null }),
    ownerBundlePaths: ['/Applications/Example.app'],
    ownerState: params.ownerState ?? 'stopped',
    ownerAppName: 'Example',
    activity: params.activity === undefined ? null : params.activity,
    minOfferedBytes: MIB,
  });
}

describeAwaitingWin32Platform('decideCatalogCandidate', () => {
  test('offers a large entry with its catalog texts, its entry id, and its owner app', () => {
    const decision = decide({});

    expect(decision).toEqual({
      kind: 'offer',
      candidate: {
        path: PATH,
        title: 'Test cache',
        category: 'caches',
        risk: 'safe',
        origin: { kind: 'catalog', entryId: 'test-entry' },
        explanation: 'A cache for tests.',
        regeneration: 'Rebuilt by the test.',
        allocatedBytes: 5 * MIB,
        entryCount: 3,
        isComplete: true,
        privateSizeFallbackCount: 0,
        lastUsedAtMs: null,
        downloadedAtMs: null,
        appName: 'Example',
        removal: {
          kind: 'deletePaths',
          targets: [{ path: PATH, identity: expect.any(Object) }],
          ownerBundlePaths: ['/Applications/Example.app'],
        },
      },
    });
  });

  test('carries an incomplete measurement into the candidate', () => {
    const decision = decide({
      measurement: buildTestTargetsMeasurement({
        path: PATH,
        allocatedBytes: 5 * MIB,
        isComplete: false,
      }),
    });

    expect(decision.kind === 'offer' && decision.candidate.isComplete).toBe(false);
  });

  test('turns an advice entry into advice, never an offer', () => {
    const decision = decide({
      entry: buildTestCatalogEntry({
        removal: { kind: 'advice', advice: 'Run the tool.', carvedPaths: [], opener: null },
      }),
    });

    expect(decision).toEqual({
      kind: 'advice',
      advice: {
        origin: { kind: 'catalog', entryId: 'test-entry' },
        path: PATH,
        title: 'Test cache',
        category: 'caches',
        risk: 'safe',
        explanation: 'A cache for tests.',
        advice: 'Run the tool.',
        opener: null,
        allocatedBytes: 5 * MIB,
        isComplete: true,
        privateSizeFallbackCount: 0,
        lastUsedAtMs: null,
        downloadedAtMs: null,
        appName: 'Example',
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
    expect(decision.kind === 'advice' && decision.advice.opener).toBeNull();
  });

  test("gives an advice entry's opener to its advice", () => {
    const decision = decide({
      entry: buildTestCatalogEntry({
        removal: {
          kind: 'advice',
          advice: 'Remove the photos in Photos.',
          carvedPaths: [],
          opener: { kind: 'app', app: 'photos' },
        },
      }),
    });

    expect(decision.kind === 'advice' && decision.advice.opener).toEqual({
      kind: 'app',
      app: 'photos',
    });
  });

  test('skips a symbolic link before anything else', () => {
    const decision = decide({
      measurement: buildTestTargetsMeasurement({
        path: PATH,
        allocatedBytes: 0,
        kind: 'symbolicLink',
      }),
      ownerState: 'running',
    });

    expect(decision).toEqual({ kind: 'skip', path: PATH, reason: 'symbolicLink' });
  });

  test('skips an Apple-owned child of a children entry', () => {
    const decision = decide({
      entry: buildTestCatalogEntry({ selection: { kind: 'children' } }),
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
      measurement: buildTestTargetsMeasurement({ path: PATH, allocatedBytes: MIB - 1 }),
    });

    expect(decision).toEqual({ kind: 'skip', path: PATH, reason: 'belowSizeThreshold' });
  });

  test('applies the age rule only to unchangedDays entries', () => {
    const staleEntry = buildTestCatalogEntry({
      selection: { kind: 'children' },
      ageRule: UNCHANGED_30_DAYS,
    });

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
      decide({ entry: buildTestCatalogEntry({ ageRule: UNCHANGED_30_DAYS }), activity: null }),
    ).toThrow();
    expect(() =>
      decide({ entry: buildTestCatalogEntry({ ageRule: { kind: 'none' } }), activity: 'quiet' }),
    ).toThrow();
  });
});
