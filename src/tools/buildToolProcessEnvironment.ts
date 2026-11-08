import type { ToolName } from './toolInstallLocations.js';

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
 * The whole environment of a tool's process: `baseEnvironment`, then the tool's own entries.
 * Nothing else is inherited.
 */
export function buildToolProcessEnvironment(params: {
  toolName: ToolName;
  baseEnvironment: Record<string, string>;
}): Record<string, string> {
  return {
    ...params.baseEnvironment,
    ...TOOL_ENVIRONMENT_ENTRIES[params.toolName],
  };
}
