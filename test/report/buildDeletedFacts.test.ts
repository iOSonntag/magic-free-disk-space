import { describe, expect, test } from 'bun:test';
import type {
  RemovalOutcome,
  RemovalOutcomeCodedKind,
  RemovalRun,
} from '../../src/delete/deleteCandidates.js';
import { buildDeletedFacts } from '../../src/report/buildDeletedFacts.js';
import { formatDeletionLogLine } from '../../src/report/formatDeletionLog.js';
import { formatRemovalRun } from '../../src/report/formatRemovalRun.js';
import type { EvictTarget, RemovalTargets } from '../../src/scan/candidate.js';
import {
  buildTestCandidate,
  buildTestEngineCandidate,
  buildTestRemovalOutcome,
  buildTestToolCandidate,
} from '../support/candidateFixtures.js';
import {
  buildTestEvictCandidate,
  buildTestEvictTarget,
} from '../support/evictCandidateFixtures.js';
import { buildExampleHome } from '../support/parsedValueFixtures.js';
import { loadProtocolFixtureEventOfKind } from '../support/protocolFixture.js';
import {
  buildProtocolFixtureReport,
  buildProtocolFixtureRun,
  PROTOCOL_FIXTURE_AVAILABLE_BYTES_AFTER,
  PROTOCOL_FIXTURE_LOG_PATH,
} from '../support/protocolFixtureScan.js';

const LOG_PATH = '/fixture/Library/Logs/magic-free-disk-space/deletions.jsonl';

function buildRun(params: { outcomes: RemovalOutcome[] }): RemovalRun {
  return { outcomes: params.outcomes, journalFailure: null };
}

