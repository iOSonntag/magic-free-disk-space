import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';
import type { ProjectPins } from '../projectPins/projectPins.js';
import { listToolPinFileRefs, selectToolPins } from '../projectPins/selectToolPins.js';
import { buildNvmVersionFindings } from './buildNvmVersionFindings.js';
import { decideNvmVersionOffers } from './decideNvmVersionOffers.js';
import { loadNvmState } from './loadNvmState.js';
import { NVM_PIN_FILE_KINDS } from './parseNvmrcPin.js';

/** The nvm node versions that neither the default alias nor any `.nvmrc` found resolves to. */
export async function loadNvmVersionFindings(params: {
  run: ExploreProbeRun;
  projectPins: ProjectPins;
}): Promise<ExploreProbeFilesResult> {
  const toolPins = selectToolPins({ pins: params.projectPins.files, kinds: NVM_PIN_FILE_KINDS });

  if (toolPins.kind === 'failed') {
    return toolPins;
  }

  const state = await loadNvmState({ homeDir: params.run.environment.homeDir });

  if (state.kind === 'failed') {
    return state;
  }

  const offers = decideNvmVersionOffers({ state: state.value, toolPins: toolPins.value });

  return {
    kind: 'succeeded',
    value: buildNvmVersionFindings({
      offers: offers,
      pinFiles: listToolPinFileRefs({ toolPins: toolPins.value }),
      projectPins: params.projectPins,
      processCommands: params.run.processCommands,
    }),
  };
}
