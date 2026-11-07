import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import { loadExploreDirectoryEntries, loadExploreRealPath } from '../loadExploreRead.js';

/** Where the native installer of Claude Code keeps each version it downloaded. */
export const CLAUDE_CODE_VERSIONS_PATH_NAMES = ['.local', 'share', 'claude', 'versions'];

/** The launcher the installer links to the version it runs. */
const CLAUDE_CODE_LAUNCHER_PATH_NAMES = ['.local', 'bin', 'claude'];

const VERSION_NAME_PATTERN = /^\d+(\.\d+)*$/;

/** A version's entry of the versions folder, an executable file or a folder. */
export type ClaudeCodeVersionEntry = { version: string; path: AbsolutePath };

/** The versions folder is absent, so the native installer holds no version. */
export type ClaudeCodeVersionStateNoVersions = { kind: 'noVersions' };

export type ClaudeCodeVersionStateInstalled = {
  kind: 'installed';
  versions: ClaudeCodeVersionEntry[];
  /**
   * The version the launcher's link resolves to; `null` when the launcher is absent or resolves
   * outside the versions folder, a custom launcher for which the installer keeps every version.
   */
  launcherVersion: string | null;
};

export type ClaudeCodeVersionState =
  | ClaudeCodeVersionStateNoVersions
  | ClaudeCodeVersionStateInstalled;

/** Reads the versions and the launcher's target, for the probe and the recheck of its units. */
export async function loadClaudeCodeVersionState(params: {
  pathRules: PathRules;
  homeDir: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<ClaudeCodeVersionState, ExploreFileUnreadable>> {
  const versionsPath = joinAbsolutePath({
    rules: params.pathRules,
    parentPath: params.homeDir,
    names: CLAUDE_CODE_VERSIONS_PATH_NAMES,
  });
  const entries = await loadExploreDirectoryEntries({
    path: versionsPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (entries.kind === 'failed') {
    return entries;
  }

  if (entries.value === null) {
    return { kind: 'succeeded', value: { kind: 'noVersions' } };
  }

  const versionsRealPath = await loadExploreRealPath({
    pathRules: params.pathRules,
    path: versionsPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (versionsRealPath.kind === 'failed') {
    return versionsRealPath;
  }

  const launcherRealPath = await loadExploreRealPath({
    pathRules: params.pathRules,
    path: joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.homeDir,
      names: CLAUDE_CODE_LAUNCHER_PATH_NAMES,
    }),
    privacyDenialCode: params.privacyDenialCode,
  });

  if (launcherRealPath.kind === 'failed') {
    return launcherRealPath;
  }

  const versions = entries.value.flatMap((entry) =>
    (entry.kind === 'file' || entry.kind === 'directory') && VERSION_NAME_PATTERN.test(entry.name)
      ? [
          {
            version: entry.name,
            path: joinAbsolutePath({
              rules: params.pathRules,
              parentPath: versionsPath,
              names: [entry.name],
            }),
          },
        ]
      : [],
  );

  return {
    kind: 'succeeded',
    value: {
      kind: 'installed',
      versions: versions,
      launcherVersion: findLauncherVersion({
        versionsRealPath: versionsRealPath.value,
        launcherRealPath: launcherRealPath.value,
      }),
    },
  };
}

/** The first name below the versions folder that the launcher resolves into. */
function findLauncherVersion(params: {
  versionsRealPath: AbsolutePath | null;
  launcherRealPath: AbsolutePath | null;
}): string | null {
  if (params.versionsRealPath === null || params.launcherRealPath === null) {
    return null;
  }

  const prefix = `${params.versionsRealPath}/`;

  if (!params.launcherRealPath.startsWith(prefix)) {
    return null;
  }

  const [version = ''] = params.launcherRealPath.slice(prefix.length).split('/');

  return VERSION_NAME_PATTERN.test(version) ? version : null;
}
