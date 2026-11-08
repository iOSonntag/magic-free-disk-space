import type { Result } from '../../result.js';
import type { CommandFailure } from '../../system/loadCommandOutput.js';
import { loadCommandOutput } from '../../system/loadCommandOutput.js';

/**
 * The value of the top-level `key` in the plist at `plistPath`, as `plutil` prints it raw,
 * trimmed; an empty value stays empty. Fails with `exitedWithError` when the plist or the key is
 * missing. Never throws.
 */
export async function loadPlistValue(params: {
  plistPath: string;
  key: string;
  timeoutMs: number;
}): Promise<Result<string, CommandFailure>> {
  const output = await loadCommandOutput({
    command: 'plutil',
    args: ['-extract', params.key, 'raw', '-o', '-', params.plistPath],
    timeoutMs: params.timeoutMs,
  });

  if (output.kind === 'failed') {
    return output;
  }

  return { kind: 'succeeded', value: output.value.trim() };
}
