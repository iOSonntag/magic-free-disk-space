import type { Environment } from '../environment/buildEnvironment.js';
import type { ExploreToolFailure, ExploreToolUnit } from '../explore/exploreUnit.js';
import { buildUnitCommand } from '../explore/exploreUnit.js';
import { recheckExploreUnit } from '../explore/recheckExploreUnit.js';
import { SCAN_LIMITS } from '../scan/limits.js';
import type { UnitMeasurement } from '../scan/loadUnitMeasurement.js';
import { loadUnitMeasurement } from '../scan/loadUnitMeasurement.js';
import type { LocatedTool } from '../tools/findTrustedTool.js';
import { loadTrustedTool } from '../tools/findTrustedTool.js';
import { runToolCommand } from '../tools/runToolCommand.js';

export const TOOL_RUN_TIMEOUT_MS = 600_000;

/** The command ran and exited 0. */
export type ToolCandidateRunCompleted = {
  kind: 'completed';
  freedBytes: number;
  stderrTail: string;
};

export type ToolCandidateSkipReason = 'changedSinceScan' | 'ownerRunning';

/** The command did not run: the tool or the unit changed since the scan, or its owner works on it. */
export type ToolCandidateRunSkipped = { kind: 'skipped'; reason: ToolCandidateSkipReason };

/** The recheck or the command failed; a command that ran may have freed part of the unit. */
export type ToolCandidateRunFailed = {
  kind: 'failed';
  freedBytes: number;
  failure: ExploreToolFailure;
};

export type ToolCandidateRun =
  | ToolCandidateRunCompleted
  | ToolCandidateRunSkipped
  | ToolCandidateRunFailed;

/**
 * Runs the unit's command once its tool passes the trust check again and `recheckExploreUnit`
 * finds the unit unchanged and idle with that fresh tool, with the processes
 * `loadProcessCommands` reads right before the recheck. The unit is measured first, so
 * `freedBytes`, the drop of its measured size, holds nothing the recheck itself added; the
 * command runs right after the recheck.
 */
export async function runToolCandidate(params: {
  unit: ExploreToolUnit;
  environment: Environment;
  loadProcessCommands: () => Promise<string[] | null>;
  timeoutMs: number;
}): Promise<ToolCandidateRun> {
  const before = await loadUnitMeasurement({
    unit: params.unit,
    deadlineMs: Date.now() + SCAN_LIMITS.measureTimeoutMs,
  });
  const trustedTool = await loadTrustedTool({
    name: params.unit.tool.name,
    path: params.unit.tool.path,
    userId: params.environment.userId,
  });

  if (trustedTool.kind === 'failed') {
    return { kind: 'skipped', reason: 'changedSinceScan' };
  }

  const recheck = await recheckExploreUnit({
    unit: params.unit,
    tool: trustedTool.value,
    environment: params.environment,
    processCommands: await params.loadProcessCommands(),
    timeoutMs: SCAN_LIMITS.toolProbeTimeoutMs,
  });

  switch (recheck.kind) {
    case 'changed':
      return { kind: 'skipped', reason: 'changedSinceScan' };
    case 'busy':
      return { kind: 'skipped', reason: 'ownerRunning' };
    case 'failed':
      return { kind: 'failed', freedBytes: 0, failure: recheck.failure };
    case 'unchanged':
      return runCheckedUnitCommand({
        unit: params.unit,
        tool: trustedTool.value,
        environment: params.environment,
        before: before,
        timeoutMs: params.timeoutMs,
      });
  }
}

/** Runs the command of a unit the recheck found unchanged and measures what it freed. */
async function runCheckedUnitCommand(params: {
  unit: ExploreToolUnit;
  tool: LocatedTool;
  environment: Environment;
  before: UnitMeasurement;
  timeoutMs: number;
}): Promise<ToolCandidateRun> {
  const command = await runToolCommand({
    tool: params.tool,
    args: buildUnitCommand(params.unit),
    homeDir: params.environment.homeDir,
    tempDir: params.environment.tempDir,
    timeoutMs: params.timeoutMs,
  });
  const after = await loadUnitMeasurement({
    unit: params.unit,
    deadlineMs: Date.now() + SCAN_LIMITS.measureTimeoutMs,
  });
  const freedBytes = Math.max(0, params.before.allocatedBytes - after.allocatedBytes);

  if (command.kind === 'failed') {
    return {
      kind: 'failed',
      freedBytes: freedBytes,
      failure: { reason: 'commandFailed', failure: command.failure },
    };
  }

  return { kind: 'completed', freedBytes: freedBytes, stderrTail: command.value.stderrTail };
}
