import type { Result } from '../result.js';
import type { CommandFailure } from '../system/loadCommandOutput.js';
import { loadCommandOutput } from '../system/loadCommandOutput.js';
import { loadRealPath } from '../system/loadRealPath.js';

const APP_BUNDLE_EXTENSION = '.app';

/** The real path of the Xcode bundle that `xcode-select` points to, `null` for none. */
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

  const bundlePath = getXcodeBundlePath({ developerDirPath: outputResult.value.trim() });

  if (bundlePath === null) {
    return { kind: 'succeeded', value: null };
  }

  // A link such as `Xcode.app` names the bundle it points to; a path it cannot resolve stays.
  const bundleRealPath = await loadRealPath({ path: bundlePath });

  return { kind: 'succeeded', value: bundleRealPath ?? bundlePath };
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
