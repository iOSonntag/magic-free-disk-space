import { realpath } from 'node:fs/promises';
import type {
  AppDataDirs,
  Environment,
  WindowsKnownFolderPaths,
} from '../../environment/buildEnvironment.js';
import { buildEnvironment } from '../../environment/buildEnvironment.js';
import { checkEnvironmentRoots } from '../../environment/checkEnvironmentRoots.js';
import type { EnvironmentFailure } from '../../environment/environmentPlatform.js';
import { isSameOrInsidePath } from '../../path/isSameOrInsidePath.js';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import { getErrorCode } from '../../system/getErrorCode.js';
import type { UserIdentity } from '../../system/userIdentity.js';
import { parseWindowsSid } from '../../system/userIdentity.js';
import { WIN32_CATALOG } from './catalog/win32Catalog.js';
import type { VariableReading } from './checkVariablePlacement.js';
import { checkVariablePlacement } from './checkVariablePlacement.js';
import type { RunKnownFolder } from './knownFolderIds.js';
import { buildGuidBytes, KNOWN_FOLDER_IDS } from './knownFolderIds.js';
import { listDriveRootTexts } from './listDriveRoots.js';
import type { Win32CallFailure } from './win32Api.js';
import {
  closeHandle,
  loadCurrentUserSubkeyStrings,
  loadDriveType,
  loadFileOwnerSid,
  loadKnownFolderPath,
  loadLogicalDrives,
  loadTokenElevation,
  loadTokenUserSid,
  openProcessToken,
} from './win32Api.js';

/** How Windows spells and compares an absolute path: from a drive letter, names without case. */
export const WIN32_PATH_RULES: PathRules = { rootForm: 'win32', separator: '\\' };

/** The `DRIVE_*` type of a disk of this PC, as against a removable, network, or optical drive. */
const DRIVE_FIXED = 3;

/** Windows keeps the user's temporary folder below LocalAppData, one name per level. */
const TEMP_DIR_NAMES = ['Temp'];

/** The folder of the deletion log below LocalAppData, one name per level. */
const WIN32_DELETION_LOG_DIR_NAMES = ['magic-free-disk-space', 'Logs'];

/** The folder of the bridge's preference file below LocalAppData, one name per level. */
const WIN32_PREFERENCES_DIR_NAMES = ['magic-free-disk-space'];

/** The variables OneDrive sets to the root of each account it syncs. */
const ONE_DRIVE_VARIABLE_NAMES = ['OneDrive', 'OneDriveConsumer', 'OneDriveCommercial'];

/** OneDrive keeps each account it syncs below this key of the user's registry. */
const ONE_DRIVE_ACCOUNTS_KEY_PATH = 'Software\\Microsoft\\OneDrive\\Accounts';

/** The value of an account's key that holds the root of the account. */
const ONE_DRIVE_USER_FOLDER_VALUE_NAME = 'UserFolder';

/** A folder of the run by the path Windows names for it and by its real path. */
type ResolvedFolder = { path: AbsolutePath; realPath: AbsolutePath };

/** The user of the token of this process, and whether the token is elevated. */
type TokenFacts = { user: UserIdentity; isElevated: boolean };

