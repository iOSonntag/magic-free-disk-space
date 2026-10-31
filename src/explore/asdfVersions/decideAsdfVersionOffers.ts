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
  pins: ToolPins;
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

  switch (params.pins.kind) {
    case 'everyVersionPinned':
      return { offers: [], isComplete: true };
    case 'texts':
      break;
  }

  const pinnedFolderKeys = buildPinnedFolderKeys({
    pinnedFolders: parseAsdfToolVersionsPins({ files: params.pins.files }),
    links: params.state.links,
  });
  const offers: AsdfVersionFolderParsed[] = [];
  let isComplete = true;

  for (const folder of params.state.folders) {
    switch (folder.kind) {
      case 'unparsed':
        isComplete = false;
        break;
      case 'parsed':
        if (
          !pinnedFolderKeys.has(
            buildFolderKey({ toolName: folder.asdfToolName, folderName: folder.version }),
          )
        ) {
          offers.push(folder);
        }
        break;
    }
  }

  return { offers: offers, isComplete: isComplete };
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
