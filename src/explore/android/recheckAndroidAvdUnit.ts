import type { UnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreUnitRecheckRun } from '../exploreProbe.js';
import type { ExploreToolUnitAndroidAvd } from '../exploreUnit.js';
import { compareAndroidAvdUnit } from './compareAndroidAvdUnit.js';
import { loadAndroidSdkState } from './loadAndroidSdkState.js';

export async function recheckAndroidAvdUnit(params: {
  unit: ExploreToolUnitAndroidAvd;
  run: ExploreUnitRecheckRun;
}): Promise<UnitRecheck> {
  const state = await loadAndroidSdkState({ homeDir: params.run.environment.homeDir });

  if (state.kind === 'failed') {
    return state;
  }

  return compareAndroidAvdUnit({
    unit: params.unit,
    state: state.value,
    processCommands: params.run.processCommands,
  });
}
