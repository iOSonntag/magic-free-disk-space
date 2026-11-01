import type { ReleaseVersion } from './releaseVersion.js';
import { formatReleaseTag } from './releaseVersion.js';

const REPOSITORY_PATH = 'iOSonntag/magic-free-disk-space';

/** GitHub's answer for the latest published release of this repository, which is no prerelease or draft. */
export const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${REPOSITORY_PATH}/releases/latest`;

export const LATEST_RELEASE_FETCH_TIMEOUT_MS = 5_000;

/** The page of a release, built from the version alone, so no URL of GitHub's answer reaches the app. */
export function buildReleasePageUrl(version: ReleaseVersion): string {
  return `https://github.com/${REPOSITORY_PATH}/releases/tag/${formatReleaseTag(version)}`;
}
