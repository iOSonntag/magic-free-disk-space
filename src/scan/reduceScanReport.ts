import { listSafeNumbers } from './buildScanReport.js';
import type { Candidate } from './candidate.js';
import { rankByPlace } from './rankCandidates.js';
import type { ScanReport } from './runScan.js';

/** What a deletion did to one candidate of a report: took it whole, or freed part of it. */
export type CandidateRemovalResult = {
  /** The candidate as the report holds it. */
  candidate: Candidate;
  isGone: boolean;
  freedBytes: number;
};

/**
 * The report as it stands after a deletion, without a new scan: each gone candidate leaves, each
 * other one shrinks by the bytes freed of it, and the rest are ranked and numbered again as a
 * scan ranks them. A shrunk size is the scanned size less the freed bytes, never below zero, not
 * measured again. Advice, skipped items, and issues stay as the scan found them.
 */
export function reduceScanReport(params: {
  report: ScanReport;
  results: CandidateRemovalResult[];
}): ScanReport {
  const resultsByCandidate = new Map(
    params.results.map((result): [Candidate, CandidateRemovalResult] => [result.candidate, result]),
  );
  const remaining = params.report.candidates.flatMap((candidate): Candidate[] => {
    const result = resultsByCandidate.get(candidate);

    if (result === undefined) {
      return [candidate];
    }

    if (result.isGone) {
      return [];
    }

    if (result.freedBytes <= 0) {
      return [candidate];
    }

    return [
      {
        ...candidate,
        allocatedBytes: Math.max(0, candidate.allocatedBytes - result.freedBytes),
      },
    ];
  });
  const candidates = rankByPlace({ candidates: remaining });

  return {
    ...params.report,
    candidates: candidates,
    safeNumbers: listSafeNumbers({ candidates: candidates }),
  };
}
