import type { ExploreProbeToolResult, ExploreProbeToolRun } from '../exploreProbe.js';
import { loadProbeOutput } from '../loadProbeOutput.js';
import { buildVagrantBoxFindings } from './buildVagrantBoxFindings.js';
import { VAGRANT_BOX_LIST_PROBE } from './parseVagrantBoxList.js';

/** Lists the boxes with `vagrant box list` and offers each version a newer one outdates. */
export async function loadVagrantBoxFindings(
  run: ExploreProbeToolRun,
): Promise<ExploreProbeToolResult> {
  const boxes = await loadProbeOutput({
    probe: VAGRANT_BOX_LIST_PROBE,
    tool: run.tool,
    environment: run.environment,
    deadlineMs: run.deadlineMs,
  });

  if (boxes.kind === 'failed') {
    return boxes;
  }

  const findings = buildVagrantBoxFindings({
    tool: run.tool,
    boxes: boxes.value,
    pathRules: run.environment.pathRules,
    homeDir: run.environment.homeDir,
    processCommands: run.processCommands,
  });

  return { kind: 'succeeded', value: { findings: findings, isComplete: true } };
}
