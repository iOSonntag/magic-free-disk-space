import type { ToolPins } from '../projectPins/selectToolPins.js';
import type { NvmAliases, NvmState, NvmVersionFolderParsed } from './loadNvmState.js';
import type { NvmNodeVersion } from './parseNvmNodeVersion.js';
import { parseNvmrcPin } from './parseNvmrcPin.js';
import type {
  NvmPinResolution,
  NvmPinResolutionNoFolder,
  NvmPinResolutionUnresolved,
  NvmPinResolutionVersion,
} from './resolveNvmVersionPin.js';
import { resolveNvmVersionPin } from './resolveNvmVersionPin.js';

export type NvmDefaultAliasNone = { kind: 'none' };

/** What the default alias resolved to, for the evidence of an offered version. */
export type NvmDefaultAlias =
  | NvmDefaultAliasNone
  | NvmPinResolutionNoFolder
  | NvmPinResolutionVersion;

/** The offered versions; `isComplete` is false when a folder or a pin could not be judged. */
export type NvmVersionOffers = {
  offers: NvmVersionFolderParsed[];
  isComplete: boolean;
  defaultAlias: NvmDefaultAlias;
};

const DEFAULT_ALIAS_NAME = 'default';

/**
 * The version folders that neither the default alias nor any `.nvmrc` resolves to. A pin that
 * does not resolve holds back every folder, and a folder with a refused name is never offered.
 */
export function decideNvmVersionOffers(params: {
  state: NvmState;
  toolPins: ToolPins;
}): NvmVersionOffers {
  if (params.state.kind === 'noVersions') {
    return { offers: [], isComplete: true, defaultAlias: { kind: 'none' } };
  }

  const hasUnparsedFolder = params.state.versionFolders.some(
    (folder) => folder.kind === 'unparsed',
  );

  if (params.toolPins.kind === 'everyVersionPinned') {
    return { offers: [], isComplete: !hasUnparsedFolder, defaultAlias: { kind: 'none' } };
  }

  const aliases = params.state.aliases;
  const parsedFolders = params.state.versionFolders.flatMap((folder) =>
    folder.kind === 'parsed' ? [folder] : [],
  );
  const versions = parsedFolders.map((folder) => folder.version);
  const defaultResolution = resolveNvmDefaultAlias({ aliases: aliases, versions: versions });
  const pinResolutions = params.toolPins.files.map((file) =>
    resolveNvmrcText({ text: file.text, aliases: aliases, versions: versions }),
  );
  const resolutions = [defaultResolution, ...pinResolutions];

  if (resolutions.some((resolution) => resolution.kind === 'unresolved')) {
    return { offers: [], isComplete: false, defaultAlias: { kind: 'none' } };
  }

  const pinnedVersions = new Set(
    resolutions.flatMap((resolution) =>
      resolution.kind === 'version' ? [resolution.version] : [],
    ),
  );

  return {
    offers: parsedFolders.filter((folder) => !pinnedVersions.has(folder.version)),
    isComplete: !hasUnparsedFolder,
    defaultAlias: decideNvmDefaultAlias({ resolution: defaultResolution }),
  };
}

function resolveNvmDefaultAlias(params: {
  aliases: NvmAliases;
  versions: NvmNodeVersion[];
}): NvmDefaultAlias | NvmPinResolutionUnresolved {
  if (!params.aliases.has(DEFAULT_ALIAS_NAME)) {
    return { kind: 'none' };
  }

  return resolveNvmVersionPin({
    pin: DEFAULT_ALIAS_NAME,
    aliases: params.aliases,
    versions: params.versions,
  });
}

function resolveNvmrcText(params: {
  text: string;
  aliases: NvmAliases;
  versions: NvmNodeVersion[];
}): NvmPinResolution {
  const pin = parseNvmrcPin({ text: params.text });

  if (pin === null) {
    return { kind: 'unresolved' };
  }

  return resolveNvmVersionPin({
    pin: pin,
    aliases: params.aliases,
    versions: params.versions,
  });
}

function decideNvmDefaultAlias(params: {
  resolution: NvmDefaultAlias | NvmPinResolutionUnresolved;
}): NvmDefaultAlias {
  switch (params.resolution.kind) {
    case 'none':
    case 'noFolder':
    case 'version':
      return params.resolution;
    case 'unresolved':
      return { kind: 'noFolder' };
  }
}
