import { isOverlappingPath } from '../path/isOverlappingPath.js';
import type { PathRules } from '../path/pathRules.js';
import type { UserIdentity } from '../system/userIdentity.js';
import type { EnvironmentFailure } from './environmentPlatform.js';

/**
 * Returns why the resolved folders are unsafe to delete in, or `null`. The tool deletes as the
 * user who runs it, inside that user's own home, and treats the whole temporary folder as
 * expendable, so it refuses root, a home of another user, and a temporary folder that holds the
 * home or lies in it.
 */
export function checkEnvironmentRoots(params: {
  pathRules: PathRules;
  user: UserIdentity;
  homeRealPath: string;
  homeOwnerId: number;
  tempRealPath: string;
}): EnvironmentFailure | null {
  const userFailure = checkDeletingUser({
    user: params.user,
    homeRealPath: params.homeRealPath,
    homeOwnerId: params.homeOwnerId,
  });

  if (userFailure !== null) {
    return userFailure;
  }

  // Compared without case: macOS disks usually ignore it, and the looser match only refuses more.
  if (
    isOverlappingPath({
      rules: params.pathRules,
      path: params.homeRealPath.toLowerCase(),
      otherPath: params.tempRealPath.toLowerCase(),
    })
  ) {
    return { reason: 'tempOverlapsHome', path: params.tempRealPath };
  }

  return null;
}

/** Refuses root, and a user who does not own the home. */
function checkDeletingUser(params: {
  user: UserIdentity;
  homeRealPath: string;
  homeOwnerId: number;
}): EnvironmentFailure | null {
  switch (params.user.kind) {
    case 'posix':
      if (params.user.uid === 0) {
        return { reason: 'runAsRoot' };
      }

      if (params.homeOwnerId !== params.user.uid) {
        return { reason: 'homeNotOwned', path: params.homeRealPath };
      }

      return null;
  }
}
