import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreFinding, ExploreProbeFindings } from '../exploreUnit.js';
import type { ProjectPinFileRef, ProjectPins } from '../projectPins/projectPins.js';
import {
  buildProjectSearchEvidence,
  PINNED_VERSION_REINSTALL_EXPLANATION,
} from '../projectPins/projectSearchEvidence.js';
import type { NvmDefaultAlias, NvmVersionOffers } from './decideNvmVersionOffers.js';

/** One finding for each offered version folder; complete exactly when the offers are. */
export function buildNvmVersionFindings(params: {
  offers: NvmVersionOffers;
  pinFiles: ProjectPinFileRef[];
  projectPins: ProjectPins;
  processCommands: string[] | null;
}): ExploreProbeFindings {
  const findings = params.offers.offers.map((offer) => {
    const finding: ExploreFinding = {
      unit: {
        kind: 'nvmVersion',
        folderPath: offer.folderPath,
        version: offer.version,
        pinFiles: params.pinFiles,
      },
      title: `nvm Node.js ${offer.version}`,
      explanation: `A Node.js version installed with nvm that neither the default alias nor any \`.nvmrc\` found uses. ${PINNED_VERSION_REINSTALL_EXPLANATION}`,
      regeneration: `\`nvm install ${offer.version}\` installs it again.`,
      risk: 'careful',
      evidenceLines: [
        buildNvmDefaultAliasEvidence({ defaultAlias: params.offers.defaultAlias }),
        `None of the \`.nvmrc\` found (${params.pinFiles.length}) resolves to ${offer.version}.`,
        ...buildProjectSearchEvidence({ pins: params.projectPins }),
      ],
      displayPath: offer.folderPath,
      activity: decideUnitActivity({
        facts: { kind: 'versionFolder', folderPath: offer.folderPath },
        processCommands: params.processCommands,
      }),
    };

    return finding;
  });

  return { findings: findings, isComplete: params.offers.isComplete };
}

function buildNvmDefaultAliasEvidence(params: { defaultAlias: NvmDefaultAlias }): string {
  switch (params.defaultAlias.kind) {
    case 'none':
      return 'There is no default alias.';
    case 'noFolder':
      return 'The default alias resolves to no installed version.';
    case 'version':
      return `The default alias resolves to ${params.defaultAlias.version}.`;
  }
}
