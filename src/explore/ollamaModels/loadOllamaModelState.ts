import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import {
  loadExploreDirectoryEntries,
  loadExploreEntryStats,
  loadExploreFileText,
} from '../loadExploreRead.js';
import {
  OLLAMA_BLOBS_FOLDER_NAME,
  OLLAMA_MANIFEST_FOLDER_NAMES,
  OLLAMA_MODELS_PATH_NAMES,
} from './ollamaModelsRoot.js';
import { parseOllamaManifestDigests } from './parseOllamaManifestDigests.js';
import type { OllamaModelName } from './parseOllamaModelName.js';
import { parseOllamaModelName } from './parseOllamaModelName.js';

/** A manifest's path below its manifests folder: `<host>/<namespace>/<model>/<tag>`. */
const MANIFEST_PATH_NAME_COUNT = 4;

/** A blob file as Ollama names it, the digest with `-` in place of `:`. */
const BLOB_FILE_NAME_PATTERN = /^sha256-[0-9a-f]{64}$/;

/** One manifest of a model's tag, with the digests of the blobs it names. */
export type OllamaManifest = {
  name: OllamaModelName;
  path: AbsolutePath;
  modifiedMs: number;
  /** `null` when it is too large to read or does not parse, so the blobs it names are unknown. */
  digests: string[] | null;
};

/** Neither manifests folder exists, so Ollama holds no model. */
export type OllamaModelStateNoModels = { kind: 'noModels' };

export type OllamaModelStateInstalled = {
  kind: 'installed';
  manifests: OllamaManifest[];
  /**
   * Whether every entry of the manifests folders sits where Ollama puts a manifest; a stray link,
   * file, or folder may hold a manifest the probe cannot read as one.
   */
  isEveryEntryKnown: boolean;
  /** The regular blob files by their digest, `sha256:<hex>`; a link or a partial file is none. */
  blobPaths: ReadonlyMap<string, AbsolutePath>;
};

/** What the reads of Ollama's manifests and blobs found. */
export type OllamaModelState = OllamaModelStateNoModels | OllamaModelStateInstalled;

type ManifestFile = { name: OllamaModelName; path: AbsolutePath };

type ManifestFiles = { files: ManifestFile[]; isEveryEntryKnown: boolean };

/**
 * Reads every manifest of both layouts and the names of the blobs, for the probe and the recheck
 * of its units. Dot names are Ollama's temporary files and are skipped.
 */
