import type { Environment } from '../environment/buildEnvironment.js';
import type { ExploreProbePlatform } from '../explore/exploreProbe.js';
import { throwPartNotBuilt } from '../notBuilt.js';
import type { Candidate, CandidateRemovalEvictUnitFiles } from '../scan/candidate.js';
import type { EntryReads } from '../system/entryReads.js';
import type { RecordedRemoval } from './deleteCandidates.js';

/**
 * Evicts each target with `brctl evict`, only while it is still downloaded and untouched since the
 * scan and its unit is unchanged and idle; one `eviction` entry per target. Never rejects.
 */
export function evictCandidateFiles(_params: {
  candidate: Candidate;
  removal: CandidateRemovalEvictUnitFiles;
  environment: Environment;
  probePlatform: ExploreProbePlatform;
  entryReads: EntryReads;
  loadProcessCommands: () => Promise<string[] | null>;
  clock: () => number;
}): Promise<RecordedRemoval> {
  return throwPartNotBuilt();
}
