import type { ExploreProbeToolResult, ExploreProbeToolRun } from '../exploreProbe.js';
import type { ProjectPins } from '../projectPins/projectPins.js';
import { listToolPinFileRefs, selectToolPins } from '../projectPins/selectToolPins.js';
import { buildAsdfVersionFindings } from './buildAsdfVersionFindings.js';
import { decideAsdfVersionOffers } from './decideAsdfVersionOffers.js';
import { loadAsdfState } from './loadAsdfState.js';
import { ASDF_PIN_FILE_KINDS } from './parseAsdfToolVersionsPins.js';

/** The installed asdf versions that no `.tool-versions` found names, each removed by `asdf`. */
export async function loadAsdfVersionFindings(params: {
  run: ExploreProbeToolRun;
  projectPins: ProjectPins;
}): Promise<ExploreProbeToolResult> {
  const toolPins = selectToolPins({ pins: params.projectPins.files, kinds: ASDF_PIN_FILE_KINDS });

  if (toolPins.kind === 'failed') {
    return toolPins;
  }

  const state = await loadAsdfState({ homeDir: params.run.environment.homeDir });

  if (state.kind === 'failed') {
    return state;
  }

  const offers = decideAsdfVersionOffers({ state: state.value, toolPins: toolPins.value });
  const findings = buildAsdfVersionFindings({
    tool: params.run.tool,
    offers: offers.offers,
    pinFiles: listToolPinFileRefs({ toolPins: toolPins.value }),
    projectPins: params.projectPins,
    processCommands: params.run.processCommands,
  });

  return { kind: 'succeeded', value: { findings: findings, isComplete: offers.isComplete } };
}
