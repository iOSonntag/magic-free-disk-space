import type { CandidateCategory, Risk } from '../catalog/catalog.js';
import type { Candidate } from './candidate.js';

/** The groups a person sees the offered candidates in, apart from Explore. */
export type ConsumerSection = 'caches' | 'developerTools' | 'apps' | 'largeFiles' | 'trash';

/** `safe` items show open in their section; the others wait under "Check before deleting". */
export type CandidateGroup = 'safe' | 'check';

export type CandidatePlaceExplore = { kind: 'explore' };

export type CandidatePlaceSection = {
  kind: 'section';
  section: ConsumerSection;
  group: CandidateGroup;
};

/** Where a candidate shows: the one rule the ranking, "Select safe", and the view all read. */
export type CandidatePlace = CandidatePlaceExplore | CandidatePlaceSection;

/** Top to bottom. */
export const CONSUMER_SECTION_ORDER: ConsumerSection[] = [
  'caches',
  'developerTools',
  'apps',
  'largeFiles',
  'trash',
];

const CANDIDATE_GROUP_ORDER: CandidateGroup[] = ['safe', 'check'];

const categorySections: Record<CandidateCategory, ConsumerSection> = {
  caches: 'caches',
  temporary: 'caches',
  developer: 'developerTools',
  packages: 'developerTools',
  projects: 'developerTools',
  system: 'developerTools',
  applications: 'apps',
  containers: 'apps',
  leftovers: 'apps',
  userFiles: 'largeFiles',
  trash: 'trash',
};

const riskGroups: Record<Risk, CandidateGroup> = {
  safe: 'safe',
  review: 'check',
  careful: 'check',
  never: 'check',
};

export function placeCandidate(candidate: Candidate): CandidatePlace {
  if (candidate.origin === 'explore') {
    return { kind: 'explore' };
  }

  return {
    kind: 'section',
    section: categorySections[candidate.category],
    group: riskGroups[candidate.risk],
  };
}

/** Orders places top to bottom: by section, `safe` before `check` within one, Explore last. */
export function compareCandidatePlaces(left: CandidatePlace, right: CandidatePlace): number {
  return rankCandidatePlace(left) - rankCandidatePlace(right);
}

function rankCandidatePlace(place: CandidatePlace): number {
  switch (place.kind) {
    case 'explore':
      return CONSUMER_SECTION_ORDER.length * CANDIDATE_GROUP_ORDER.length;
    case 'section':
      return (
        CONSUMER_SECTION_ORDER.indexOf(place.section) * CANDIDATE_GROUP_ORDER.length +
        CANDIDATE_GROUP_ORDER.indexOf(place.group)
      );
  }
}
