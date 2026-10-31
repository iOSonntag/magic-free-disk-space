import { basename } from 'node:path';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import { isJsonObject, parseJsonValue } from '../../system/parseJsonValue.js';
import { ASDF_INSTALLS_PATH_NAMES } from '../asdfVersions/asdfInstallsRoot.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import {
  loadExploreFileText,
  loadExploreFolderNames,
  loadExploreRealPath,
} from '../loadExploreRead.js';
import { MISE_INSTALLS_PATH_NAMES } from '../miseVersions/miseInstallsRoot.js';
import { NVM_NODE_VERSIONS_PATH_NAMES } from '../nvmVersions/nvmVersionsRoot.js';
import { parsePnpmVersionMajor } from './parsePnpmVersionMajor.js';
import { PNPM_HOMES_PATH_NAMES } from './pnpmHomes.js';
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

const COREPACK_PNPM_PATH_NAMES = [
  ['.cache', 'node', 'corepack', 'v1', 'pnpm'],
  ['.cache', 'node', 'corepack', 'pnpm'],
];

const PNPM_TOOLS_PATH_NAMES = [
  ['.tools', PNPM_TOOL_NAME],
  ['.tools', '@pnpm+exe'],
  ['.tools', 'pnpm-exe'],
];

const PNPM_GLOBAL_FOLDER_NAME = 'global';

/** An entry of pnpm's `global` folder that holds install folders, such as pnpm 11's `v11`. */
const PNPM_GLOBAL_INSTALLS_FOLDER_PATTERN = /^v\d+$/;

const SCRIPT_SHEBANG = '#!';

const ASDF_NODE_TOOL_NAME = 'nodejs';

const MISE_NODE_TOOL_NAME = 'node';

const HOMEBREW_CELLAR_FOLDER_NAME = 'Cellar';

const HOMEBREW_VERSIONED_PNPM_PREFIX = `${PNPM_TOOL_NAME}@`;

const NODE_MODULES_FOLDER_NAME = 'node_modules';

const PNPM_PACKAGE_PATH_NAMES = [
  [NODE_MODULES_FOLDER_NAME, PNPM_TOOL_NAME],
  [NODE_MODULES_FOLDER_NAME, '@pnpm', 'exe'],
];

const NPM_GLOBAL_FOLDER_NAME = 'lib';

const PACKAGE_JSON_FILE_NAME = 'package.json';

/**
 * The pnpm installed in every place corepack, asdf, mise (each installs folder naming pnpm),
 * Homebrew, the npm globals of a node, and pnpm in each of its homes keep it (`.tools`, the global
 * folders, the launcher `pnpm`); a missing place holds none.
 */
export async function loadPnpmInstallState(params: {
  homeDir: AbsolutePath;
  homebrewPrefixPaths: AbsolutePath[];
}): Promise<Result<PnpmInstallState, ExploreFileUnreadable>> {
  const pnpmHomePaths = PNPM_HOMES_PATH_NAMES.map((names) =>
    joinAbsolutePath({ parentPath: params.homeDir, names: names }),
  );
  const misePnpmRoots = await loadMisePnpmVersionsRoots({ homeDir: params.homeDir });

  if (misePnpmRoots.kind === 'failed') {
    return misePnpmRoots;
  }

  const cellarRoots = await loadHomebrewCellarPnpmRoots({
    homebrewPrefixPaths: params.homebrewPrefixPaths,
  });

  if (cellarRoots.kind === 'failed') {
    return cellarRoots;
  }

  const homeRoots = listHomePnpmVersionsRoots({
    homeDir: params.homeDir,
    pnpmHomePaths: pnpmHomePaths,
    misePnpmRoots: misePnpmRoots.value,
  });
  const folderInstalls = await loadVersionFolderInstalls({
    versionsRoots: [...homeRoots, ...cellarRoots.value],
  });

  if (folderInstalls.kind === 'failed') {
    return folderInstalls;
  }

  const globalFolders = await loadPnpmGlobalFolders({ pnpmHomePaths: pnpmHomePaths });

  if (globalFolders.kind === 'failed') {
    return globalFolders;
  }

  const packageFolders = await loadPnpmPackageFolders({
    homeDir: params.homeDir,
    homebrewPrefixPaths: params.homebrewPrefixPaths,
    globalFolderPaths: globalFolders.value,
  });

  if (packageFolders.kind === 'failed') {
    return packageFolders;
  }

  const packageInstalls = await loadPackageJsonInstalls({ packageFolders: packageFolders.value });

  if (packageInstalls.kind === 'failed') {
    return packageInstalls;
  }

  const standaloneInstalls = await loadStandaloneInstalls({ pnpmHomePaths: pnpmHomePaths });

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

function listHomePnpmVersionsRoots(params: {
  homeDir: AbsolutePath;
  pnpmHomePaths: AbsolutePath[];
  misePnpmRoots: AbsolutePath[];
}): AbsolutePath[] {
  const asdfRoot = joinAbsolutePath({
    parentPath: params.homeDir,
    names: [...ASDF_INSTALLS_PATH_NAMES, PNPM_TOOL_NAME],
  });
  const corepackRoots = COREPACK_PNPM_PATH_NAMES.map((names) =>
    joinAbsolutePath({ parentPath: params.homeDir, names: names }),
  );
  const pnpmToolsRoots = params.pnpmHomePaths.flatMap((pnpmHomePath) =>
    PNPM_TOOLS_PATH_NAMES.map((names) =>
      joinAbsolutePath({ parentPath: pnpmHomePath, names: names }),
    ),
  );

  return [asdfRoot, ...params.misePnpmRoots, ...corepackRoots, ...pnpmToolsRoots];
}

/**
 * The folders and links of mise's installs whose name names pnpm, such as `pnpm` and the folder
 * `npm-pnpm` of the backend key `npm:pnpm`; a missing installs folder holds none.
 */
async function loadMisePnpmVersionsRoots(params: {
  homeDir: AbsolutePath;
}): Promise<Result<AbsolutePath[], ExploreFileUnreadable>> {
  const miseInstallsPath = joinAbsolutePath({
    parentPath: params.homeDir,
    names: MISE_INSTALLS_PATH_NAMES,
  });
  const entryPaths = await loadEntryPaths({ folderPaths: [miseInstallsPath] });

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
  homebrewPrefixPaths: AbsolutePath[];
}): Promise<Result<AbsolutePath[], ExploreFileUnreadable>> {
  const roots: AbsolutePath[] = [];

  for (const prefixPath of params.homebrewPrefixPaths) {
    const cellarPath = joinAbsolutePath({
      parentPath: prefixPath,
      names: [HOMEBREW_CELLAR_FOLDER_NAME],
    });
    const names = await loadExploreFolderNames({ path: cellarPath });

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
        joinAbsolutePath({ parentPath: cellarPath, names: [formulaName] }),
      ),
    );
  }

  return { kind: 'succeeded', value: roots };
}