export async function loadEnvironment(): Promise<Result<Environment, EnvironmentFailure>> {
  const token = loadTokenFacts();

  if (token.kind === 'failed') {
    return token;
  }

  if (token.value.isElevated) {
    return { kind: 'failed', failure: { reason: 'runElevated' } };
  }

  const home = await loadRequiredKnownFolder({ folder: 'profile' });

  if (home.kind === 'failed') {
    return home;
  }

  const localAppData = await loadRequiredKnownFolder({ folder: 'localAppData' });

  if (localAppData.kind === 'failed') {
    return localAppData;
  }

  const roamingAppData = await loadRequiredKnownFolder({ folder: 'roamingAppData' });

  if (roamingAppData.kind === 'failed') {
    return roamingAppData;
  }

  const tempDir = joinAbsolutePath({
    rules: WIN32_PATH_RULES,
    parentPath: localAppData.value.path,
    names: TEMP_DIR_NAMES,
  });
  const tempRealPath = await loadRealPath({ path: tempDir });

  if (tempRealPath.kind === 'failed') {
    return tempRealPath;
  }

  const homeOwner = loadOwner({ path: home.value.realPath });

  if (homeOwner.kind === 'failed') {
    return homeOwner;
  }

  const rootsFailure = checkEnvironmentRoots({
    pathRules: WIN32_PATH_RULES,
    user: token.value.user,
    homeRealPath: home.value.realPath,
    homeOwner: homeOwner.value,
    tempRealPath: tempRealPath.value,
    tempPlacement: 'belowHome',
  });

  if (rootsFailure !== null) {
    return { kind: 'failed', failure: rootsFailure };
  }

  const variablesFailure = checkVariablePlacement({
    pathRules: WIN32_PATH_RULES,
    checks: [
      {
        variableName: 'USERPROFILE',
        reading: await readVariable({ name: 'USERPROFILE' }),
        expectedPath: home.value.path,
        expectedRealPath: home.value.realPath,
      },
      {
        variableName: 'TMP',
        reading: await readVariable({ name: 'TMP' }),
        expectedPath: tempDir,
        expectedRealPath: tempRealPath.value,
      },
      {
        variableName: 'TEMP',
        reading: await readVariable({ name: 'TEMP' }),
        expectedPath: tempDir,
        expectedRealPath: tempRealPath.value,
      },
    ],
  });

  if (variablesFailure !== null) {
    return { kind: 'failed', failure: variablesFailure };
  }

  const fixedDriveRoots = loadFixedDriveRoots();

  if (fixedDriveRoots.kind === 'failed') {
    return fixedDriveRoots;
  }

  // Each fixed drive's root is refused as a whole; a home on no listed drive would leave its own
  // drive root unguarded.
  if (
    !fixedDriveRoots.value.some((rootPath) =>
      isSameOrInsidePath({
        rules: WIN32_PATH_RULES,
        path: home.value.realPath,
        parentPath: rootPath,
      }),
    )
  ) {
    return {
      kind: 'failed',
      failure: { reason: 'unresolvable', path: home.value.realPath, code: 'notOnFixedDrive' },
    };
  }

  const knownFolderPaths = loadKnownFolderPaths();
  const protectedKnownFolderRealPaths = await loadExistingRealPaths({
    paths: WIN32_CATALOG.protectedKnownFolders.flatMap((folder) => {
      const path = knownFolderPaths[folder];

      return path === null ? [] : [path];
    }),
  });
  const oneDriveRealPaths = await loadExistingRealPaths({
    paths: listOneDriveRootPaths({ skyDrivePath: knownFolderPaths.skyDrive }),
  });

  return {
    kind: 'succeeded',
    value: buildWin32Environment({
      nowMs: Date.now(),
      user: token.value.user,
      home: home.value,
      temp: { path: tempDir, realPath: tempRealPath.value },
      localAppData: localAppData.value,
      roamingAppData: roamingAppData.value,
      knownFolderPaths: knownFolderPaths,
      fixedDriveRoots: fixedDriveRoots.value,
      protectedFolderRealPaths: [...protectedKnownFolderRealPaths, ...oneDriveRealPaths],
    }),
  };
}

/** The environment of a run on Windows: the values read for the run, with the facts of Windows. */
export function buildWin32Environment(params: {
  nowMs: number;
  user: UserIdentity;
  home: ResolvedFolder;
  temp: ResolvedFolder;
  localAppData: ResolvedFolder;
  roamingAppData: ResolvedFolder;
  knownFolderPaths: WindowsKnownFolderPaths;
  /** The root of each fixed drive, each refused as a whole. */
  fixedDriveRoots: AbsolutePath[];
  /** The real paths of the guarded known folders and of the OneDrive roots that exist. */
  protectedFolderRealPaths: AbsolutePath[];
}): Environment {
  const appDataDirs: AppDataDirs = {
    localDir: params.localAppData.path,
    roamingDir: params.roamingAppData.path,
  };
  const appDataRealDirs: AppDataDirs = {
    localDir: params.localAppData.realPath,
    roamingDir: params.roamingAppData.realPath,
  };

  return buildEnvironment({
    nowMs: params.nowMs,
    user: params.user,
    pathRules: WIN32_PATH_RULES,
    homeDir: params.home.path,
    homeRealPath: params.home.realPath,
    tempDir: params.temp.path,
    tempRealPath: params.temp.realPath,
    // Windows keeps the caches of the system and its apps in LocalAppData, an allowed root itself.
    userCache: null,
    appData: { dirs: appDataDirs, realDirs: appDataRealDirs },
    knownFolderPaths: params.knownFolderPaths,
    // Apps of Windows are only ever advised on, so no app folder is a root of a removal.
    applicationDirs: [],
    applicationRealPaths: [],
    protectedRootPaths: params.fixedDriveRoots,
    protectedDirNames: WIN32_CATALOG.protectedDirNames,
    protectedFolderRealPaths: [
      params.home.realPath,
      params.localAppData.realPath,
      params.roamingAppData.realPath,
      ...params.protectedFolderRealPaths,
    ],
    sensitiveDirNames: WIN32_CATALOG.sensitiveDirNames,
    sensitiveExceptionDirNames: [],
    evictDirNames: [],
    deletionLogDirNames: { base: 'localAppData', names: WIN32_DELETION_LOG_DIR_NAMES },
    preferencesDirNames: { base: 'localAppData', names: WIN32_PREFERENCES_DIR_NAMES },
    // A file Windows creates takes the access list of its folder, which keeps the profile the
    // user's own; the POSIX modes of Node mean nothing there.
    ownerOnlyModes: null,
  });
}

