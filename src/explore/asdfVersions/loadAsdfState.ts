import { basename, dirname } from 'node:path';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import {
  loadExploreFileText,
  loadExploreFolderNames,
  loadExploreRealPath,
} from '../loadExploreRead.js';
import { ASDF_INSTALLS_PATH_NAMES } from './asdfInstallsRoot.js';
import type { AsdfToolName, AsdfToolVersion } from './parseAsdfInstallNames.js';
import { parseAsdfToolName, parseAsdfToolVersion } from './parseAsdfInstallNames.js';
import { isAsdfLegacyVersionFileOn } from './parseAsdfrcText.js';

/** A folder `~/.asdf/installs/<tool>/<version>` whose tool and version names their makers accept. */
export type AsdfVersionFolderParsed = {
  kind: 'parsed';
  folderPath: AbsolutePath;
  asdfToolName: AsdfToolName;
  version: AsdfToolVersion;
};

/** A tool or version folder whose name its maker refuses, so its versions cannot be judged. */
export type AsdfVersionFolderUnparsed = { kind: 'unparsed'; folderPath: AbsolutePath };

export type AsdfVersionFolder = AsdfVersionFolderParsed | AsdfVersionFolderUnparsed;

/** A link in `installs/<tool>/` whose real path is the version folder `folderName` beside it. */
export type AsdfVersionLink = { asdfToolName: AsdfToolName; linkName: string; folderName: string };

/** Whether `~/.asdfrc` sets `legacy_version_file` to `yes`; `unknown` when the file is unfit. */
export type AsdfLegacyVersionFile = 'off' | 'on' | 'unknown';

/** `~/.asdf/installs` does not exist, so no version is installed. */
export type AsdfStateNoInstalls = { kind: 'noInstalls' };

export type AsdfStateInstalled = {
  kind: 'installed';
  folders: AsdfVersionFolder[];
  links: AsdfVersionLink[];
  legacyVersionFile: AsdfLegacyVersionFile;
};

export type AsdfState = AsdfStateNoInstalls | AsdfStateInstalled;

type AsdfToolFolderState = { folders: AsdfVersionFolder[]; links: AsdfVersionLink[] };

const ASDFRC_FILE_NAME = '.asdfrc';

/**
 * Reads asdf's version folders, the links beside them, and `legacy_version_file`, for the probe and
 * the recheck of its units. A read that is absent or unfit is a fact of the state; only a failed
 * read fails.
 */
export async function loadAsdfState(params: {
  homeDir: AbsolutePath;
}): Promise<Result<AsdfState, ExploreFileUnreadable>> {
  const installsPath = joinAbsolutePath({
    parentPath: params.homeDir,
    names: ASDF_INSTALLS_PATH_NAMES,
  });
  const toolNames = await loadExploreFolderNames({ path: installsPath });

  if (toolNames.kind === 'failed') {
    return toolNames;
  }

  if (toolNames.value === null) {
    return { kind: 'succeeded', value: { kind: 'noInstalls' } };
  }

  const folders: AsdfVersionFolder[] = [];
  const links: AsdfVersionLink[] = [];

  for (const toolFolderName of toolNames.value.folderNames) {
    const toolFolder = await loadAsdfToolFolder({
      toolPath: joinAbsolutePath({ parentPath: installsPath, names: [toolFolderName] }),
      toolFolderName: toolFolderName,
    });

    if (toolFolder.kind === 'failed') {
      return toolFolder;
    }

    folders.push(...toolFolder.value.folders);
    links.push(...toolFolder.value.links);
  }

  const legacyVersionFile = await loadAsdfLegacyVersionFile({ homeDir: params.homeDir });

  if (legacyVersionFile.kind === 'failed') {
    return legacyVersionFile;
  }

  return {
    kind: 'succeeded',
    value: {
      kind: 'installed',
      folders: folders,
      links: links,
      legacyVersionFile: legacyVersionFile.value,
    },
  };
}

