import { basename } from 'node:path';
import type { CandidateDecision } from './candidate.js';
import type { ArtifactFinding } from './findProjectArtifacts.js';
import type { Measurement } from './loadPathMeasurement.js';
import type { ActivityProbe } from './loadTreeActivity.js';

/** Offers a project build folder when its project has been quiet for the stale period. */
export function decideArtifactCandidate(params: {
  finding: ArtifactFinding;
  measurement: Measurement;
  activity: ActivityProbe;
  minOfferedBytes: number;
}): CandidateDecision {
  const path = params.finding.artifactPath;

  if (params.measurement.identity.kind === 'symbolicLink') {
    return { kind: 'skip', path: path, reason: 'symbolicLink' };
  }

  if (params.measurement.allocatedBytes < params.minOfferedBytes) {
    return { kind: 'skip', path: path, reason: 'belowSizeThreshold' };
  }

  if (params.activity === 'recent') {
    return { kind: 'skip', path: path, reason: 'recentActivity' };
  }

  if (params.activity === 'unknown') {
    return { kind: 'skip', path: path, reason: 'activityUnknown' };
  }

  return {
    kind: 'offer',
    candidate: {
      path: path,
      title: `${params.finding.rule.title} of ${basename(params.finding.projectRoot)}`,
      category: 'projects',
      risk: params.finding.rule.risk,
      origin: 'artifact',
      explanation: `${params.finding.rule.explanation} Nothing else in the project changed during the stale period.`,
      regeneration: params.finding.rule.regeneration,
      allocatedBytes: params.measurement.allocatedBytes,
      entryCount: params.measurement.entryCount,
      isComplete: params.measurement.isComplete,
      removal: { kind: 'deletePath', identity: params.measurement.identity, ownerBundlePaths: [] },
    },
  };
}
