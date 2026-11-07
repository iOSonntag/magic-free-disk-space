import type { Result } from '../../result.js';
import type {
  ExploreProbeFilesResult,
  ExploreProbeRun,
  ExploreProbeToolResult,
  ExploreProbeToolRun,
} from '../exploreProbe.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import type { ProjectPins } from '../projectPins/projectPins.js';
import {
  buildAndroidAvdFindings,
  buildAndroidEmulatorFindings,
  buildAndroidSystemImageFindings,
} from './buildAndroidFindings.js';
import {
  decideAndroidEmulatorOffers,
  decideAndroidSystemImageOffers,
} from './decideAndroidPackageOffers.js';
import { loadAndroidProbeSdkRoots } from './loadAndroidSdkRoots.js';
import type { AndroidSdkState } from './loadAndroidSdkState.js';
import { loadAndroidSdkState } from './loadAndroidSdkState.js';

/** The AVDs not used since the cutoff, each removed by the located `avdmanager`. */
export async function loadAndroidAvdFindings(params: {
  run: ExploreProbeToolRun;
  projectPins: ProjectPins;
}): Promise<ExploreProbeToolResult> {
  const state = await loadAndroidProbeSdkState(params);

  if (state.kind === 'failed') {
    return state;
  }

  return {
    kind: 'succeeded',
    value: buildAndroidAvdFindings({
      state: state.value,
      tool: params.run.tool,
      unusedCutoffMs: params.run.unusedCutoffMs,
      processCommands: params.run.processCommands,
    }),
  };
}

/** The system image folders of each SDK that no AVD names. */
export async function loadAndroidSystemImageFindings(params: {
  run: ExploreProbeRun;
  projectPins: ProjectPins;
}): Promise<ExploreProbeFilesResult> {
  const state = await loadAndroidProbeSdkState(params);

  if (state.kind === 'failed') {
    return state;
  }

  return {
    kind: 'succeeded',
    value: buildAndroidSystemImageFindings({
      offers: decideAndroidSystemImageOffers(state.value),
      processCommands: params.run.processCommands,
    }),
  };
}

/** The emulator package of each SDK while no AVD exists. */
export async function loadAndroidEmulatorFindings(params: {
  run: ExploreProbeRun;
  projectPins: ProjectPins;
}): Promise<ExploreProbeFilesResult> {
  const state = await loadAndroidProbeSdkState(params);

  if (state.kind === 'failed') {
    return state;
  }

  return {
    kind: 'succeeded',
    value: buildAndroidEmulatorFindings({
      offers: decideAndroidEmulatorOffers(state.value),
      processCommands: params.run.processCommands,
    }),
  };
}

/** The state of every SDK root the probe finds, and of the AVDs. */
async function loadAndroidProbeSdkState(params: {
  run: ExploreProbeRun;
  projectPins: ProjectPins;
}): Promise<Result<AndroidSdkState, ExploreFileUnreadable>> {
  const sdkRoots = await loadAndroidProbeSdkRoots(params);

  if (sdkRoots.kind === 'failed') {
    return sdkRoots;
  }

  return loadAndroidSdkState({
    pathRules: params.run.environment.pathRules,
    homeDir: params.run.environment.homeDir,
    sdkRoots: sdkRoots.value,
    privacyDenialCode: params.run.platform.privacyDenialCode,
  });
}
