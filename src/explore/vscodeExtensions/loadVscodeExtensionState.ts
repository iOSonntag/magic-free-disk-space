import { basename, dirname, posix, win32 } from 'node:path';
import type { CatalogLocation } from '../../catalog/catalog.js';
import { resolveCatalogLocation } from '../../catalog/resolveCatalogLocation.js';
import type { Environment } from '../../environment/buildEnvironment.js';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import { isJsonObject, parseJsonValue } from '../../system/parseJsonValue.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import {
  loadExploreDirectoryEntries,
  loadExploreDirectoryNames,
  loadExploreFileText,
  loadExploreRealPath,
} from '../loadExploreRead.js';

const EXTENSIONS_FOLDER_NAMES = ['.vscode', 'extensions'];

const REGISTRY_FILE_NAME = 'extensions.json';

const OBSOLETE_FILE_NAME = '.obsolete';

/** A `file:` URI path that starts at a drive, such as `/c:/Users`. */
const URI_DRIVE_PATH_PATTERN = /^\/[A-Za-z]:\//;

/**
 * VS Code's own parse of an extension folder name (`ExtensionKeyRegex`): `<publisher>.<name>`, a
 * `-<major>.<minor>.<patch>` version, then an optional `-<target platform>`.
 */
const EXTENSION_FOLDER_NAME_PATTERN = /^([^.]+\..+)-(\d+\.\d+\.\d+)(-(.+))?$/;

/** An extension folder in `~/.vscode/extensions`, named as VS Code names it. */
export type VscodeExtensionFolder = {
  name: string;
  path: AbsolutePath;
  extensionId: string;
  /** `<major>.<minor>.<patch>`, without the platform suffix. */
  version: string;
};

/** `~/.vscode/extensions` does not exist, so no extension is installed. */
export type VscodeExtensionStateNoExtensions = { kind: 'noExtensions' };

/** The sets hold folder names in lower case, since VS Code compares extension paths without case. */
export type VscodeExtensionStateInstalled = {
  kind: 'installed';
  folders: VscodeExtensionFolder[];
  /**
   * The folders the default registry or a profile's lists; `null` when the default registry is
   * missing, or a registry is unfit or does not parse, so no folder counts as unlisted.
   */
  listedFolderNames: ReadonlySet<string> | null;
  /** The folders `.obsolete` marks for removal, empty without it; `null` when it does not parse. */
  obsoleteFolderNames: ReadonlySet<string> | null;
};

/** What the reads of `~/.vscode/extensions`, its registries, and `.obsolete` found. */
export type VscodeExtensionState = VscodeExtensionStateNoExtensions | VscodeExtensionStateInstalled;

/** One registry to read: the default one, or a profile's. */
type VscodeRegistry = {
  path: AbsolutePath;
  /** A missing default registry leaves every folder unjudged; a profile without one keeps the default list. */
  isRequired: boolean;
};

/**
 * Reads the extension folders and every registry once, for the probe and the recheck of its units.
 * A read that is absent or unfit is a fact of the state; only a failed read fails.
 */
