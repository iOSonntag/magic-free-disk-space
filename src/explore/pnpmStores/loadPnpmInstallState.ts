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
import { PNPM_TOOL_NAME } from './pnpmToolName.js';

/** An installed pnpm whose version names its major. */
export type PnpmInstallParsed = {
  kind: 'parsed';
  path: AbsolutePath;
  versionText: string;
  major: number;
};

/** An installed pnpm whose version is not read; `versionText` is `null` when it has none. */
export type PnpmInstallUnparsed = {
  kind: 'unparsed';
  path: AbsolutePath;
  versionText: string | null;
};

export type PnpmInstall = PnpmInstallParsed | PnpmInstallUnparsed;

export type PnpmInstallState = { installs: PnpmInstall[] };

const COREPACK_PNPM_PATH_NAMES = [
  ['.cache', 'node', 'corepack', 'v1', 'pnpm'],
  ['.cache', 'node', 'corepack', 'pnpm'],
];

const PNPM_TOOLS_PATH_NAMES = [
  ['Library', 'pnpm', '.tools', 'pnpm'],
  ['Library', 'pnpm', '.tools', '@pnpm+exe'],
];

const PNPM_GLOBAL_PATH_NAMES = ['Library', 'pnpm', 'global'];

const PNPM_STANDALONE_PATH_NAMES = ['Library', 'pnpm', PNPM_TOOL_NAME];

const SCRIPT_SHEBANG = '#!';

const ASDF_NODE_TOOL_NAME = 'nodejs';

const MISE_NODE_TOOL_NAME = 'node';

const HOMEBREW_CELLAR_FOLDER_NAME = 'Cellar';

const HOMEBREW_VERSIONED_PNPM_PREFIX = `${PNPM_TOOL_NAME}@`;

const PNPM_PACKAGE_PATH_NAMES = [
  ['node_modules', PNPM_TOOL_NAME],
  ['node_modules', '@pnpm', 'exe'],
];

const NPM_GLOBAL_FOLDER_NAME = 'lib';

const PACKAGE_JSON_FILE_NAME = 'package.json';

/**
 * The pnpm installed in every place pnpm, corepack, asdf, mise, Homebrew, and the npm globals of
 * a node keep it; a missing place holds none. Each pnpm store probe and recheck loads it on its
 * own, a known cost of one probe per store root.
 */
export async function loadPnpmInstallState(params: {
  homeDir: AbsolutePath;
  homebrewPrefixPaths: AbsolutePath[];
}): Promise<Result<PnpmInstallState, ExploreFileUnreadable>> {
  const cellarRoots = await loadHomebrewCellarPnpmRoots({
    homebrewPrefixPaths: params.homebrewPrefixPaths,
  });

  if (cellarRoots.kind === 'failed') {
    return cellarRoots;
  }

  const folderInstalls = await loadVersionFolderInstalls({
    versionsRoots: [
      ...listHomePnpmVersionsRoots({ homeDir: params.homeDir }),
      ...cellarRoots.value,
    ],
  });

  if (folderInstalls.kind === 'failed') {
    return folderInstalls;
  }

  const packageFolders = await loadPnpmPackageFolders({
    homeDir: params.homeDir,
    homebrewPrefixPaths: params.homebrewPrefixPaths,
  });

  if (packageFolders.kind === 'failed') {
    return packageFolders;
  }

  const packageInstalls = await loadPackageJsonInstalls({ packageFolders: packageFolders.value });

  if (packageInstalls.kind === 'failed') {
    return packageInstalls;
  }

  const standaloneInstall = await loadStandaloneInstall({ homeDir: params.homeDir });

  if (standaloneInstall.kind === 'failed') {
    return standaloneInstall;
  }

  const standaloneInstalls = standaloneInstall.value === null ? [] : [standaloneInstall.value];

  return {
    kind: 'succeeded',
    value: {
      installs: [...folderInstalls.value, ...packageInstalls.value, ...standaloneInstalls],
    },
  };
}

