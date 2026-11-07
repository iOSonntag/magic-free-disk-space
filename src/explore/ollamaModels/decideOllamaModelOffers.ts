import { toNonEmpty } from '../../system/nonEmptyList.js';
import type { ExploreFoundPaths } from '../exploreUnit.js';
import type { OllamaManifest, OllamaModelStateInstalled } from './loadOllamaModelState.js';

/** A model to offer: its manifest and the blob files that no other manifest names. */
export type OllamaModelOffer = {
  manifest: OllamaManifest;
  digestCount: number;
  blobPaths: ExploreFoundPaths;
};

/**
 * Offers each model with the blobs only its manifest names, since Ollama itself removes a model's
 * blobs only when no other manifest reaches them. A model whose blobs all are shared frees nothing
 * and is not offered. `null` while a manifest is unread or a stray entry sits among them, because a
 * blob it names would then read as unshared.
 */
export function decideOllamaModelOffers(params: {
  state: OllamaModelStateInstalled;
}): OllamaModelOffer[] | null {
  if (!params.state.isEveryEntryKnown) {
    return null;
  }

  const readManifests: { manifest: OllamaManifest; digests: Set<string> }[] = [];

  for (const manifest of params.state.manifests) {
    if (manifest.digests === null) {
      return null;
    }

    readManifests.push({ manifest: manifest, digests: new Set(manifest.digests) });
  }

  const manifestCountByDigest = new Map<string, number>();

  for (const readManifest of readManifests) {
    for (const digest of readManifest.digests) {
      manifestCountByDigest.set(digest, (manifestCountByDigest.get(digest) ?? 0) + 1);
    }
  }

  return readManifests.flatMap((readManifest) => {
    const blobPaths = toNonEmpty(
      [...readManifest.digests].flatMap((digest) => {
        const blobPath = params.state.blobPaths.get(digest);

        return manifestCountByDigest.get(digest) === 1 && blobPath !== undefined ? [blobPath] : [];
      }),
    );

    if (blobPaths === null) {
      return [];
    }

    return [
      {
        manifest: readManifest.manifest,
        digestCount: readManifest.digests.size,
        blobPaths: blobPaths,
      },
    ];
  });
}
