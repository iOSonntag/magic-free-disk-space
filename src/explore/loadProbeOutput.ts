import type { Environment } from '../environment/buildEnvironment.js';
import type { Result } from '../result.js';
import type { LocatedTool } from '../tools/findTrustedTool.js';
import { runToolCommand } from '../tools/runToolCommand.js';
import type { ToolName } from '../tools/toolInstallLocations.js';
import type { ExploreToolFailure } from './exploreUnit.js';

/**
 * The read-only form of a probe, which the scan and the recheck before a run both run: its tool,
 * its arguments after the tool's leading ones, and the parser of its standard output.
 */
export type ExploreProbeDefinition<T> = {
  toolName: ToolName;
  args: string[];
  parse: (params: { stdoutText: string }) => Result<T, string>;
};

/**
 * Runs the probe with `tool` and parses its standard output; a rejection of the parser fails as
 * `outputUnreadable`. Throws for a tool other than the probe's, a broken invariant of the caller.
 */
export async function loadProbeOutput<T>(params: {
  probe: ExploreProbeDefinition<T>;
  tool: LocatedTool;
  environment: Environment;
  timeoutMs: number;
}): Promise<Result<T, ExploreToolFailure>> {
  if (params.tool.name !== params.probe.toolName) {
    throw new Error(`A probe of ${params.probe.toolName} got the tool ${params.tool.name}`);
  }

  const output = await runToolCommand({
    tool: params.tool,
    args: params.probe.args,
    homeDir: params.environment.homeDir,
    tempDir: params.environment.tempDir,
    timeoutMs: params.timeoutMs,
  });

  if (output.kind === 'failed') {
    return { kind: 'failed', failure: { reason: 'commandFailed', failure: output.failure } };
  }

  const parsed = params.probe.parse({ stdoutText: output.value.stdoutText });

  if (parsed.kind === 'failed') {
    return { kind: 'failed', failure: { reason: 'outputUnreadable', detail: parsed.failure } };
  }

  return parsed;
}
