import { compareDottedVersions } from '../compareDottedVersions.js';
import type {
  ClaudeCodeVersionEntry,
  ClaudeCodeVersionStateInstalled,
} from './loadClaudeCodeVersionState.js';

/** How many of the newest versions the installer keeps besides the launcher's. */
export const KEPT_NEWEST_COUNT = 2;

/**
 * The versions past the `KEPT_NEWEST_COUNT` newest that the launcher does not run, as the installer
 * itself keeps them. `null` without the launcher's version, since a custom launcher may run any.
 */
export function decideClaudeCodeVersionOffers(params: {
  state: ClaudeCodeVersionStateInstalled;
}): ClaudeCodeVersionEntry[] | null {
  if (params.state.launcherVersion === null) {
    return null;
  }

  const launcherVersion = params.state.launcherVersion;
  const newestFirst = params.state.versions.toSorted((left, right) =>
    compareDottedVersions(right.version, left.version),
  );

  return newestFirst.slice(KEPT_NEWEST_COUNT).filter((entry) => entry.version !== launcherVersion);
}
