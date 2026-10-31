import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import { loadExploreFolderNames, loadExploreRealPath } from '../loadExploreRead.js';
import type { PnpmStoreVersion } from './parsePnpmStoreVersion.js';
import { parsePnpmStoreVersion } from './parsePnpmStoreVersion.js';

/**
 * A folder `<store root>/v<N>` whose name is a store version. `realPath` is its name below the
 * real path of the store root.
 */
export type PnpmStoreFolderParsed = {
  kind: 'parsed';
  folderPath: AbsolutePath;
  realPath: AbsolutePath;
  storeVersion: PnpmStoreVersion;
};

/** A folder of the store root whose name `parsePnpmStoreVersion` refuses, such as `tmp`. */
export type PnpmStoreFolderUnparsed = {
  kind: 'unparsed';
  folderPath: AbsolutePath;
  realPath: AbsolutePath;
};

export type PnpmStoreFolder = PnpmStoreFolderParsed | PnpmStoreFolderUnparsed;

/** The folders of one store root; none when the root or its real path is missing. */
export type PnpmStoreState = { folders: PnpmStoreFolder[] };

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

  const storeRootRealPath = await loadExploreRealPath({ path: params.storeRoot });

  if (storeRootRealPath.kind === 'failed') {
    return storeRootRealPath;
  }

  if (storeRootRealPath.value === null) {
    return { kind: 'succeeded', value: { folders: [] } };
  }

  const realStoreRoot = storeRootRealPath.value;
  const folders = names.value.folderNames.map((folderName) =>
    buildPnpmStoreFolder({
      storeRoot: params.storeRoot,
      storeRootRealPath: realStoreRoot,
      folderName: folderName,
    }),
  );

  return { kind: 'succeeded', value: { folders: folders } };
}

function buildPnpmStoreFolder(params: {
  storeRoot: AbsolutePath;
  storeRootRealPath: AbsolutePath;
  folderName: string;
}): PnpmStoreFolder {
  const folderPath = joinAbsolutePath({ parentPath: params.storeRoot, names: [params.folderName] });
  const realPath = joinAbsolutePath({
    parentPath: params.storeRootRealPath,
    names: [params.folderName],
  });
  const storeVersion = parsePnpmStoreVersion({ folderName: params.folderName });

  switch (storeVersion.kind) {
    case 'succeeded':
      return {
        kind: 'parsed',
        folderPath: folderPath,
        realPath: realPath,
        storeVersion: storeVersion.value,
      };
    case 'failed':
      return { kind: 'unparsed', folderPath: folderPath, realPath: realPath };
  }
}
