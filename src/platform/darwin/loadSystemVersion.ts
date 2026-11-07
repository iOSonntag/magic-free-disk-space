import { SYSTEM_COMMAND_TIMEOUT_MS } from '../../system/limits.js';
import { loadCommandOutput } from '../../system/loadCommandOutput.js';

/** Where macOS names its own version, as `sw_vers` reads it. */
const SYSTEM_VERSION_PLIST_PATH = '/System/Library/CoreServices/SystemVersion.plist';

/** The version of macOS, such as `15.1`; `null` when it cannot be read. Never throws. */
export function loadSystemVersion(): Promise<string | null> {
  return loadPlistProductVersion({ plistPath: SYSTEM_VERSION_PLIST_PATH });
}

/** The `ProductVersion` of the plist at `plistPath`; `null` when it has none or cannot be read. */
export async function loadPlistProductVersion(params: {
  plistPath: string;
}): Promise<string | null> {
  const output = await loadCommandOutput({
    command: 'plutil',
    args: ['-extract', 'ProductVersion', 'raw', '-o', '-', params.plistPath],
    timeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
  });

  if (output.kind === 'failed') {
    return null;
  }

  const version = output.value.trim();

  return version === '' ? null : version;
}
