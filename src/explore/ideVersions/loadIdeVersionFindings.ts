import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';
import { buildIdeVersionFindings } from './buildIdeVersionFindings.js';
import { loadIdeVersionState } from './loadIdeVersionState.js';
import { loadRunningIdes } from './loadRunningIdes.js';

/** The caches, logs, plugins, and settings of the IDE versions a newer one of their product outdates. */
export async function loadIdeVersionFindings(
  run: ExploreProbeRun,
): Promise<ExploreProbeFilesResult> {
  const folders = await loadIdeVersionState({
    pathRules: run.environment.pathRules,
    homeDir: run.environment.homeDir,
    roots: run.platform.explore.ideVersionRoots,
    privacyDenialCode: run.platform.privacyDenialCode,
  });

  if (folders.kind === 'failed') {
    return folders;
  }

  const runningIdes = await loadRunningIdes({
    processCommands: run.processCommands,
    privacyDenialCode: run.platform.privacyDenialCode,
  });

  return {
    kind: 'succeeded',
    value: buildIdeVersionFindings({
      folders: folders.value,
      runningIdes: runningIdes,
      processCommands: run.processCommands,
    }),
  };
}
