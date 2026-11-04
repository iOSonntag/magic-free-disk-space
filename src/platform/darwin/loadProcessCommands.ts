import type { Result } from '../../result.js';
import { parseProcessCommandLines } from '../../scan/parseProcessCommandLines.js';
import type { CommandFailure } from '../../system/loadCommandOutput.js';
import { loadCommandOutput } from '../../system/loadCommandOutput.js';

export async function loadProcessCommands(params: {
  commandTimeoutMs: number;
}): Promise<Result<string[], CommandFailure>> {
  const outputResult = await loadCommandOutput({
    command: 'ps',
    args: ['-axww', '-o', 'command='],
    timeoutMs: params.commandTimeoutMs,
  });

  if (outputResult.kind === 'failed') {
    return outputResult;
  }

  const commandLines = parseProcessCommandLines({ stdoutText: outputResult.value });

  return { kind: 'succeeded', value: commandLines };
}
