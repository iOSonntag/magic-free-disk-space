import { describe, expect, test } from 'bun:test';
import { decideAppCandidate } from '../../src/scan/decideAppCandidate.js';
import type { InstalledApp } from '../../src/scan/loadInstalledApps.js';
import type { OwnerState } from '../../src/scan/resolveOwnerState.js';
import type { FileKind } from '../../src/system/loadFileIdentity.js';
import { buildTestMeasurement } from '../support/candidateFixtures.js';
import { buildTestInstalledApp } from '../support/installedAppFixtures.js';

const MIB = 1_048_576;
const CUTOFF_MS = Date.UTC(2026, 0, 1);
const LONG_AGO_MS = Date.UTC(2025, 2, 15);

function decide(params: {
  app?: InstalledApp;
  allocatedBytes?: number;
  kind?: FileKind;
  lastSignOfUseMs?: number | null;
  ownerState?: OwnerState;
  isProtectedDeveloperApp?: boolean;
}) {
  const app = params.app ?? buildTestInstalledApp({});

  return decideAppCandidate({
    app: app,
    measurement: buildTestMeasurement({
      realPath: app.bundlePath,
      allocatedBytes: params.allocatedBytes ?? 600 * MIB,
      kind: params.kind ?? 'directory',
    }),
    lastSignOfUseMs: params.lastSignOfUseMs === undefined ? LONG_AGO_MS : params.lastSignOfUseMs,
    unusedCutoffMs: CUTOFF_MS,
    ownerState: params.ownerState ?? 'stopped',
    isProtectedDeveloperApp: params.isProtectedDeveloperApp ?? false,
    minAppBytes: 256 * MIB,
  });
}

describe('decideAppCandidate', () => {
  test('offers a large unused app as review with its last use date', () => {
    const decision = decide({});

    expect(decision.kind === 'offer' && decision.candidate).toMatchObject({
      path: '/Applications/Example.app',
      title: 'Example',
      risk: 'review',
      category: 'applications',
      origin: 'application',
    });
    expect(decision.kind === 'offer' && decision.candidate.explanation).toContain('2025-03-15');
  });

  test('offers a protected developer app only as never', () => {
    const decision = decide({ isProtectedDeveloperApp: true });

    expect(decision.kind === 'offer' && decision.candidate.risk).toBe('never');
  });

  test('skips a symbolic link bundle', () => {
    expect(decide({ kind: 'symbolicLink' })).toMatchObject({ reason: 'symbolicLink' });
  });

  test('skips an app without bundle id, whose running cannot be checked', () => {
    expect(decide({ app: buildTestInstalledApp({ bundleId: null }) })).toMatchObject({
      reason: 'notBundleId',
    });
  });

  test('withholds a running app and one whose state is unknown', () => {
    expect(decide({ ownerState: 'running' })).toMatchObject({ reason: 'ownerRunning' });
    expect(decide({ ownerState: 'unknown' })).toMatchObject({ reason: 'runningUnknown' });
  });

  test('skips a small app', () => {
    expect(decide({ allocatedBytes: 255 * MIB })).toMatchObject({ reason: 'belowSizeThreshold' });
  });

  test('treats an unknown last use as not unused', () => {
    expect(decide({ lastSignOfUseMs: null })).toMatchObject({ reason: 'useUnknown' });
  });

  test('keeps an app used at or after the cutoff', () => {
    expect(decide({ lastSignOfUseMs: CUTOFF_MS })).toMatchObject({ reason: 'recentUse' });
    expect(decide({ lastSignOfUseMs: CUTOFF_MS - 1 }).kind).toBe('offer');
  });
});
