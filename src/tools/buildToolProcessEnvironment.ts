import { dirname } from 'node:path';
import type { LocatedTool } from './findTrustedTool.js';
import type { ToolName } from './toolInstallLocations.js';

const SYSTEM_PATH_DIRS = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];

// Keeps Homebrew from updating itself, reporting home, and printing hints into its output.
const HOMEBREW_ENVIRONMENT_ENTRIES = {
  HOMEBREW_NO_AUTO_UPDATE: '1',
  HOMEBREW_NO_ANALYTICS: '1',
  HOMEBREW_NO_ENV_HINTS: '1',
};

// Entries that keep each tool from reaching the network or changing its own setup.
const TOOL_ENVIRONMENT_ENTRIES: Record<ToolName, Record<string, string>> = {
  xcrun: {},
  dart: {},
  mise: { MISE_OFFLINE: '1' },
  brewAppleSilicon: HOMEBREW_ENVIRONMENT_ENTRIES,
  brewIntel: HOMEBREW_ENVIRONMENT_ENTRIES,
  avdmanager: {},
};

/**
 * The whole environment of a tool's process: nothing is inherited, and `PATH` holds only the
 * tool's own folder and the system folders.
 */
export function buildToolProcessEnvironment(params: {
  tool: LocatedTool;
  homeDir: string;
  tempDir: string;
}): Record<string, string> {
  return {
    HOME: params.homeDir,
    TMPDIR: params.tempDir,
    LANG: 'en_US.UTF-8',
    PATH: [dirname(params.tool.path), ...SYSTEM_PATH_DIRS].join(':'),
    ...TOOL_ENVIRONMENT_ENTRIES[params.tool.name],
  };
}
