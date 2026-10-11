import type { Advice, Candidate, CandidateDecision } from './candidate.js';
import type { ScanIssue } from './issue.js';
import { rankBySize } from './rankCandidates.js';
import type { ScanReport, SkippedItem } from './runScan.js';

/** Splits the decisions into ranked candidates, ranked advice, and skipped items. */
export function buildScanReport(params: {
  decisions: CandidateDecision[];
  issues: ScanIssue[];
}): ScanReport {
  const candidates: Candidate[] = [];
  const advice: Advice[] = [];
  const skipped: SkippedItem[] = [];

  for (const decision of params.decisions) {
    if (decision.kind === 'offer') {
      candidates.push(decision.candidate);
    } else if (decision.kind === 'advice') {
      advice.push(decision.advice);
    } else {
      skipped.push({ path: decision.path, reason: decision.reason });
    }
  }

  return {
    candidates: rankBySize({ items: candidates }),
    advice: rankBySize({ items: advice }),
    skipped: skipped,
    issues: params.issues,
  };
}
