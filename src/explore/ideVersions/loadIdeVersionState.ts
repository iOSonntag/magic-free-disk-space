import type { EnvironmentFolders } from '../../environment/buildEnvironment.js';
import { resolveEnvironmentLocation } from '../../environment/environmentLocation.js';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import type { IdeVersionRoots } from '../explorePlatform.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import { loadExploreDirectoryEntries, loadExploreFolderNames } from '../loadExploreRead.js';

/**
 * A version folder's name, the IDE's `dataDirectoryName`: the product without spaces, then its
 * version, such as `IntelliJIdea2024.1` or `AndroidStudio2024.2`.
 */
const VERSION_FOLDER_NAME_PATTERN = /^([A-Za-z]+)(\d+(?:\.\d+)+)$/;

/** The folder of a version's settings that holds the plugins installed for it. */
const IDE_PLUGINS_FOLDER_NAME = 'plugins';

/** A version's folder of caches or of logs. */
export type IdeVersionFolderPlain = {
  kind: 'caches' | 'logs';
  product: string;
  version: string;
  path: AbsolutePath;
};

/** A version's settings folder, with its plugins folder apart from its other entries. */
export type IdeVersionFolderSettings = {
  kind: 'settings';
  product: string;
  version: string;
  path: AbsolutePath;
  pluginsPath: AbsolutePath | null;
  /** Its files and folders but `plugins`; a link is never one. */
  otherPaths: AbsolutePath[];
};

export type IdeVersionFolder = IdeVersionFolderPlain | IdeVersionFolderSettings;

/** Reads every version folder of every root, for the probe and the recheck of its units. */
export async function loadIdeVersionState(params: {
  environment: EnvironmentFolders;
  roots: IdeVersionRoots;
  privacyDenialCode: string | null;
}): Promise<Result<IdeVersionFolder[], ExploreFileUnreadable>> {
  const folders: IdeVersionFolder[] = [];
  const kinds: (keyof IdeVersionRoots)[] = ['caches', 'logs', 'settings'];

  for (const kind of kinds) {
    for (const root of params.roots[kind]) {
      const rootFolders = await loadRootFolders({
        pathRules: params.environment.pathRules,
        rootPath: resolveEnvironmentLocation({ folders: params.environment, location: root }),
        kind: kind,
        privacyDenialCode: params.privacyDenialCode,
      });

      if (rootFolders.kind === 'failed') {
        return rootFolders;
      }

      folders.push(...rootFolders.value);
    }
  }

  return { kind: 'succeeded', value: folders };
}

async function loadRootFolders(params: {
  pathRules: PathRules;
  rootPath: AbsolutePath;
  kind: keyof IdeVersionRoots;
  privacyDenialCode: string | null;
}): Promise<Result<IdeVersionFolder[], ExploreFileUnreadable>> {
  const names = await loadExploreFolderNames({
    path: params.rootPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (names.kind === 'failed') {
    return names;
  }

  const folders: IdeVersionFolder[] = [];

  for (const name of names.value?.folderNames ?? []) {
    const match = VERSION_FOLDER_NAME_PATTERN.exec(name);
    const product = match?.[1];
    const version = match?.[2];

    if (product === undefined || version === undefined) {
      continue;
    }

    const path = joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.rootPath,
      names: [name],
    });

    if (params.kind !== 'settings') {
      folders.push({ kind: params.kind, product: product, version: version, path: path });

      continue;
    }

    const settings = await loadSettingsFolder({
      pathRules: params.pathRules,
      product: product,
      version: version,
      path: path,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (settings.kind === 'failed') {
      return settings;
    }

    if (settings.value !== null) {
      folders.push(settings.value);
    }
  }

  return { kind: 'succeeded', value: folders };
}

async function loadSettingsFolder(params: {
  pathRules: PathRules;
  product: string;
  version: string;
  path: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<IdeVersionFolderSettings | null, ExploreFileUnreadable>> {
  const entries = await loadExploreDirectoryEntries({
    path: params.path,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (entries.kind === 'failed') {
    return entries;
  }

  if (entries.value === null) {
    return { kind: 'succeeded', value: null };
  }

  const pluginsEntry = entries.value.find(
    (entry) => entry.name === IDE_PLUGINS_FOLDER_NAME && entry.kind === 'directory',
  );
  const otherPaths = entries.value
    .filter(
      (entry) =>
        entry.name !== IDE_PLUGINS_FOLDER_NAME &&
        (entry.kind === 'file' || entry.kind === 'directory'),
    )
    .map((entry) =>
      joinAbsolutePath({ rules: params.pathRules, parentPath: params.path, names: [entry.name] }),
    );

  return {
    kind: 'succeeded',
    value: {
      kind: 'settings',
      product: params.product,
      version: params.version,
      path: params.path,
      pluginsPath:
        pluginsEntry === undefined
          ? null
          : joinAbsolutePath({
              rules: params.pathRules,
              parentPath: params.path,
              names: [IDE_PLUGINS_FOLDER_NAME],
            }),
      otherPaths: otherPaths,
    },
  };
}
