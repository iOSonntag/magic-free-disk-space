import type { Environment } from '../environment/buildEnvironment.js';
import type { Result } from '../result.js';
import type { LocatedTool } from '../tools/findTrustedTool.js';
import { runToolCommand } from '../tools/runToolCommand.js';
import type { ExploreToolFailure } from './exploreUnit.js';

/**
 * Runs the read-only form of a probe and parses its standard output; a rejection of the parser
 * fails as `outputUnreadable`.
 */
export async function loadProbeOutput<T>(params: {
  tool: LocatedTool;
  args: string[];
  parse: (params: { stdoutText: string }) => Result<T, string>;
  environment: Environment;
  timeoutMs: number;
}): Promise<Result<T, ExploreToolFailure>> {
  const output = await runToolCommand({
    tool: params.tool,
    args: params.args,
    homeDir: params.environment.homeDir,
    tempDir: params.environment.tempDir,
    timeoutMs: params.timeoutMs,
  });

  if (output.kind === 'failed') {
    return { kind: 'failed', failure: { reason: 'commandFailed', failure: output.failure } };
  }

  const parsed = params.parse({ stdoutText: output.value.stdoutText });

  if (parsed.kind === 'failed') {
    return { kind: 'failed', failure: { reason: 'outputUnreadable', detail: parsed.failure } };
  }

  return parsed;
}
