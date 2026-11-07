import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import type { ExploreToolCommandRun } from '../exploreProbe.js';
import type { ExploreProbeFailure } from '../exploreUnit.js';
import { loadExploreEntryStats } from '../loadExploreRead.js';
import { loadProbeOutput } from '../loadProbeOutput.js';
import type { RustupListedToolchain } from './parseRustupLists.js';
import { RUSTUP_OVERRIDE_LIST_PROBE, RUSTUP_TOOLCHAIN_LIST_PROBE } from './parseRustupLists.js';

/** rustup's toolchains below the home folder, the same on every platform. */
const RUSTUP_TOOLCHAINS_PATH_NAMES = ['.rustup', 'toolchains'];

/** A listed toolchain whose folder is a real folder; a linked custom toolchain has none. */
export type RustupInstalledToolchain = RustupListedToolchain & { toolchainPath: AbsolutePath };

/** What rustup lists, and the toolchains its folder overrides name. */
export type RustupState = {
  toolchains: RustupInstalledToolchain[];
  overrideNames: string[];
};

/** Runs `rustup toolchain list` and `rustup override list`, and finds each toolchain's folder. */
export async function loadRustupState(params: {
  run: ExploreToolCommandRun;
  privacyDenialCode: string | null;
}): Promise<Result<RustupState, ExploreProbeFailure>> {
  const listed = await loadProbeOutput({
    probe: RUSTUP_TOOLCHAIN_LIST_PROBE,
    tool: params.run.tool,
    environment: params.run.environment,
    deadlineMs: params.run.deadlineMs,
  });

  if (listed.kind === 'failed') {
    return listed;
  }

  const overrideNames = await loadProbeOutput({
    probe: RUSTUP_OVERRIDE_LIST_PROBE,
    tool: params.run.tool,
    environment: params.run.environment,
    deadlineMs: params.run.deadlineMs,
  });

  if (overrideNames.kind === 'failed') {
    return overrideNames;
  }

  const toolchainsRoot = joinAbsolutePath({
    rules: params.run.environment.pathRules,
    parentPath: params.run.environment.homeDir,
    names: RUSTUP_TOOLCHAINS_PATH_NAMES,
  });
  const toolchains: RustupInstalledToolchain[] = [];

  for (const toolchain of listed.value) {
    const toolchainPath = joinAbsolutePath({
      rules: params.run.environment.pathRules,
      parentPath: toolchainsRoot,
      names: [toolchain.name],
    });
    const stats = await loadExploreEntryStats({
      path: toolchainPath,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (stats.kind === 'failed') {
      return stats;
    }

    if (stats.value?.kind === 'directory') {
      toolchains.push({ ...toolchain, toolchainPath: toolchainPath });
    }
  }

  return {
    kind: 'succeeded',
    value: { toolchains: toolchains, overrideNames: overrideNames.value },
  };
}
