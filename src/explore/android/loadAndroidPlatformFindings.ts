import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';
import type { ProjectPins } from '../projectPins/projectPins.js';
import { listToolPinFileRefs, selectToolPins } from '../projectPins/selectToolPins.js';
import { buildAndroidPlatformFindings } from './buildAndroidPlatformFindings.js';
import { decideAndroidPlatformOffers } from './decideAndroidPlatformOffers.js';
import { loadAndroidPlatformState } from './loadAndroidPlatformState.js';
import { ANDROID_PIN_FILE_KINDS } from './parseAndroidCompileSdkPins.js';

/** The platform folders of the SDK that no Gradle file found compiles against. */
export async function loadAndroidPlatformFindings(params: {
  run: ExploreProbeRun;
  projectPins: ProjectPins;
}): Promise<ExploreProbeFilesResult> {
  const toolPins = selectToolPins({
    pins: params.projectPins.files,
    kinds: ANDROID_PIN_FILE_KINDS,
  });

  if (toolPins.kind === 'failed') {
    return toolPins;
  }

  const state = await loadAndroidPlatformState({ homeDir: params.run.environment.homeDir });

  if (state.kind === 'failed') {
    return state;
  }

  return {
    kind: 'succeeded',
    value: buildAndroidPlatformFindings({
      offers: decideAndroidPlatformOffers({ state: state.value, toolPins: toolPins.value }),
      pinFiles: listToolPinFileRefs({ toolPins: toolPins.value }),
      projectPins: params.projectPins,
      processCommands: params.run.processCommands,
    }),
  };
}
