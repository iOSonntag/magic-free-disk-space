import { basename, dirname } from 'node:path';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import type { FileKind } from '../../system/loadFileIdentity.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import {
  loadExploreDirectoryEntries,
  loadExploreEntryStats,
  loadExploreFileText,
  loadExploreRealPath,
} from '../loadExploreRead.js';

/** The hub cache of the Hugging Face libraries below the home folder, unless `HF_HOME` moves it. */
export const HUGGING_FACE_HUB_PATH_NAMES = ['.cache', 'huggingface', 'hub'];

/** A repository folder of the hub cache: `<type>s--<owner>--<name>`. */
const REPO_FOLDER_NAME_PATTERN = /^(models|datasets|spaces|kernels)--.+$/;

/** A ref's file holds the full commit hash it points at. */
const COMMIT_HASH_PATTERN = /^[0-9a-f]{40}$/;

/** The folders of a repository that hold no file content and go with its current revisions. */
const REPO_METADATA_FOLDER_NAMES = ['refs', '.no_exist', 'trees'];

const REFS_FOLDER_NAME = 'refs';

const BLOBS_FOLDER_NAME = 'blobs';

const SNAPSHOTS_FOLDER_NAME = 'snapshots';

/** A blob that a download is still writing, renamed to its etag once it is complete. */
export const HUGGING_FACE_INCOMPLETE_SUFFIX = '.incomplete';

/** The folder of one revision, with the names of the repository's blobs its links reach. */
export type HuggingFaceSnapshot = {
  commit: string;
  path: AbsolutePath;
  modifiedMs: number;
  linkedBlobNames: ReadonlySet<string>;
};

/** A regular file of the repository's `blobs`; a link there, such as Xet's, is none. */
export type HuggingFaceBlob = { name: string; path: AbsolutePath; modifiedMs: number };

/** What one repository folder holds. */
export type HuggingFaceRepoState = {
  repoPath: AbsolutePath;
  folderName: string;
  /**
   * The commits its refs point at; `null` when a ref does not read as a commit or `snapshots`
   * holds what is no folder, so which revision is current cannot be told.
   */
  currentCommits: ReadonlySet<string> | null;
  snapshots: HuggingFaceSnapshot[];
  blobs: HuggingFaceBlob[];
  /** Its `refs`, `.no_exist`, and `trees`, those present. */
  metadataPaths: AbsolutePath[];
};

