import type { CandidateDecision } from './candidate.js';
import type { InstalledApp } from './loadInstalledApps.js';
import type { Measurement } from './loadPathMeasurement.js';
import type { OwnerState } from './resolveOwnerState.js';

/**
 * Offers an app unused since `unusedCutoffMs`. An app without a bundle id is skipped, because
 * whether it runs cannot be checked; a protected developer app is offered as `never`.
 */
export function decideAppCandidate(params: {
  app: InstalledApp;
  measurement: Measurement;
  lastSignOfUseMs: number | null;
  unusedCutoffMs: number;
  ownerState: OwnerState;
  isProtectedDeveloperApp: boolean;
  minAppBytes: number;
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
      origin: 'application',
      explanation: `An app with no sign of use since ${lastUsedDate}. Its settings and data in your Library stay behind.`,
      regeneration: 'Install it again from the App Store or from its maker.',
      allocatedBytes: params.measurement.allocatedBytes,
      entryCount: params.measurement.entryCount,
      isComplete: params.measurement.isComplete,
      removal: {
        kind: 'deletePath',
        identity: params.measurement.identity,
        ownerBundlePaths: [path],
      },
      evidenceLines: [],
    },
  };
}
