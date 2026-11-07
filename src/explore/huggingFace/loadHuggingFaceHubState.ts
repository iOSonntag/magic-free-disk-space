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
import type { HuggingFaceRepoName } from './parseHuggingFaceRepoFolderName.js';
import { parseHuggingFaceRepoFolderName } from './parseHuggingFaceRepoFolderName.js';

/** The hub cache of the Hugging Face libraries below the home folder, unless `HF_HOME` moves it. */
const HUGGING_FACE_HUB_PATH_NAMES = ['.cache', 'huggingface', 'hub'];

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

/** A regular file of the repository's `blobs`; a link there is none. */
export type HuggingFaceBlob = { name: string; path: AbsolutePath; modifiedMs: number };

/** What one repository folder holds. */
export type HuggingFaceRepoState = {
  repoPath: AbsolutePath;
  name: HuggingFaceRepoName;
  /**
   * The commits its refs point at; `null` when a ref does not read as a commit or `snapshots`
   * holds what is no folder, so which revision is current cannot be told.
   */
  currentCommits: ReadonlySet<string> | null;
  snapshots: HuggingFaceSnapshot[];
  blobs: HuggingFaceBlob[];
  /** The entries of its `blobs` that are links; no offer takes them, nor what they reach. */
  linkedBlobCount: number;
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
    if (entry.kind !== 'directory') {
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

/**
 * Reads one repository folder; `null` when it is absent, no folder, or named as no repository, which
 * the libraries keep beside them, such as `.locks`.
 */
export async function loadHuggingFaceRepoState(params: {
  pathRules: PathRules;
  repoPath: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<HuggingFaceRepoState | null, ExploreFileUnreadable>> {
  const repoName = parseHuggingFaceRepoFolderName(basename(params.repoPath));

  if (repoName === null) {
    return { kind: 'succeeded', value: null };
  }

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
      name: repoName,
      currentCommits: isJudged ? new Set(refCommits.value) : null,
      snapshots: snapshots.value.snapshots,
      blobs: blobs.value.blobs,
      linkedBlobCount: blobs.value.linkedBlobCount,
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

type RepoBlobs = { blobs: HuggingFaceBlob[]; linkedBlobCount: number };

async function loadBlobs(params: {
  pathRules: PathRules;
  blobsPath: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<RepoBlobs, ExploreFileUnreadable>> {
  const entries = await loadExploreDirectoryEntries({
    path: params.blobsPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (entries.kind === 'failed') {
    return entries;
  }

  const blobs: HuggingFaceBlob[] = [];
  let linkedBlobCount = 0;

  for (const entry of entries.value ?? []) {
    if (entry.kind === 'symbolicLink') {
      linkedBlobCount += 1;

      continue;
    }

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

  return { kind: 'succeeded', value: { blobs: blobs, linkedBlobCount: linkedBlobCount } };
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

    const linkedBlobNames = await loadLinkedBlobNames({
      pathRules: params.pathRules,
      folderPath: path,
      blobsRealPath: blobsRealPath.value,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (linkedBlobNames.kind === 'failed') {
      return linkedBlobNames;
    }

    if (stats.value !== null) {
      snapshots.push({
        commit: entry.name,
        path: path,
        modifiedMs: stats.value.modifiedMs,
        linkedBlobNames: linkedBlobNames.value,
      });
    }
  }

  return {
    kind: 'succeeded',
    value: { snapshots: snapshots, isEveryEntryFolder: isEveryEntryFolder },
  };
}

/**
 * The names of the repository's blobs that the links below the folder resolve to, matched by real
 * paths, so the relative links the libraries write need no parse of their own. A link that
 * resolves elsewhere, such as through a linked blob to the hub cache's shared copy, names none.
 */
async function loadLinkedBlobNames(params: {
  pathRules: PathRules;
  folderPath: AbsolutePath;
  blobsRealPath: AbsolutePath | null;
  privacyDenialCode: string | null;
}): Promise<Result<Set<string>, ExploreFileUnreadable>> {
  const entries = await loadExploreDirectoryEntries({
    path: params.folderPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (entries.kind === 'failed') {
    return entries;
  }

  const linkedBlobNames = new Set<string>();

  for (const entry of entries.value ?? []) {
    const path = joinAbsolutePath({
      rules: params.pathRules,
      parentPath: params.folderPath,
      names: [entry.name],
    });

    if (entry.kind === 'directory') {
      const below = await loadLinkedBlobNames({
        pathRules: params.pathRules,
        folderPath: path,
        blobsRealPath: params.blobsRealPath,
        privacyDenialCode: params.privacyDenialCode,
      });

      if (below.kind === 'failed') {
        return below;
      }

      for (const name of below.value) {
        linkedBlobNames.add(name);
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
      linkedBlobNames.add(basename(realPath.value));
    }
  }

  return { kind: 'succeeded', value: linkedBlobNames };
}
