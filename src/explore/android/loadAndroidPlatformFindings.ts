import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';
import type { ProjectPins } from '../projectPins/projectPins.js';
import { selectToolPins } from '../projectPins/selectToolPins.js';
import { buildAndroidPlatformFindings } from './buildAndroidPlatformFindings.js';
import { decideAndroidPlatformOffers } from './decideAndroidPlatformOffers.js';
import { loadAndroidPlatformState } from './loadAndroidPlatformState.js';

/** The platform folders of the SDK that no Gradle file found compiles against. */
export async function loadAndroidPlatformFindings(params: {
  run: ExploreProbeRun;
  projectPins: ProjectPins;
}): Promise<ExploreProbeFilesResult> {
  const pins = selectToolPins({ pins: params.projectPins.files, kinds: ['gradle'] });

  if (pins.kind === 'failed') {
    return pins;
  }

  const state = await loadAndroidPlatformState({ homeDir: params.run.environment.homeDir });

  if (state.kind === 'failed') {
    return state;
  }

  const gradleFiles = pins.value.kind === 'texts' ? pins.value.files : [];

  return {
    kind: 'succeeded',
    value: buildAndroidPlatformFindings({
      offers: decideAndroidPlatformOffers({ state: state.value, pins: pins.value }),
      gradleFiles: gradleFiles,
      projectPins: params.projectPins,
      processCommands: params.run.processCommands,
    }),
  };
}
