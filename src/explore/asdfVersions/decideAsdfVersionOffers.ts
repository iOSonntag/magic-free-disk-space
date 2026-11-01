import type { ToolPins } from '../projectPins/selectToolPins.js';
import type { AsdfState, AsdfVersionFolderParsed, AsdfVersionLink } from './loadAsdfState.js';
import type { AsdfPinnedFolder } from './parseAsdfToolVersionsPins.js';
import { parseAsdfToolVersionsPins } from './parseAsdfToolVersionsPins.js';

/** The version folders no pin names; `isComplete` is false when some folder could not be judged. */
export type AsdfVersionOffers = { offers: AsdfVersionFolderParsed[]; isComplete: boolean };

/**
 * Offers each parsed version folder that no `.tool-versions` names, directly or through a link
 * beside it. Nothing is offered, and the offers are not complete, while `legacy_version_file` is on
 * or unknown, since asdf then reads pins this cleaner does not.
 */
export function decideAsdfVersionOffers(params: {
  state: AsdfState;
  toolPins: ToolPins;
}): AsdfVersionOffers {
  switch (params.state.kind) {
    case 'noInstalls':
      return { offers: [], isComplete: true };
    case 'installed':
      break;
  }

  switch (params.state.legacyVersionFile) {
    case 'on':
    case 'unknown':
      return { offers: [], isComplete: false };
    case 'off':
      break;
  }

  const hasUnparsedFolder = params.state.folders.some((folder) => folder.kind === 'unparsed');

  switch (params.toolPins.kind) {
    case 'everyVersionPinned':
      return { offers: [], isComplete: !hasUnparsedFolder };
    case 'texts':
      break;
  }

  const pinnedFolderKeys = buildPinnedFolderKeys({
    pinnedFolders: parseAsdfToolVersionsPins({ files: params.toolPins.files }),
    links: params.state.links,
  });
  const offers = params.state.folders.flatMap((folder) =>
    folder.kind === 'parsed' &&
    !pinnedFolderKeys.has(
      buildFolderKey({ toolName: folder.asdfToolName, folderName: folder.version }),
    )
      ? [folder]
      : [],
  );

  return { offers: offers, isComplete: !hasUnparsedFolder };
}

/** The keys of the pinned folders, each pin of a link also pinning the folder the link resolves to. */
function buildPinnedFolderKeys(params: {
  pinnedFolders: AsdfPinnedFolder[];
  links: AsdfVersionLink[];
}): Set<string> {
  const keys = new Set<string>();

  for (const pinnedFolder of params.pinnedFolders) {
    keys.add(buildFolderKey(pinnedFolder));

    for (const link of params.links) {
      if (
        link.asdfToolName === pinnedFolder.toolName &&
        link.linkName === pinnedFolder.folderName
      ) {
        keys.add(buildFolderKey({ toolName: link.asdfToolName, folderName: link.folderName }));
      }
    }
  }

  return keys;
}

function buildFolderKey(params: { toolName: string; folderName: string }): string {
  return `${params.toolName}/${params.folderName}`;
}
