import type { Result } from '../../result.js';
import type { ExploreProbeRun } from '../exploreProbe.js';
import type { ExploreFileUnreadable, ExploreProbeFindings } from '../exploreUnit.js';
import { buildVscodeExtensionFindings } from './buildVscodeExtensionFindings.js';
import { loadVscodeExtensionState } from './loadVscodeExtensionState.js';

/** The extension folders no registry lists that are obsolete or an older version. */
export async function loadVscodeExtensionFindings(
  run: ExploreProbeRun,
): Promise<Result<ExploreProbeFindings, ExploreFileUnreadable>> {
  const state = await loadVscodeExtensionState({ homeDir: run.environment.homeDir });

  if (state.kind === 'failed') {
    return state;
  }

  return {
    kind: 'succeeded',
    value: buildVscodeExtensionFindings({
      state: state.value,
      processCommands: run.processCommands,
    }),
  };
}
