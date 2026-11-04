import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import type { ExploreFileReadText, ExploreFileReadUnfit } from '../loadExploreRead.js';
import {
  loadExploreDirectoryEntries,
  loadExploreFileText,
  loadExploreFolderNames,
} from '../loadExploreRead.js';
import { NVM_ALIAS_PATH_NAMES, NVM_NODE_VERSIONS_PATH_NAMES } from './nvmVersionsRoot.js';
import type { NvmNodeVersion } from './parseNvmNodeVersion.js';
import { parseNvmNodeVersion } from './parseNvmNodeVersion.js';

export type NvmVersionFolderParsed = {
  kind: 'parsed';
  folderPath: AbsolutePath;
  version: NvmNodeVersion;
};

/** A folder whose name `parseNvmNodeVersion` refuses, such as `v22.0.0-nightly`; never offered. */
export type NvmVersionFolderUnparsed = { kind: 'unparsed'; folderPath: AbsolutePath };

export type NvmVersionFolder = NvmVersionFolderParsed | NvmVersionFolderUnparsed;

export type NvmAliasFile = ExploreFileReadText | ExploreFileReadUnfit;

/** The alias files by their name below `~/.nvm/alias`, such as `default` or `lts/iron`, unparsed. */
export type NvmAliases = ReadonlyMap<string, NvmAliasFile>;

/** `~/.nvm/versions/node` does not exist, so no version is installed. */
export type NvmStateNoVersions = { kind: 'noVersions' };

export type NvmStateInstalled = {
  kind: 'installed';
  versionFolders: NvmVersionFolder[];
  aliases: NvmAliases;
};

export type NvmState = NvmStateNoVersions | NvmStateInstalled;

/**
 * Reads nvm's version folders and every alias file once, for the probe and the recheck of its
 * units. A missing alias folder or file is no alias; only a failed read fails.
 */
export async function loadNvmState(params: {
  pathRules: PathRules;
  homeDir: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<NvmState, ExploreFileUnreadable>> {
  const versionsPath = joinAbsolutePath({
    rules: params.pathRules,
    parentPath: params.homeDir,
    names: NVM_NODE_VERSIONS_PATH_NAMES,
  });
  const names = await loadExploreFolderNames({
    path: versionsPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (names.kind === 'failed') {
    return names;
  }

  if (names.value === null) {
    return { kind: 'succeeded', value: { kind: 'noVersions' } };
  }

  const aliases = await loadNvmAliasFolder({
    pathRules: params.pathRules,
    folderPath: joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.homeDir,
      names: NVM_ALIAS_PATH_NAMES,
    }),
    namePrefix: '',
    privacyDenialCode: params.privacyDenialCode,
  });

  if (aliases.kind === 'failed') {
    return aliases;
  }

  const versionFolders = names.value.folderNames.map((folderName) =>
    buildNvmVersionFolder({
      pathRules: params.pathRules,
      versionsPath: versionsPath,
      folderName: folderName,
    }),
  );

  return {
    kind: 'succeeded',
    value: { kind: 'installed', versionFolders: versionFolders, aliases: new Map(aliases.value) },
  };
}

function buildNvmVersionFolder(params: {
  pathRules: PathRules;
  versionsPath: AbsolutePath;
  folderName: string;
}): NvmVersionFolder {
  const folderPath = joinAbsolutePath({
    rules: params.pathRules,
    parentPath: params.versionsPath,
    names: [params.folderName],
  });
  const version = parseNvmNodeVersion({ folderName: params.folderName });

  if (version.kind === 'failed') {
    return { kind: 'unparsed', folderPath: folderPath };
  }

  return { kind: 'parsed', folderPath: folderPath, version: version.value };
}

type NvmAliasEntry = [aliasName: string, file: NvmAliasFile];

/** Every alias file below `folderPath`, its subfolders such as `lts/` included; none when it is missing. */
async function loadNvmAliasFolder(params: {
  pathRules: PathRules;
  folderPath: AbsolutePath;
  namePrefix: string;
  privacyDenialCode: string | null;
}): Promise<Result<NvmAliasEntry[], ExploreFileUnreadable>> {
  const entries = await loadExploreDirectoryEntries({
    path: params.folderPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (entries.kind === 'failed') {
    return entries;
  }

  const aliases: NvmAliasEntry[] = [];

  for (const entry of entries.value ?? []) {
    const entryPath = joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.folderPath,
      names: [entry.name],
    });
    const aliasName = `${params.namePrefix}${entry.name}`;
    const loaded =
      entry.kind === 'directory'
        ? await loadNvmAliasFolder({
            pathRules: params.pathRules,
            folderPath: entryPath,
            namePrefix: `${aliasName}/`,
            privacyDenialCode: params.privacyDenialCode,
          })
        : await loadNvmAliasFile({
            path: entryPath,
            aliasName: aliasName,
            privacyDenialCode: params.privacyDenialCode,
          });

    if (loaded.kind === 'failed') {
      return loaded;
    }

    aliases.push(...loaded.value);
  }

  return { kind: 'succeeded', value: aliases };
}

/** The alias file as one entry, or none when it is gone. */
async function loadNvmAliasFile(params: {
  path: AbsolutePath;
  aliasName: string;
  privacyDenialCode: string | null;
}): Promise<Result<NvmAliasEntry[], ExploreFileUnreadable>> {
  const file = await loadExploreFileText({
    path: params.path,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (file.kind === 'failed') {
    return file;
  }

  switch (file.value.kind) {
    case 'absent':
      return { kind: 'succeeded', value: [] };
    case 'unfit':
    case 'text':
      return { kind: 'succeeded', value: [[params.aliasName, file.value]] };
  }
}
