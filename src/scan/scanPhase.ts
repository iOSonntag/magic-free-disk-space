import type { CandidateDecision } from './candidate.js';
import type { ScanIssue } from './issue.js';

/** Decisions in source order with the issues met on the way. */
export type ScanPhase = { decisions: CandidateDecision[]; issues: ScanIssue[] };

export const EMPTY_SCAN_PHASE: ScanPhase = { decisions: [], issues: [] };

/** Joins the phases into one, their decisions and their issues each in phase order. */
export function mergeScanPhases(params: { phases: ScanPhase[] }): ScanPhase {
  return {
    decisions: params.phases.flatMap((phase) => phase.decisions),
    issues: params.phases.flatMap((phase) => phase.issues),
  };
}
