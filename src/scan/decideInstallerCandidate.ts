import type { MacBundleId } from '../catalog/catalogOwner.js';
import type { UserIdentity } from '../system/userIdentity.js';
import type { CandidateDecision } from './candidate.js';
import { DAY_MS } from './limits.js';
import type { Measurement } from './loadPathMeasurement.js';
import type { InstalledApp, SystemInstaller } from './scanPlatform.js';

/** An installer that came onto this Mac within these days may be about to run. */
const INSTALLER_MIN_AGE_DAYS = 14;

const NANOSECONDS_PER_MILLISECOND = 1_000_000n;

/**
 * Offers the app, an installer of the system, when it is older than 14 days and installs another
 * release than this Mac runs. One the user does not own becomes advice, since only an
 * administrator may remove it. An installer whose release or the running one cannot be read is
 * never offered, as if it installed the running release.
 */
export function decideInstallerCandidate(params: {
  app: InstalledApp;
  installer: SystemInstaller;
  bundleId: MacBundleId;
  measurement: Measurement;
  systemVersion: string | null;
  nowMs: number;
  user: UserIdentity;
}): CandidateDecision {
  const installerRelease = parseSystemRelease({ version: params.installer.builtForSystemVersion });
  const runningRelease = parseSystemRelease({ version: params.systemVersion });

  if (installerRelease === null || runningRelease === null) {
    return { kind: 'skip', path: params.app.bundlePath, reason: 'systemVersionUnknown' };
  }

  if (installerRelease === runningRelease) {
    return { kind: 'skip', path: params.app.bundlePath, reason: 'installsRunningSystem' };
  }

  // The birth of the bundle on this disk: what an installer holds keeps the times of its build.
  const arrivedAtMs = Number(params.measurement.identity.birthtimeNs / NANOSECONDS_PER_MILLISECOND);

  if (params.nowMs - arrivedAtMs < INSTALLER_MIN_AGE_DAYS * DAY_MS) {
    return { kind: 'skip', path: params.app.bundlePath, reason: 'recentActivity' };
  }

  const explanation = `An installer of macOS ${installerRelease}, while this Mac runs macOS ${runningRelease}.`;

  if (!isOwnedByUser({ app: params.app, user: params.user })) {
    return {
      kind: 'advice',
      advice: {
        origin: { kind: 'application', bundleId: params.bundleId },
        path: params.app.bundlePath,
        title: params.app.displayName,
        category: 'installers',
        risk: 'review',
        explanation: `${explanation} It belongs to an administrator, so this tool cannot delete it.`,
        advice: 'Drag it to the Trash in Finder, and enter your password when Finder asks.',
        opener: { kind: 'app', app: 'finder' },
        carvedPaths: [],
        allocatedBytes: params.measurement.allocatedBytes,
        isComplete: params.measurement.isComplete,
        privateSizeFallbackCount: params.measurement.privateSizeFallbackCount,
        lastUsedAtMs: null,
        downloadedAtMs: arrivedAtMs,
        appName: params.app.displayName,
      },
    };
  }

  return {
    kind: 'offer',
    candidate: {
      path: params.app.bundlePath,
      title: params.app.displayName,
      category: 'installers',
      risk: 'review',
      origin: { kind: 'application', bundleId: params.bundleId },
      explanation: explanation,
      regeneration: 'Download it again from the App Store or with softwareupdate.',
      allocatedBytes: params.measurement.allocatedBytes,
      entryCount: params.measurement.entryCount,
      isComplete: params.measurement.isComplete,
      privateSizeFallbackCount: params.measurement.privateSizeFallbackCount,
      lastUsedAtMs: null,
      downloadedAtMs: arrivedAtMs,
      appName: params.app.displayName,
      removal: {
        kind: 'deletePaths',
        targets: [{ path: params.app.bundlePath, identity: params.measurement.identity }],
        ownerBundlePaths: [params.app.bundlePath],
      },
    },
  };
}

/**
 * The release of a macOS version, its first number: an installer of the same release as the
 * running one is never offered. `null` for no version.
 */
function parseSystemRelease(params: { version: string | null }): string | null {
  if (params.version === null) {
    return null;
  }

  const release = /^(\d+)(\.|$)/.exec(params.version.trim());

  return release === null ? null : (release[1] ?? null);
}

function isOwnedByUser(params: { app: InstalledApp; user: UserIdentity }): boolean {
  switch (params.user.kind) {
    case 'posix':
      return params.app.ownerUid === params.user.uid;
  }
}
