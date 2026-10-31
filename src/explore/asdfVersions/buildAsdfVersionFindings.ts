import type { LocatedTool } from '../../tools/findTrustedTool.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreFinding } from '../exploreUnit.js';
import type { ProjectPinFileRef, ProjectPins } from '../projectPins/projectPins.js';
import {
  buildProjectSearchEvidence,
  PINNED_VERSION_REINSTALL_EXPLANATION,
} from '../projectPins/projectSearchEvidence.js';
import type { AsdfVersionFolderParsed } from './loadAsdfState.js';

export function buildAsdfVersionFindings(params: {
  tool: LocatedTool;
  offers: AsdfVersionFolderParsed[];
  pinFiles: ProjectPinFileRef[];
  projectPins: ProjectPins;
  processCommands: string[] | null;
}): ExploreFinding[] {
  const searchEvidenceLines = buildProjectSearchEvidence({ pins: params.projectPins });

  return params.offers.map((offer) => {
    const finding: ExploreFinding = {
      unit: {
        kind: 'asdfVersion',
        tool: params.tool,
        asdfToolName: offer.asdfToolName,
        version: offer.version,
        installPath: offer.folderPath,
        pinFiles: params.pinFiles,
      },
      title: `asdf ${offer.asdfToolName} ${offer.version}`,
      explanation: `A tool version installed with asdf that no \`.tool-versions\` found asks for. ${PINNED_VERSION_REINSTALL_EXPLANATION}`,
      regeneration: 'asdf installs it again when a project asks for it.',
      risk: 'careful',
      evidenceLines: [
        `None of the \`.tool-versions\` found (${params.pinFiles.length}) names ${offer.asdfToolName} ${offer.version}.`,
        ...searchEvidenceLines,
      ],
      displayPath: offer.folderPath,
      activity: decideUnitActivity({
        facts: { kind: 'versionFolder', folderPath: offer.folderPath },
        processCommands: params.processCommands,
      }),
    };

    return finding;
  });
}
