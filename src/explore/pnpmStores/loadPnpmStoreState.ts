import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import { loadExploreDirectoryNames, loadExploreFolderNames } from '../loadExploreRead.js';
import type { PnpmStoreVersion } from './parsePnpmStoreVersion.js';
import { parsePnpmStoreVersion } from './parsePnpmStoreVersion.js';

/**
 * A folder `<store root>/v<N>` whose name is a store version. `hasGlobalVirtualStore` is whether
 * its `links` holds pnpm's global virtual store, which projects and global packages link into.
 */
export type PnpmStoreFolderParsed = {
  kind: 'parsed';
  folderPath: AbsolutePath;
  storeVersion: PnpmStoreVersion;
  hasGlobalVirtualStore: boolean;
};

/** A folder of the store root whose name `parsePnpmStoreVersion` refuses, such as `tmp`. */
export type PnpmStoreFolderUnparsed = { kind: 'unparsed'; folderPath: AbsolutePath };

export type PnpmStoreFolder = PnpmStoreFolderParsed | PnpmStoreFolderUnparsed;

/** The folders of one store root; none when the root is missing. */
export type PnpmStoreState = { folders: PnpmStoreFolder[] };

const GLOBAL_VIRTUAL_STORE_FOLDER_NAME = 'links';

const HIDDEN_NAME_PREFIX = '.';

export async function loadPnpmStoreState(params: {
  storeRoot: AbsolutePath;
}): Promise<Result<PnpmStoreState, ExploreFileUnreadable>> {
  const names = await loadExploreFolderNames({ path: params.storeRoot });

  if (names.kind === 'failed') {
    return names;
  }

  if (names.value === null) {
    return { kind: 'succeeded', value: { folders: [] } };
  }

  const folders = await loadPnpmStoreFolders({
    storeRoot: params.storeRoot,
    folderNames: names.value.folderNames,
  });

  if (folders.kind === 'failed') {
    return folders;
  }

  return { kind: 'succeeded', value: { folders: folders.value } };
}

async function loadPnpmStoreFolders(params: {
  storeRoot: AbsolutePath;
  folderNames: string[];
}): Promise<Result<PnpmStoreFolder[], ExploreFileUnreadable>> {
  const folders: PnpmStoreFolder[] = [];

  for (const folderName of params.folderNames) {
    const folder = await loadPnpmStoreFolder({
      storeRoot: params.storeRoot,
      folderName: folderName,
    });

    if (folder.kind === 'failed') {
      return folder;
    }

    folders.push(folder.value);
  }

  return { kind: 'succeeded', value: folders };
}

/**
 * A store folder by its name; a parsed one holds a global virtual store when its `links` holds an
 * entry of any type whose name does not start with `.`, and a missing `links` holds none.
 */
async function loadPnpmStoreFolder(params: {
  storeRoot: AbsolutePath;
  folderName: string;
}): Promise<Result<PnpmStoreFolder, ExploreFileUnreadable>> {
  const folderPath = joinAbsolutePath({ parentPath: params.storeRoot, names: [params.folderName] });
  const storeVersion = parsePnpmStoreVersion({ folderName: params.folderName });

  switch (storeVersion.kind) {
    case 'failed':
      return { kind: 'succeeded', value: { kind: 'unparsed', folderPath: folderPath } };
    case 'succeeded': {
      const linksNames = await loadExploreDirectoryNames({
        path: joinAbsolutePath({
          parentPath: folderPath,
          names: [GLOBAL_VIRTUAL_STORE_FOLDER_NAME],
        }),
      });

      if (linksNames.kind === 'failed') {
        return linksNames;
      }

      const entryNames = linksNames.value ?? [];
      const hasGlobalVirtualStore = entryNames.some((name) => !name.startsWith(HIDDEN_NAME_PREFIX));

      return {
        kind: 'succeeded',
        value: {
          kind: 'parsed',
          folderPath: folderPath,
          storeVersion: storeVersion.value,
          hasGlobalVirtualStore: hasGlobalVirtualStore,
        },
      };
    }
  }
}
