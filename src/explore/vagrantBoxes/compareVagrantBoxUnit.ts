import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { RunningProcesses } from '../../system/systemPlatform.js';
import type { UnitComparison } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExploreToolUnitVagrantBoxVersion } from '../exploreUnit.js';
import { buildVagrantBoxVersionPath, listOutdatedVagrantBoxes } from './buildVagrantBoxFindings.js';
import type { VagrantBox } from './parseVagrantBoxList.js';

/**
 * Unchanged while the list still holds the unit's version, in the same folder, outdated by a newer
 * one; busy while `vagrant` runs.
 */
export function compareVagrantBoxUnit(params: {
  unit: ExploreToolUnitVagrantBoxVersion;
  boxes: VagrantBox[];
  pathRules: PathRules;
  homeDir: AbsolutePath;
  runningProcesses: RunningProcesses | null;
}): UnitComparison {
  const isStillOutdated = listOutdatedVagrantBoxes(params.boxes).some(
    (outdated) =>
      outdated.box.name === params.unit.name &&
      outdated.box.provider === params.unit.provider &&
      outdated.box.version === params.unit.version &&
      buildVagrantBoxVersionPath({
        box: outdated.box,
        pathRules: params.pathRules,
        homeDir: params.homeDir,
      }) === params.unit.versionPath,
  );

  if (!isStillOutdated) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'vagrant' },
    runningProcesses: params.runningProcesses,
  });
}
