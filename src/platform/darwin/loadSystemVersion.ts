import { SYSTEM_COMMAND_TIMEOUT_MS } from '../../system/limits.js';
import { loadPlistValue } from './loadPlistValue.js';

/** Where macOS names its own version, as `sw_vers` reads it. */
const SYSTEM_VERSION_PLIST_PATH = '/System/Library/CoreServices/SystemVersion.plist';

/** The version of macOS, such as `15.1`; `null` when it cannot be read. Never throws. */
export function loadSystemVersion(): Promise<string | null> {
  return loadPlistVersion({
    plistPath: SYSTEM_VERSION_PLIST_PATH,
    key: 'ProductVersion',
    timeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
  });
}

/** The version under `key` in the plist at `plistPath`; `null` when it is empty, missing or unread. */
export async function loadPlistVersion(params: {
  plistPath: string;
  key: string;
  timeoutMs: number;
}): Promise<string | null> {
  const version = await loadPlistValue({
    plistPath: params.plistPath,
    key: params.key,
    timeoutMs: params.timeoutMs,
  });

  return version.kind === 'failed' || version.value === '' ? null : version.value;
}
