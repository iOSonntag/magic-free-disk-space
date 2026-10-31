import type { UnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreUnitRecheckRun } from '../exploreProbe.js';
import type { ExploreToolUnitAsdfVersion } from '../exploreUnit.js';
import { loadProjectPinFiles } from '../projectPins/loadProjectPins.js';
import { selectToolPins } from '../projectPins/selectToolPins.js';
import { compareAsdfVersionUnit } from './compareAsdfVersionUnit.js';
import { loadAsdfState } from './loadAsdfState.js';

/** Reads the installs and the unit's pin files again and compares them with the unit. */
export async function recheckAsdfVersionUnit(params: {
  unit: ExploreToolUnitAsdfVersion;
  run: ExploreUnitRecheckRun;
}): Promise<UnitRecheck> {
  const state = await loadAsdfState({ homeDir: params.run.environment.homeDir });

  if (state.kind === 'failed') {
    return state;
  }

  const pinFiles = await loadProjectPinFiles({ files: params.unit.pinFiles });
  const toolPins = selectToolPins({ pins: pinFiles, kinds: ['toolVersions'] });

  if (toolPins.kind === 'failed') {
    return toolPins;
  }

  return compareAsdfVersionUnit({
    unit: params.unit,
    state: state.value,
    pins: toolPins.value,
    processCommands: params.run.processCommands,
  });
}
