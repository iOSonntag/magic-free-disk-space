import { stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import type { Environment, OwnerOnlyModes } from '../../environment/buildEnvironment.js';
import { buildEnvironment } from '../../environment/buildEnvironment.js';
import { checkEnvironmentRoots } from '../../environment/checkEnvironmentRoots.js';
import type { EnvironmentLocationAtRoot } from '../../environment/environmentLocation.js';
import type { EnvironmentFailure } from '../../environment/environmentPlatform.js';
import {
  loadEnvironmentRealPath,
  loadExistingRealPaths,
} from '../../environment/loadEnvironmentRealPath.js';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import { getErrorCode } from '../../system/getErrorCode.js';
import { SYSTEM_COMMAND_TIMEOUT_MS } from '../../system/limits.js';
import { loadCommandOutput } from '../../system/loadCommandOutput.js';
import type { UserIdentity } from '../../system/userIdentity.js';
import { parsePosixUid } from '../../system/userIdentity.js';
import { ICLOUD_DRIVE_ROOT } from './appleDataRoots.js';
import {
  PROTECTED_HOME_DIR_NAMES,
  SENSITIVE_EXCEPTION_HOME_DIR_NAMES,
  SENSITIVE_HOME_DIR_NAMES,
} from './protectedPaths.js';

/** How macOS spells and compares an absolute path. */
export const DARWIN_PATH_RULES: PathRules = { rootForm: 'posix', separator: '/' };

/** The root of the macOS file system, which is refused as a whole. */
const DARWIN_PROTECTED_ROOT_PATHS: AbsolutePath[] = [parseDarwinAbsolutePath({ text: '/' })];

/** The folder of the deletion log. */
const DARWIN_DELETION_LOG_LOCATION: EnvironmentLocationAtRoot = {
  root: 'home',
  path: 'Library/Logs/magic-free-disk-space',
};

/** The folder of the bridge's preference file. */
const DARWIN_PREFERENCES_LOCATION: EnvironmentLocationAtRoot = {
  root: 'home',
  path: 'Library/Application Support/magic-free-disk-space',
};

/** Folders the tool writes are the user's alone: `rwx------`, and `rw-------` for files. */
const DARWIN_OWNER_ONLY_MODES: OwnerOnlyModes = { directoryMode: 0o700, fileMode: 0o600 };

/** Where macOS apps are installed for every user. */
const DARWIN_SHARED_APPLICATION_DIR: AbsolutePath = parseDarwinAbsolutePath({
  text: '/Applications',
});

/** Where macOS apps are installed for the user alone, below the home folder, one name per level. */
const DARWIN_USER_APPLICATION_DIR_NAMES: string[] = ['Applications'];

/** Homebrew's prefixes, Apple silicon's first, then Intel's. */
export const DARWIN_HOMEBREW_PREFIX_PATHS: AbsolutePath[] = ['/opt/homebrew', '/usr/local'].map(
  (prefixText) => parseDarwinAbsolutePath({ text: prefixText }),
);

/** The name under which macOS keeps the per-user temporary folder, whatever `TMPDIR` says. */
const USER_TEMP_DIR_NAME = 'DARWIN_USER_TEMP_DIR';

/** The name under which macOS keeps the per-user folder of its own caches, the temp's sibling. */
const USER_CACHE_DIR_NAME = 'DARWIN_USER_CACHE_DIR';

export async function loadEnvironment(): Promise<Result<Environment, EnvironmentFailure>> {
  const homeText = homedir();
  const homeDir = parseEnvironmentPath({ text: homeText, failurePath: homeText });

  if (homeDir.kind === 'failed') {
    return homeDir;
  }

  const applicationDirs = [
    DARWIN_SHARED_APPLICATION_DIR,
    joinAbsolutePath({
      rules: DARWIN_PATH_RULES,
      parentPath: homeDir.value,
      names: DARWIN_USER_APPLICATION_DIR_NAMES,
    }),
  ];

  const homeRealPath = await loadEnvironmentRealPath({
    pathRules: DARWIN_PATH_RULES,
    path: homeDir.value,
  });

  if (homeRealPath.kind === 'failed') {
    return homeRealPath;
  }

  const homeOwnerId = await loadOwnerId({ path: homeRealPath.value });

  if (homeOwnerId.kind === 'failed') {
    return homeOwnerId;
  }

  // Read from the system, not from `TMPDIR`: every child of this folder may count as temporary.
  const tempDir = await loadUserConfDir({ name: USER_TEMP_DIR_NAME });

  if (tempDir.kind === 'failed') {
    return tempDir;
  }

  const tempRealPath = await loadEnvironmentRealPath({
    pathRules: DARWIN_PATH_RULES,
    path: tempDir.value,
  });

  if (tempRealPath.kind === 'failed') {
    return tempRealPath;
  }

  const userCacheDir = await loadUserConfDir({ name: USER_CACHE_DIR_NAME });

  if (userCacheDir.kind === 'failed') {
    return userCacheDir;
  }

  const userCacheRealPath = await loadEnvironmentRealPath({
    pathRules: DARWIN_PATH_RULES,
    path: userCacheDir.value,
  });

  if (userCacheRealPath.kind === 'failed') {
    return userCacheRealPath;
  }

  const user = getEffectiveUser();
  const rootsFailure = checkEnvironmentRoots({
    pathRules: DARWIN_PATH_RULES,
    user: user,
    homeRealPath: homeRealPath.value,
    homeOwner: buildPosixUser({ uid: homeOwnerId.value }),
    tempRealPath: tempRealPath.value,
    tempPlacement: 'apartFromHome',
  });

  if (rootsFailure !== null) {
    return { kind: 'failed', failure: rootsFailure };
  }

  const applicationRealPaths = await loadExistingRealPaths({
    pathRules: DARWIN_PATH_RULES,
    paths: applicationDirs,
  });

  return {
    kind: 'succeeded',
    value: buildDarwinEnvironment({
      nowMs: Date.now(),
      user: user,
      homeDir: homeDir.value,
      homeRealPath: homeRealPath.value,
      tempDir: tempDir.value,
      tempRealPath: tempRealPath.value,
      userCacheDir: userCacheDir.value,
      userCacheRealPath: userCacheRealPath.value,
      applicationDirs: applicationDirs,
      applicationRealPaths: applicationRealPaths,
    }),
  };
}

/** The environment of a run on macOS: the values read for the run, with the facts of macOS. */
export function buildDarwinEnvironment(params: {
  nowMs: number;
  user: UserIdentity;
  homeDir: AbsolutePath;
  homeRealPath: AbsolutePath;
  tempDir: AbsolutePath;
  tempRealPath: AbsolutePath;
  userCacheDir: AbsolutePath;
  userCacheRealPath: AbsolutePath;
  applicationDirs: AbsolutePath[];
  applicationRealPaths: AbsolutePath[];
}): Environment {
  return buildEnvironment({
    nowMs: params.nowMs,
    user: params.user,
    pathRules: DARWIN_PATH_RULES,
    homeDir: params.homeDir,
    homeRealPath: params.homeRealPath,
    tempDir: params.tempDir,
    tempRealPath: params.tempRealPath,
    platformFolders: { kind: 'darwin', userCacheDir: params.userCacheDir },
    platformRealFolders: { kind: 'darwin', userCacheDir: params.userCacheRealPath },
    applicationDirs: params.applicationDirs,
    applicationRealPaths: params.applicationRealPaths,
    protectedRootPaths: DARWIN_PROTECTED_ROOT_PATHS,
    // macOS mounts every volume below its one root, so no drive has a root of its own.
    fixedDriveRoots: [],
    protectedLocations: toHomeLocations({ nameLists: PROTECTED_HOME_DIR_NAMES }),
    protectedFolderRealPaths: [],
    sensitiveLocations: toHomeLocations({ nameLists: SENSITIVE_HOME_DIR_NAMES }),
    sensitiveExceptionLocations: toHomeLocations({
      nameLists: SENSITIVE_EXCEPTION_HOME_DIR_NAMES,
    }),
    evictLocations: [ICLOUD_DRIVE_ROOT],
    deletionLogLocation: DARWIN_DELETION_LOG_LOCATION,
    preferencesLocation: DARWIN_PREFERENCES_LOCATION,
    ownerOnlyModes: DARWIN_OWNER_ONLY_MODES,
  });
}

/** Each list of names below the home folder, one name per level, as a location in the home folder. */
function toHomeLocations(params: { nameLists: string[][] }): EnvironmentLocationAtRoot[] {
  return params.nameLists.map(
    (names): EnvironmentLocationAtRoot => ({ root: 'home', path: names.join('/') }),
  );
}

/** A path of macOS this file spells out; throws for one that is not absolute, which is a bug. */
function parseDarwinAbsolutePath(params: { text: string }): AbsolutePath {
  const path = parseAbsolutePath({ rules: DARWIN_PATH_RULES, text: params.text });

  if (path.kind === 'failed') {
    throw new Error(`The macOS path ${params.text} is not absolute.`);
  }

  return path.value;
}

/** Parses `text` as a macOS absolute path; unresolvable at `failurePath` when it is not one. */
function parseEnvironmentPath(params: {
  text: string;
  failurePath: string;
}): Result<AbsolutePath, EnvironmentFailure> {
  const path = parseAbsolutePath({ rules: DARWIN_PATH_RULES, text: params.text });

  if (path.kind === 'failed') {
    return {
      kind: 'failed',
      failure: { reason: 'unresolvable', path: params.failurePath, code: 'notAbsolute' },
    };
  }

  return { kind: 'succeeded', value: path.value };
}

/** The effective user of the process; throws for an id that is no non-negative integer. */
function getEffectiveUser(): UserIdentity {
  // Without an id, as on no Mac, the check refuses as for root.
  return buildPosixUser({ uid: process.geteuid?.() ?? 0 });
}

/** Throws for an id that is no non-negative integer, which no Mac reports. */
function buildPosixUser(params: { uid: number }): UserIdentity {
  const uid = parsePosixUid({ value: params.uid });

  if (uid.kind === 'failed') {
    throw new Error(`The user id is ${uid.failure}.`);
  }

  return { kind: 'posix', uid: uid.value };
}

/** The per-user folder that `getconf` names by `name`, such as the temporary folder. */
async function loadUserConfDir(params: {
  name: string;
}): Promise<Result<AbsolutePath, EnvironmentFailure>> {
  const output = await loadCommandOutput({
    command: 'getconf',
    args: [params.name],
    timeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
  });

  if (output.kind === 'failed') {
    return {
      kind: 'failed',
      failure: { reason: 'unresolvable', path: params.name, code: output.failure.reason },
    };
  }

  // Printed with a trailing slash, which would end up in every path shown below it.
  const dirText = output.value.trim().replace(/\/+$/, '');

  return parseEnvironmentPath({ text: dirText, failurePath: params.name });
}

async function loadOwnerId(params: { path: string }): Promise<Result<number, EnvironmentFailure>> {
  try {
    return { kind: 'succeeded', value: (await stat(params.path)).uid };
  } catch (error) {
    return {
      kind: 'failed',
      failure: { reason: 'unresolvable', path: params.path, code: getErrorCode(error) },
    };
  }
}