/** The user of this process's token and whether it is elevated, the token closed after. */
function loadTokenFacts(): Result<TokenFacts, EnvironmentFailure> {
  const token = openProcessToken();

  if (token.kind === 'failed') {
    return failCall({ failure: token.failure });
  }

  try {
    const isElevated = loadTokenElevation({ token: token.value });

    if (isElevated.kind === 'failed') {
      return failCall({ failure: isElevated.failure });
    }

    const sidText = loadTokenUserSid({ token: token.value });

    if (sidText.kind === 'failed') {
      return failCall({ failure: sidText.failure });
    }

    const user = buildWindowsUser({ sidText: sidText.value, failurePath: 'TokenUser' });

    if (user.kind === 'failed') {
      return user;
    }

    return { kind: 'succeeded', value: { user: user.value, isElevated: isElevated.value } };
  } finally {
    closeHandle({ handle: token.value });
  }
}

/** The owner of the folder at `path` as a user; unresolvable when it cannot be read. */
function loadOwner(params: { path: AbsolutePath }): Result<UserIdentity, EnvironmentFailure> {
  const sidText = loadFileOwnerSid({ path: params.path });

  if (sidText.kind === 'failed') {
    return failCall({ failure: sidText.failure });
  }

  return buildWindowsUser({ sidText: sidText.value, failurePath: params.path });
}

function buildWindowsUser(params: {
  sidText: string;
  failurePath: string;
}): Result<UserIdentity, EnvironmentFailure> {
  const sid = parseWindowsSid({ text: params.sidText });

  if (sid.kind === 'failed') {
    return {
      kind: 'failed',
      failure: { reason: 'unresolvable', path: params.failurePath, code: 'notSecurityIdentifier' },
    };
  }

  return { kind: 'succeeded', value: { kind: 'windows', sid: sid.value } };
}

/** A known folder the run cannot do without, by its path and its real path. */
async function loadRequiredKnownFolder(params: {
  folder: RunKnownFolder;
}): Promise<Result<ResolvedFolder, EnvironmentFailure>> {
  const pathText = loadKnownFolderPath({
    folderId: buildGuidBytes({ text: KNOWN_FOLDER_IDS[params.folder] }),
  });

  if (pathText.kind === 'failed') {
    return failCall({ failure: pathText.failure });
  }

  const path = parseAbsolutePath({ rules: WIN32_PATH_RULES, text: pathText.value });

  // A folder on a network share, as Folder Redirection may place it, is no drive path.
  if (path.kind === 'failed') {
    return {
      kind: 'failed',
      failure: { reason: 'unresolvable', path: pathText.value, code: 'notAbsolute' },
    };
  }

  const realPath = await loadRealPath({ path: path.value });

  if (realPath.kind === 'failed') {
    return realPath;
  }

  return { kind: 'succeeded', value: { path: path.value, realPath: realPath.value } };
}

/** The path Windows names for each known folder; `null` for one it names none or no drive path for. */
function loadKnownFolderPaths(): WindowsKnownFolderPaths {
  return {
    desktop: loadOptionalKnownFolderPath({ folder: 'desktop' }),
    documents: loadOptionalKnownFolderPath({ folder: 'documents' }),
    downloads: loadOptionalKnownFolderPath({ folder: 'downloads' }),
    videos: loadOptionalKnownFolderPath({ folder: 'videos' }),
    music: loadOptionalKnownFolderPath({ folder: 'music' }),
    pictures: loadOptionalKnownFolderPath({ folder: 'pictures' }),
    localAppDataLow: loadOptionalKnownFolderPath({ folder: 'localAppDataLow' }),
    skyDrive: loadOptionalKnownFolderPath({ folder: 'skyDrive' }),
  };
}

function loadOptionalKnownFolderPath(params: { folder: RunKnownFolder }): AbsolutePath | null {
  const pathText = loadKnownFolderPath({
    folderId: buildGuidBytes({ text: KNOWN_FOLDER_IDS[params.folder] }),
  });

  if (pathText.kind === 'failed') {
    return null;
  }

  const path = parseAbsolutePath({ rules: WIN32_PATH_RULES, text: pathText.value });

  return path.kind === 'succeeded' ? path.value : null;
}

