import type { CandidateCategory, Risk } from '../catalog/catalog.js';
import type { Candidate } from './candidate.js';
import { isProbedCandidate } from './candidate.js';

/** The groups a person sees the offered candidates in, apart from Explore. */
export type ConsumerSection =
  | 'caches'
  | 'developerTools'
  | 'projects'
  | 'containers'
  | 'aiModels'
  | 'downloads'
  | 'icloud'
  | 'apps'
  | 'largeFiles'
  | 'trash'
  | 'ownApp';

/**
 * `safe` items a rule alone vouches for, `careful` items that nothing brings back, `review` every
 * other item, a safe item a probe found among them, since its evidence wants reading first.
 */
export type CandidateGroup = 'safe' | 'review' | 'careful';

/** A probe's item still belongs to the section of its category, but shows under Explore. */
export type CandidatePlaceExplore = {
  kind: 'explore';
  section: ConsumerSection;
  group: Exclude<CandidateGroup, 'safe'>;
};

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
  'projects',
  'containers',
  'aiModels',
  'apps',
  'downloads',
  'largeFiles',
  'icloud',
  'trash',
  'ownApp',
];

/** Top to bottom within one section. */
export const CANDIDATE_GROUP_ORDER: CandidateGroup[] = ['safe', 'review', 'careful'];

const categorySections: Record<CandidateCategory, ConsumerSection> = {
  caches: 'caches',
  temporary: 'caches',
  developer: 'developerTools',
  packages: 'developerTools',
  system: 'developerTools',
  projects: 'projects',
  containerEngines: 'containers',
  aiModels: 'aiModels',
  downloads: 'downloads',
  installers: 'downloads',
  cloudCopies: 'icloud',
  applications: 'apps',
  appContainers: 'apps',
  leftovers: 'apps',
  userFiles: 'largeFiles',
  trash: 'trash',
  appManaged: 'ownApp',
};

const matchedRiskGroups: Record<Risk, CandidateGroup> = {
  safe: 'safe',
  review: 'review',
  careful: 'careful',
  never: 'review',
};

const probedRiskGroups: Record<Risk, Exclude<CandidateGroup, 'safe'>> = {
  safe: 'review',
  review: 'review',
  careful: 'careful',
  never: 'review',
};

export function placeCandidate(candidate: Candidate): CandidatePlace {
  const section = getCategorySection({ category: candidate.category });

  if (isProbedCandidate(candidate)) {
    return { kind: 'explore', section: section, group: probedRiskGroups[candidate.risk] };
  }

  return { kind: 'section', section: section, group: matchedRiskGroups[candidate.risk] };
}

/** The section an item of the category belongs to, an offer, a probe's item, or advice alike. */
export function getCategorySection(params: { category: CandidateCategory }): ConsumerSection {
  return categorySections[params.category];
}

/** Orders places top to bottom: by section, then by group within one, Explore last. */
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