export async function loadOllamaModelState(params: {
  pathRules: PathRules;
  homeDir: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<OllamaModelState, ExploreFileUnreadable>> {
  const modelsPath = joinAbsolutePath({
    rules: params.pathRules,
    parentPath: params.homeDir,
    names: OLLAMA_MODELS_PATH_NAMES,
  });
  const manifestFiles: ManifestFile[] = [];
  let isEveryEntryKnown = true;
  let isAnyManifestFolderPresent = false;

  for (const folderName of OLLAMA_MANIFEST_FOLDER_NAMES) {
    const found = await loadManifestFiles({
      pathRules: params.pathRules,
      folderPath: joinAbsolutePath({
        rules: params.pathRules,
        parentPath: modelsPath,
        names: [folderName],
      }),
      pathNames: [],
      privacyDenialCode: params.privacyDenialCode,
    });

    if (found.kind === 'failed') {
      return found;
    }

    if (found.value !== null) {
      isAnyManifestFolderPresent = true;
      isEveryEntryKnown = isEveryEntryKnown && found.value.isEveryEntryKnown;
      manifestFiles.push(...found.value.files);
    }
  }

  if (!isAnyManifestFolderPresent) {
    return { kind: 'succeeded', value: { kind: 'noModels' } };
  }

  const manifests = await loadManifests({
    files: manifestFiles,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (manifests.kind === 'failed') {
    return manifests;
  }

  const blobPaths = await loadBlobPaths({
    pathRules: params.pathRules,
    blobsPath: joinAbsolutePath({
      rules: params.pathRules,
      parentPath: modelsPath,
      names: [OLLAMA_BLOBS_FOLDER_NAME],
    }),
    privacyDenialCode: params.privacyDenialCode,
  });

  if (blobPaths.kind === 'failed') {
    return blobPaths;
  }

  return {
    kind: 'succeeded',
    value: {
      kind: 'installed',
      manifests: manifests.value,
      isEveryEntryKnown: isEveryEntryKnown,
      blobPaths: blobPaths.value,
    },
  };
}

/**
 * The manifest files below `folderPath`, which lies `pathNames` deep in a manifests folder; `null`
 * when the folder is absent.
 */
async function loadManifestFiles(params: {
  pathRules: PathRules;
  folderPath: AbsolutePath;
  pathNames: string[];
  privacyDenialCode: string | null;
}): Promise<Result<ManifestFiles | null, ExploreFileUnreadable>> {
  const entries = await loadExploreDirectoryEntries({
    path: params.folderPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (entries.kind === 'failed') {
    return entries;
  }

  if (entries.value === null) {
    return { kind: 'succeeded', value: null };
  }

  const isTagLevel = params.pathNames.length === MANIFEST_PATH_NAME_COUNT - 1;
  const files: ManifestFile[] = [];
  let isEveryEntryKnown = true;

  for (const entry of entries.value) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const pathNames = [...params.pathNames, entry.name];
    const path = joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.folderPath,
      names: [entry.name],
    });

    if (isTagLevel) {
      const name = parseOllamaModelName({ pathNames: pathNames });

      if (entry.kind === 'file' && name !== null) {
        files.push({ name: name, path: path });
      } else {
        isEveryEntryKnown = false;
      }

      continue;
    }

    if (entry.kind !== 'directory') {
      isEveryEntryKnown = false;

      continue;
    }

    const below = await loadManifestFiles({
      pathRules: params.pathRules,
      folderPath: path,
      pathNames: pathNames,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (below.kind === 'failed') {
      return below;
    }

    if (below.value === null) {
      continue;
    }

    files.push(...below.value.files);
    isEveryEntryKnown = isEveryEntryKnown && below.value.isEveryEntryKnown;
  }

  return { kind: 'succeeded', value: { files: files, isEveryEntryKnown: isEveryEntryKnown } };
}

/** Reads each manifest's time and digests; one that vanished since its folder was listed is none. */
async function loadManifests(params: {
  files: ManifestFile[];
  privacyDenialCode: string | null;
}): Promise<Result<OllamaManifest[], ExploreFileUnreadable>> {
  const manifests: OllamaManifest[] = [];

  for (const file of params.files) {
    const stats = await loadExploreEntryStats({
      path: file.path,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (stats.kind === 'failed') {
      return stats;
    }

    const read = await loadExploreFileText({
      path: file.path,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (read.kind === 'failed') {
      return read;
    }

    if (stats.value === null || read.value.kind === 'absent') {
      continue;
    }

    manifests.push({
      name: file.name,
      path: file.path,
      modifiedMs: stats.value.modifiedMs,
      digests: read.value.kind === 'text' ? parseDigests({ text: read.value.text }) : null,
    });
  }

  return { kind: 'succeeded', value: manifests };
}

function parseDigests(params: { text: string }): string[] | null {
  const digests = parseOllamaManifestDigests({ text: params.text });

  return digests.kind === 'succeeded' ? digests.value : null;
}

/** The regular files of the blobs folder named as blobs, by digest; none when it is absent. */
async function loadBlobPaths(params: {
  pathRules: PathRules;
  blobsPath: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<ReadonlyMap<string, AbsolutePath>, ExploreFileUnreadable>> {
  const entries = await loadExploreDirectoryEntries({
    path: params.blobsPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (entries.kind === 'failed') {
    return entries;
  }

  const blobPaths = new Map<string, AbsolutePath>();

  for (const entry of entries.value ?? []) {
    if (entry.kind !== 'file' || !BLOB_FILE_NAME_PATTERN.test(entry.name)) {
      continue;
    }

    blobPaths.set(
      entry.name.replace('-', ':'),
      joinAbsolutePath({
        rules: params.pathRules,
        parentPath: params.blobsPath,
        names: [entry.name],
      }),
    );
  }

  return { kind: 'succeeded', value: blobPaths };
}
