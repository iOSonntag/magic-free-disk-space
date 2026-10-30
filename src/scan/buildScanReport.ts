import type { Advice, Candidate, CandidateDecision } from './candidate.js';
import type { ScanIssue } from './issue.js';
import { rankBySize } from './rankCandidates.js';
import type { ScanReport, SkippedItem } from './runScan.js';

/**
 * Splits the decisions into candidates ranked by size with the Explore ones after all others,
 * ranked advice, and skipped items, and numbers the safe candidates outside Explore.
 */
export function buildScanReport(params: {
  decisions: CandidateDecision[];
  issues: ScanIssue[];
}): ScanReport {
  const offered: Candidate[] = [];
  const explored: Candidate[] = [];
  const advice: Advice[] = [];
  const skipped: SkippedItem[] = [];

  for (const decision of params.decisions) {
    switch (decision.kind) {
      case 'offer':
        if (decision.candidate.origin === 'explore') {
          explored.push(decision.candidate);
        } else {
          offered.push(decision.candidate);
        }

        break;
      case 'advice':
        advice.push(decision.advice);
        break;
      case 'skip':
        skipped.push({ path: decision.path, reason: decision.reason });
        break;
    }
  }

  const candidates = [...rankBySize({ items: offered }), ...rankBySize({ items: explored })];

  return {
    candidates: candidates,
    safeNumbers: listSafeNumbers({ candidates: candidates }),
    advice: rankBySize({ items: advice }),
    skipped: skipped,
    issues: params.issues,
  };
}

/** An Explore item is never picked by "safe": it waits for the user to read its reasons. */
function listSafeNumbers(params: { candidates: Candidate[] }): number[] {
  return params.candidates.flatMap((candidate, index) =>
    candidate.risk === 'safe' && candidate.origin !== 'explore' ? [index + 1] : [],
  );
}
