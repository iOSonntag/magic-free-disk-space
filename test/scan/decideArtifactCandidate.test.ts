import { describe, expect, test } from 'bun:test';
import { PROJECT_ARTIFACT_RULES } from '../../src/catalog/projectArtifactRules.js';
import { decideArtifactCandidate } from '../../src/scan/decideArtifactCandidate.js';
import type { ActivityProbe } from '../../src/scan/loadTreeActivity.js';
import type { FileKind } from '../../src/system/loadFileIdentity.js';
import { buildTestMeasurement } from '../support/candidateFixtures.js';

const MIB = 1_048_576;
const ARTIFACT_PATH = '/home/code/shop/node_modules';

function decide(params: { activity: ActivityProbe; allocatedBytes?: number; kind?: FileKind }) {
  const rule = PROJECT_ARTIFACT_RULES.find(
    (candidateRule) => candidateRule.artifactName === 'node_modules',
  );

  if (rule === undefined) {
    throw new Error('The node_modules rule is missing');
  }

  return decideArtifactCandidate({
    finding: { artifactPath: ARTIFACT_PATH, projectRoot: '/home/code/shop', rule: rule },
    measurement: buildTestMeasurement({
      realPath: ARTIFACT_PATH,
      allocatedBytes: params.allocatedBytes ?? 200 * MIB,
      kind: params.kind ?? 'directory',
    }),
    activity: params.activity,
    minOfferedBytes: MIB,
  });
}

describe('decideArtifactCandidate', () => {
  test('offers the artifact of a quiet project with the rule risk', () => {
    const decision = decide({ activity: 'quiet' });

    expect(decision.kind === 'offer' && decision.candidate).toMatchObject({
      path: ARTIFACT_PATH,
      title: 'Node.js dependencies of shop',
      risk: 'review',
      category: 'projects',
      origin: 'artifact',
    });
  });

  test('keeps the artifact of a recently changed project', () => {
    expect(decide({ activity: 'recent' })).toEqual({
      kind: 'skip',
      path: ARTIFACT_PATH,
      reason: 'recentActivity',
    });
  });

  test('treats an unknown activity as not stale', () => {
    expect(decide({ activity: 'unknown' })).toEqual({
      kind: 'skip',
      path: ARTIFACT_PATH,
      reason: 'activityUnknown',
    });
  });

  test('skips a symbolic link and a small artifact', () => {
    expect(decide({ activity: 'quiet', kind: 'symbolicLink' })).toMatchObject({
      reason: 'symbolicLink',
    });
    expect(decide({ activity: 'quiet', allocatedBytes: 1000 })).toMatchObject({
      reason: 'belowSizeThreshold',
    });
  });
});
