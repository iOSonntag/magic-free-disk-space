import { SYSTEM_COMMAND_TIMEOUT_MS } from '../../system/limits.js';
import { loadPlistValue } from './loadPlistValue.js';

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
  const version = await loadPlistValue({
    plistPath: params.plistPath,
    key: 'ProductVersion',
    timeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
  });

  return version.kind === 'failed' || version.value === '' ? null : version.value;
}
