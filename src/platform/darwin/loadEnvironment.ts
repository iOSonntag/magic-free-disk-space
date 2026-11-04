import { realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute } from 'node:path';
import type { CatalogFolder } from '../../catalog/catalogPlatform.js';
import { resolveCatalogFolderPath } from '../../catalog/catalogPlatform.js';
import type { Environment } from '../../environment/buildEnvironment.js';
import { buildEnvironment } from '../../environment/buildEnvironment.js';
import { checkEnvironmentRoots } from '../../environment/checkEnvironmentRoots.js';
import type { EnvironmentFailure } from '../../environment/environmentPlatform.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import { getErrorCode } from '../../system/getErrorCode.js';
import { SYSTEM_COMMAND_TIMEOUT_MS } from '../../system/limits.js';
import { loadCommandOutput } from '../../system/loadCommandOutput.js';
import type { UserIdentity } from '../../system/userIdentity.js';
import { parsePosixUid } from '../../system/userIdentity.js';
import { PROTECTED_HOME_RELATIVE_PATHS, SENSITIVE_HOME_RELATIVE_PATHS } from './protectedPaths.js';

/** How macOS spells and compares an absolute path. */
export const DARWIN_PATH_RULES: PathRules = {
  rootForm: 'posix',
  separator: '/',
  caseFolding: 'exact',
};

/** The root of the macOS file system, which is refused as a whole. */
export const DARWIN_PROTECTED_ROOT_PATHS: AbsolutePath[] = [parseDarwinAbsolutePath({ text: '/' })];

/** The folder of the deletion log below the home folder, one name per level. */
export const DARWIN_DELETION_LOG_HOME_DIR_NAMES: string[] = [
  'Library',
  'Logs',
  'magic-free-disk-space',
];

/** The folder of the bridge's preference file below the home folder, one name per level. */
export const DARWIN_PREFERENCES_HOME_DIR_NAMES: string[] = [
  'Library',
  'Application Support',
  'magic-free-disk-space',
];

/** Where macOS apps are installed: for every user, and for the user alone. */
export const DARWIN_APPLICATION_DIRS: CatalogFolder[] = [
  { root: 'absolute', path: '/Applications' },
  { root: 'home', path: 'Applications' },
];

/** Homebrew's prefixes, Apple silicon's first, then Intel's. */
export const DARWIN_HOMEBREW_PREFIX_PATHS: AbsolutePath[] = ['/opt/homebrew', '/usr/local'].map(
  (prefixText) => parseDarwinAbsolutePath({ text: prefixText }),
);

/** The name under which macOS keeps the per-user temporary folder, whatever `TMPDIR` says. */
const USER_TEMP_DIR_NAME = 'DARWIN_USER_TEMP_DIR';

