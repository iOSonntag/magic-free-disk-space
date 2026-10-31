import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { ToolPins } from '../projectPins/selectToolPins.js';
import type { NvmState, NvmStateInstalled } from './loadNvmState.js';
import type { NvmNodeVersion } from './parseNvmNodeVersion.js';
import { parseNvmrcPin } from './parseNvmrcPin.js';
import type { NvmPinResolution } from './resolveNvmVersionPin.js';
import { resolveNvmVersionPin } from './resolveNvmVersionPin.js';

export type NvmVersionOffer = { folderPath: AbsolutePath; version: NvmNodeVersion };

export type NvmDefaultAliasNone = { kind: 'none' };

/** The default alias names no installed folder, such as `system` or a version not installed. */
export type NvmDefaultAliasNoFolder = { kind: 'noFolder' };

export type NvmDefaultAliasVersion = { kind: 'version'; version: NvmNodeVersion };

/** What the default alias resolved to, for the evidence of an offered version. */
export type NvmDefaultAlias =
  | NvmDefaultAliasNone
  | NvmDefaultAliasNoFolder
  | NvmDefaultAliasVersion;

/** The offered versions; `isComplete` is false when a folder or a pin could not be judged. */
export type NvmVersionOffers = {
  offers: NvmVersionOffer[];
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

  // A local keeps the narrowing to `installed` inside the callbacks below.
  const state = params.state;
  const hasUnparsedFolder = state.versionFolders.some((folder) => folder.kind === 'unparsed');

  if (params.toolPins.kind === 'everyVersionPinned') {
    return { offers: [], isComplete: !hasUnparsedFolder, defaultAlias: { kind: 'none' } };
  }

  const parsedFolders = state.versionFolders.flatMap((folder) =>
    folder.kind === 'parsed' ? [folder] : [],
  );
  const versions = parsedFolders.map((folder) => folder.version);
  const defaultResolution = resolveNvmDefaultAlias({ state: state, versions: versions });
  const pinResolutions = params.toolPins.files.map((file) =>
    resolveNvmrcText({ text: file.text, state: state, versions: versions }),
  );
  const resolutions =
    defaultResolution === null ? pinResolutions : [defaultResolution, ...pinResolutions];

  if (resolutions.some((resolution) => resolution.kind === 'unresolved')) {
    return { offers: [], isComplete: false, defaultAlias: { kind: 'none' } };
  }

  const pinnedVersions = new Set(
    resolutions.flatMap((resolution) =>
      resolution.kind === 'version' ? [resolution.version] : [],
    ),
  );
  const offers = parsedFolders
    .filter((folder) => !pinnedVersions.has(folder.version))
    .map((folder) => ({ folderPath: folder.folderPath, version: folder.version }));

  return {
    offers: offers,
    isComplete: !hasUnparsedFolder,
    defaultAlias: decideNvmDefaultAlias({ resolution: defaultResolution }),
  };
}

/** `null` without a default alias file, which pins no folder. */
function resolveNvmDefaultAlias(params: {
  state: NvmStateInstalled;
  versions: NvmNodeVersion[];
}): NvmPinResolution | null {
  if (!params.state.aliases.has(DEFAULT_ALIAS_NAME)) {
    return null;
  }

  return resolveNvmVersionPin({
    pin: DEFAULT_ALIAS_NAME,
    aliases: params.state.aliases,
    versions: params.versions,
  });
}

function resolveNvmrcText(params: {
  text: string;
  state: NvmStateInstalled;
  versions: NvmNodeVersion[];
}): NvmPinResolution {
  const pin = parseNvmrcPin({ text: params.text });

  if (pin === null) {
    return { kind: 'unresolved' };
  }

  return resolveNvmVersionPin({
    pin: pin,
    aliases: params.state.aliases,
    versions: params.versions,
  });
}

function decideNvmDefaultAlias(params: { resolution: NvmPinResolution | null }): NvmDefaultAlias {
  if (params.resolution === null) {
    return { kind: 'none' };
  }

  switch (params.resolution.kind) {
    case 'version':
      return { kind: 'version', version: params.resolution.version };
    case 'noFolder':
    case 'unresolved':
      return { kind: 'noFolder' };
  }
}