describe('buildDeletedFacts', () => {
  test('gives the deleted event of the protocol fixture for the run it shows', async () => {
    const run = buildProtocolFixtureRun();

    expect<unknown>({
      kind: 'deleted',
      lines: [
        ...formatRemovalRun({ run: run }),
        formatDeletionLogLine({ logPath: PROTOCOL_FIXTURE_LOG_PATH }),
      ],
      ...buildDeletedFacts({
        run: run,
        ranked: buildProtocolFixtureReport().candidates,
        availableBytesAfter: PROTOCOL_FIXTURE_AVAILABLE_BYTES_AFTER,
        logPath: PROTOCOL_FIXTURE_LOG_PATH,
      }),
    }).toEqual(await loadProtocolFixtureEventOfKind('deleted'));
  });

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
    const codedOutcomes = codedKinds.map((kind) =>
      buildTestRemovalOutcome({
        candidate: buildTestCandidate({ path: `/fixture/${kind}` }),
        outcome: kind,
        freedBytes: kind === 'removed' ? 4096 : 0,
      }),
    );
    const toolCandidate = buildTestToolCandidate({
      home: buildExampleHome({ text: '/fixture' }),
      version: '20.1.0',
    });
    const run = buildRun({
      outcomes: [
        ...codedOutcomes,
        {
          candidate: toolCandidate,
          freedBytes: 0,
          outcome: 'toolFailed',
          failure: { reason: 'outputUnreadable', detail: 'no version list' },
        },
      ],
    });

    const facts = buildDeletedFacts({
      run: run,
      ranked: run.outcomes.map((outcome) => outcome.candidate),
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
          buildTestRemovalOutcome({ candidate: removed, outcome: 'removed', freedBytes: 1000 }),
          buildTestRemovalOutcome({
            candidate: partly,
            outcome: 'permissionDenied',
            freedBytes: 2000,
          }),
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

  test('words a path left partly in place as partly removed once it freed any, else as failed', () => {
    const freedSome = buildTestCandidate({ path: 'C:\\fixture\\cache', allocatedBytes: 8192 });
    const freedNone = buildTestCandidate({ path: 'C:\\fixture\\held', allocatedBytes: 4096 });

    const facts = buildDeletedFacts({
      run: buildRun({
        outcomes: [
          {
            candidate: freedSome,
            freedBytes: 6144,
            outcome: 'partlyRemoved',
            stayedEntryCount: 2,
          },
          { candidate: freedNone, freedBytes: 0, outcome: 'partlyRemoved', stayedEntryCount: 1 },
        ],
      }),
      ranked: [freedSome, freedNone],
      availableBytesAfter: null,
      logPath: LOG_PATH,
    });

    expect(facts.outcomes.map((outcome) => [outcome.outcome, outcome.reasonKey])).toEqual([
      ['partlyRemoved', 'partlyRemoved'],
      ['failed', 'partlyRemoved'],
    ]);
    expect(facts.freedBytes).toBe(6144);
  });

  test('words an iCloud folder whose evict took 9 files and left 1 changed as partly removed', () => {
    const folderPath = '/fixture/Library/Mobile Documents/com~apple~CloudDocs/Archive';
    const targets: RemovalTargets<EvictTarget> = [
      buildTestEvictTarget({ path: `${folderPath}/file-0.pdf` }),
      ...Array.from({ length: 9 }, (_, index) =>
        buildTestEvictTarget({ path: `${folderPath}/file-${index + 1}.pdf` }),
      ),
    ];
    const candidate = buildTestEvictCandidate({
      folderPath: folderPath,
      targets: targets,
      allocatedBytes: 10 * 8192,
    });

    const facts = buildDeletedFacts({
      run: buildRun({
        outcomes: [
          buildTestRemovalOutcome({
            candidate: candidate,
            outcome: 'changedSinceScan',
            freedBytes: 9 * 8192,
          }),
        ],
      }),
      ranked: [candidate],
      availableBytesAfter: null,
      logPath: LOG_PATH,
    });

    expect(facts.outcomes.map((outcome) => [outcome.outcome, outcome.reasonKey])).toEqual([
      ['partlyRemoved', 'changedSinceScan'],
    ]);
    expect(facts.freedBytes).toBe(9 * 8192);
  });

  test('words an engine unit of many ids whose later call its engine refused as partly removed', () => {
    const candidate = buildTestEngineCandidate({ homeDir: '/fixture', allocatedBytes: 9000 });

    const facts = buildDeletedFacts({
      run: buildRun({
        outcomes: [
          buildTestRemovalOutcome({
            candidate: candidate,
            outcome: 'engineInUse',
            freedBytes: 3000,
            code: '409',
          }),
        ],
      }),
      ranked: [candidate],
      availableBytesAfter: null,
      logPath: LOG_PATH,
    });

    expect(facts.outcomes.map((outcome) => [outcome.outcome, outcome.reasonKey])).toEqual([
      ['partlyRemoved', 'engineInUse'],
    ]);
    expect(facts).toMatchObject({ freedBytes: 0, returnsLaterBytes: 3000 });
  });

  test('counts what an engine freed as space that comes back later, and keeps an item it holds', () => {
    const pathCandidate = buildTestCandidate({ path: '/fixture/a', allocatedBytes: 1000 });
    const cleaned = buildTestEngineCandidate({ homeDir: '/fixture', allocatedBytes: 5000 });
    const inUse = buildTestEngineCandidate({ homeDir: '/fixture/other', allocatedBytes: 7000 });
    const stopped = buildTestEngineCandidate({ homeDir: '/fixture/third', allocatedBytes: 9000 });

    const facts = buildDeletedFacts({
      run: buildRun({
        outcomes: [
          buildTestRemovalOutcome({
            candidate: pathCandidate,
            outcome: 'removed',
            freedBytes: 1000,
          }),
          buildTestRemovalOutcome({ candidate: cleaned, outcome: 'removed', freedBytes: 5000 }),
          buildTestRemovalOutcome({ candidate: inUse, outcome: 'engineInUse', freedBytes: 0 }),
          buildTestRemovalOutcome({
            candidate: stopped,
            outcome: 'engineNotRunning',
            freedBytes: 0,
          }),
        ],
      }),
      ranked: [pathCandidate, cleaned, inUse, stopped],
      availableBytesAfter: null,
      logPath: LOG_PATH,
    });

    expect(
      facts.outcomes.map((outcome) => [outcome.number, outcome.outcome, outcome.reasonKey]),
    ).toEqual([
      [1, 'removed', null],
      [2, 'removed', null],
      [3, 'kept', 'engineInUse'],
      [4, 'kept', 'engineNotRunning'],
    ]);
    expect(facts).toMatchObject({ freedBytes: 1000, returnsLaterBytes: 5000 });
  });
});
