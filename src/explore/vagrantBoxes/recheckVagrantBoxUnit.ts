import type { UnitRecheck } from '../decideComparisonActivity.js';
import type { ExploreUnitRecheckRun } from '../exploreProbe.js';
import type { ExploreToolUnitVagrantBoxVersion } from '../exploreUnit.js';
import { loadProbeOutput } from '../loadProbeOutput.js';
import { compareVagrantBoxUnit } from './compareVagrantBoxUnit.js';
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
    processes: params.run.platform.toolProcesses,
    deadlineMs: params.run.deadlineMs,
  });

  if (boxes.kind === 'failed') {
    return boxes;
  }

  return compareVagrantBoxUnit({
    unit: params.unit,
    boxes: boxes.value,
    pathRules: params.run.environment.pathRules,
    homeDir: params.run.environment.homeDir,
    runningProcesses: params.run.runningProcesses,
  });
}
