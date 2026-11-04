import type { WindowsImageName } from '../catalog/catalogOwner.js';
import { isSameOrInsidePath } from '../path/isSameOrInsidePath.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { PathRules } from '../path/pathRules.js';

/**
 * True when a process runs a Windows program: its image path lies inside `installFolderPath`, or
 * its file name is one of `imageNames`. Both compare without case, as Windows compares paths.
 * `processImagePaths` holds the path of each running process's image file.
 */
export function isExecutableOwnerRunning(params: {
  pathRules: PathRules;
  imageNames: WindowsImageName[];
  installFolderPath: AbsolutePath | null;
  processImagePaths: string[];
}): boolean {
  return params.processImagePaths.some((imagePath) => {
    // Lower-cased as `parseWindowsImageName` makes every image name, so the two compare as text.
    const fileName = findFileName({ path: imagePath }).toLowerCase();

    return (
      params.imageNames.some((imageName) => imageName === fileName) ||
      (params.installFolderPath !== null &&
        isSameOrInsidePath({
          rules: params.pathRules,
          path: imagePath,
          parentPath: params.installFolderPath,
        }))
    );
  });
}

/** The last name of a Windows path, after its last `\` or `/`. */
function findFileName(params: { path: string }): string {
  return params.path.slice(
    Math.max(params.path.lastIndexOf('\\'), params.path.lastIndexOf('/')) + 1,
  );
}
