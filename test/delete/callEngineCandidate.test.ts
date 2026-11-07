import { afterEach, beforeEach, expect, test } from 'bun:test';
import { callEngineCandidate } from '../../src/delete/callEngineCandidate.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { CandidateProbed, CandidateRemovalCallEngine } from '../../src/scan/candidate.js';
import {
  buildDiskUsageAnswer,
  buildFakeUnitPlace,
  buildVolumeName,
  buildVolumeRecord,
  FAKE_API_VERSION,
  startFakeEngine,
} from '../explore/engineFixtures.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { buildTestEngineCandidate } from '../support/candidateFixtures.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';

const NOW_MS = Date.UTC(2026, 9, 1);

const VOLUME_BYTES = 4096;

describeAwaitingWin32Platform('callEngineCandidate', () => {
  let fixtureRoot: FixtureRoot;
  let environment: Environment;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
    environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: Date.now() });
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  function buildVolumeCandidate(): {
    candidate: CandidateProbed;
    removal: CandidateRemovalCallEngine;
  } {
    const removal: CandidateRemovalCallEngine = {
      kind: 'callEngine',
      unit: {
        kind: 'engineVolume',
        ...buildFakeUnitPlace({ homeDir: environment.homeDir }),
        sizeBytes: VOLUME_BYTES,
        volumeName: buildVolumeName('db'),
      },
    };
    const candidate: CandidateProbed = {
      ...buildTestEngineCandidate({ homeDir: environment.homeDir, allocatedBytes: VOLUME_BYTES }),
      removal: removal,
    };

    return { candidate: candidate, removal: removal };
  }

  test('removes the unit over its engine and journals the call with its status', async () => {
    const { candidate, removal } = buildVolumeCandidate();
    const engine = startFakeEngine({
      socketPath: removal.unit.socketPath,
      usage: buildDiskUsageAnswer({ volumes: [buildVolumeRecord({ name: 'db' })] }),
      answerRequest: () => ({ status: 204, bodyText: '' }),
    });

    try {
      const removed = await callEngineCandidate({
        candidate: candidate,
        removal: removal,
        user: environment.user,
        clock: () => NOW_MS,
      });

      expect(removed).toEqual({
        outcome: {
          candidate: candidate,
          path: candidate.path,
          allocatedBytes: VOLUME_BYTES,
          freedBytes: VOLUME_BYTES,
          outcome: 'removed',
          code: null,
        },
        outcomeEntries: [
          {
            kind: 'engineCall',
            atMs: NOW_MS,
            engineName: 'Docker Desktop',
            unitKind: 'engineVolume',
            unitIds: ['db'],
            outcome: 'removed',
            status: 204,
          },
        ],
      });
      expect(engine.requests.at(-1)).toBe(`DELETE /v${FAKE_API_VERSION}/volumes/db`);
    } finally {
      engine.stop();
    }
  });

  test('keeps the item as engineNotRunning when the socket is gone, with no status', async () => {
    const { candidate, removal } = buildVolumeCandidate();

    expect(
      await callEngineCandidate({
        candidate: candidate,
        removal: removal,
        user: environment.user,
        clock: () => NOW_MS,
      }),
    ).toEqual({
      outcome: {
        candidate: candidate,
        path: candidate.path,
        allocatedBytes: VOLUME_BYTES,
        freedBytes: 0,
        outcome: 'engineNotRunning',
        code: null,
      },
      outcomeEntries: [
        {
          kind: 'engineCall',
          atMs: NOW_MS,
          engineName: 'Docker Desktop',
          unitKind: 'engineVolume',
          unitIds: ['db'],
          outcome: 'engineNotRunning',
          status: null,
        },
      ],
    });
  });
});
