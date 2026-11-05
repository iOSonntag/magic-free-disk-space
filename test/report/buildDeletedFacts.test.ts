import { expect, test } from 'bun:test';
import type {
  RemovalOutcome,
  RemovalOutcomeCodedKind,
  RemovalRun,
} from '../../src/delete/deleteCandidates.js';
import { buildDeletedFacts } from '../../src/report/buildDeletedFacts.js';
import type { Candidate } from '../../src/scan/candidate.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { buildTestCandidate, buildTestToolCandidate } from '../support/candidateFixtures.js';

const LOG_PATH = '/fixture/Library/Logs/magic-free-disk-space/deletions.jsonl';

function buildCodedOutcome(params: {
  candidate: Candidate;
  outcome: RemovalOutcomeCodedKind;
  freedBytes: number;
}): RemovalOutcome {
  return {
    candidate: params.candidate,
    path: params.candidate.path,
    allocatedBytes: params.candidate.allocatedBytes,
    freedBytes: params.freedBytes,
    outcome: params.outcome,
    code: null,
  };
}

function buildRun(params: { outcomes: RemovalOutcome[] }): RemovalRun {
  return { outcomes: params.outcomes, journalFailure: null };
}

describeAwaitingWin32Platform('buildDeletedFacts', () => {
  test('words every outcome a run can give, with its reason, number, and key', () => {
    const codedKinds: RemovalOutcomeCodedKind[] = [
      'removed',
      'alreadyGone',
      'changedSinceScan',
      'ownerRunning',
      'notAttempted',
      'permissionDenied',
      'failed',
    ];
    const ranked = codedKinds.map((kind) => buildTestCandidate({ path: `/fixture/${kind}` }));
    const toolCandidate = buildTestToolCandidate({ homeDir: '/fixture', version: '20.1.0' });
    const run = buildRun({
      outcomes: [
        ...codedKinds.map((kind, index) =>
          buildCodedOutcome({
            candidate: ranked[index] as Candidate,
            outcome: kind,
            freedBytes: kind === 'removed' ? 4096 : 0,
          }),
        ),
        {
          candidate: toolCandidate,
          path: toolCandidate.path,
          allocatedBytes: toolCandidate.allocatedBytes,
          freedBytes: 0,
          outcome: 'toolFailed',
          failure: { reason: 'outputUnreadable', detail: 'no version list' },
        },
      ],
    });

    const facts = buildDeletedFacts({
      run: run,
      ranked: [...ranked, toolCandidate],
      availableBytesAfter: 52_000_000_000,
      logPath: LOG_PATH,
    });

    expect(
      facts.outcomes.map((outcome) => [outcome.number, outcome.outcome, outcome.reasonKey]),
    ).toEqual([
      [1, 'removed', null],
      [2, 'removed', 'alreadyGone'],
      [3, 'kept', 'changedSinceScan'],
      [4, 'kept', 'ownerRunning'],
      [5, 'kept', 'notAttempted'],
      [6, 'failed', 'permissionDenied'],
      [7, 'failed', 'failed'],
      [8, 'failed', 'toolFailed'],
    ]);
    expect<string | undefined>(facts.outcomes[0]?.key).toBe('catalog:test-entry:/fixture/removed');
    expect<string | undefined>(facts.outcomes[7]?.key).toBe(
      'explore:miseVersions:miseVersion:node@20.1.0',
    );
    expect(facts).toMatchObject({
      freedBytes: 4096,
      returnsLaterBytes: 0,
      availableBytesAfter: 52_000_000_000,
      logPath: LOG_PATH,
    });
  });

  test('words a failure that freed part of its item as partly removed, and sums what it freed', () => {
    const removed = buildTestCandidate({ path: '/fixture/a', allocatedBytes: 1000 });
    const partly = buildTestCandidate({ path: '/fixture/b', allocatedBytes: 5000 });

    const facts = buildDeletedFacts({
      run: buildRun({
        outcomes: [
          buildCodedOutcome({ candidate: removed, outcome: 'removed', freedBytes: 1000 }),
          buildCodedOutcome({ candidate: partly, outcome: 'permissionDenied', freedBytes: 2000 }),
        ],
      }),
      ranked: [removed, partly],
      availableBytesAfter: null,
      logPath: LOG_PATH,
    });

    expect<unknown>(facts.outcomes).toEqual([
      {
        number: 1,
        key: 'catalog:test-entry:/fixture/a',
        outcome: 'removed',
        reasonKey: null,
        freedBytes: 1000,
      },
      {
        number: 2,
        key: 'catalog:test-entry:/fixture/b',
        outcome: 'partlyRemoved',
        reasonKey: 'permissionDenied',
        freedBytes: 2000,
      },
    ]);
    expect(facts.freedBytes).toBe(3000);
    expect(facts.availableBytesAfter).toBeNull();
  });
});