export async function loadVscodeExtensionState(params: {
  environment: Environment;
  /** VS Code's folder of profiles, from the explore slice. */
  profilesRoot: CatalogLocation;
  privacyDenialCode: string | null;
}): Promise<Result<VscodeExtensionState, ExploreFileUnreadable>> {
  const pathRules = params.environment.pathRules;
  const extensionsPath = joinAbsolutePath({
    rules: pathRules,
    parentPath: params.environment.homeDir,
    names: EXTENSIONS_FOLDER_NAMES,
  });
  const folders = await loadExtensionFolders({
    pathRules: pathRules,
    extensionsPath: extensionsPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (folders.kind === 'failed') {
    return folders;
  }

  if (folders.value === null) {
    return { kind: 'succeeded', value: { kind: 'noExtensions' } };
  }

  const extensionsRealPath = await loadExploreRealPath({
    pathRules: pathRules,
    path: extensionsPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (extensionsRealPath.kind === 'failed') {
    return extensionsRealPath;
  }

  if (extensionsRealPath.value === null) {
    return { kind: 'succeeded', value: { kind: 'noExtensions' } };
  }

  const listedFolderNames = await loadListedFolderNames({
    pathRules: pathRules,
    profilesPath: resolveCatalogLocation({
      environment: params.environment,
      location: params.profilesRoot,
    }),
    extensionsPath: extensionsPath,
    extensionsRealPath: extensionsRealPath.value,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (listedFolderNames.kind === 'failed') {
    return listedFolderNames;
  }

  const obsoleteFolderNames = await loadObsoleteFolderNames({
    pathRules: pathRules,
    extensionsPath: extensionsPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (obsoleteFolderNames.kind === 'failed') {
    return obsoleteFolderNames;
  }

  return {
    kind: 'succeeded',
    value: {
      kind: 'installed',
      folders: folders.value,
      listedFolderNames: listedFolderNames.value,
      obsoleteFolderNames: obsoleteFolderNames.value,
    },
  };
}

/** Whether `folderNames`, a set of the state, holds the folder. */
export function hasVscodeExtensionFolder(params: {
  folderNames: ReadonlySet<string>;
  folder: VscodeExtensionFolder;
}): boolean {
  return params.folderNames.has(params.folder.name.toLowerCase());
}

/** The folders and links whose name parses as an extension's; `null` when the folder is absent. */
async function loadExtensionFolders(params: {
  pathRules: PathRules;
  extensionsPath: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<VscodeExtensionFolder[] | null, ExploreFileUnreadable>> {
  const entries = await loadExploreDirectoryEntries({
    path: params.extensionsPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (entries.kind === 'failed') {
    return entries;
  }

  if (entries.value === null) {
    return { kind: 'succeeded', value: null };
  }

  const folders = entries.value.flatMap((entry) => {
    if (entry.kind !== 'directory' && entry.kind !== 'symbolicLink') {
      return [];
    }

    const folder = parseExtensionFolder({
      pathRules: params.pathRules,
      name: entry.name,
      extensionsPath: params.extensionsPath,
    });

    return folder === null ? [] : [folder];
  });

  return { kind: 'succeeded', value: folders };
}

function parseExtensionFolder(params: {
  pathRules: PathRules;
  name: string;
  extensionsPath: AbsolutePath;
}): VscodeExtensionFolder | null {
  const match = EXTENSION_FOLDER_NAME_PATTERN.exec(params.name);
  const extensionId = match?.[1];
  const version = match?.[2];

  if (extensionId === undefined || version === undefined) {
    return null;
  }

  return {
    name: params.name,
    path: joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.extensionsPath,
      names: [params.name],
    }),
    extensionId: extensionId,
    version: version,
  };
}

/**
 * The union of the folders every registry lists, matched by the real path of each entry's parent
 * folder; `null` when a registry leaves the probe unjudged.
 */
async function loadListedFolderNames(params: {
  pathRules: PathRules;
  profilesPath: AbsolutePath;
  extensionsPath: AbsolutePath;
  extensionsRealPath: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<ReadonlySet<string> | null, ExploreFileUnreadable>> {
  const registries = await listRegistries({
    pathRules: params.pathRules,
    profilesPath: params.profilesPath,
    extensionsPath: params.extensionsPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (registries.kind === 'failed') {
    return registries;
  }

  const folderPaths = await loadRegistriesFolderPaths({
    pathRules: params.pathRules,
    registries: registries.value,
    extensionsPath: params.extensionsPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (folderPaths.kind === 'failed') {
    return folderPaths;
  }

  if (folderPaths.value === null) {
    return { kind: 'succeeded', value: null };
  }

  const parentRealPaths = await loadParentRealPaths({
    pathRules: params.pathRules,
    parentPaths: new Set(folderPaths.value.map((folderPath) => dirname(folderPath))),
    privacyDenialCode: params.privacyDenialCode,
  });

  if (parentRealPaths.kind === 'failed') {
    return parentRealPaths;
  }

  const listedFolderNames = folderPaths.value.flatMap((folderPath) => {
    const folderName = findExtensionsFolderName({
      folderPath: folderPath,
      parentRealPaths: parentRealPaths.value,
      extensionsRealPath: params.extensionsRealPath,
    });

    return folderName === null ? [] : [folderName];
  });

  return { kind: 'succeeded', value: new Set(listedFolderNames) };
}

/** The folder paths of every registry together; `null` when one leaves the probe unjudged. */
async function loadRegistriesFolderPaths(params: {
  pathRules: PathRules;
  registries: VscodeRegistry[];
  extensionsPath: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<AbsolutePath[] | null, ExploreFileUnreadable>> {
  const folderPaths: AbsolutePath[] = [];
  let isEveryRegistryJudged = true;

  for (const registry of params.registries) {
    const registryFolderPaths = await loadRegistryFolderPaths({
      pathRules: params.pathRules,
      registry: registry,
      extensionsPath: params.extensionsPath,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (registryFolderPaths.kind === 'failed') {
      return registryFolderPaths;
    }

    if (registryFolderPaths.value === null) {
      isEveryRegistryJudged = false;
    } else {
      folderPaths.push(...registryFolderPaths.value);
    }
  }

  return { kind: 'succeeded', value: isEveryRegistryJudged ? folderPaths : null };
}

/**
 * The real path of each parent folder, read once each; `null` for one that is absent or has a part
 * that is no folder.
 */
async function loadParentRealPaths(params: {
  pathRules: PathRules;
  parentPaths: ReadonlySet<string>;
  privacyDenialCode: string | null;
}): Promise<Result<ReadonlyMap<string, AbsolutePath | null>, ExploreFileUnreadable>> {
  const parentRealPaths = new Map<string, AbsolutePath | null>();

  for (const parentPath of params.parentPaths) {
    const realPath = await loadExploreRealPath({
      pathRules: params.pathRules,
      path: parentPath,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (realPath.kind === 'failed') {
      return realPath;
    }

    parentRealPaths.set(parentPath, realPath.value);
  }

  return { kind: 'succeeded', value: parentRealPaths };
}

/** The default registry, then one per profile folder; no profiles folder adds none. */
async function listRegistries(params: {
  pathRules: PathRules;
  profilesPath: AbsolutePath;
  extensionsPath: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<VscodeRegistry[], ExploreFileUnreadable>> {
  const defaultRegistry: VscodeRegistry = {
    path: joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.extensionsPath,
      names: [REGISTRY_FILE_NAME],
    }),
    isRequired: true,
  };
  const profileNames = await loadExploreDirectoryNames({
    path: params.profilesPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (profileNames.kind === 'failed') {
    return profileNames;
  }

  const profileRegistries = (profileNames.value ?? []).map((profileName) => ({
    path: joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.profilesPath,
      names: [profileName, REGISTRY_FILE_NAME],
    }),
    isRequired: false,
  }));

  return { kind: 'succeeded', value: [defaultRegistry, ...profileRegistries] };
}

/** The resolved folder paths the registry lists; `null` when it leaves the folders unjudged. */
async function loadRegistryFolderPaths(params: {
  pathRules: PathRules;
  registry: VscodeRegistry;
  extensionsPath: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<AbsolutePath[] | null, ExploreFileUnreadable>> {
  const read = await loadExploreFileText({
    path: params.registry.path,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (read.kind === 'failed') {
    return read;
  }

  switch (read.value.kind) {
    case 'absent':
      return { kind: 'succeeded', value: params.registry.isRequired ? null : [] };
    case 'unfit':
      return { kind: 'succeeded', value: null };
    case 'text':
      return {
        kind: 'succeeded',
        value: parseRegistryFolderPaths({
          pathRules: params.pathRules,
          text: read.value.text,
          extensionsPath: params.extensionsPath,
        }),
      };
  }
}

/**
 * The folder paths an `extensions.json` lists, each under `pathRules`; `null` when the registry is
 * no list or an entry names no folder, so it never reads as empty.
 */
export function parseRegistryFolderPaths(params: {
  pathRules: PathRules;
  text: string;
  extensionsPath: AbsolutePath;
}): AbsolutePath[] | null {
  const registry = parseJsonValue({ text: params.text });

  if (registry.kind === 'failed' || !Array.isArray(registry.value)) {
    return null;
  }

  const folderPaths: AbsolutePath[] = [];

  for (const entry of registry.value) {
    const folderPath = parseRegistryEntryFolderPath({
      pathRules: params.pathRules,
      entry: entry,
      extensionsPath: params.extensionsPath,
    });

    if (folderPath.kind === 'failed') {
      return null;
    }

    if (folderPath.value !== null) {
      folderPaths.push(folderPath.value);
    }
  }

  return folderPaths;
}

/**
 * Resolves an entry's folder path as VS Code does: `relativeLocation` under the extensions folder
 * as written, else the path of its `location` URI. `null` for an entry that lists no folder:
 * VS Code skips one whose only location is a string.
 */
function parseRegistryEntryFolderPath(params: {
  pathRules: PathRules;
  entry: unknown;
  extensionsPath: AbsolutePath;
}): Result<AbsolutePath | null, string> {
  if (!isJsonObject(params.entry)) {
    return { kind: 'failed', failure: 'an entry is no object' };
  }

  const relativeLocation = params.entry.relativeLocation;

  if (typeof relativeLocation === 'string' && relativeLocation !== '') {
    return parseFolderPath({
      pathRules: params.pathRules,
      text: resolveUnderRules({
        pathRules: params.pathRules,
        paths: [params.extensionsPath, relativeLocation],
      }),
    });
  }

  const location = params.entry.location;

  if (typeof location === 'string') {
    return { kind: 'succeeded', value: null };
  }

  if (!isJsonObject(location) || typeof location.path !== 'string') {
    return { kind: 'failed', failure: 'an entry names no folder' };
  }

  return parseFolderPath({
    pathRules: params.pathRules,
    text: parseLocationUriPath({ pathRules: params.pathRules, uriPath: location.path }),
  });
}

/**
 * The file path a `file:` URI path names. A URI path always starts at `/`, so on Windows it holds
 * the drive after it, as `/c:/Users/…`; that slash goes, and `parseAbsolutePath` turns the rest
 * into `C:\Users\…`. `null` for a path that is not absolute.
 */
function parseLocationUriPath(params: { pathRules: PathRules; uriPath: string }): string | null {
  switch (params.pathRules.rootForm) {
    case 'posix':
      return posix.isAbsolute(params.uriPath) ? posix.resolve(params.uriPath) : null;
    case 'win32':
      return URI_DRIVE_PATH_PATTERN.test(params.uriPath) ? params.uriPath.slice(1) : null;
  }
}

/** Resolves `paths` as the platform's path rules resolve them, never against the host's. */
function resolveUnderRules(params: { pathRules: PathRules; paths: string[] }): string {
  switch (params.pathRules.rootForm) {
    case 'posix':
      return posix.resolve(...params.paths);
    case 'win32':
      return win32.resolve(...params.paths);
  }
}

function parseFolderPath(params: {
  pathRules: PathRules;
  text: string | null;
}): Result<AbsolutePath, string> {
  const folderPath =
    params.text === null ? null : parseAbsolutePath({ rules: params.pathRules, text: params.text });

  if (folderPath === null || folderPath.kind === 'failed') {
    return { kind: 'failed', failure: 'an entry names no folder' };
  }

  return folderPath;
}

/**
 * The lower-case name of a folder directly inside the extensions folder, whatever link its path
 * goes through: its parent's real path in `parentRealPaths` equals the extensions folder's,
 * without case. Else `null`.
 */
function findExtensionsFolderName(params: {
  folderPath: string;
  parentRealPaths: ReadonlyMap<string, AbsolutePath | null>;
  extensionsRealPath: AbsolutePath;
}): string | null {
  const parentRealPath = params.parentRealPaths.get(dirname(params.folderPath));

  if (parentRealPath?.toLowerCase() !== params.extensionsRealPath.toLowerCase()) {
    return null;
  }

  return basename(params.folderPath).toLowerCase();
}

/** No `.obsolete` marks nothing; `null` when it is unfit or no JSON object. */
async function loadObsoleteFolderNames(params: {
  pathRules: PathRules;
  extensionsPath: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<ReadonlySet<string> | null, ExploreFileUnreadable>> {
  const read = await loadExploreFileText({
    path: joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.extensionsPath,
      names: [OBSOLETE_FILE_NAME],
    }),
    privacyDenialCode: params.privacyDenialCode,
  });

  if (read.kind === 'failed') {
    return read;
  }

  switch (read.value.kind) {
    case 'absent':
      return { kind: 'succeeded', value: new Set() };
    case 'unfit':
      return { kind: 'succeeded', value: null };
    case 'text':
      return { kind: 'succeeded', value: parseObsoleteFolderNames({ text: read.value.text }) };
  }
}

/** `.obsolete` is a JSON object from folder name to `true`, which VS Code writes on removal. */
function parseObsoleteFolderNames(params: { text: string }): ReadonlySet<string> | null {
  const obsolete = parseJsonValue({ text: params.text });

  if (obsolete.kind === 'failed' || !isJsonObject(obsolete.value)) {
    return null;
  }

  const folderNames = Object.entries(obsolete.value).flatMap(([folderName, isObsolete]) =>
    isObsolete === true ? [folderName.toLowerCase()] : [],
  );

  return new Set(folderNames);
}
