import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { ExploreFoundPaths } from '../exploreUnit.js';
import type { HuggingFaceRepoState, HuggingFaceSnapshot } from './loadHuggingFaceHubState.js';
import { HUGGING_FACE_INCOMPLETE_SUFFIX } from './loadHuggingFaceHubState.js';

/** How long an unfinished blob stays untouched before it counts as left behind: a day. */
export const HUGGING_FACE_PARTIAL_UNTOUCHED_MS = 24 * 60 * 60 * 1000;

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

export type HuggingFaceRepoOffer =
  | HuggingFaceRepoOfferRepository
  | HuggingFaceRepoOfferDetached
  | HuggingFaceRepoOfferPartial;

/** `isJudged` is false when the current revisions are unknown, so only stale partials are offered. */
export type HuggingFaceRepoOffers = { offers: HuggingFaceRepoOffer[]; isJudged: boolean };

/**
 * Splits a repository into its three disjoint offers. A blob both a current and a detached snapshot
 * link goes with the current revisions, so removing the detached ones never breaks a current one.
 * A link, such as one into Xet's shared store, is never a blob of either.
 */
export function decideHuggingFaceRepoOffers(params: {
  repo: HuggingFaceRepoState;
  partialCutoffMs: number;
}): HuggingFaceRepoOffers {
  const partialPaths = params.repo.blobs
    .filter(
      (blob) =>
        blob.name.endsWith(HUGGING_FACE_INCOMPLETE_SUFFIX) &&
        blob.modifiedMs <= params.partialCutoffMs,
    )
    .map((blob) => blob.path);
  const partialOffers = buildPartialOffers({ paths: partialPaths });

  if (params.repo.currentCommits === null) {
    return { offers: partialOffers, isJudged: false };
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
  const offers: HuggingFaceRepoOffer[] = [];
  const repositoryPaths = toFoundPaths([
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

  const detachedPaths = toFoundPaths([
    ...detachedSnapshots.map((snapshot) => snapshot.path),
    ...detachedBlobPaths,
  ]);

  if (detachedPaths !== null && detachedSnapshots.length > 0) {
    offers.push({
      kind: 'huggingFaceDetachedRevisions',
      paths: detachedPaths,
      revisions: detachedSnapshots.map((snapshot) => snapshot.commit),
      downloadedAtMs: findNewestModifiedMs({ snapshots: detachedSnapshots }),
    });
  }

  return { offers: [...offers, ...partialOffers], isJudged: true };
}

function buildPartialOffers(params: { paths: AbsolutePath[] }): HuggingFaceRepoOfferPartial[] {
  const paths = toFoundPaths(params.paths);

  return paths === null ? [] : [{ kind: 'huggingFacePartialDownloads', paths: paths }];
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

function toFoundPaths(paths: AbsolutePath[]): ExploreFoundPaths | null {
  const [firstPath, ...otherPaths] = paths;

  return firstPath === undefined ? null : [firstPath, ...otherPaths];
}
