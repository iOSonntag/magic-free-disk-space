import type { Risk } from '../../catalog/catalog.js';
import type { RunningProcesses } from '../../system/systemPlatform.js';
import type { UnitActivityFactsAppBundles } from '../decideUnitActivity.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreFinding, ExploreProbeFindings, IdeVersionFolderKind } from '../exploreUnit.js';
import type { IdeVersionOffer } from './decideIdeVersionOffers.js';
import { decideIdeVersionOffers } from './decideIdeVersionOffers.js';
import type { IdeVersionFolder } from './loadIdeVersionState.js';
import type { RunningIde } from './loadRunningIdes.js';
import { listVersionBundlePaths } from './loadRunningIdes.js';

/** The texts and the risk of each kind of folder. */
type IdeVersionFolderTexts = {
  noun: string;
  explanation: string;
  regeneration: string;
  risk: Risk;
};

const IDE_VERSION_FOLDER_TEXTS: Record<IdeVersionFolderKind, IdeVersionFolderTexts> = {
  caches: {
    noun: 'caches',
    explanation:
      'The caches and indexes of an older version of a JetBrains IDE or Android Studio, which a newer version replaced.',
    regeneration: 'The IDE builds them again if you open this version again.',
    risk: 'safe',
  },
  logs: {
    noun: 'logs',
    explanation: 'The logs of an older version of a JetBrains IDE or Android Studio.',
    regeneration: 'The IDE writes new logs if you open this version again.',
    risk: 'safe',
  },
  plugins: {
    noun: 'plugins',
    explanation:
      'The plugins installed for an older version of a JetBrains IDE or Android Studio. The newer version keeps its own.',
    regeneration: 'You install them again only if you open this version again.',
    risk: 'review',
  },
  settings: {
    noun: 'settings',
    explanation:
      'The settings of an older version of a JetBrains IDE or Android Studio, which a newer version imports when it first starts.',
    regeneration: 'Nothing makes them again: they hold your settings of this version.',
    risk: 'careful',
  },
};

/** Offers each folder of an old version; one is in use while an IDE of that version runs. */
export function buildIdeVersionFindings(params: {
  folders: IdeVersionFolder[];
  runningIdes: RunningIde[];
  runningProcesses: RunningProcesses | null;
}): ExploreProbeFindings {
  return {
    findings: decideIdeVersionOffers({ folders: params.folders }).map((offer) =>
      buildIdeVersionFinding({
        offer: offer,
        runningIdes: params.runningIdes,
        runningProcesses: params.runningProcesses,
      }),
    ),
    isComplete: true,
  };
}

/**
 * The bundles whose run holds the version: each running IDE whose `dataDirectoryName` is the
 * version's folder name, or whose `product-info.json` could not be read.
 */
export function buildIdeVersionActivityFacts(params: {
  product: string;
  version: string;
  runningIdes: RunningIde[];
}): UnitActivityFactsAppBundles {
  return {
    kind: 'appBundles',
    bundlePaths: listVersionBundlePaths({
      runningIdes: params.runningIdes,
      dataDirectoryName: `${params.product}${params.version}`,
    }),
  };
}

function buildIdeVersionFinding(params: {
  offer: IdeVersionOffer;
  runningIdes: RunningIde[];
  runningProcesses: RunningProcesses | null;
}): ExploreFinding {
  const texts = IDE_VERSION_FOLDER_TEXTS[params.offer.folderKind];

  return {
    unit: {
      kind: 'ideVersionFolder',
      product: params.offer.product,
      version: params.offer.version,
      folderKind: params.offer.folderKind,
      folderPath: params.offer.folderPath,
      foundPaths: params.offer.foundPaths,
    },
    title: `${params.offer.product} ${params.offer.version} ${texts.noun}`,
    explanation: texts.explanation,
    regeneration: texts.regeneration,
    risk: texts.risk,
    evidenceLines: [
      `${params.offer.product} ${params.offer.newestVersion} has its own folders beside this version.`,
    ],
    displayPath:
      params.offer.folderKind === 'plugins' ? params.offer.foundPaths[0] : params.offer.folderPath,
    activity: decideUnitActivity({
      facts: buildIdeVersionActivityFacts({
        product: params.offer.product,
        version: params.offer.version,
        runningIdes: params.runningIdes,
      }),
      runningProcesses: params.runningProcesses,
    }),
  };
}
