import { basename } from 'node:path';
import type { EnvironmentFolders } from '../../environment/buildEnvironment.js';
import {
  resolveEnvironmentLocation,
  resolveEnvironmentLocations,
} from '../../environment/environmentLocation.js';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import { isJsonObject, parseJsonValue } from '../../system/parseJsonValue.js';
import type { PnpmInstallPlaces } from '../explorePlatform.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import {
  loadExploreFileText,
  loadExploreFolderNames,
  loadExploreRealPath,
} from '../loadExploreRead.js';
import { parsePnpmVersionMajor } from './parsePnpmVersionMajor.js';
import { hasPnpmToolName, PNPM_TOOL_NAME } from './pnpmToolName.js';

/** An installed pnpm whose version names its major. */
export type PnpmInstallParsed = {
  kind: 'parsed';
  path: AbsolutePath;
  versionText: string;
  major: number;
};

/** An installed pnpm whose version is not read, or that has none. */
export type PnpmInstallUnparsed = { kind: 'unparsed'; path: AbsolutePath };

export type PnpmInstall = PnpmInstallParsed | PnpmInstallUnparsed;

export type PnpmInstallState = { installs: PnpmInstall[] };

const PNPM_TOOLS_PATH_NAMES = [
  ['.tools', PNPM_TOOL_NAME],
  ['.tools', '@pnpm+exe'],
  ['.tools', 'pnpm-exe'],
];

const PNPM_GLOBAL_FOLDER_NAME = 'global';

/** An entry of pnpm's `global` folder that holds install folders, such as pnpm 11's `v11`. */
const PNPM_GLOBAL_INSTALLS_FOLDER_PATTERN = /^v\d+$/;

const SCRIPT_SHEBANG = '#!';

const HOMEBREW_CELLAR_FOLDER_NAME = 'Cellar';

const HOMEBREW_VERSIONED_PNPM_PREFIX = `${PNPM_TOOL_NAME}@`;

const NODE_MODULES_FOLDER_NAME = 'node_modules';

/** The packages of pnpm, each by the names of its folder in a `node_modules` folder. */
const PNPM_PACKAGE_PATH_NAMES = [[PNPM_TOOL_NAME], ['@pnpm', 'exe']];

const PACKAGE_JSON_FILE_NAME = 'package.json';

/**
 * The pnpm installed in each of `places`: homes' `.tools`, global folders and launchers, pnpm
 * versions of corepack, tool managers and mise, npm globals below each prefix and node version,
 * and Homebrew prefixes. A missing place holds none; an unreadable one fails the whole state.
 */
