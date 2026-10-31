import type { ProjectPinFileText } from '../projectPins/projectPins.js';
import { parseToolVersionsText } from './parseToolVersionsText.js';

/** A folder name in `installs/<toolName>/` that a `.tool-versions` names, as asdf would use it. */
export type AsdfPinnedFolder = { toolName: string; folderName: string };

const REF_VERSION_PREFIX = 'ref:';

const PATH_VERSION_PREFIX = 'path:';

const SYSTEM_VERSION = 'system';

/**
 * The folders the `.tool-versions` texts name: `ref:<x>` names `ref-<x>`, `system` and `path:<p>`
 * name none, and any other version names the folder of its exact text.
 */
export function parseAsdfToolVersionsPins(params: {
  files: ProjectPinFileText[];
}): AsdfPinnedFolder[] {
  const pinnedFolders: AsdfPinnedFolder[] = [];

  for (const file of params.files) {
    for (const line of parseToolVersionsText({ text: file.text })) {
      for (const version of line.versions) {
        const folderName = mapAsdfVersionToFolderName({ version: version });

        if (folderName !== null) {
          pinnedFolders.push({ toolName: line.toolName, folderName: folderName });
        }
      }
    }
  }

  return pinnedFolders;
}

function mapAsdfVersionToFolderName(params: { version: string }): string | null {
  if (params.version === SYSTEM_VERSION || params.version.startsWith(PATH_VERSION_PREFIX)) {
    return null;
  }

  if (params.version.startsWith(REF_VERSION_PREFIX)) {
    return `ref-${params.version.slice(REF_VERSION_PREFIX.length)}`;
  }

  return params.version;
}