async function loadAsdfToolFolder(params: {
  toolPath: AbsolutePath;
  toolFolderName: string;
}): Promise<Result<AsdfToolFolderState, ExploreFileUnreadable>> {
  const asdfToolName = parseAsdfToolName({ folderName: params.toolFolderName });

  if (asdfToolName.kind === 'failed') {
    return {
      kind: 'succeeded',
      value: { folders: [{ kind: 'unparsed', folderPath: params.toolPath }], links: [] },
    };
  }

  const versionNames = await loadExploreFolderNames({ path: params.toolPath });

  if (versionNames.kind === 'failed') {
    return versionNames;
  }

  if (versionNames.value === null) {
    return { kind: 'succeeded', value: { folders: [], links: [] } };
  }

  const folders = versionNames.value.folderNames.map((folderName) =>
    buildAsdfVersionFolder({
      folderPath: joinAbsolutePath({ parentPath: params.toolPath, names: [folderName] }),
      asdfToolName: asdfToolName.value,
      folderName: folderName,
    }),
  );
  const links = await loadAsdfVersionLinks({
    toolPath: params.toolPath,
    asdfToolName: asdfToolName.value,
    folderNames: versionNames.value.folderNames,
    linkNames: versionNames.value.linkNames,
  });

  if (links.kind === 'failed') {
    return links;
  }

  return { kind: 'succeeded', value: { folders: folders, links: links.value } };
}

function buildAsdfVersionFolder(params: {
  folderPath: AbsolutePath;
  asdfToolName: AsdfToolName;
  folderName: string;
}): AsdfVersionFolder {
  const version = parseAsdfToolVersion({ folderName: params.folderName });

  if (version.kind === 'failed') {
    return { kind: 'unparsed', folderPath: params.folderPath };
  }

  return {
    kind: 'parsed',
    folderPath: params.folderPath,
    asdfToolName: params.asdfToolName,
    version: version.value,
  };
}

/** The links whose real path is a version folder of the same tool; any other link pins nothing. */
async function loadAsdfVersionLinks(params: {
  toolPath: AbsolutePath;
  asdfToolName: AsdfToolName;
  folderNames: string[];
  linkNames: string[];
}): Promise<Result<AsdfVersionLink[], ExploreFileUnreadable>> {
  if (params.linkNames.length === 0) {
    return { kind: 'succeeded', value: [] };
  }

  const toolRealPath = await loadExploreRealPath({ path: params.toolPath });

  if (toolRealPath.kind === 'failed') {
    return toolRealPath;
  }

  if (toolRealPath.value === null) {
    return { kind: 'succeeded', value: [] };
  }

  const links: AsdfVersionLink[] = [];

  for (const linkName of params.linkNames) {
    const linkRealPath = await loadExploreRealPath({
      path: joinAbsolutePath({ parentPath: params.toolPath, names: [linkName] }),
    });

    if (linkRealPath.kind === 'failed') {
      return linkRealPath;
    }

    if (linkRealPath.value === null || dirname(linkRealPath.value) !== toolRealPath.value) {
      continue;
    }

    const folderName = basename(linkRealPath.value);

    if (params.folderNames.includes(folderName)) {
      links.push({ asdfToolName: params.asdfToolName, linkName: linkName, folderName: folderName });
    }
  }

  return { kind: 'succeeded', value: links };
}

async function loadAsdfLegacyVersionFile(params: {
  homeDir: AbsolutePath;
}): Promise<Result<AsdfLegacyVersionFile, ExploreFileUnreadable>> {
  const asdfrc = await loadExploreFileText({
    path: joinAbsolutePath({ parentPath: params.homeDir, names: [ASDFRC_FILE_NAME] }),
  });

  if (asdfrc.kind === 'failed') {
    return asdfrc;
  }

  switch (asdfrc.value.kind) {
    case 'absent':
      return { kind: 'succeeded', value: 'off' };
    case 'unfit':
      return { kind: 'succeeded', value: 'unknown' };
    case 'text':
      return {
        kind: 'succeeded',
        value: isAsdfLegacyVersionFileOn({ text: asdfrc.value.text }) ? 'on' : 'off',
      };
  }
}
