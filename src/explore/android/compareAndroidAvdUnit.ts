import type { UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExploreToolUnitAndroidAvd } from '../exploreUnit.js';
import { isAndroidAvdFolder } from './buildAndroidFindings.js';
import type { AndroidSdkState } from './loadAndroidSdkState.js';

/**
 * Unchanged while the state still lists the AVD in the unit's SDK, as an AVD folder at the same
 * paths, under the same name and last use, and idle. Runs no command, reads no clock, and takes
 * no cutoff: the last use is compared for equality.
 */
export function compareAndroidAvdUnit(params: {
  unit: ExploreToolUnitAndroidAvd;
  state: AndroidSdkState;
  processCommands: string[] | null;
}): UnitComparison {
  const isStillListed =
    params.state.sdk?.sdkRoot === params.unit.sdkRoot &&
    (params.state.avds ?? []).some(
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
    processCommands: params.processCommands,
  });
}
