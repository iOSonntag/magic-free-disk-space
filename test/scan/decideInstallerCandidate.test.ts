import { expect, test } from 'bun:test';
import { decideAppCandidate } from '../../src/scan/decideAppCandidate.js';
import { DAY_MS } from '../../src/scan/limits.js';
import type { OwnerState } from '../../src/scan/resolveOwnerState.js';
import type { SystemInstaller } from '../../src/scan/scanPlatform.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { buildTestMeasurement } from '../support/candidateFixtures.js';
import { buildTestInstalledApp } from '../support/installedAppFixtures.js';
import { buildTestUserIdentity } from '../support/parsedValueFixtures.js';

const MIB = 1_048_576;
const NOW_MS = Date.UTC(2026, 10, 1);
const USER_UID = 501;
const INSTALLER_PATH = '/Applications/Install macOS Sequoia.app';

function decide(params: {
  systemInstaller?: SystemInstaller | null;
  systemVersion?: string | null;
  ownerUid?: number | null;
  ownerState?: OwnerState;
  ageDays?: number;
}) {
  const app = buildTestInstalledApp({
    bundlePath: INSTALLER_PATH,
    displayName: 'Install macOS Sequoia',
    bundleId: 'com.apple.InstallAssistant',
    systemInstaller:
      params.systemInstaller === undefined
        ? { builtForSystemVersion: '15.6' }
        : params.systemInstaller,
    ownerUid: params.ownerUid === undefined ? USER_UID : params.ownerUid,
  });
  const measurement = buildTestMeasurement({ realPath: INSTALLER_PATH, allocatedBytes: 900 * MIB });
  const bornMs = NOW_MS - (params.ageDays ?? 30) * DAY_MS;

  return decideAppCandidate({
    app: app,
    measurement: {
      ...measurement,
      identity: { ...measurement.identity, birthtimeNs: BigInt(bornMs) * 1_000_000n },
    },
    // An installer is never opened as an app, so its last use says nothing.
    lastSignOfUseMs: NOW_MS,
    unusedCutoffMs: NOW_MS - 180 * DAY_MS,
    ownerState: params.ownerState ?? 'stopped',
    isProtectedDeveloperApp: false,
    minAppBytes: 256 * MIB,
    systemVersion: params.systemVersion === undefined ? '26.2' : params.systemVersion,
    nowMs: NOW_MS,
    user: buildTestUserIdentity({ uid: USER_UID }),
  });
}

describeAwaitingWin32Platform('decideAppCandidate for a macOS installer', () => {
  test('offers an old installer of another release as an installer to review', () => {
    const decision = decide({});

    expect(decision.kind === 'offer' && decision.candidate).toMatchObject({
      path: INSTALLER_PATH,
      category: 'installers',
      risk: 'review',
      origin: { kind: 'application', bundleId: 'com.apple.InstallAssistant' },
      explanation: 'An installer of macOS 15, while this Mac runs macOS 26.',
      downloadedAtMs: NOW_MS - 30 * DAY_MS,
      removal: { kind: 'deletePaths', ownerBundlePaths: [INSTALLER_PATH] },
    });
  });

  test('judges an app as an installer only when the platform marks it one, not by its name', () => {
    expect(decide({ systemInstaller: null })).toMatchObject({
      kind: 'skip',
      reason: 'recentUse',
    });
  });

  test('withholds an installer while it runs, or while that cannot be checked', () => {
    expect(decide({ ownerState: 'running' })).toMatchObject({ reason: 'ownerRunning' });
    expect(decide({ ownerState: 'unknown' })).toMatchObject({ reason: 'runningUnknown' });
  });

  test('never offers an installer of the release this Mac runs, by its first number', () => {
    expect(decide({ systemInstaller: { builtForSystemVersion: '26.0' } })).toMatchObject({
      kind: 'skip',
      reason: 'installsRunningSystem',
    });
  });

  test('never offers an installer whose release or the running one is unknown', () => {
    expect(decide({ systemInstaller: { builtForSystemVersion: null } })).toMatchObject({
      reason: 'systemVersionUnknown',
    });
    expect(decide({ systemInstaller: { builtForSystemVersion: 'unknown' } })).toMatchObject({
      reason: 'systemVersionUnknown',
    });
    expect(decide({ systemVersion: null })).toMatchObject({ reason: 'systemVersionUnknown' });
  });

  test('keeps an installer that came onto this Mac within 14 days', () => {
    expect(decide({ ageDays: 13 })).toMatchObject({ kind: 'skip', reason: 'recentActivity' });
    expect(decide({ ageDays: 15 }).kind).toBe('offer');
  });

  test('turns an installer the user does not own, as root owns it, into advice', () => {
    for (const ownerUid of [0, null]) {
      const decision = decide({ ownerUid: ownerUid });

      expect(decision.kind).toBe('advice');
      expect(decision.kind === 'advice' && decision.advice).toMatchObject({
        path: INSTALLER_PATH,
        category: 'installers',
        origin: { kind: 'application', bundleId: 'com.apple.InstallAssistant' },
        opener: { kind: 'app', app: 'finder' },
      });
    }
  });
});
