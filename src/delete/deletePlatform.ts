import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { Result } from '../result.js';
import type { RecycleBinLoad } from '../scan/scanPlatform.js';

/** The whole tree is gone. */
export type TreeRemovalRemoved = { kind: 'removed' };

/**
 * The tree is gone but for entries that stayed where they were: files another program held open
 * or Windows refused to delete, such as a program that runs, and entries whose content only a
 * cloud store keeps, with the folders that hold them.
 */
export type TreeRemovalPartlyRemoved = { kind: 'partlyRemoved'; stayedEntryCount: number };

export type TreeRemoval = TreeRemovalRemoved | TreeRemovalPartlyRemoved;

/** The trash is a folder of the catalog, whose items `removeTree` removes as any other path. */
export type DeletePlatformTrashCatalogFolder = { kind: 'catalogFolder' };

/** Each Recycle Bin is emptied by the system as one unit, after a fresh count of what it holds. */
export type DeletePlatformTrashRecycleBins = {
  kind: 'recycleBins';
  loadRecycleBin: RecycleBinLoad;
  /**
   * Empties the bin of the drive at `driveRootPath`, which must be a drive root: the system would
   * take an empty root for every drive. A failure is the text of its error code. Never throws.
   */
  emptyRecycleBin: (params: { driveRootPath: AbsolutePath }) => Result<null, string>;
};

export type DeletePlatformTrash = DeletePlatformTrashCatalogFolder | DeletePlatformTrashRecycleBins;

/** What the deletion takes from the operating system. */
export type DeletePlatform = {
  /**
   * Removes the entry at `path` with everything below it; a symbolic link or a junction inside is
   * removed itself, never its target. Fails with the system's error code. Never throws.
   */
  removeTree: (params: { path: string }) => Promise<Result<TreeRemoval, string>>;
  trash: DeletePlatformTrash;
};
