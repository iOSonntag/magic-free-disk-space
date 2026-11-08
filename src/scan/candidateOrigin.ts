import type { ExploreProbeId } from '../catalog/catalog.js';
import type { MacBundleId } from '../catalog/catalogOwner.js';
import { formatExploreUnitKey } from '../explore/formatExploreUnitKey.js';
import type { Advice, Candidate } from './candidate.js';

export type CandidateOriginCatalog = { kind: 'catalog'; entryId: string };

export type CandidateOriginArtifact = { kind: 'artifact'; artifactName: string };

export type CandidateOriginApplication = { kind: 'application'; bundleId: MacBundleId };

export type CandidateOriginUserFile = { kind: 'userFile' };

/** How the data was tied to the app it stayed behind from. */
export type LeftoverMatch = 'bundleId' | 'name';

export type CandidateOriginLeftover = { kind: 'leftover'; matchedBy: LeftoverMatch };

export type CandidateOriginExplore = { kind: 'explore'; probe: ExploreProbeId };

/** The source that found an item, with the id that source knows it by. */
export type CandidateOrigin =
  | CandidateOriginCatalog
  | CandidateOriginArtifact
  | CandidateOriginApplication
  | CandidateOriginUserFile
  | CandidateOriginLeftover
  | CandidateOriginExplore;

declare const itemKeyBrand: unique symbol;

/** Names an item the same way in every scan, so a client can keep what it knows about it. */
export type ItemKey = string & { [itemKeyBrand]: true };

export function buildItemKey(params: { item: Candidate | Advice }): ItemKey {
  const parts = [
    params.item.origin.kind,
    ...listOriginKeyParts({ origin: params.item.origin }),
    formatItemPlaceKey({ item: params.item }),
  ];

  // The brand records that this function made the key, which the compiler cannot follow.
  return parts.join(':') as ItemKey;
}

function listOriginKeyParts(params: { origin: CandidateOrigin }): string[] {
  switch (params.origin.kind) {
    case 'catalog':
      return [params.origin.entryId];
    case 'artifact':
      return [params.origin.artifactName];
    case 'application':
      return [params.origin.bundleId];
    case 'userFile':
    case 'leftover':
      return [];
    case 'explore':
      return [params.origin.probe];
  }
}

/** A unit by what its tool knows it by, since several units of one tool may show one path. */
function formatItemPlaceKey(params: { item: Candidate | Advice }): string {
  if (!('removal' in params.item)) {
    return params.item.path;
  }

  switch (params.item.removal.kind) {
    case 'deletePaths':
      return params.item.path;
    case 'runTool':
    case 'deleteUnitPaths':
    case 'evictUnitFiles':
    case 'callEngine':
      return formatExploreUnitKey({ unit: params.item.removal.unit });
  }
}