/**
 * The roots OneDrive may sync to: its known folder, the variables it sets, and the accounts in the
 * user's registry. Each source only adds; a value that is no drive path is left out.
 */
function listOneDriveRootPaths(params: { skyDrivePath: AbsolutePath | null }): AbsolutePath[] {
  const accountFolders = loadCurrentUserSubkeyStrings({
    keyPath: ONE_DRIVE_ACCOUNTS_KEY_PATH,
    valueName: ONE_DRIVE_USER_FOLDER_VALUE_NAME,
  });
  const rootTexts = [
    ...ONE_DRIVE_VARIABLE_NAMES.flatMap((name) => {
      const value = process.env[name];

      return value === undefined || value === '' ? [] : [value];
    }),
    ...(accountFolders.kind === 'succeeded' ? accountFolders.value : []),
  ];

  return [
    ...(params.skyDrivePath === null ? [] : [params.skyDrivePath]),
    ...rootTexts.flatMap((text) => {
      const path = parseAbsolutePath({ rules: WIN32_PATH_RULES, text: text });

      return path.kind === 'succeeded' ? [path.value] : [];
    }),
  ];
}

/** The root of each fixed drive, from the drives in use and the type of each. */
function loadFixedDriveRoots(): Result<AbsolutePath[], EnvironmentFailure> {
  const logicalDrives = loadLogicalDrives();

  if (logicalDrives.kind === 'failed') {
    return failCall({ failure: logicalDrives.failure });
  }

  const rootPaths = listDriveRootTexts({ logicalDrives: logicalDrives.value }).flatMap(
    (rootText) => {
      const rootPath = parseAbsolutePath({ rules: WIN32_PATH_RULES, text: rootText });

      return rootPath.kind === 'succeeded' ? [rootPath.value] : [];
    },
  );

  return {
    kind: 'succeeded',
    value: rootPaths.filter((rootPath) => loadDriveType({ rootPath: rootPath }) === DRIVE_FIXED),
  };
}

/** What the variable holds: unset, the real path of the folder it names, or a path that fails. */
async function readVariable(params: { name: string }): Promise<VariableReading> {
  const value = process.env[params.name];

  if (value === undefined || value === '') {
    return { kind: 'unset' };
  }

  const path = parseAbsolutePath({ rules: WIN32_PATH_RULES, text: value });

  if (path.kind === 'failed') {
    return { kind: 'unresolvable' };
  }

  const realPath = await loadRealPath({ path: path.value });

  if (realPath.kind === 'failed') {
    return { kind: 'unresolvable' };
  }

  return { kind: 'resolved', realPath: realPath.value };
}

/** The real path of `path`; unresolvable when it cannot be read or is not a drive path. */
async function loadRealPath(params: {
  path: AbsolutePath;
}): Promise<Result<AbsolutePath, EnvironmentFailure>> {
  const realPathText = await loadRealPathText({ path: params.path });

  if (realPathText.kind === 'failed') {
    return realPathText;
  }

  const realPath = parseAbsolutePath({ rules: WIN32_PATH_RULES, text: realPathText.value });

  if (realPath.kind === 'failed') {
    return {
      kind: 'failed',
      failure: { reason: 'unresolvable', path: params.path, code: 'notAbsolute' },
    };
  }

  return { kind: 'succeeded', value: realPath.value };
}

async function loadRealPathText(params: {
  path: AbsolutePath;
}): Promise<Result<string, EnvironmentFailure>> {
  try {
    return { kind: 'succeeded', value: await realpath(params.path) };
  } catch (error) {
    return {
      kind: 'failed',
      failure: { reason: 'unresolvable', path: params.path, code: getErrorCode(error) },
    };
  }
}

async function loadExistingRealPaths(params: { paths: AbsolutePath[] }): Promise<AbsolutePath[]> {
  const realPaths: AbsolutePath[] = [];

  for (const path of params.paths) {
    const result = await loadRealPath({ path: path });

    if (result.kind === 'succeeded') {
      realPaths.push(result.value);
    }
  }

  return realPaths;
}

/** A failed call of Windows as the environment's failure, its code in hex. */
function failCall(params: { failure: Win32CallFailure }): Result<never, EnvironmentFailure> {
  return {
    kind: 'failed',
    failure: {
      reason: 'unresolvable',
      path: params.failure.call,
      code: `0x${params.failure.code.toString(16).padStart(8, '0')}`,
    },
  };
}
