import type { UserIdentity } from '../system/userIdentity.js';
import type { CandidateDecision } from './candidate.js';
import { decideInstallerCandidate } from './decideInstallerCandidate.js';
import type { Measurement } from './loadPathMeasurement.js';
import type { OwnerState } from './resolveOwnerState.js';
import type { InstalledApp } from './scanPlatform.js';

/**
 * Offers an app unused since `unusedCutoffMs`, and a macOS installer as
 * `decideInstallerCandidate` judges it, either one only while it does not run. An app without a
 * bundle id is skipped, because whether it runs cannot be checked; a protected developer app is
 * offered as `never`.
 */
export function decideAppCandidate(params: {
  app: InstalledApp;
  measurement: Measurement;
  lastSignOfUseMs: number | null;
  unusedCutoffMs: number;
  ownerState: OwnerState;
  isProtectedDeveloperApp: boolean;
  minAppBytes: number;
  /** The running system's version; `null` when it could not be read. */
  systemVersion: string | null;
  nowMs: number;
  user: UserIdentity;
}): CandidateDecision {
  const path = params.app.bundlePath;

  if (params.measurement.identity.kind === 'symbolicLink') {
    return { kind: 'skip', path: path, reason: 'symbolicLink' };
  }

  if (params.app.bundleId === null) {
    return { kind: 'skip', path: path, reason: 'notBundleId' };
  }

  if (params.ownerState === 'running') {
    return { kind: 'skip', path: path, reason: 'ownerRunning' };
  }

  if (params.ownerState === 'unknown') {
    return { kind: 'skip', path: path, reason: 'runningUnknown' };
  }

  if (params.app.systemInstaller !== null) {
    return decideInstallerCandidate({
      app: params.app,
      installer: params.app.systemInstaller,
      bundleId: params.app.bundleId,
      measurement: params.measurement,
      systemVersion: params.systemVersion,
      nowMs: params.nowMs,
      user: params.user,
    });
  }

  if (params.measurement.allocatedBytes < params.minAppBytes) {
    return { kind: 'skip', path: path, reason: 'belowSizeThreshold' };
  }

  if (params.lastSignOfUseMs === null) {
    return { kind: 'skip', path: path, reason: 'useUnknown' };
  }

  if (params.lastSignOfUseMs >= params.unusedCutoffMs) {
    return { kind: 'skip', path: path, reason: 'recentUse' };
  }

  const lastUsedDate = new Date(params.lastSignOfUseMs).toISOString().slice(0, 10);

  return {
    kind: 'offer',
    candidate: {
      path: path,
      title: params.app.displayName,
      category: 'applications',
      risk: params.isProtectedDeveloperApp ? 'never' : 'review',
      origin: { kind: 'application', bundleId: params.app.bundleId },
      explanation: `An app with no sign of use since ${lastUsedDate}. Its settings and data in your Library stay behind.`,
      regeneration: 'Install it again from the App Store or from its maker.',
      allocatedBytes: params.measurement.allocatedBytes,
      entryCount: params.measurement.entryCount,
      isComplete: params.measurement.isComplete,
      privateSizeFallbackCount: params.measurement.privateSizeFallbackCount,
      lastUsedAtMs: params.lastSignOfUseMs,
      downloadedAtMs: null,
      appName: params.app.displayName,
      removal: {
        kind: 'deletePaths',
        targets: [{ path: path, identity: params.measurement.identity }],
        owner: { kind: 'bundles', bundlePaths: [path] },
      },
    },
  };
}