export async function loadPnpmInstallState(params: {
  environment: EnvironmentFolders;
  places: PnpmInstallPlaces;
  homebrewPrefixPaths: AbsolutePath[];
  privacyDenialCode: string | null;
}): Promise<Result<PnpmInstallState, ExploreFileUnreadable>> {
  const pnpmHomePaths = resolveEnvironmentLocations({
    folders: params.environment,
    locations: params.places.homes,
  });
  const corepackRootPaths = resolveEnvironmentLocations({
    folders: params.environment,
    locations: params.places.corepackRoots,
  });
  const pnpmVersionsRootPaths = resolveEnvironmentLocations({
    folders: params.environment,
    locations: params.places.pnpmVersionsRoots,
  });
  const npmPrefixPaths = resolveEnvironmentLocations({
    folders: params.environment,
    locations: params.places.npmPrefixes,
  });
  const launcherPaths = resolveEnvironmentLocations({
    folders: params.environment,
    locations: params.places.launchers,
  });
  const nodeVersionsRoots = params.places.nodeVersionsRoots.map((root) => ({
    path: resolveEnvironmentLocation({ folders: params.environment, location: root.location }),
    prefixNames: root.prefixNames,
  }));
  const misePnpmRoots = await loadMisePnpmVersionsRoots({
    pathRules: params.environment.pathRules,
    miseInstallsPaths: resolveEnvironmentLocations({
      folders: params.environment,
      locations: params.places.miseInstallsRoots,
    }),
    privacyDenialCode: params.privacyDenialCode,
  });

  if (misePnpmRoots.kind === 'failed') {
    return misePnpmRoots;
  }

  const cellarRoots = await loadHomebrewCellarPnpmRoots({
    pathRules: params.environment.pathRules,
    homebrewPrefixPaths: params.homebrewPrefixPaths,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (cellarRoots.kind === 'failed') {
    return cellarRoots;
  }

  const versionsRoots = listPnpmVersionsRoots({
    pathRules: params.environment.pathRules,
    pnpmVersionsRootPaths: pnpmVersionsRootPaths,
    pnpmHomePaths: pnpmHomePaths,
    misePnpmRoots: misePnpmRoots.value,
    corepackRootPaths: corepackRootPaths,
  });
  const folderInstalls = await loadVersionFolderInstalls({
    pathRules: params.environment.pathRules,
    versionsRoots: [...versionsRoots, ...cellarRoots.value],
    privacyDenialCode: params.privacyDenialCode,
  });

  if (folderInstalls.kind === 'failed') {
    return folderInstalls;
  }

  const globalFolders = await loadPnpmGlobalFolders({
    pathRules: params.environment.pathRules,
    pnpmHomePaths: pnpmHomePaths,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (globalFolders.kind === 'failed') {
    return globalFolders;
  }

  const nodePrefixPaths = await loadNodePrefixPaths({
    pathRules: params.environment.pathRules,
    nodeVersionsRoots: nodeVersionsRoots,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (nodePrefixPaths.kind === 'failed') {
    return nodePrefixPaths;
  }

  const packageFolders = buildPnpmPackageFolders({
    pathRules: params.environment.pathRules,
    npmPrefixPaths: [...npmPrefixPaths, ...params.homebrewPrefixPaths, ...nodePrefixPaths.value],
    npmGlobalFolderNames: params.places.npmGlobalFolderNames,
    globalFolderPaths: globalFolders.value,
  });
  const packageInstalls = await loadPackageJsonInstalls({
    pathRules: params.environment.pathRules,
    packageFolders: packageFolders,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (packageInstalls.kind === 'failed') {
    return packageInstalls;
  }

  const standaloneInstalls = await loadStandaloneInstalls({
    launcherPaths: launcherPaths,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (standaloneInstalls.kind === 'failed') {
    return standaloneInstalls;
  }

  return {
    kind: 'succeeded',
    value: {
      installs: [...folderInstalls.value, ...packageInstalls.value, ...standaloneInstalls.value],
    },
  };
}

/**
 * The folders that hold one folder per pnpm version, the platform's own and each home's `.tools`.
 */
function listPnpmVersionsRoots(params: {
  pathRules: PathRules;
  pnpmVersionsRootPaths: AbsolutePath[];
  pnpmHomePaths: AbsolutePath[];
  misePnpmRoots: AbsolutePath[];
  corepackRootPaths: AbsolutePath[];
}): AbsolutePath[] {
  const pnpmToolsRoots = params.pnpmHomePaths.flatMap((pnpmHomePath) =>
    PNPM_TOOLS_PATH_NAMES.map((names) =>
      joinAbsolutePath({ rules: params.pathRules, parentPath: pnpmHomePath, names: names }),
    ),
  );

  return [
    ...params.pnpmVersionsRootPaths,
    ...params.misePnpmRoots,
    ...params.corepackRootPaths,
    ...pnpmToolsRoots,
  ];
}

/**
 * The folders and links of mise's installs whose name names pnpm, such as `pnpm` and the folder
 * `npm-pnpm` of the backend key `npm:pnpm`; a missing installs folder holds none.
 */
async function loadMisePnpmVersionsRoots(params: {
  pathRules: PathRules;
  miseInstallsPaths: AbsolutePath[];
  privacyDenialCode: string | null;
}): Promise<Result<AbsolutePath[], ExploreFileUnreadable>> {
  const entryPaths = await loadEntryPaths({
    pathRules: params.pathRules,
    folderPaths: params.miseInstallsPaths,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (entryPaths.kind === 'failed') {
    return entryPaths;
  }

  const pnpmRoots = [...entryPaths.value.folderPaths, ...entryPaths.value.linkPaths].filter(
    (entryPath) => hasPnpmToolName({ text: basename(entryPath) }),
  );

  return { kind: 'succeeded', value: pnpmRoots };
}

/** The Cellar folders of the formula `pnpm` and of each versioned formula `pnpm@<major>`. */
async function loadHomebrewCellarPnpmRoots(params: {
  pathRules: PathRules;
  homebrewPrefixPaths: AbsolutePath[];
  privacyDenialCode: string | null;
}): Promise<Result<AbsolutePath[], ExploreFileUnreadable>> {
  const roots: AbsolutePath[] = [];

  for (const prefixPath of params.homebrewPrefixPaths) {
    const cellarPath = joinAbsolutePath({
      rules: params.pathRules,
      parentPath: prefixPath,
      names: [HOMEBREW_CELLAR_FOLDER_NAME],
    });
    const names = await loadExploreFolderNames({
      path: cellarPath,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (names.kind === 'failed') {
      return names;
    }

    const formulaNames =
      names.value === null ? [] : [...names.value.folderNames, ...names.value.linkNames];
    const pnpmFormulaNames = formulaNames.filter(
      (formulaName) =>
        formulaName === PNPM_TOOL_NAME || formulaName.startsWith(HOMEBREW_VERSIONED_PNPM_PREFIX),
    );
    roots.push(
      ...pnpmFormulaNames.map((formulaName) =>
        joinAbsolutePath({ rules: params.pathRules, parentPath: cellarPath, names: [formulaName] }),
      ),
    );
  }

  return { kind: 'succeeded', value: roots };
}

async function loadVersionFolderInstalls(params: {
  pathRules: PathRules;
  versionsRoots: AbsolutePath[];
  privacyDenialCode: string | null;
}): Promise<Result<PnpmInstall[], ExploreFileUnreadable>> {
  const installs: PnpmInstall[] = [];

  for (const versionsRoot of params.versionsRoots) {
    const rootInstalls = await loadVersionsRootInstalls({
      pathRules: params.pathRules,
      versionsRoot: versionsRoot,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (rootInstalls.kind === 'failed') {
      return rootInstalls;
    }

    installs.push(...rootInstalls.value);
  }

  return { kind: 'succeeded', value: installs };
}

/**
 * Each folder of a versions folder by its name, and each live link by its name when that names a
 * version, else by the name of the folder its real path ends in.
 */
async function loadVersionsRootInstalls(params: {
  pathRules: PathRules;
  versionsRoot: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<PnpmInstall[], ExploreFileUnreadable>> {
  const names = await loadExploreFolderNames({
    path: params.versionsRoot,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (names.kind === 'failed') {
    return names;
  }

  if (names.value === null) {
    return { kind: 'succeeded', value: [] };
  }

  const installs = names.value.folderNames.map((folderName) =>
    buildPnpmInstall({
      path: joinAbsolutePath({
        rules: params.pathRules,
        parentPath: params.versionsRoot,
        names: [folderName],
      }),
      versionText: folderName,
    }),
  );

  for (const linkName of names.value.linkNames) {
    const linkPath = joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.versionsRoot,
      names: [linkName],
    });
    const realPath = await loadExploreRealPath({
      pathRules: params.pathRules,
      path: linkPath,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (realPath.kind === 'failed') {
      return realPath;
    }

    if (realPath.value === null) {
      continue;
    }

    const isVersionName = parsePnpmVersionMajor({ text: linkName }) !== null;
    const versionText = isVersionName ? linkName : basename(realPath.value);
    installs.push(buildPnpmInstall({ path: linkPath, versionText: versionText }));
  }

  return { kind: 'succeeded', value: installs };
}

/**
 * The real path of the npm prefix of each node version: each folder and live link in a root,
 * `prefixNames` below it, each path once; a missing root holds none.
 */
async function loadNodePrefixPaths(params: {
  pathRules: PathRules;
  nodeVersionsRoots: { path: AbsolutePath; prefixNames: string[] }[];
  privacyDenialCode: string | null;
}): Promise<Result<AbsolutePath[], ExploreFileUnreadable>> {
  const folderPrefixPaths: AbsolutePath[] = [];
  const linkPrefixPaths: AbsolutePath[] = [];

  for (const root of params.nodeVersionsRoots) {
    const entryPaths = await loadEntryPaths({
      pathRules: params.pathRules,
      folderPaths: [root.path],
      privacyDenialCode: params.privacyDenialCode,
    });

    if (entryPaths.kind === 'failed') {
      return entryPaths;
    }

    folderPrefixPaths.push(
      ...buildPrefixPaths({
        pathRules: params.pathRules,
        versionPaths: entryPaths.value.folderPaths,
        prefixNames: root.prefixNames,
      }),
    );
    linkPrefixPaths.push(
      ...buildPrefixPaths({
        pathRules: params.pathRules,
        versionPaths: entryPaths.value.linkPaths,
        prefixNames: root.prefixNames,
      }),
    );
  }

  return loadRealPaths({
    pathRules: params.pathRules,
    paths: [...folderPrefixPaths, ...linkPrefixPaths],
    privacyDenialCode: params.privacyDenialCode,
  });
}

function buildPrefixPaths(params: {
  pathRules: PathRules;
  versionPaths: AbsolutePath[];
  prefixNames: string[];
}): AbsolutePath[] {
  return params.versionPaths.map((versionPath) =>
    joinAbsolutePath({
      rules: params.pathRules,
      parentPath: versionPath,
      names: params.prefixNames,
    }),
  );
}

/**
 * The `node_modules/pnpm` and `node_modules/@pnpm/exe` folders of pnpm's global folders, and the
 * `pnpm` and `@pnpm/exe` folders of npm's globals below each of `npmPrefixPaths`.
 */
function buildPnpmPackageFolders(params: {
  pathRules: PathRules;
  npmPrefixPaths: AbsolutePath[];
  /** The folder of npm's global packages below a prefix, by its names. */
  npmGlobalFolderNames: string[];
  globalFolderPaths: AbsolutePath[];
}): AbsolutePath[] {
  const globalPackageFolders = params.globalFolderPaths.flatMap((globalFolder) =>
    PNPM_PACKAGE_PATH_NAMES.map((names) =>
      joinAbsolutePath({
        rules: params.pathRules,
        parentPath: globalFolder,
        names: [NODE_MODULES_FOLDER_NAME, ...names],
      }),
    ),
  );
  const npmGlobalPackageFolders = params.npmPrefixPaths.flatMap((prefixPath) =>
    PNPM_PACKAGE_PATH_NAMES.map((names) =>
      joinAbsolutePath({
        rules: params.pathRules,
        parentPath: prefixPath,
        names: [...params.npmGlobalFolderNames, ...names],
      }),
    ),
  );

  return [...globalPackageFolders, ...npmGlobalPackageFolders];
}

/**
 * pnpm's global folders in each pnpm home: each entry of `global` by its real path, except that
 * the entries of an entry named `v<digits>` are the global folders in its place.
 */
async function loadPnpmGlobalFolders(params: {
  pathRules: PathRules;
  pnpmHomePaths: AbsolutePath[];
  privacyDenialCode: string | null;
}): Promise<Result<AbsolutePath[], ExploreFileUnreadable>> {
  const entryPaths = await loadEntryPaths({
    pathRules: params.pathRules,
    folderPaths: params.pnpmHomePaths.map((pnpmHomePath) =>
      joinAbsolutePath({
        rules: params.pathRules,
        parentPath: pnpmHomePath,
        names: [PNPM_GLOBAL_FOLDER_NAME],
      }),
    ),
    privacyDenialCode: params.privacyDenialCode,
  });

  if (entryPaths.kind === 'failed') {
    return entryPaths;
  }

  const globalEntryPaths = [...entryPaths.value.folderPaths, ...entryPaths.value.linkPaths];
  const installsFolderPaths = globalEntryPaths.filter((entryPath) =>
    isGlobalInstallsFolder({ entryPath: entryPath }),
  );
  const flatFolderPaths = globalEntryPaths.filter(
    (entryPath) => !isGlobalInstallsFolder({ entryPath: entryPath }),
  );
  const flatFolders = await loadRealPaths({
    pathRules: params.pathRules,
    paths: flatFolderPaths,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (flatFolders.kind === 'failed') {
    return flatFolders;
  }

  const installFolders = await loadEntryRealPaths({
    pathRules: params.pathRules,
    folderPaths: installsFolderPaths,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (installFolders.kind === 'failed') {
    return installFolders;
  }

  const folderPaths = new Set([...flatFolders.value, ...installFolders.value]);

  return { kind: 'succeeded', value: [...folderPaths] };
}

function isGlobalInstallsFolder(params: { entryPath: AbsolutePath }): boolean {
  return PNPM_GLOBAL_INSTALLS_FOLDER_PATTERN.test(basename(params.entryPath));
}

async function loadStandaloneInstalls(params: {
  launcherPaths: AbsolutePath[];
  privacyDenialCode: string | null;
}): Promise<Result<PnpmInstall[], ExploreFileUnreadable>> {
  const installs: PnpmInstall[] = [];

  for (const launcherPath of params.launcherPaths) {
    const install = await loadStandaloneInstall({
      launcherPath: launcherPath,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (install.kind === 'failed') {
      return install;
    }

    if (install.value !== null) {
      installs.push(install.value);
    }
  }

  return { kind: 'succeeded', value: installs };
}

/**
 * The executable at a launcher's place, such as the one `install.sh` and `pnpm setup` copy into a
 * pnpm home, an install of no known version; `null` when nothing is there or it is a script, which
 * runs a pnpm of a place read on its own.
 */
async function loadStandaloneInstall(params: {
  launcherPath: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<PnpmInstall | null, ExploreFileUnreadable>> {
  const file = await loadExploreFileText({
    path: params.launcherPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (file.kind === 'failed') {
    return file;
  }

  switch (file.value.kind) {
    case 'absent':
      return { kind: 'succeeded', value: null };
    case 'unfit':
      return {
        kind: 'succeeded',
        value: buildPnpmInstall({ path: params.launcherPath, versionText: null }),
      };
    case 'text': {
      if (file.value.text.startsWith(SCRIPT_SHEBANG)) {
        return { kind: 'succeeded', value: null };
      }

      return {
        kind: 'succeeded',
        value: buildPnpmInstall({ path: params.launcherPath, versionText: null }),
      };
    }
  }
}

/** The real paths of the folders and the live links in each of `folderPaths`, each path once. */
async function loadEntryRealPaths(params: {
  pathRules: PathRules;
  folderPaths: AbsolutePath[];
  privacyDenialCode: string | null;
}): Promise<Result<AbsolutePath[], ExploreFileUnreadable>> {
  const entryPaths = await loadEntryPaths({
    pathRules: params.pathRules,
    folderPaths: params.folderPaths,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (entryPaths.kind === 'failed') {
    return entryPaths;
  }

  return loadRealPaths({
    pathRules: params.pathRules,
    paths: [...entryPaths.value.folderPaths, ...entryPaths.value.linkPaths],
    privacyDenialCode: params.privacyDenialCode,
  });
}

type EntryPaths = { folderPaths: AbsolutePath[]; linkPaths: AbsolutePath[] };

/** The folders and the links in each of `folderPaths`; a missing folder holds none. */
async function loadEntryPaths(params: {
  pathRules: PathRules;
  folderPaths: AbsolutePath[];
  privacyDenialCode: string | null;
}): Promise<Result<EntryPaths, ExploreFileUnreadable>> {
  const folderPaths: AbsolutePath[] = [];
  const linkPaths: AbsolutePath[] = [];

  for (const folderPath of params.folderPaths) {
    const names = await loadExploreFolderNames({
      path: folderPath,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (names.kind === 'failed') {
      return names;
    }

    if (names.value === null) {
      continue;
    }

    folderPaths.push(
      ...names.value.folderNames.map((folderName) =>
        joinAbsolutePath({ rules: params.pathRules, parentPath: folderPath, names: [folderName] }),
      ),
    );
    linkPaths.push(
      ...names.value.linkNames.map((linkName) =>
        joinAbsolutePath({ rules: params.pathRules, parentPath: folderPath, names: [linkName] }),
      ),
    );
  }

  return { kind: 'succeeded', value: { folderPaths: folderPaths, linkPaths: linkPaths } };
}

/** The real path of each of `paths`, each real path once; a dangling link adds nothing. */
async function loadRealPaths(params: {
  pathRules: PathRules;
  paths: AbsolutePath[];
  privacyDenialCode: string | null;
}): Promise<Result<AbsolutePath[], ExploreFileUnreadable>> {
  const realPaths = new Set<AbsolutePath>();

  for (const path of params.paths) {
    const realPath = await loadExploreRealPath({
      pathRules: params.pathRules,
      path: path,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (realPath.kind === 'failed') {
      return realPath;
    }

    if (realPath.value !== null) {
      realPaths.add(realPath.value);
    }
  }

  return { kind: 'succeeded', value: [...realPaths] };
}

async function loadPackageJsonInstalls(params: {
  pathRules: PathRules;
  packageFolders: AbsolutePath[];
  privacyDenialCode: string | null;
}): Promise<Result<PnpmInstall[], ExploreFileUnreadable>> {
  const installs: PnpmInstall[] = [];

  for (const packageFolder of params.packageFolders) {
    const install = await loadPackageJsonInstall({
      pathRules: params.pathRules,
      packageFolder: packageFolder,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (install.kind === 'failed') {
      return install;
    }

    if (install.value !== null) {
      installs.push(install.value);
    }
  }

  return { kind: 'succeeded', value: installs };
}

/** The pnpm of a package folder by the `version` of its `package.json`; `null` when it has none. */
async function loadPackageJsonInstall(params: {
  pathRules: PathRules;
  packageFolder: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<PnpmInstall | null, ExploreFileUnreadable>> {
  const packageJson = await loadExploreFileText({
    path: joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.packageFolder,
      names: [PACKAGE_JSON_FILE_NAME],
    }),
    privacyDenialCode: params.privacyDenialCode,
  });

  if (packageJson.kind === 'failed') {
    return packageJson;
  }

  switch (packageJson.value.kind) {
    case 'absent':
      return { kind: 'succeeded', value: null };
    case 'unfit':
      return {
        kind: 'succeeded',
        value: buildPnpmInstall({ path: params.packageFolder, versionText: null }),
      };
    case 'text': {
      const versionText = parsePackageVersion({ text: packageJson.value.text });

      return {
        kind: 'succeeded',
        value: buildPnpmInstall({ path: params.packageFolder, versionText: versionText }),
      };
    }
  }
}

/** The string `version` of a `package.json`; `null` for no JSON object or no string version. */
function parsePackageVersion(params: { text: string }): string | null {
  const json = parseJsonValue({ text: params.text });

  if (json.kind === 'failed' || !isJsonObject(json.value)) {
    return null;
  }

  const version = json.value.version;

  return typeof version === 'string' ? version : null;
}

/** A parsed install when `versionText` names a major; an unparsed one otherwise, or without one. */
function buildPnpmInstall(params: { path: AbsolutePath; versionText: string | null }): PnpmInstall {
  if (params.versionText === null) {
    return { kind: 'unparsed', path: params.path };
  }

  const major = parsePnpmVersionMajor({ text: params.versionText });

  if (major === null) {
    return { kind: 'unparsed', path: params.path };
  }

  return { kind: 'parsed', path: params.path, versionText: params.versionText, major: major };
}
