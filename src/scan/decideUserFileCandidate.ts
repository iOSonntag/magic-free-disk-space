import { basename } from 'node:path';
import type { CandidateDecision } from './candidate.js';
import type { UserFileFinding } from './findLargeUserFiles.js';

/** Offers a large file unchanged since `unusedCutoffMs` as `careful`: nothing brings it back. */
export function decideUserFileCandidate(params: {
  finding: UserFileFinding;
  unusedCutoffMs: number;
  minUserFileBytes: number;
}): CandidateDecision {
  const path = params.finding.path;

  if (params.finding.identity.kind === 'symbolicLink') {
    return { kind: 'skip', path: path, reason: 'symbolicLink' };
  }

  if (params.finding.allocatedBytes < params.minUserFileBytes) {
    return { kind: 'skip', path: path, reason: 'belowSizeThreshold' };
  }

  if (params.finding.modifiedMs >= params.unusedCutoffMs) {
    return { kind: 'skip', path: path, reason: 'recentActivity' };
  }

  const modifiedDate = new Date(params.finding.modifiedMs).toISOString().slice(0, 10);

  return {
    kind: 'offer',
    candidate: {
      path: path,
      title: basename(path),
      category: 'userFiles',
      risk: 'careful',
      origin: 'userFile',
      explanation: `A large file of yours, unchanged since ${modifiedDate}.`,
      regeneration: 'Not regenerated: only a backup or a new download brings it back.',
      allocatedBytes: params.finding.allocatedBytes,
      entryCount: 1,
      isComplete: true,
      removal: { kind: 'deletePath', identity: params.finding.identity, ownerBundlePaths: [] },
      evidenceLines: [],
    },
  };
}
