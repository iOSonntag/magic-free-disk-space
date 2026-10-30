import type { Advice, Candidate, CandidateDecision } from './candidate.js';
import type { ScanIssue } from './issue.js';
import { rankBySize } from './rankCandidates.js';
import type { ScanReport, SkippedItem } from './runScan.js';

/** The share of one decision in each part of the report; all but one part are empty. */
type DecisionPartition = {
  offered: Candidate[];
  explored: Candidate[];
  advice: Advice[];
  skipped: SkippedItem[];
};

/**
 * Splits the decisions into candidates ranked by size with the Explore ones after all others,
 * ranked advice, and skipped items, and numbers the safe candidates outside Explore.
 */
export function buildScanReport(params: {
  decisions: CandidateDecision[];
  issues: ScanIssue[];
}): ScanReport {
  const partitions = params.decisions.map(partitionDecision);
  const candidates = [
    ...rankBySize({ items: partitions.flatMap((partition) => partition.offered) }),
    ...rankBySize({ items: partitions.flatMap((partition) => partition.explored) }),
  ];

  return {
    candidates: candidates,
    safeNumbers: listSafeNumbers({ candidates: candidates }),
    advice: rankBySize({ items: partitions.flatMap((partition) => partition.advice) }),
    skipped: partitions.flatMap((partition) => partition.skipped),
    issues: params.issues,
  };
}

function partitionDecision(decision: CandidateDecision): DecisionPartition {
  switch (decision.kind) {
    case 'offer':
      if (decision.candidate.origin === 'explore') {
        return { offered: [], explored: [decision.candidate], advice: [], skipped: [] };
      }

      return { offered: [decision.candidate], explored: [], advice: [], skipped: [] };
    case 'advice':
      return { offered: [], explored: [], advice: [decision.advice], skipped: [] };
    case 'skip': {
      const skippedItem: SkippedItem = { path: decision.path, reason: decision.reason };

      return { offered: [], explored: [], advice: [], skipped: [skippedItem] };
    }
  }
}

/** An Explore item is never picked by "safe": it waits for the user to read its reasons. */
function listSafeNumbers(params: { candidates: Candidate[] }): number[] {
  return params.candidates.flatMap((candidate, index) =>
    candidate.risk === 'safe' && candidate.origin !== 'explore' ? [index + 1] : [],
  );
}
