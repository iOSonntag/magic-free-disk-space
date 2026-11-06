import type { Environment } from '../environment/buildEnvironment.js';
import { throwPartNotBuilt } from '../notBuilt.js';
import type { Candidate, CandidateRemovalEvictUnitFiles } from '../scan/candidate.js';
import type { RemovalDecision } from './validateRemoval.js';

/**
 * Approves an evict only when each target is a plain file inside iCloud Drive's folder, the one
 * place where an evict is allowed and a delete never is.
 */
export function validateEvictRemoval(_params: {
  candidate: Candidate;
  removal: CandidateRemovalEvictUnitFiles;
  environment: Environment;
}): RemovalDecision {
  return throwPartNotBuilt();
}
