import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreFinding, ExploreProbeFindings } from '../exploreUnit.js';
import type { ProjectPinFileRef, ProjectPins } from '../projectPins/projectPins.js';
import {
  buildProjectSearchEvidence,
  PINNED_VERSION_REINSTALL_EXPLANATION,
} from '../projectPins/selectToolPins.js';
import type { PnpmInstalledVersion, PnpmStoreOffers } from './decidePnpmStoreOffers.js';

const PNPM_STORE_EXPLANATION = `A store-version folder of pnpm that neither an installed pnpm nor a pnpm a project pins uses. Projects keep their linked copies of its packages, so the space freed can be less than shown. A pnpm installed in a place this search does not know would fill it again. ${PINNED_VERSION_REINSTALL_EXPLANATION}`;

const PNPM_STORE_REGENERATION =
  'A pnpm that uses this store version downloads the packages a project needs into it again.';

/** One careful finding for each offered store folder; complete exactly when the offers are. */
export function buildPnpmStoreFindings(params: {
  offers: PnpmStoreOffers;
  storeRoot: AbsolutePath;
  pinFiles: ProjectPinFileRef[];
  projectPins: ProjectPins;
  processCommands: string[] | null;
}): ExploreProbeFindings {
  const activity = decideUnitActivity({
    facts: { kind: 'pnpmStore' },
    processCommands: params.processCommands,
  });
  const installedEvidence = formatInstalledEvidence({
    installedVersions: params.offers.installedVersions,
  });
  const searchEvidence = buildProjectSearchEvidence({ pins: params.projectPins });

  const findings = params.offers.offers.map((offer) => {
    const finding: ExploreFinding = {
      unit: {
        kind: 'pnpmStore',
        storeRoot: params.storeRoot,
        folderPath: offer.folderPath,
        storeVersion: offer.storeVersion,
        pinFiles: params.pinFiles,
      },
      title: `pnpm store ${offer.storeVersion}`,
      explanation: PNPM_STORE_EXPLANATION,
      regeneration: PNPM_STORE_REGENERATION,
      risk: 'careful',
      evidenceLines: [
        installedEvidence,
        `None of the \`package.json\`, \`.tool-versions\`, and mise configs found (${params.pinFiles.length}) pins a pnpm that uses ${offer.storeVersion}.`,
        ...searchEvidence,
      ],
      displayPath: offer.folderPath,
      activity: activity,
    };

    return finding;
  });

  return { findings: findings, isComplete: params.offers.isComplete };
}

function formatInstalledEvidence(params: { installedVersions: PnpmInstalledVersion[] }): string {
  if (params.installedVersions.length === 0) {
    return 'Installed pnpm: none found.';
  }

  const versions = params.installedVersions.map(
    (installed) => `${installed.versionText} (store ${installed.storeVersion})`,
  );

  return `Installed pnpm: ${versions.join(', ')}.`;
}
