import { compareDottedVersions } from '../compareDottedVersions.js';
import type { NvmAliases } from './loadNvmState.js';
import { parseNvmAliasText } from './parseNvmAliasText.js';
import type { NvmNodeVersion } from './parseNvmNodeVersion.js';

/** The pin names this installed version, the one nvm would use. */
export type NvmPinResolutionVersion = { kind: 'version'; version: NvmNodeVersion };

/** The pin names no installed folder: `system`, `iojs`, or a version nvm would install anew. */
export type NvmPinResolutionNoFolder = { kind: 'noFolder' };

/** The pin names something this reader cannot follow, so it may name any installed version. */
export type NvmPinResolutionUnresolved = { kind: 'unresolved' };

export type NvmPinResolution =
  | NvmPinResolutionVersion
  | NvmPinResolutionNoFolder
  | NvmPinResolutionUnresolved;

const MAX_ALIAS_HOPS = 8;

// `v` is optional, as nvm adds it; one to three groups, as `22`, `v24.19`, or `20.11.1`.
const VERSION_PATTERN = /^v?(\d+(\.\d+){0,2})$/;

const NO_FOLDER_NAMES = ['system', 'iojs'];

const NEWEST_VERSION_NAME_BEFORE_ALIASES = 'node';

const NEWEST_VERSION_NAME_WITHOUT_ALIAS = 'stable';

/**
 * What a pin of nvm resolves to among the installed `versions`, as nvm resolves it: `system`,
 * `iojs`, and `node` first, then the alias file of the name, at most 8 hops, and only without one
 * `stable` or the newest installed version a version matches.
 */
export function resolveNvmVersionPin(params: {
  pin: string;
  aliases: NvmAliases;
  versions: NvmNodeVersion[];
}): NvmPinResolution {
  return resolveNvmPinName({
    name: params.pin,
    aliases: params.aliases,
    versions: params.versions,
    followedAliasNames: [],
  });
}

function resolveNvmPinName(params: {
  name: string;
  aliases: NvmAliases;
  versions: NvmNodeVersion[];
  followedAliasNames: string[];
}): NvmPinResolution {
  // nvm reads `system`, `iojs`, and `node` before any alias file, and any other name's alias
  // file before the name as a version.
  if (NO_FOLDER_NAMES.includes(params.name)) {
    return { kind: 'noFolder' };
  }

  if (params.name === NEWEST_VERSION_NAME_BEFORE_ALIASES) {
    return selectNewestNvmVersion({ versions: params.versions });
  }

  const aliasFile = params.aliases.get(params.name);

  if (aliasFile === undefined) {
    return resolveNvmVersionName({ name: params.name, versions: params.versions });
  }

  if (
    params.followedAliasNames.length === MAX_ALIAS_HOPS ||
    params.followedAliasNames.includes(params.name)
  ) {
    return { kind: 'unresolved' };
  }

  if (aliasFile.kind === 'unfit') {
    return { kind: 'unresolved' };
  }

  const target = parseNvmAliasText({ text: aliasFile.text });

  if (target === null) {
    return { kind: 'unresolved' };
  }

  return resolveNvmPinName({
    ...params,
    name: target,
    followedAliasNames: [...params.followedAliasNames, params.name],
  });
}

/**
 * The resolution of a name that has no alias file: `stable` or a version to the newest installed
 * one it matches; any other name does not resolve.
 */
function resolveNvmVersionName(params: {
  name: string;
  versions: NvmNodeVersion[];
}): NvmPinResolution {
  if (params.name === NEWEST_VERSION_NAME_WITHOUT_ALIAS) {
    return selectNewestNvmVersion({ versions: params.versions });
  }

  const versionMatch = VERSION_PATTERN.exec(params.name);

  if (versionMatch === null) {
    return { kind: 'unresolved' };
  }

  const pinGroups = (versionMatch[1] ?? '').split('.');
  const matching = params.versions.filter((version) => {
    const versionGroups = version.slice(1).split('.');

    return pinGroups.every((group, index) => versionGroups[index] === group);
  });

  return selectNewestNvmVersion({ versions: matching });
}

function selectNewestNvmVersion(params: { versions: NvmNodeVersion[] }): NvmPinResolution {
  const newest = params.versions
    .toSorted((left, right) => compareDottedVersions(left.slice(1), right.slice(1)))
    .at(-1);

  if (newest === undefined) {
    return { kind: 'noFolder' };
  }

  return { kind: 'version', version: newest };
}
