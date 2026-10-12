import { realpath } from 'node:fs/promises';
import type { Result } from '../result.js';
import type { CommandFailure } from '../system/loadCommandOutput.js';
import { loadCommandOutput } from '../system/loadCommandOutput.js';

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

  return {
    kind: 'succeeded',
    value: bundlePath === null ? null : await loadRealPathOrSelf({ path: bundlePath }),
  };
}

/** The resolved path, so a link such as `Xcode.app` names the bundle it points to. */
async function loadRealPathOrSelf(params: { path: string }): Promise<string> {
  try {
    return await realpath(params.path);
  } catch {
    return params.path;
  }
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
