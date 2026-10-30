import type {
  ExploreProbeFilesResult,
  ExploreProbeRun,
  ExploreProbeToolResult,
  ExploreProbeToolRun,
} from '../exploreProbe.js';
import {
  buildAndroidAvdFindings,
  buildAndroidEmulatorFindings,
  buildAndroidSystemImageFindings,
} from './buildAndroidFindings.js';
import {
  decideAndroidEmulatorOffers,
  decideAndroidSystemImageOffers,
} from './decideAndroidPackageOffers.js';
import { loadAndroidSdkState } from './loadAndroidSdkState.js';

/** The AVDs not used since the cutoff, each removed by the located `avdmanager`. */
export async function loadAndroidAvdFindings(
  run: ExploreProbeToolRun,
): Promise<ExploreProbeToolResult> {
  const state = await loadAndroidSdkState({ homeDir: run.environment.homeDir });

  if (state.kind === 'failed') {
    return state;
  }

  return {
    kind: 'succeeded',
    value: buildAndroidAvdFindings({
      state: state.value,
      tool: run.tool,
      unusedCutoffMs: run.unusedCutoffMs,
      processCommands: run.processCommands,
    }),
  };
}

/** The system image folders of the SDK that no AVD names. */
export async function loadAndroidSystemImageFindings(
  run: ExploreProbeRun,
): Promise<ExploreProbeFilesResult> {
  const state = await loadAndroidSdkState({ homeDir: run.environment.homeDir });

  if (state.kind === 'failed') {
    return state;
  }

  return {
    kind: 'succeeded',
    value: buildAndroidSystemImageFindings({
      offers: decideAndroidSystemImageOffers(state.value),
      processCommands: run.processCommands,
    }),
  };
}

/** The emulator package of the SDK while no AVD exists. */
export async function loadAndroidEmulatorFindings(
  run: ExploreProbeRun,
): Promise<ExploreProbeFilesResult> {
  const state = await loadAndroidSdkState({ homeDir: run.environment.homeDir });

  if (state.kind === 'failed') {
    return state;
  }

  return {
    kind: 'succeeded',
    value: buildAndroidEmulatorFindings({
      offers: decideAndroidEmulatorOffers(state.value),
      processCommands: run.processCommands,
    }),
  };
}