export async function loadEnvironment(): Promise<Result<Environment, EnvironmentFailure>> {
  const homeText = homedir();
  const homeDir = parseAbsolutePath({ rules: DARWIN_PATH_RULES, text: homeText });

  if (homeDir.kind === 'failed') {
    return {
      kind: 'failed',
      failure: { reason: 'unresolvable', path: homeText, code: 'notAbsolute' },
    };
  }

  const applicationDirs = DARWIN_APPLICATION_DIRS.map((folder) =>
    resolveCatalogFolderPath({ folder: folder, homeDir: homeDir.value }),
  );

  const homeRealPath = await loadRealPath({ path: homeDir.value });

  if (homeRealPath.kind === 'failed') {
    return homeRealPath;
  }

  const homeOwnerId = await loadOwnerId({ path: homeRealPath.value });

  if (homeOwnerId.kind === 'failed') {
    return homeOwnerId;
  }

  // Read from the system, not from `TMPDIR`: every child of this folder may count as temporary.
  const tempDir = await loadUserTempDir();

  if (tempDir.kind === 'failed') {
    return tempDir;
  }

  const tempRealPath = await loadRealPath({ path: tempDir.value });

  if (tempRealPath.kind === 'failed') {
    return tempRealPath;
  }

  const user = getEffectiveUser();
  const rootsFailure = checkEnvironmentRoots({
    pathRules: DARWIN_PATH_RULES,
    user: user,
    homeRealPath: homeRealPath.value,
    homeOwnerId: homeOwnerId.value,
    tempRealPath: tempRealPath.value,
  });

  if (rootsFailure !== null) {
    return { kind: 'failed', failure: rootsFailure };
  }

  const applicationRealPaths = await loadExistingRealPaths({ paths: applicationDirs });

  return {
    kind: 'succeeded',
    value: buildEnvironment({
      nowMs: Date.now(),
      user: user,
      pathRules: DARWIN_PATH_RULES,
      homeDir: homeDir.value,
      homeRealPath: homeRealPath.value,
      tempDir: tempDir.value,
      tempRealPath: tempRealPath.value,
      applicationRealPaths: applicationRealPaths,
      protectedRootPaths: DARWIN_PROTECTED_ROOT_PATHS,
      protectedHomeRelativePaths: PROTECTED_HOME_RELATIVE_PATHS,
      sensitiveHomeRelativePaths: SENSITIVE_HOME_RELATIVE_PATHS,
      deletionLogHomeDirNames: DARWIN_DELETION_LOG_HOME_DIR_NAMES,
      preferencesHomeDirNames: DARWIN_PREFERENCES_HOME_DIR_NAMES,
    }),
  };
}

/** A path of macOS this file spells out; throws for one that is not absolute, which is a bug. */
function parseDarwinAbsolutePath(params: { text: string }): AbsolutePath {
  const path = parseAbsolutePath({ rules: DARWIN_PATH_RULES, text: params.text });

  if (path.kind === 'failed') {
    throw new Error(`The macOS path ${params.text} is not absolute.`);
  }

  return path.value;
}

/** The effective user of the process; throws for an id that is no non-negative integer. */
function getEffectiveUser(): UserIdentity {
  // Without an id, as on no Mac, the check refuses as for root.
  const uid = parsePosixUid({ value: process.geteuid?.() ?? 0 });

  if (uid.kind === 'failed') {
    throw new Error(`The effective user id is ${uid.failure}.`);
  }

  return { kind: 'posix', uid: uid.value };
}

async function loadUserTempDir(): Promise<Result<string, EnvironmentFailure>> {
  const output = await loadCommandOutput({
    command: 'getconf',
    args: [USER_TEMP_DIR_NAME],
    timeoutMs: SYSTEM_COMMAND_TIMEOUT_MS,
  });

  if (output.kind === 'failed') {
    return {
      kind: 'failed',
      failure: { reason: 'unresolvable', path: USER_TEMP_DIR_NAME, code: output.failure.reason },
    };
  }

  // Printed with a trailing slash, which would end up in every temporary path shown.
  const tempDir = output.value.trim().replace(/\/+$/, '');

  if (!isAbsolute(tempDir)) {
    return {
      kind: 'failed',
      failure: { reason: 'unresolvable', path: USER_TEMP_DIR_NAME, code: 'notAbsolute' },
    };
  }

  return { kind: 'succeeded', value: tempDir };
}

async function loadRealPath(params: { path: string }): Promise<Result<string, EnvironmentFailure>> {
  try {
    return { kind: 'succeeded', value: await realpath(params.path) };
  } catch (error) {
    return {
      kind: 'failed',
      failure: { reason: 'unresolvable', path: params.path, code: getErrorCode(error) },
    };
  }
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

async function loadExistingRealPaths(params: { paths: string[] }): Promise<string[]> {
  const realPaths: string[] = [];

  for (const path of params.paths) {
    const result = await loadRealPath({ path: path });

    if (result.kind === 'succeeded') {
      realPaths.push(result.value);
    }
  }

  return realPaths;
}
