import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import { isJsonObject, parseJsonValue } from '../../system/parseJsonValue.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import {
  loadExploreDirectoryEntries,
  loadExploreDirectoryNames,
  loadExploreFileText,
} from '../loadExploreRead.js';

const EXTENSIONS_FOLDER_NAMES = ['.vscode', 'extensions'];

const PROFILES_FOLDER_NAMES = ['Library', 'Application Support', 'Code', 'User', 'profiles'];

const REGISTRY_FILE_NAME = 'extensions.json';

const OBSOLETE_FILE_NAME = '.obsolete';

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
  homeDir: AbsolutePath;
}): Promise<Result<VscodeExtensionState, ExploreFileUnreadable>> {
  const extensionsPath = joinAbsolutePath({
    parentPath: params.homeDir,
    names: EXTENSIONS_FOLDER_NAMES,
  });
  const folders = await loadExtensionFolders({ extensionsPath: extensionsPath });

  if (folders.kind === 'failed') {
    return folders;
  }

  if (folders.value === null) {
    return { kind: 'succeeded', value: { kind: 'noExtensions' } };
  }

  const listedFolderNames = await loadListedFolderNames({
    homePath: params.homeDir,
    extensionsPath: extensionsPath,
  });

  if (listedFolderNames.kind === 'failed') {
    return listedFolderNames;
  }

  const obsoleteFolderNames = await loadObsoleteFolderNames({ extensionsPath: extensionsPath });

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
  extensionsPath: AbsolutePath;
}): Promise<Result<VscodeExtensionFolder[] | null, ExploreFileUnreadable>> {
  const entries = await loadExploreDirectoryEntries({ path: params.extensionsPath });

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
      name: entry.name,
      extensionsPath: params.extensionsPath,
    });

    return folder === null ? [] : [folder];
  });

  return { kind: 'succeeded', value: folders };
}

function parseExtensionFolder(params: {
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
    path: joinAbsolutePath({ parentPath: params.extensionsPath, names: [params.name] }),
    extensionId: extensionId,
    version: version,
  };
}

/** The union of the folders every registry lists; `null` when one leaves the probe unjudged. */
async function loadListedFolderNames(params: {
  homePath: AbsolutePath;
  extensionsPath: AbsolutePath;
}): Promise<Result<ReadonlySet<string> | null, ExploreFileUnreadable>> {
  const registries = await listRegistries(params);

  if (registries.kind === 'failed') {
    return registries;
  }

  const listedFolderNames = new Set<string>();
  let isEveryRegistryJudged = true;

  for (const registry of registries.value) {
    const folderNames = await loadRegistryFolderNames({
      registry: registry,
      extensionsPath: params.extensionsPath,
    });

    if (folderNames.kind === 'failed') {
      return folderNames;
    }

    if (folderNames.value === null) {
      isEveryRegistryJudged = false;
    } else {
      for (const folderName of folderNames.value) {
        listedFolderNames.add(folderName);
      }
    }
  }

  return { kind: 'succeeded', value: isEveryRegistryJudged ? listedFolderNames : null };
}

/** The default registry, then one per profile folder; no profiles folder adds none. */
async function listRegistries(params: {
  homePath: AbsolutePath;
  extensionsPath: AbsolutePath;
}): Promise<Result<VscodeRegistry[], ExploreFileUnreadable>> {
  const defaultRegistry: VscodeRegistry = {
    path: joinAbsolutePath({ parentPath: params.extensionsPath, names: [REGISTRY_FILE_NAME] }),
    isRequired: true,
  };
  const profilesPath = joinAbsolutePath({
    parentPath: params.homePath,
    names: PROFILES_FOLDER_NAMES,
  });
  const profileNames = await loadExploreDirectoryNames({ path: profilesPath });

  if (profileNames.kind === 'failed') {
    return profileNames;
  }

  const profileRegistries = (profileNames.value ?? []).map((profileName) => ({
    path: joinAbsolutePath({ parentPath: profilesPath, names: [profileName, REGISTRY_FILE_NAME] }),
    isRequired: false,
  }));

  return { kind: 'succeeded', value: [defaultRegistry, ...profileRegistries] };
}

/** The folders of `~/.vscode/extensions` the registry lists; `null` when it leaves them unjudged. */
async function loadRegistryFolderNames(params: {
  registry: VscodeRegistry;
  extensionsPath: AbsolutePath;
}): Promise<Result<string[] | null, ExploreFileUnreadable>> {
  const read = await loadExploreFileText({ path: params.registry.path });

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
        value: parseRegistryFolderNames({
          text: read.value.text,
          extensionsPath: params.extensionsPath,
        }),
      };
  }
}

/** `null` when the registry is no list or an entry names no folder, so it never reads as empty. */
function parseRegistryFolderNames(params: {
  text: string;
  extensionsPath: AbsolutePath;
}): string[] | null {
  const registry = parseJsonValue({ text: params.text });

  if (registry.kind === 'failed' || !Array.isArray(registry.value)) {
    return null;
  }

  const listedFolderNames: string[] = [];

  for (const entry of registry.value) {
    const folderName = parseRegistryEntryFolderName({
      entry: entry,
      extensionsPath: params.extensionsPath,
    });

    if (folderName.kind === 'failed') {
      return null;
    }

    if (folderName.value !== null) {
      listedFolderNames.push(folderName.value);
    }
  }

  return listedFolderNames;
}

/**
 * Resolves an entry's folder as VS Code does: `relativeLocation` under the extensions folder,
 * else the path of its `location` URI. `null` for an entry that lists no folder of
 * `~/.vscode/extensions`: VS Code skips one whose only location is a string.
 */
function parseRegistryEntryFolderName(params: {
  entry: unknown;
  extensionsPath: AbsolutePath;
}): Result<string | null, string> {
  if (!isJsonObject(params.entry)) {
    return { kind: 'failed', failure: 'an entry is no object' };
  }

  const relativeLocation = params.entry.relativeLocation;

  if (typeof relativeLocation === 'string' && relativeLocation !== '') {
    return {
      kind: 'succeeded',
      value: findExtensionsFolderName({
        folderPath: resolve(params.extensionsPath, relativeLocation),
        extensionsPath: params.extensionsPath,
      }),
    };
  }

  const location = params.entry.location;

  if (typeof location === 'string') {
    return { kind: 'succeeded', value: null };
  }

  if (!isJsonObject(location) || typeof location.path !== 'string' || !isAbsolute(location.path)) {
    return { kind: 'failed', failure: 'an entry names no folder' };
  }

  return {
    kind: 'succeeded',
    value: findExtensionsFolderName({
      folderPath: resolve(location.path),
      extensionsPath: params.extensionsPath,
    }),
  };
}

/** The lower-case name of a folder directly inside the extensions folder, else `null`. */
function findExtensionsFolderName(params: {
  folderPath: string;
  extensionsPath: AbsolutePath;
}): string | null {
  if (dirname(params.folderPath).toLowerCase() !== params.extensionsPath.toLowerCase()) {
    return null;
  }

  return basename(params.folderPath).toLowerCase();
}

/** No `.obsolete` marks nothing; `null` when it is unfit or no JSON object. */
async function loadObsoleteFolderNames(params: {
  extensionsPath: AbsolutePath;
}): Promise<Result<ReadonlySet<string> | null, ExploreFileUnreadable>> {
  const read = await loadExploreFileText({
    path: joinAbsolutePath({ parentPath: params.extensionsPath, names: [OBSOLETE_FILE_NAME] }),
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
