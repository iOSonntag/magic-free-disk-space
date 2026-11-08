import type { Environment, WindowsKnownFolderPaths } from '../../environment/buildEnvironment.js';
import { buildEnvironment } from '../../environment/buildEnvironment.js';
import { checkEnvironmentRoots } from '../../environment/checkEnvironmentRoots.js';
import type { EnvironmentLocationAtRoot } from '../../environment/environmentLocation.js';
import type { EnvironmentFailure } from '../../environment/environmentPlatform.js';
import {
  loadEnvironmentRealPath,
  loadExistingRealPaths,
} from '../../environment/loadEnvironmentRealPath.js';
import { isSameOrInsidePath } from '../../path/isSameOrInsidePath.js';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
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

/** `ERROR_INVALID_SID`, what Windows answers for a security identifier that is malformed. */
const ERROR_INVALID_SID = 1337;

/** Windows keeps the user's temporary folder below LocalAppData, one name per level. */
const TEMP_DIR_NAMES = ['Temp'];

/** The folder of the deletion log. */
const WIN32_DELETION_LOG_LOCATION: EnvironmentLocationAtRoot = {
  root: 'localAppData',
  path: 'magic-free-disk-space/Logs',
};

/** The folder of the bridge's preference file. */
const WIN32_PREFERENCES_LOCATION: EnvironmentLocationAtRoot = {
  root: 'localAppData',
  path: 'magic-free-disk-space',
};

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
  const tempRealPath = await loadEnvironmentRealPath({
    pathRules: WIN32_PATH_RULES,
    path: tempDir,
  });

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
        reading: await loadVariableReading({ name: 'USERPROFILE' }),
        expectedPath: home.value.path,
        expectedRealPath: home.value.realPath,
      },
      {
        variableName: 'TMP',
        reading: await loadVariableReading({ name: 'TMP' }),
        expectedPath: tempDir,
        expectedRealPath: tempRealPath.value,
      },
      {
        variableName: 'TEMP',
        reading: await loadVariableReading({ name: 'TEMP' }),
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
  const knownFolderRealPaths = await loadKnownFolderRealPaths({ paths: knownFolderPaths });
  const oneDriveRealPaths = await loadExistingRealPaths({
    pathRules: WIN32_PATH_RULES,
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
      knownFolderRealPaths: knownFolderRealPaths,
      fixedDriveRoots: fixedDriveRoots.value,
      oneDriveRealPaths: oneDriveRealPaths,
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
  /** The real path of each known folder; `null` for one Windows names no path for or that is gone. */
  knownFolderRealPaths: WindowsKnownFolderPaths;
  /** The root of each fixed drive, each refused as a whole. */
  fixedDriveRoots: AbsolutePath[];
  /** The real paths of the OneDrive roots that exist. */
  oneDriveRealPaths: AbsolutePath[];
}): Environment {
  return buildEnvironment({
    nowMs: params.nowMs,
    user: params.user,
    pathRules: WIN32_PATH_RULES,
    homeDir: params.home.path,
    homeRealPath: params.home.realPath,
    tempDir: params.temp.path,
    tempRealPath: params.temp.realPath,
    platformFolders: {
      kind: 'win32',
      appDataDirs: { localDir: params.localAppData.path, roamingDir: params.roamingAppData.path },
      knownFolderPaths: params.knownFolderPaths,
    },
    platformRealFolders: {
      kind: 'win32',
      appDataDirs: {
        localDir: params.localAppData.realPath,
        roamingDir: params.roamingAppData.realPath,
      },
      knownFolderPaths: params.knownFolderRealPaths,
    },
    // Apps of Windows are only ever advised on, so no app folder is a root of a removal.
    applicationDirs: [],
    applicationRealPaths: [],
    protectedRootPaths: params.fixedDriveRoots,
    protectedLocations: WIN32_CATALOG.protectedLocations,
    protectedFolderRealPaths: params.oneDriveRealPaths,
    sensitiveLocations: WIN32_CATALOG.sensitiveLocations,
    sensitiveExceptionLocations: [],
    evictLocations: [],
    deletionLogLocation: WIN32_DELETION_LOG_LOCATION,
    preferencesLocation: WIN32_PREFERENCES_LOCATION,
    // A file Windows creates takes the access list of its folder, which keeps the profile the
    // user's own; the POSIX modes of Node mean nothing there.
    ownerOnlyModes: null,
  });
}

/** The user of this process's token and whether it is elevated, the token closed after. */
function loadTokenFacts(): Result<TokenFacts, EnvironmentFailure> {
  const token = openProcessToken();

  if (token.kind === 'failed') {
    return buildCallFailure({ failure: token.failure });
  }

  try {
    const isElevated = loadTokenElevation({ token: token.value });

    if (isElevated.kind === 'failed') {
      return buildCallFailure({ failure: isElevated.failure });
    }

    const sidText = loadTokenUserSid({ token: token.value });

    if (sidText.kind === 'failed') {
      return buildCallFailure({ failure: sidText.failure });
    }

    const user = buildWindowsUser({
      sidText: sidText.value,
      // The text the conversion gave holds no security identifier.
      failure: { reason: 'callFailed', call: 'ConvertSidToStringSidW', code: ERROR_INVALID_SID },
    });

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
    return buildCallFailure({ failure: sidText.failure });
  }

  return buildWindowsUser({
    sidText: sidText.value,
    failure: { reason: 'unresolvable', path: params.path, code: 'notSecurityIdentifier' },
  });
}

/** The user of the SID text, or `failure` for a text that holds no SID. */
function buildWindowsUser(params: {
  sidText: string;
  failure: EnvironmentFailure;
}): Result<UserIdentity, EnvironmentFailure> {
  const sid = parseWindowsSid({ text: params.sidText });

  if (sid.kind === 'failed') {
    return { kind: 'failed', failure: params.failure };
  }

  return { kind: 'succeeded', value: { kind: 'windows', sid: sid.value } };
}

/** A known folder the run cannot do without, by its path and its real path. */
async function loadRequiredKnownFolder(params: {
  folder: RunKnownFolder;
}): Promise<Result<ResolvedFolder, EnvironmentFailure>> {
  const path = loadKnownFolderDrivePath({ folder: params.folder });

  if (path.kind === 'failed') {
    return path;
  }

  const realPath = await loadEnvironmentRealPath({ pathRules: WIN32_PATH_RULES, path: path.value });

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
  const path = loadKnownFolderDrivePath({ folder: params.folder });

  return path.kind === 'succeeded' ? path.value : null;
}

/** The path Windows names for the known folder, which must be a drive path. */
function loadKnownFolderDrivePath(params: {
  folder: RunKnownFolder;
}): Result<AbsolutePath, EnvironmentFailure> {
  const pathText = loadKnownFolderPath({
    folderId: buildGuidBytes({ text: KNOWN_FOLDER_IDS[params.folder] }),
  });

  if (pathText.kind === 'failed') {
    return buildCallFailure({ failure: pathText.failure });
  }

  const path = parseAbsolutePath({ rules: WIN32_PATH_RULES, text: pathText.value });

  // A folder on a network share, as Folder Redirection may place it, is no drive path.
  if (path.kind === 'failed') {
    return {
      kind: 'failed',
      failure: { reason: 'unresolvable', path: pathText.value, code: 'notAbsolute' },
    };
  }

  return path;
}

/** The real path of each known folder; `null` for one without a path or whose path is gone. */
async function loadKnownFolderRealPaths(params: {
  paths: WindowsKnownFolderPaths;
}): Promise<WindowsKnownFolderPaths> {
  return {
    desktop: await loadOptionalRealPath({ path: params.paths.desktop }),
    documents: await loadOptionalRealPath({ path: params.paths.documents }),
    downloads: await loadOptionalRealPath({ path: params.paths.downloads }),
    videos: await loadOptionalRealPath({ path: params.paths.videos }),
    music: await loadOptionalRealPath({ path: params.paths.music }),
    pictures: await loadOptionalRealPath({ path: params.paths.pictures }),
    localAppDataLow: await loadOptionalRealPath({ path: params.paths.localAppDataLow }),
    skyDrive: await loadOptionalRealPath({ path: params.paths.skyDrive }),
  };
}

async function loadOptionalRealPath(params: {
  path: AbsolutePath | null;
}): Promise<AbsolutePath | null> {
  if (params.path === null) {
    return null;
  }

  const realPath = await loadEnvironmentRealPath({
    pathRules: WIN32_PATH_RULES,
    path: params.path,
  });

  return realPath.kind === 'succeeded' ? realPath.value : null;
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
    return buildCallFailure({ failure: logicalDrives.failure });
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
async function loadVariableReading(params: { name: string }): Promise<VariableReading> {
  const value = process.env[params.name];

  if (value === undefined || value === '') {
    return { kind: 'unset' };
  }

  const path = parseAbsolutePath({ rules: WIN32_PATH_RULES, text: value });

  if (path.kind === 'failed') {
    return { kind: 'unresolvable' };
  }

  const realPath = await loadEnvironmentRealPath({ pathRules: WIN32_PATH_RULES, path: path.value });

  if (realPath.kind === 'failed') {
    return { kind: 'unresolvable' };
  }

  return { kind: 'resolved', realPath: realPath.value };
}

/** A failed call of Windows as the environment's failure. */
function buildCallFailure(params: {
  failure: Win32CallFailure;
}): Result<never, EnvironmentFailure> {
  return {
    kind: 'failed',
    failure: { reason: 'callFailed', call: params.failure.call, code: params.failure.code },
  };
}
