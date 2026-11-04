import { dirname } from 'node:path';
import type { LocatedTool } from './findTrustedTool.js';
import type { ToolName } from './toolInstallLocations.js';
import type { ToolProcessPlatform } from './toolsPlatform.js';

// Keeps Homebrew from updating itself, reporting home, and printing hints or colour codes into its
// output. Homebrew reads its brew.env files anyway, and `HOMEBREW_NO_COLOR` wins over a
// `HOMEBREW_COLOR` set there.
const HOMEBREW_ENVIRONMENT_ENTRIES = {
  HOMEBREW_NO_AUTO_UPDATE: '1',
  HOMEBREW_NO_ANALYTICS: '1',
  HOMEBREW_NO_ENV_HINTS: '1',
  HOMEBREW_NO_COLOR: '1',
};

// Entries that keep each tool from reaching the network or changing its own setup.
const TOOL_ENVIRONMENT_ENTRIES: Record<ToolName, Record<string, string>> = {
  xcrun: {},
  dart: {},
  mise: { MISE_OFFLINE: '1' },
  brewAppleSilicon: HOMEBREW_ENVIRONMENT_ENTRIES,
  brewIntel: HOMEBREW_ENVIRONMENT_ENTRIES,
  avdmanager: {},
  asdf: {},
  brctl: {},
  vagrant: { VAGRANT_CHECKPOINT_DISABLE: '1' },
  rustup: { RUSTUP_AUTO_INSTALL: '0' },
  conda: { CONDA_OFFLINE: 'true' },
  fvm: {},
};

/**
 * The whole environment of a tool's process: the platform's base, whose `PATH` holds only the
 * tool's own folder and the system folders, then the tool's own entries. Nothing else is
 * inherited.
 */
export function buildToolProcessEnvironment(params: {
  tool: LocatedTool;
  homeDir: string;
  tempDir: string;
  processes: ToolProcessPlatform;
}): Record<string, string> {
  return {
    ...params.processes.buildBaseEnvironment({
      toolFolderPath: dirname(params.tool.path),
      homeDir: params.homeDir,
      tempDir: params.tempDir,
    }),
    ...TOOL_ENVIRONMENT_ENTRIES[params.tool.name],
  };
}