/** Every repository folder of the hub cache; none when the cache is absent. */
export async function loadHuggingFaceHubState(params: {
  pathRules: PathRules;
  homeDir: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<HuggingFaceRepoState[], ExploreFileUnreadable>> {
  const hubPath = joinAbsolutePath({
    rules: params.pathRules,
    parentPath: params.homeDir,
    names: HUGGING_FACE_HUB_PATH_NAMES,
  });
  const entries = await loadExploreDirectoryEntries({
    path: hubPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (entries.kind === 'failed') {
    return entries;
  }

  const repos: HuggingFaceRepoState[] = [];

  for (const entry of entries.value ?? []) {
    if (entry.kind !== 'directory' || !REPO_FOLDER_NAME_PATTERN.test(entry.name)) {
      continue;
    }

    const repo = await loadHuggingFaceRepoState({
      pathRules: params.pathRules,
      repoPath: joinAbsolutePath({
        rules: params.pathRules,
        parentPath: hubPath,
        names: [entry.name],
      }),
      privacyDenialCode: params.privacyDenialCode,
    });

    if (repo.kind === 'failed') {
      return repo;
    }

    if (repo.value !== null) {
      repos.push(repo.value);
    }
  }

  return { kind: 'succeeded', value: repos };
}

/** Reads one repository folder; `null` when it is absent or no folder. */
export async function loadHuggingFaceRepoState(params: {
  pathRules: PathRules;
  repoPath: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<HuggingFaceRepoState | null, ExploreFileUnreadable>> {
  const entries = await loadExploreDirectoryEntries({
    path: params.repoPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (entries.kind === 'failed') {
    return entries;
  }

  if (entries.value === null) {
    return { kind: 'succeeded', value: null };
  }

  const entryNames = new Set(entries.value.map((entry) => entry.name));
  const metadataPaths = REPO_METADATA_FOLDER_NAMES.filter((name) => entryNames.has(name)).map(
    (name) =>
      joinAbsolutePath({ rules: params.pathRules, parentPath: params.repoPath, names: [name] }),
  );
  const refCommits = await loadRefCommits({
    pathRules: params.pathRules,
    folderPath: joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.repoPath,
      names: [REFS_FOLDER_NAME],
    }),
    privacyDenialCode: params.privacyDenialCode,
  });

  if (refCommits.kind === 'failed') {
    return refCommits;
  }

  const blobsPath = joinAbsolutePath({
    rules: params.pathRules,
    parentPath: params.repoPath,
    names: [BLOBS_FOLDER_NAME],
  });
  const blobs = await loadBlobs({
    pathRules: params.pathRules,
    blobsPath: blobsPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (blobs.kind === 'failed') {
    return blobs;
  }

  const snapshots = await loadSnapshots({
    pathRules: params.pathRules,
    snapshotsPath: joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.repoPath,
      names: [SNAPSHOTS_FOLDER_NAME],
    }),
    blobsPath: blobsPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (snapshots.kind === 'failed') {
    return snapshots;
  }

  const isJudged = refCommits.value !== null && snapshots.value.isEveryEntryFolder;

  return {
    kind: 'succeeded',
    value: {
      repoPath: params.repoPath,
      folderName: basename(params.repoPath),
      currentCommits: isJudged ? new Set(refCommits.value) : null,
      snapshots: snapshots.value.snapshots,
      blobs: blobs.value,
      metadataPaths: metadataPaths,
    },
  };
}

/**
 * The commits of every ref file, nested ones such as a pull request's too; none without `refs`.
 * `null` when a ref is unfit or holds no commit hash.
 */
async function loadRefCommits(params: {
  pathRules: PathRules;
  folderPath: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<string[] | null, ExploreFileUnreadable>> {
  const entries = await loadExploreDirectoryEntries({
    path: params.folderPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (entries.kind === 'failed') {
    return entries;
  }

  const commits: string[] = [];

  for (const entry of entries.value ?? []) {
    const path = joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.folderPath,
      names: [entry.name],
    });
    const entryCommits = await loadRefEntryCommits({
      pathRules: params.pathRules,
      path: path,
      kind: entry.kind,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (entryCommits.kind === 'failed' || entryCommits.value === null) {
      return entryCommits;
    }

    commits.push(...entryCommits.value);
  }

  return { kind: 'succeeded', value: commits };
}

async function loadRefEntryCommits(params: {
  pathRules: PathRules;
  path: AbsolutePath;
  kind: FileKind;
  privacyDenialCode: string | null;
}): Promise<Result<string[] | null, ExploreFileUnreadable>> {
  if (params.kind === 'directory') {
    return loadRefCommits({
      pathRules: params.pathRules,
      folderPath: params.path,
      privacyDenialCode: params.privacyDenialCode,
    });
  }

  if (params.kind !== 'file') {
    return { kind: 'succeeded', value: null };
  }

  const read = await loadExploreFileText({
    path: params.path,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (read.kind === 'failed') {
    return read;
  }

  switch (read.value.kind) {
    case 'absent':
      return { kind: 'succeeded', value: [] };
    case 'unfit':
      return { kind: 'succeeded', value: null };
    case 'text': {
      const commit = read.value.text.trim();

      return { kind: 'succeeded', value: COMMIT_HASH_PATTERN.test(commit) ? [commit] : null };
    }
  }
}

async function loadBlobs(params: {
  pathRules: PathRules;
  blobsPath: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<HuggingFaceBlob[], ExploreFileUnreadable>> {
  const entries = await loadExploreDirectoryEntries({
    path: params.blobsPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (entries.kind === 'failed') {
    return entries;
  }

  const blobs: HuggingFaceBlob[] = [];

  for (const entry of entries.value ?? []) {
    if (entry.kind !== 'file') {
      continue;
    }

    const path = joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.blobsPath,
      names: [entry.name],
    });
    const stats = await loadExploreEntryStats({
      path: path,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (stats.kind === 'failed') {
      return stats;
    }

    if (stats.value !== null) {
      blobs.push({ name: entry.name, path: path, modifiedMs: stats.value.modifiedMs });
    }
  }

  return { kind: 'succeeded', value: blobs };
}

type Snapshots = { snapshots: HuggingFaceSnapshot[]; isEveryEntryFolder: boolean };

async function loadSnapshots(params: {
  pathRules: PathRules;
  snapshotsPath: AbsolutePath;
  blobsPath: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<Snapshots, ExploreFileUnreadable>> {
  const entries = await loadExploreDirectoryEntries({
    path: params.snapshotsPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (entries.kind === 'failed') {
    return entries;
  }

  const blobsRealPath = await loadExploreRealPath({
    pathRules: params.pathRules,
    path: params.blobsPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (blobsRealPath.kind === 'failed') {
    return blobsRealPath;
  }

  const snapshots: HuggingFaceSnapshot[] = [];
  let isEveryEntryFolder = true;

  for (const entry of entries.value ?? []) {
    if (entry.kind !== 'directory') {
      isEveryEntryFolder = false;

      continue;
    }

    const path = joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.snapshotsPath,
      names: [entry.name],
    });
    const stats = await loadExploreEntryStats({
      path: path,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (stats.kind === 'failed') {
      return stats;
    }

    const linkedBlobNames = new Set<string>();
    const linked = await loadLinkedBlobNames({
      pathRules: params.pathRules,
      folderPath: path,
      blobsRealPath: blobsRealPath.value,
      linkedBlobNames: linkedBlobNames,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (linked.kind === 'failed') {
      return linked;
    }

    if (stats.value !== null) {
      snapshots.push({
        commit: entry.name,
        path: path,
        modifiedMs: stats.value.modifiedMs,
        linkedBlobNames: linkedBlobNames,
      });
    }
  }

  return {
    kind: 'succeeded',
    value: { snapshots: snapshots, isEveryEntryFolder: isEveryEntryFolder },
  };
}

/**
 * Adds the name of each blob of the repository that a link below the folder resolves to, matched
 * by real paths, so the relative links the libraries write need no parse of their own.
 */
async function loadLinkedBlobNames(params: {
  pathRules: PathRules;
  folderPath: AbsolutePath;
  blobsRealPath: AbsolutePath | null;
  linkedBlobNames: Set<string>;
  privacyDenialCode: string | null;
}): Promise<Result<null, ExploreFileUnreadable>> {
  const entries = await loadExploreDirectoryEntries({
    path: params.folderPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (entries.kind === 'failed') {
    return entries;
  }

  for (const entry of entries.value ?? []) {
    const path = joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.folderPath,
      names: [entry.name],
    });

    if (entry.kind === 'directory') {
      const below = await loadLinkedBlobNames({ ...params, folderPath: path });

      if (below.kind === 'failed') {
        return below;
      }

      continue;
    }

    if (entry.kind !== 'symbolicLink' || params.blobsRealPath === null) {
      continue;
    }

    const realPath = await loadExploreRealPath({
      pathRules: params.pathRules,
      path: path,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (realPath.kind === 'failed') {
      return realPath;
    }

    if (realPath.value !== null && dirname(realPath.value) === params.blobsRealPath) {
      params.linkedBlobNames.add(basename(realPath.value));
    }
  }

  return { kind: 'succeeded', value: null };
}
