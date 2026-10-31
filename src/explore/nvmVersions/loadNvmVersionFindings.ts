import type { ExploreProbeFilesResult, ExploreProbeRun } from '../exploreProbe.js';
import type { ProjectPins } from '../projectPins/projectPins.js';
import { selectToolPins } from '../projectPins/selectToolPins.js';
import { buildNvmVersionFindings } from './buildNvmVersionFindings.js';
import { decideNvmVersionOffers } from './decideNvmVersionOffers.js';
import { loadNvmState } from './loadNvmState.js';

/** The nvm node versions that neither the default alias nor any `.nvmrc` found resolves to. */
export async function loadNvmVersionFindings(params: {
  run: ExploreProbeRun;
  projectPins: ProjectPins;
}): Promise<ExploreProbeFilesResult> {
  const toolPins = selectToolPins({ pins: params.projectPins.files, kinds: ['nvmrc'] });

  if (toolPins.kind === 'failed') {
    return toolPins;
  }

  const state = await loadNvmState({ homeDir: params.run.environment.homeDir });

  if (state.kind === 'failed') {
    return state;
  }

  const offers = decideNvmVersionOffers({ state: state.value, toolPins: toolPins.value });
  const pinFiles =
    toolPins.value.kind === 'texts'
      ? toolPins.value.files.map((file) => ({ path: file.path, kind: file.kind }))
      : [];

  return {
    kind: 'succeeded',
    value: buildNvmVersionFindings({
      offers: offers,
      pinFiles: pinFiles,
      projectPins: params.projectPins,
      processCommands: params.run.processCommands,
    }),
  };
}
