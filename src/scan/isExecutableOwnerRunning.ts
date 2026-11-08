import type { WindowsImageName } from '../catalog/catalogOwner.js';
import { isSameEntryName, isSameOrInsidePath } from '../path/isSameOrInsidePath.js';
import { listPathNames } from '../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { PathRules } from '../path/pathRules.js';

/**
 * True when a process runs a Windows program: its image path lies inside `installFolderPath`, or
 * its file name is one of `imageNames`. Both compare as `pathRules` compare names.
 * `processImagePaths` holds the path of each running process's image file, or its file name alone.
 */
export function isExecutableOwnerRunning(params: {
  pathRules: PathRules;
  imageNames: [WindowsImageName, ...WindowsImageName[]];
  installFolderPath: AbsolutePath | null;
  processImagePaths: string[];
}): boolean {
  return params.processImagePaths.some((imagePath) => {
    const fileName =
      listPathNames({ rules: params.pathRules, path: imagePath }).at(-1) ?? imagePath;

    return (
      params.imageNames.some((imageName) =>
        isSameEntryName({ rules: params.pathRules, name: fileName, otherName: imageName }),
      ) ||
      (params.installFolderPath !== null &&
        isSameOrInsidePath({
          rules: params.pathRules,
          path: imagePath,
          parentPath: params.installFolderPath,
        }))
    );
  });
}
