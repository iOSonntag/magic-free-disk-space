import type { Result } from '../result.js';
import type { CommandFailure } from '../system/loadCommandOutput.js';
import { loadCommandOutput } from '../system/loadCommandOutput.js';

const APP_BUNDLE_EXTENSION = '.app';

export async function loadActiveXcodeBundlePath(params: {
  commandTimeoutMs: number;
}): Promise<Result<string | null, CommandFailure>> {
  const outputResult = await loadCommandOutput({
    command: 'xcode-select',
    args: ['-p'],
    timeoutMs: params.commandTimeoutMs,
  });

  if (outputResult.kind === 'failed') {
    return outputResult;
  }

  return {
    kind: 'succeeded',
    value: getXcodeBundlePath({ developerDirPath: outputResult.value.trim() }),
  };
}

/**
 * The outermost `.app` bundle that holds the developer directory, or `null` when no bundle does,
 * as for the Command Line Tools.
 */
export function getXcodeBundlePath(params: { developerDirPath: string }): string | null {
  const bundleMarkerIndex = params.developerDirPath.indexOf(`${APP_BUNDLE_EXTENSION}/`);

  if (bundleMarkerIndex === -1) {
    return null;
  }

  return params.developerDirPath.slice(0, bundleMarkerIndex + APP_BUNDLE_EXTENSION.length);
}
