import type { UnitRecheck } from '../decideComparisonActivity.js';
import { decideComparisonActivity } from '../decideComparisonActivity.js';
import type { ExploreUnitRecheckRun } from '../exploreProbe.js';
import type { ExploreToolUnitCondaPackages, ExploreToolUnitCondaTarballs } from '../exploreUnit.js';
import { listUnitPaths } from '../exploreUnit.js';
import { loadProbeOutput } from '../loadProbeOutput.js';
import type { CondaCleanPlan } from './parseCondaCleanDryRun.js';
import { CONDA_CLEAN_DRY_RUN_PROBE } from './parseCondaCleanDryRun.js';

/**
 * Asks the clean's dry run again and compares its paths with the unit, right before the clean:
 * unchanged while the clean would remove some of the unit's paths and nothing else, and idle.
 */
export async function recheckCondaUnit(params: {
  unit: ExploreToolUnitCondaTarballs | ExploreToolUnitCondaPackages;
  run: ExploreUnitRecheckRun;
}): Promise<UnitRecheck> {
  const plan = await loadProbeOutput({
    probe: CONDA_CLEAN_DRY_RUN_PROBE,
    ...params.run,
  });

  if (plan.kind === 'failed') {
    return plan;
  }

  if (!isCondaCleanWithinUnit({ unit: params.unit, plan: plan.value })) {
    return { kind: 'changed' };
  }

  return decideComparisonActivity({
    facts: { kind: 'conda' },
    runningProcesses: params.run.runningProcesses,
  });
}

/** Whether the fresh clean of the unit's kind removes something, and only paths of the unit. */
function isCondaCleanWithinUnit(params: {
  unit: ExploreToolUnitCondaTarballs | ExploreToolUnitCondaPackages;
  plan: CondaCleanPlan;
}): boolean {
  const unitPaths: string[] = listUnitPaths(params.unit);
  const freshPaths =
    params.unit.kind === 'condaTarballs' ? params.plan.tarballPaths : params.plan.packagePaths;

  return freshPaths.length > 0 && freshPaths.every((path) => unitPaths.includes(path));
}
