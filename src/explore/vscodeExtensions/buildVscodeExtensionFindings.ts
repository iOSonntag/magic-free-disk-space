import { compareDottedVersions } from '../compareDottedVersions.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type {
  ExploreFinding,
  ExplorePathUnitVscodeExtensionReason,
  ExploreProbeFindings,
} from '../exploreUnit.js';
import type {
  VscodeExtensionFolder,
  VscodeExtensionState,
  VscodeExtensionStateInstalled,
} from './loadVscodeExtensionState.js';
import { hasVscodeExtensionFolder } from './loadVscodeExtensionState.js';

export type VscodeExtensionOfferObsolete = { reason: 'obsolete' };

export type VscodeExtensionOfferOlderVersion = { reason: 'olderVersion'; newerVersion: string };

/** Why the state offers an extension folder, with what the evidence names. */
export type VscodeExtensionOffer = VscodeExtensionOfferObsolete | VscodeExtensionOfferOlderVersion;

/** Tried in this order, so a folder `.obsolete` marks is offered as obsolete. */
const VSCODE_EXTENSION_REASONS: ExplorePathUnitVscodeExtensionReason[] = [
  'obsolete',
  'olderVersion',
];

/**
 * Offers each extension folder no registry lists that `.obsolete` marks or that a newer version of
 * its id outdates. Not judged without every registry; only in part while `.obsolete` is unfit.
 */
export function buildVscodeExtensionFindings(params: {
  state: VscodeExtensionState;
  processCommands: string[] | null;
}): ExploreProbeFindings {
  switch (params.state.kind) {
    case 'noExtensions':
      return { findings: [], isComplete: true };
    case 'installed':
      return buildInstalledExtensionFindings({
        state: params.state,
        processCommands: params.processCommands,
      });
  }
}

function buildInstalledExtensionFindings(params: {
  state: VscodeExtensionStateInstalled;
  processCommands: string[] | null;
}): ExploreProbeFindings {
  if (params.state.listedFolderNames === null) {
    return { findings: [], isComplete: false };
  }

  const findings = params.state.folders.flatMap((folder) => {
    const offer = findFirstVscodeExtensionOffer({ state: params.state, folder: folder });

    if (offer === null) {
      return [];
    }

    return [
      buildVscodeExtensionFinding({
        folder: folder,
        offer: offer,
        processCommands: params.processCommands,
      }),
    ];
  });

  return { findings: findings, isComplete: params.state.obsoleteFolderNames !== null };
}

function findFirstVscodeExtensionOffer(params: {
  state: VscodeExtensionStateInstalled;
  folder: VscodeExtensionFolder;
}): VscodeExtensionOffer | null {
  for (const reason of VSCODE_EXTENSION_REASONS) {
    const offer = findVscodeExtensionOffer({
      state: params.state,
      folder: params.folder,
      reason: reason,
    });

    if (offer !== null) {
      return offer;
    }
  }

  return null;
}

/**
 * The offer of the folder by `reason`: no registry lists it, and `.obsolete` marks it or a newer
 * version of its id is installed. `null` when the reason does not hold or could not be judged.
 */
export function findVscodeExtensionOffer(params: {
  state: VscodeExtensionStateInstalled;
  folder: VscodeExtensionFolder;
  reason: ExplorePathUnitVscodeExtensionReason;
}): VscodeExtensionOffer | null {
  if (
    params.state.listedFolderNames === null ||
    hasVscodeExtensionFolder({ folderNames: params.state.listedFolderNames, folder: params.folder })
  ) {
    return null;
  }

  switch (params.reason) {
    case 'obsolete': {
      const isMarked =
        params.state.obsoleteFolderNames !== null &&
        hasVscodeExtensionFolder({
          folderNames: params.state.obsoleteFolderNames,
          folder: params.folder,
        });

      return isMarked ? { reason: 'obsolete' } : null;
    }
    case 'olderVersion': {
      const newerVersion = findNewestVersion({ state: params.state, folder: params.folder });

      return newerVersion === null ? null : { reason: 'olderVersion', newerVersion: newerVersion };
    }
  }
}

/** The newest version of the folder's extension id, compared without case, if newer than it. */
function findNewestVersion(params: {
  state: VscodeExtensionStateInstalled;
  folder: VscodeExtensionFolder;
}): string | null {
  const extensionId = params.folder.extensionId.toLowerCase();
  const newerVersions = params.state.folders
    .filter((other) => other.extensionId.toLowerCase() === extensionId)
    .map((other) => other.version)
    .filter((version) => compareDottedVersions(version, params.folder.version) > 0);
  const [newestVersion] = newerVersions.toSorted((left, right) =>
    compareDottedVersions(right, left),
  );

  return newestVersion ?? null;
}

function buildVscodeExtensionFinding(params: {
  folder: VscodeExtensionFolder;
  offer: VscodeExtensionOffer;
  processCommands: string[] | null;
}): ExploreFinding {
  return {
    unit: {
      kind: 'vscodeExtension',
      folderPath: params.folder.path,
      extensionId: params.folder.extensionId,
      version: params.folder.version,
      reason: params.offer.reason,
    },
    title: `VS Code extension ${params.folder.extensionId} ${params.folder.version}`,
    explanation: formatOfferExplanation({ offer: params.offer }),
    regeneration: 'VS Code downloads it again only if you install this version again.',
    risk: 'review',
    evidenceLines: [
      "Neither VS Code's default registry nor any profile's lists this folder.",
      formatOfferEvidenceLine({ folder: params.folder, offer: params.offer }),
    ],
    displayPath: params.folder.path,
    activity: decideUnitActivity({
      facts: { kind: 'vscodeExtension' },
      processCommands: params.processCommands,
    }),
  };
}

function formatOfferExplanation(params: { offer: VscodeExtensionOffer }): string {
  switch (params.offer.reason) {
    case 'obsolete':
      return 'An extension folder VS Code marked for removal after an uninstall or an update.';
    case 'olderVersion':
      return 'An older version of an extension, left beside a newer version of it.';
  }
}

function formatOfferEvidenceLine(params: {
  folder: VscodeExtensionFolder;
  offer: VscodeExtensionOffer;
}): string {
  switch (params.offer.reason) {
    case 'obsolete':
      return "VS Code's .obsolete file marks it for removal.";
    case 'olderVersion':
      return `Version ${params.offer.newerVersion} of ${params.folder.extensionId} is installed beside it.`;
  }
}
