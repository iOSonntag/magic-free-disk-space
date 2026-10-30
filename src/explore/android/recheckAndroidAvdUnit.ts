import type { UnitRecheck } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExploreUnitRecheckRun } from '../exploreProbe.js';
import type { ExploreToolUnitAndroidAvd } from '../exploreUnit.js';
import { isAndroidAvdFolder } from './buildAndroidFindings.js';
import { loadAndroidSdkState } from './loadAndroidSdkState.js';

/**
 * Unchanged while the AVD is still an AVD folder at the same path, with the same last use, and
 * idle. Runs no command, reads no clock, and takes no cutoff: the last use is compared for
 * equality.
 */
export async function recheckAndroidAvdUnit(params: {
  unit: ExploreToolUnitAndroidAvd;
  run: ExploreUnitRecheckRun;
}): Promise<UnitRecheck> {
  const state = await loadAndroidSdkState({ homeDir: params.run.environment.homeDir });

  if (state.kind === 'failed') {
    return state;
  }

  const isStillListed =
    state.value.sdk?.sdkRoot === params.unit.sdkRoot &&
    (state.value.avds ?? []).some(
      (avd) =>
        avd.kind === 'present' &&
        isAndroidAvdFolder(avd) &&
        avd.name === params.unit.name &&
        avd.iniPath === params.unit.iniPath &&
        avd.avdPath === params.unit.avdPath &&
        avd.lastUsedAtMs === params.unit.lastUsedAtMs,
    );

  if (!isStillListed) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'android' },
    processCommands: params.run.processCommands,
  });
}
