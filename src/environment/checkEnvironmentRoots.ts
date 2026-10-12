import { isSameOrInsidePath } from '../path/isSameOrInsidePath.js';
import type { EnvironmentFailure } from './loadEnvironment.js';

/**
 * Returns why the resolved folders are unsafe to delete in, or `null`. The tool deletes as the
 * user who runs it, inside that user's own home, and treats the whole temporary folder as
 * expendable, so it refuses root, a home of another user, and a temporary folder that holds the
 * home or lies in it.
 */
export function checkEnvironmentRoots(params: {
  userId: number;
  homeRealPath: string;
  homeOwnerId: number;
  tempRealPath: string;
}): EnvironmentFailure | null {
  if (params.userId === 0) {
    return { reason: 'runAsRoot' };
  }

  if (params.homeOwnerId !== params.userId) {
    return { reason: 'homeNotOwned', path: params.homeRealPath };
  }

  // Compared without case: macOS disks usually ignore it, and the looser match only refuses more.
  const lowerCaseHomePath = params.homeRealPath.toLowerCase();
  const lowerCaseTempPath = params.tempRealPath.toLowerCase();

  if (
    isSameOrInsidePath({ path: lowerCaseHomePath, parentPath: lowerCaseTempPath }) ||
    isSameOrInsidePath({ path: lowerCaseTempPath, parentPath: lowerCaseHomePath })
  ) {
    return { reason: 'tempOverlapsHome', path: params.tempRealPath };
  }

  return null;
}
