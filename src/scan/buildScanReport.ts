import type { Advice, Candidate, CandidateDecision } from './candidate.js';
import type { ScanIssue } from './issue.js';
import { placeCandidate } from './placeCandidate.js';
import { rankByPlace, rankBySize } from './rankCandidates.js';
import type { ScanReport, SkippedItem } from './runScan.js';
import type { AppAdvice } from './scanPlatform.js';

/** The share of one decision in each part of the report; all but one part are empty. */
type DecisionPartition = {
  offered: Candidate[];
  advice: Advice[];
  skipped: SkippedItem[];
};

/**
 * Splits the decisions into candidates ranked by their place with Explore last, advice ranked by
 * size, and skipped items, and numbers the candidates placed in a safe group.
 */
export function buildScanReport(params: {
  decisions: CandidateDecision[];
  appAdvice: AppAdvice | null;
  evictedEntryCount: number;
  issues: ScanIssue[];
}): ScanReport {
  const partitions = params.decisions.map(partitionDecision);
  const candidates = rankByPlace({
    candidates: partitions.flatMap((partition) => partition.offered),
  });

  return {
    candidates: candidates,
    safeNumbers: listSafeNumbers({ candidates: candidates }),
    advice: rankBySize({ items: partitions.flatMap((partition) => partition.advice) }),
    appAdvice: params.appAdvice,
    skipped: partitions.flatMap((partition) => partition.skipped),
    evictedEntryCount: params.evictedEntryCount,
    issues: params.issues,
  };
}

function partitionDecision(decision: CandidateDecision): DecisionPartition {
  switch (decision.kind) {
    case 'offer':
      return { offered: [decision.candidate], advice: [], skipped: [] };
    case 'advice':
      return { offered: [], advice: [decision.advice], skipped: [] };
    case 'skip': {
      const skippedItem: SkippedItem = { path: decision.path, reason: decision.reason };

      return { offered: [], advice: [], skipped: [skippedItem] };
    }
  }
}

/** An Explore item is in no safe group: it waits for the user to read its reasons. */
function listSafeNumbers(params: { candidates: Candidate[] }): number[] {
  return params.candidates.flatMap((candidate, index) =>
    isPlacedInSafeGroup({ candidate: candidate }) ? [index + 1] : [],
  );
}

function isPlacedInSafeGroup(params: { candidate: Candidate }): boolean {
  const place = placeCandidate(params.candidate);

  return place.kind === 'section' && place.group === 'safe';
}