function listHomePnpmVersionsRoots(params: { homeDir: AbsolutePath }): AbsolutePath[] {
  const homePathNames = [
    [...ASDF_INSTALLS_PATH_NAMES, PNPM_TOOL_NAME],
    [...MISE_INSTALLS_PATH_NAMES, PNPM_TOOL_NAME],
    ...COREPACK_PNPM_PATH_NAMES,
    ...PNPM_TOOLS_PATH_NAMES,
  ];

  return homePathNames.map((names) =>
    joinAbsolutePath({ parentPath: params.homeDir, names: names }),
  );
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
}): Promise<Result<AbsolutePath[], ExploreFileUnreadable>> {
  const globalFolders = await loadEntryRealPaths({
    folderPaths: [joinAbsolutePath({ parentPath: params.homeDir, names: PNPM_GLOBAL_PATH_NAMES })],
  });

  if (globalFolders.kind === 'failed') {
    return globalFolders;
  }

  const nodeInstallsRoots = [
    [...ASDF_INSTALLS_PATH_NAMES, ASDF_NODE_TOOL_NAME],
    [...MISE_INSTALLS_PATH_NAMES, MISE_NODE_TOOL_NAME],
    NVM_NODE_VERSIONS_PATH_NAMES,
  ].map((names) => joinAbsolutePath({ parentPath: params.homeDir, names: names }));
  const nodeFolders = await loadEntryRealPaths({ folderPaths: nodeInstallsRoots });

  if (nodeFolders.kind === 'failed') {
    return nodeFolders;
  }

  const globalPackageFolders = globalFolders.value.flatMap((globalFolder) =>
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
 * The executable pnpm's `install.sh` and `pnpm setup` copy to `~/Library/pnpm/pnpm`, an install
 * of no known version; `null` when nothing is there or it is a script, which runs a pnpm of a place
 * read on its own.
 */
async function loadStandaloneInstall(params: {
  homeDir: AbsolutePath;
}): Promise<Result<PnpmInstall | null, ExploreFileUnreadable>> {
  const path = joinAbsolutePath({ parentPath: params.homeDir, names: PNPM_STANDALONE_PATH_NAMES });
  const file = await loadExploreFileText({ path: path });

  if (file.kind === 'failed') {
    return file;
  }

  switch (file.value.kind) {
    case 'absent':
      return { kind: 'succeeded', value: null };
    case 'unfit':
      return { kind: 'succeeded', value: { kind: 'unparsed', path: path, versionText: null } };
    case 'text': {
      if (file.value.text.startsWith(SCRIPT_SHEBANG)) {
        return { kind: 'succeeded', value: null };
      }

      return { kind: 'succeeded', value: { kind: 'unparsed', path: path, versionText: null } };
    }
  }
}

/** The real paths of the folders and the live links in each of `folderPaths`, each path once. */
async function loadEntryRealPaths(params: {
  folderPaths: AbsolutePath[];
}): Promise<Result<AbsolutePath[], ExploreFileUnreadable>> {
  const realPaths = new Set<AbsolutePath>();

  for (const folderPath of params.folderPaths) {
    const names = await loadExploreFolderNames({ path: folderPath });

    if (names.kind === 'failed') {
      return names;
    }

    const entryNames =
      names.value === null ? [] : [...names.value.folderNames, ...names.value.linkNames];

    for (const entryName of entryNames) {
      const realPath = await loadExploreRealPath({
        path: joinAbsolutePath({ parentPath: folderPath, names: [entryName] }),
      });

      if (realPath.kind === 'failed') {
        return realPath;
      }

      if (realPath.value !== null) {
        realPaths.add(realPath.value);
      }
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
        value: { kind: 'unparsed', path: params.packageFolder, versionText: null },
      };
    case 'text': {
      const versionText = parsePackageVersion({ text: packageJson.value.text });

      if (versionText === null) {
        return {
          kind: 'succeeded',
          value: { kind: 'unparsed', path: params.packageFolder, versionText: null },
        };
      }

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

function buildPnpmInstall(params: { path: AbsolutePath; versionText: string }): PnpmInstall {
  const major = parsePnpmVersionMajor({ text: params.versionText });

  if (major === null) {
    return { kind: 'unparsed', path: params.path, versionText: params.versionText };
  }

  return { kind: 'parsed', path: params.path, versionText: params.versionText, major: major };
}
