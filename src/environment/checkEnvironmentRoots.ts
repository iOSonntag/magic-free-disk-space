import { parseDriveRoot } from '../path/driveRoot.js';
import { isPossiblySameOrInsidePath } from '../path/isSameOrInsidePath.js';
import type { PathRules } from '../path/pathRules.js';
import type { UserIdentity } from '../system/userIdentity.js';
import type { EnvironmentFailure } from './environmentPlatform.js';

/**
 * Where the platform keeps the temporary folder: apart from the home on macOS, below it on Windows
 * (`AppData\Local\Temp`).
 */
export type TempPlacement = 'apartFromHome' | 'belowHome';

/**
 * Returns why the resolved folders are unsafe to delete in, or `null`: the root user, another
 * user's home, a temporary folder that is or holds the home, one that lies in it where the
 * platform keeps it apart from the home, and one that is a drive root or is or holds a protected
 * folder.
 */
export function checkEnvironmentRoots(params: {
  pathRules: PathRules;
  user: UserIdentity;
  homeRealPath: string;
  homeOwner: UserIdentity;
  tempRealPath: string;
  tempPlacement: TempPlacement;
  /**
   * The real paths of the protected folders known before the check, such as the drive roots, as
   * the environment lists them: the entry the temporary folder adds for itself is left out once.
   */
  protectedRealPaths: string[];
}): EnvironmentFailure | null {
  // The tool deletes as its user, inside that user's own home, and treats the whole temporary
  // folder as expendable.
  const userFailure = checkDeletingUser({
    user: params.user,
    homeRealPath: params.homeRealPath,
    homeOwner: params.homeOwner,
  });

  if (userFailure !== null) {
    return userFailure;
  }

  if (
    isPossiblySameOrInsidePath({
      rules: params.pathRules,
      path: params.homeRealPath,
      parentPath: params.tempRealPath,
    }) ||
    isTempRefusedInHome({
      pathRules: params.pathRules,
      homeRealPath: params.homeRealPath,
      tempRealPath: params.tempRealPath,
      tempPlacement: params.tempPlacement,
    })
  ) {
    return { reason: 'tempOverlapsHome', path: params.tempRealPath };
  }

  const tempIsDriveRoot =
    parseDriveRoot({ rules: params.pathRules, text: params.tempRealPath }).kind === 'succeeded';
  const tempHoldsProtectedFolder = listProtectedRealPathsBesideTemp({
    protectedRealPaths: params.protectedRealPaths,
    tempRealPath: params.tempRealPath,
  }).some((protectedRealPath) =>
    isPossiblySameOrInsidePath({
      rules: params.pathRules,
      path: protectedRealPath,
      parentPath: params.tempRealPath,
    }),
  );

  if (tempIsDriveRoot || tempHoldsProtectedFolder) {
    return { reason: 'tempHoldsProtectedFolder', path: params.tempRealPath };
  }

  return null;
}

/**
 * The protected real paths without the one entry the temporary folder adds for itself. A protected
 * folder that is the temporary folder too has an entry of its own, which stays, so it is refused.
 */
function listProtectedRealPathsBesideTemp(params: {
  protectedRealPaths: string[];
  tempRealPath: string;
}): string[] {
  const tempEntryIndex = params.protectedRealPaths.indexOf(params.tempRealPath);

  if (tempEntryIndex === -1) {
    return params.protectedRealPaths;
  }

  return params.protectedRealPaths.toSpliced(tempEntryIndex, 1);
}

/** Refuses root, and a user who does not own the home. */
function checkDeletingUser(params: {
  user: UserIdentity;
  homeRealPath: string;
  homeOwner: UserIdentity;
}): EnvironmentFailure | null {
  switch (params.user.kind) {
    case 'posix':
      if (params.user.uid === 0) {
        return { reason: 'runAsRoot' };
      }

      if (params.homeOwner.kind !== 'posix' || params.homeOwner.uid !== params.user.uid) {
        return { reason: 'homeNotOwned', path: params.homeRealPath };
      }

      return null;
    case 'windows':
      if (params.homeOwner.kind !== 'windows' || params.homeOwner.sid !== params.user.sid) {
        return { reason: 'profileNotOwned', path: params.homeRealPath };
      }

      return null;
  }
}

function isTempRefusedInHome(params: {
  pathRules: PathRules;
  homeRealPath: string;
  tempRealPath: string;
  tempPlacement: TempPlacement;
}): boolean {
  switch (params.tempPlacement) {
    case 'apartFromHome':
      return isPossiblySameOrInsidePath({
        rules: params.pathRules,
        path: params.tempRealPath,
        parentPath: params.homeRealPath,
      });
    case 'belowHome':
      return false;
  }
}
