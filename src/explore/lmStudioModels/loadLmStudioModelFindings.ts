import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';
import { buildLmStudioModelFindings } from './buildLmStudioModelFindings.js';
import { loadLmStudioModelState } from './loadLmStudioModelState.js';

/** The model folders in `~/.lmstudio/models`, one per publisher and model. */
export async function loadLmStudioModelFindings(
  run: ExploreProbeRun,
): Promise<ExploreProbeFilesResult> {
  const folders = await loadLmStudioModelState({
    pathRules: run.environment.pathRules,
    homeDir: run.environment.homeDir,
    privacyDenialCode: run.platform.privacyDenialCode,
  });

  if (folders.kind === 'failed') {
    return folders;
  }

  return {
    kind: 'succeeded',
    value: buildLmStudioModelFindings({
      folders: folders.value,
      processCommands: run.processCommands,
    }),
  };
}
