import { toNonEmpty } from '../../system/nonEmptyList.js';
import type { ExploreFoundPaths } from '../exploreUnit.js';
import { DAY_MS } from '../formatLimitTexts.js';
import type { HuggingFaceRepoState, HuggingFaceSnapshot } from './loadHuggingFaceHubState.js';
import { HUGGING_FACE_INCOMPLETE_SUFFIX } from './loadHuggingFaceHubState.js';

/** How long an unfinished blob stays untouched before it counts as left behind: a day. */
export const HUGGING_FACE_PARTIAL_UNTOUCHED_MS = DAY_MS;

/** The current revisions: the metadata, their snapshots, their blobs, and the blobs no link reaches. */
export type HuggingFaceRepoOfferRepository = {
  kind: 'huggingFaceRepository';
  paths: ExploreFoundPaths;
  revisionCount: number;
  downloadedAtMs: number | null;
};

/** The snapshots no ref names, with the blobs that no current snapshot links. */
export type HuggingFaceRepoOfferDetached = {
  kind: 'huggingFaceDetachedRevisions';
  paths: ExploreFoundPaths;
  revisions: string[];
  downloadedAtMs: number | null;
};

/** The unfinished blobs untouched past the cutoff. */
export type HuggingFaceRepoOfferPartial = {
  kind: 'huggingFacePartialDownloads';
  paths: ExploreFoundPaths;
};

/** The offers that follow the refs of a repository. */
export type HuggingFaceRepoOfferRevisions =
  | HuggingFaceRepoOfferRepository
  | HuggingFaceRepoOfferDetached;

export type HuggingFaceRepoOffer = HuggingFaceRepoOfferRevisions | HuggingFaceRepoOfferPartial;

/** `isJudged` is false when the current revisions are unknown, so only stale partials are offered. */
export type HuggingFaceRepoOffers = { offers: HuggingFaceRepoOffer[]; isJudged: boolean };

/** Splits a repository into its three disjoint offers: its revision offers and its partial one. */
export function decideHuggingFaceRepoOffers(params: {
  repo: HuggingFaceRepoState;
  partialCutoffMs: number;
}): HuggingFaceRepoOffers {
  const partialOffer = decideHuggingFacePartialOffer({
    repo: params.repo,
    partialCutoffMs: params.partialCutoffMs,
  });
  const partialOffers = partialOffer === null ? [] : [partialOffer];
  const revisionOffers = decideHuggingFaceRevisionOffers({ repo: params.repo });

  if (revisionOffers === null) {
    return { offers: partialOffers, isJudged: false };
  }

  return { offers: [...revisionOffers, ...partialOffers], isJudged: true };
}

/** The unfinished blobs untouched since the cutoff; `null` when there are none. */
export function decideHuggingFacePartialOffer(params: {
  repo: HuggingFaceRepoState;
  partialCutoffMs: number;
}): HuggingFaceRepoOfferPartial | null {
  const paths = toNonEmpty(
    params.repo.blobs
      .filter(
        (blob) =>
          blob.name.endsWith(HUGGING_FACE_INCOMPLETE_SUFFIX) &&
          blob.modifiedMs <= params.partialCutoffMs,
      )
      .map((blob) => blob.path),
  );

  return paths === null ? null : { kind: 'huggingFacePartialDownloads', paths: paths };
}

/**
 * The current revisions and the detached ones; `null` when the refs cannot tell the current ones.
 * A blob both a current and a detached snapshot link goes with the current revisions, so removing
 * the detached ones never breaks a current one. A link in `blobs`, such as the one `hf_xet` writes
 * to the copy the hub cache shares across repositories, is no blob, so neither offer reaches it.
 */
export function decideHuggingFaceRevisionOffers(params: {
  repo: HuggingFaceRepoState;
}): HuggingFaceRepoOfferRevisions[] | null {
  if (params.repo.currentCommits === null) {
    return null;
  }

  const currentCommits = params.repo.currentCommits;
  const currentSnapshots = params.repo.snapshots.filter((snapshot) =>
    currentCommits.has(snapshot.commit),
  );
  const detachedSnapshots = params.repo.snapshots.filter(
    (snapshot) => !currentCommits.has(snapshot.commit),
  );
  const currentLinked = collectLinkedBlobNames({ snapshots: currentSnapshots });
  const detachedLinked = collectLinkedBlobNames({ snapshots: detachedSnapshots });
  const completeBlobs = params.repo.blobs.filter(
    (blob) => !blob.name.endsWith(HUGGING_FACE_INCOMPLETE_SUFFIX),
  );
  const currentBlobPaths = completeBlobs
    .filter((blob) => currentLinked.has(blob.name) || !detachedLinked.has(blob.name))
    .map((blob) => blob.path);
  const detachedBlobPaths = completeBlobs
    .filter((blob) => detachedLinked.has(blob.name) && !currentLinked.has(blob.name))
    .map((blob) => blob.path);
  const offers: HuggingFaceRepoOfferRevisions[] = [];
  const repositoryPaths = toNonEmpty([
    ...params.repo.metadataPaths,
    ...currentSnapshots.map((snapshot) => snapshot.path),
    ...currentBlobPaths,
  ]);

  if (repositoryPaths !== null && (currentSnapshots.length > 0 || currentBlobPaths.length > 0)) {
    offers.push({
      kind: 'huggingFaceRepository',
      paths: repositoryPaths,
      revisionCount: currentSnapshots.length,
      downloadedAtMs: findNewestModifiedMs({ snapshots: currentSnapshots }),
    });
  }

  const detachedPaths = toNonEmpty([
    ...detachedSnapshots.map((snapshot) => snapshot.path),
    ...detachedBlobPaths,
  ]);

  if (detachedPaths !== null) {
    offers.push({
      kind: 'huggingFaceDetachedRevisions',
      paths: detachedPaths,
      revisions: detachedSnapshots.map((snapshot) => snapshot.commit),
      downloadedAtMs: findNewestModifiedMs({ snapshots: detachedSnapshots }),
    });
  }

  return offers;
}

function collectLinkedBlobNames(params: { snapshots: HuggingFaceSnapshot[] }): Set<string> {
  return new Set(params.snapshots.flatMap((snapshot) => [...snapshot.linkedBlobNames]));
}

function findNewestModifiedMs(params: { snapshots: HuggingFaceSnapshot[] }): number | null {
  if (params.snapshots.length === 0) {
    return null;
  }

  return Math.max(...params.snapshots.map((snapshot) => snapshot.modifiedMs));
}