async function loadVersionFolderInstalls(params: {
  versionsRoots: AbsolutePath[];
}): Promise<Result<PnpmInstall[], ExploreFileUnreadable>> {
  const installs: PnpmInstall[] = [];

  for (const versionsRoot of params.versionsRoots) {
    const rootInstalls = await loadVersionsRootInstalls({ versionsRoot: versionsRoot });

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
  versionsRoot: AbsolutePath;
}): Promise<Result<PnpmInstall[], ExploreFileUnreadable>> {
  const names = await loadExploreFolderNames({ path: params.versionsRoot });

  if (names.kind === 'failed') {
    return names;
  }

  if (names.value === null) {
    return { kind: 'succeeded', value: [] };
  }

  const installs = names.value.folderNames.map((folderName) =>
    buildPnpmInstall({
      path: joinAbsolutePath({ parentPath: params.versionsRoot, names: [folderName] }),
      versionText: folderName,
    }),
  );

  for (const linkName of names.value.linkNames) {
    const linkPath = joinAbsolutePath({ parentPath: params.versionsRoot, names: [linkName] });
    const realPath = await loadExploreRealPath({ path: linkPath });

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
 * The `node_modules/pnpm` and `node_modules/@pnpm/exe` folders of pnpm's global folders and of
 * each node's npm globals.
 */
async function loadPnpmPackageFolders(params: {
  homeDir: AbsolutePath;
  homebrewPrefixPaths: AbsolutePath[];
  globalFolderPaths: AbsolutePath[];
}): Promise<Result<AbsolutePath[], ExploreFileUnreadable>> {
  const nodeInstallsRoots = [
    [...ASDF_INSTALLS_PATH_NAMES, ASDF_NODE_TOOL_NAME],
    [...MISE_INSTALLS_PATH_NAMES, MISE_NODE_TOOL_NAME],
    NVM_NODE_VERSIONS_PATH_NAMES,
  ].map((names) => joinAbsolutePath({ parentPath: params.homeDir, names: names }));
  const nodeFolders = await loadEntryRealPaths({ folderPaths: nodeInstallsRoots });

  if (nodeFolders.kind === 'failed') {
    return nodeFolders;
  }

  const globalPackageFolders = params.globalFolderPaths.flatMap((globalFolder) =>
    PNPM_PACKAGE_PATH_NAMES.map((names) =>
      joinAbsolutePath({ parentPath: globalFolder, names: names }),
    ),
  );
  const npmGlobalPackageFolders = [...params.homebrewPrefixPaths, ...nodeFolders.value].flatMap(
    (nodeFolder) =>
      PNPM_PACKAGE_PATH_NAMES.map((names) =>
        joinAbsolutePath({ parentPath: nodeFolder, names: [NPM_GLOBAL_FOLDER_NAME, ...names] }),
      ),
  );

  return { kind: 'succeeded', value: [...globalPackageFolders, ...npmGlobalPackageFolders] };
}

/**
 * pnpm's global folders in each pnpm home: each entry of `global` by its real path, except that
 * the entries of an entry named `v<digits>` are the global folders in its place.
 */
async function loadPnpmGlobalFolders(params: {
  pnpmHomePaths: AbsolutePath[];
}): Promise<Result<AbsolutePath[], ExploreFileUnreadable>> {
  const entryPaths = await loadEntryPaths({
    folderPaths: params.pnpmHomePaths.map((pnpmHomePath) =>
      joinAbsolutePath({ parentPath: pnpmHomePath, names: [PNPM_GLOBAL_FOLDER_NAME] }),
    ),
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
  const flatFolders = await loadRealPaths({ paths: flatFolderPaths });

  if (flatFolders.kind === 'failed') {
    return flatFolders;
  }

  const installFolders = await loadEntryRealPaths({ folderPaths: installsFolderPaths });

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
  pnpmHomePaths: AbsolutePath[];
}): Promise<Result<PnpmInstall[], ExploreFileUnreadable>> {
  const installs: PnpmInstall[] = [];

  for (const pnpmHomePath of params.pnpmHomePaths) {
    const install = await loadStandaloneInstall({ pnpmHomePath: pnpmHomePath });

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
 * The executable pnpm's `install.sh` and `pnpm setup` copy to `pnpm` in a pnpm home, an install
 * of no known version; `null` when nothing is there or it is a script, which runs a pnpm of a place
 * read on its own.
 */
async function loadStandaloneInstall(params: {
  pnpmHomePath: AbsolutePath;
}): Promise<Result<PnpmInstall | null, ExploreFileUnreadable>> {
  const path = joinAbsolutePath({ parentPath: params.pnpmHomePath, names: [PNPM_TOOL_NAME] });
  const file = await loadExploreFileText({ path: path });

  if (file.kind === 'failed') {
    return file;
  }

  switch (file.value.kind) {
    case 'absent':
      return { kind: 'succeeded', value: null };
    case 'unfit':
      return { kind: 'succeeded', value: buildPnpmInstall({ path: path, versionText: null }) };
    case 'text': {
      if (file.value.text.startsWith(SCRIPT_SHEBANG)) {
        return { kind: 'succeeded', value: null };
      }

      return { kind: 'succeeded', value: buildPnpmInstall({ path: path, versionText: null }) };
    }
  }
}

/** The real paths of the folders and the live links in each of `folderPaths`, each path once. */
async function loadEntryRealPaths(params: {
  folderPaths: AbsolutePath[];
}): Promise<Result<AbsolutePath[], ExploreFileUnreadable>> {
  const entryPaths = await loadEntryPaths({ folderPaths: params.folderPaths });

  if (entryPaths.kind === 'failed') {
    return entryPaths;
  }

  return loadRealPaths({
    paths: [...entryPaths.value.folderPaths, ...entryPaths.value.linkPaths],
  });
}

type EntryPaths = { folderPaths: AbsolutePath[]; linkPaths: AbsolutePath[] };

/** The folders and the links in each of `folderPaths`; a missing folder holds none. */
async function loadEntryPaths(params: {
  folderPaths: AbsolutePath[];
}): Promise<Result<EntryPaths, ExploreFileUnreadable>> {
  const folderPaths: AbsolutePath[] = [];
  const linkPaths: AbsolutePath[] = [];

  for (const folderPath of params.folderPaths) {
    const names = await loadExploreFolderNames({ path: folderPath });

    if (names.kind === 'failed') {
      return names;
    }

    if (names.value === null) {
      continue;
    }

    folderPaths.push(
      ...names.value.folderNames.map((folderName) =>
        joinAbsolutePath({ parentPath: folderPath, names: [folderName] }),
      ),
    );
    linkPaths.push(
      ...names.value.linkNames.map((linkName) =>
        joinAbsolutePath({ parentPath: folderPath, names: [linkName] }),
      ),
    );
  }

  return { kind: 'succeeded', value: { folderPaths: folderPaths, linkPaths: linkPaths } };
}

/** The real path of each of `paths`, each real path once; a dangling link adds nothing. */
async function loadRealPaths(params: {
  paths: AbsolutePath[];
}): Promise<Result<AbsolutePath[], ExploreFileUnreadable>> {
  const realPaths = new Set<AbsolutePath>();

  for (const path of params.paths) {
    const realPath = await loadExploreRealPath({ path: path });

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
  packageFolders: AbsolutePath[];
}): Promise<Result<PnpmInstall[], ExploreFileUnreadable>> {
  const installs: PnpmInstall[] = [];

  for (const packageFolder of params.packageFolders) {
    const install = await loadPackageJsonInstall({ packageFolder: packageFolder });

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
  packageFolder: AbsolutePath;
}): Promise<Result<PnpmInstall | null, ExploreFileUnreadable>> {
  const packageJson = await loadExploreFileText({
    path: joinAbsolutePath({ parentPath: params.packageFolder, names: [PACKAGE_JSON_FILE_NAME] }),
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
