import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { UnitComparison, UnitRecheck } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExploreUnitRecheckRun } from '../exploreProbe.js';
import type { ExploreToolUnitVagrantBoxVersion } from '../exploreUnit.js';
import { loadProbeOutput } from '../loadProbeOutput.js';
import { buildVagrantBoxVersionPath, listOutdatedVagrantBoxes } from './buildVagrantBoxFindings.js';
import type { VagrantBox } from './parseVagrantBoxList.js';
import { VAGRANT_BOX_LIST_PROBE } from './parseVagrantBoxList.js';

/** Lists the boxes again and compares the unit's version with the list, right before its remove. */
export async function recheckVagrantBoxUnit(params: {
  unit: ExploreToolUnitVagrantBoxVersion;
  run: ExploreUnitRecheckRun;
}): Promise<UnitRecheck> {
  const boxes = await loadProbeOutput({
    probe: VAGRANT_BOX_LIST_PROBE,
    tool: params.run.tool,
    environment: params.run.environment,
    deadlineMs: params.run.deadlineMs,
  });

  if (boxes.kind === 'failed') {
    return boxes;
  }

  return compareVagrantBoxVersion({
    unit: params.unit,
    boxes: boxes.value,
    pathRules: params.run.environment.pathRules,
    homeDir: params.run.environment.homeDir,
    processCommands: params.run.processCommands,
  });
}

/**
 * Unchanged while the list still holds the unit's version, in the same folder, outdated by a newer
 * one; busy while `vagrant` runs.
 */
export function compareVagrantBoxVersion(params: {
  unit: ExploreToolUnitVagrantBoxVersion;
  boxes: VagrantBox[];
  pathRules: PathRules;
  homeDir: AbsolutePath;
  processCommands: string[] | null;
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
    processCommands: params.processCommands,
  });
}
