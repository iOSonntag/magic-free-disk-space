import type { Preferences } from '../preferences/preferencesFile.js';
import type {
  LatestReleaseFetchFailure,
  LatestReleaseFetchResult,
} from './fetchLatestReleaseVersion.js';
import type { ReleaseVersion } from './releaseVersion.js';
import { compareReleaseVersions } from './releaseVersion.js';

type UpdateCheckOutcomeOff = { kind: 'off' };

/** A development build, which has no release to compare. */
type UpdateCheckOutcomeUnversioned = { kind: 'unversioned' };

type UpdateCheckOutcomeCurrent = { kind: 'current' };

type UpdateCheckOutcomeFailed = { kind: 'failed'; reason: LatestReleaseFetchFailure['reason'] };

type UpdateCheckOutcomeNewer = { kind: 'newer'; current: ReleaseVersion; latest: ReleaseVersion };

export type UpdateCheckOutcome =
  | UpdateCheckOutcomeOff
  | UpdateCheckOutcomeUnversioned
  | UpdateCheckOutcomeCurrent
  | UpdateCheckOutcomeFailed
  | UpdateCheckOutcomeNewer;

/** Fetches the latest release only when the check is on and the build has a version. */
export async function runUpdateCheck(params: {
  preferences: Preferences;
  releaseVersion: ReleaseVersion | null;
  /** Never throws. */
  fetchLatestReleaseVersion: () => Promise<LatestReleaseFetchResult>;
}): Promise<UpdateCheckOutcome> {
  if (!params.preferences.isUpdateCheckEnabled) {
    return { kind: 'off' };
  }

  if (params.releaseVersion === null) {
    return { kind: 'unversioned' };
  }

  const latest = await params.fetchLatestReleaseVersion();

  if (latest.kind === 'failed') {
    return { kind: 'failed', reason: latest.failure.reason };
  }

  return compareWithLatestRelease({ current: params.releaseVersion, latest: latest.value });
}

/** An older latest release, as after a release was pulled, counts as current. */
export function compareWithLatestRelease(params: {
  current: ReleaseVersion;
  latest: ReleaseVersion;
}): UpdateCheckOutcomeCurrent | UpdateCheckOutcomeNewer {
  if (compareReleaseVersions(params.latest, params.current) > 0) {
    return { kind: 'newer', current: params.current, latest: params.latest };
  }

  return { kind: 'current' };
}
