import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { compareDottedVersions } from '../compareDottedVersions.js';
import type { ExploreFoundPaths, IdeVersionFolderKind } from '../exploreUnit.js';
import type { IdeVersionFolder } from './loadIdeVersionState.js';

/** A folder of an old version to offer, with the newest version of its product. */
export type IdeVersionOffer = {
  product: string;
  version: string;
  newestVersion: string;
  folderKind: IdeVersionFolderKind;
  /** The version's folder of its kind, or its settings folder for `plugins`. */
  folderPath: AbsolutePath;
  foundPaths: ExploreFoundPaths;
};

/**
 * Offers each folder of a version older than the newest of its product, the newest counted across
 * every root. A version's settings split into its plugins and the rest, so the two never overlap.
 */
export function decideIdeVersionOffers(params: { folders: IdeVersionFolder[] }): IdeVersionOffer[] {
  const newestVersions = new Map<string, string>();

  for (const folder of params.folders) {
    const newest = newestVersions.get(folder.product);

    if (newest === undefined || compareDottedVersions(folder.version, newest) > 0) {
      newestVersions.set(folder.product, folder.version);
    }
  }

  return params.folders.flatMap((folder) => {
    const newestVersion = newestVersions.get(folder.product);

    if (newestVersion === undefined || compareDottedVersions(folder.version, newestVersion) >= 0) {
      return [];
    }

    return buildFolderOffers({ folder: folder, newestVersion: newestVersion });
  });
}

/** The offers of one old version's folder: one for caches or logs, up to two for its settings. */
function buildFolderOffers(params: {
  folder: IdeVersionFolder;
  newestVersion: string;
}): IdeVersionOffer[] {
  const base = {
    product: params.folder.product,
    version: params.folder.version,
    newestVersion: params.newestVersion,
  };

  switch (params.folder.kind) {
    case 'caches':
    case 'logs':
      return [
        {
          ...base,
          folderKind: params.folder.kind,
          folderPath: params.folder.path,
          foundPaths: [params.folder.path],
        },
      ];
    case 'settings': {
      const offers: IdeVersionOffer[] = [];

      if (params.folder.pluginsPath !== null) {
        offers.push({
          ...base,
          folderKind: 'plugins',
          folderPath: params.folder.path,
          foundPaths: [params.folder.pluginsPath],
        });
      }

      const [firstPath, ...otherPaths] = params.folder.otherPaths;

      if (firstPath !== undefined) {
        offers.push({
          ...base,
          folderKind: 'settings',
          folderPath: params.folder.path,
          foundPaths: [firstPath, ...otherPaths],
        });
      }

      return offers;
    }
  }
}
